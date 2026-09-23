using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

/// <summary>Delivers paid-order notifications at least once, with a database lease per channel.</summary>
public sealed class OrderPaidNotificationHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderPaidNotificationHostedService> _logger;

    public OrderPaidNotificationHostedService(
        IServiceScopeFactory scopeFactory,
        ILogger<OrderPaidNotificationHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
            do
            {
                try
                {
                    await RunOnceAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogError(ex, "[PaidNotifications] Scheduled run failed");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }

    public async Task RunOnceAsync(CancellationToken cancellationToken = default)
    {
        List<long> ids;
        var now = DateTime.UtcNow;
        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            ids = await db.OrderPaidNotifications.AsNoTracking()
                .Where(x => x.CompletedAtUtc == null && x.DeadLetteredAtUtc == null
                    && x.AvailableAtUtc <= now
                    && (x.LockedUntilUtc == null || x.LockedUntilUtc <= now))
                .OrderBy(x => x.AvailableAtUtc)
                .Select(x => x.Id)
                .Take(25)
                .ToListAsync(cancellationToken);
        }

        foreach (var id in ids)
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var leaseToken = Guid.NewGuid().ToString("N");
            now = DateTime.UtcNow;
            var claimed = await db.OrderPaidNotifications
                .Where(x => x.Id == id && x.CompletedAtUtc == null && x.DeadLetteredAtUtc == null
                    && x.AvailableAtUtc <= now
                    && (x.LockedUntilUtc == null || x.LockedUntilUtc <= now))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.LockToken, leaseToken)
                    .SetProperty(x => x.LockedUntilUtc, now.AddMinutes(2))
                    .SetProperty(x => x.AttemptCount, x => x.AttemptCount + 1), cancellationToken);
            if (claimed != 1) continue;

            var delivery = await db.OrderPaidNotifications.AsNoTracking()
                .SingleAsync(x => x.Id == id, cancellationToken);
            bool sent;
            string? failure = null;
            try
            {
                sent = await SendAsync(scope.ServiceProvider, delivery, cancellationToken);
                if (!sent) failure = "Delivery returned an unsuccessful result";
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "[PaidNotifications] Delivery {DeliveryId} failed", id);
                sent = false;
                failure = ex.GetType().Name;
            }

            now = DateTime.UtcNow;
            var owned = db.OrderPaidNotifications.Where(x => x.Id == id && x.LockToken == leaseToken);
            if (sent)
            {
                await owned.ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.CompletedAtUtc, now)
                    .SetProperty(x => x.LockedUntilUtc, (DateTime?)null)
                    .SetProperty(x => x.LockToken, (string?)null)
                    .SetProperty(x => x.LastError, (string?)null), cancellationToken);
            }
            else
            {
                var deadLetter = delivery.AttemptCount >= 8;
                await owned.ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.AvailableAtUtc, now.Add(RetryDelay(delivery.AttemptCount)))
                    .SetProperty(x => x.DeadLetteredAtUtc, deadLetter ? now : (DateTime?)null)
                    .SetProperty(x => x.LockedUntilUtc, (DateTime?)null)
                    .SetProperty(x => x.LockToken, (string?)null)
                    .SetProperty(x => x.LastError, failure), cancellationToken);
                if (deadLetter)
                    _logger.LogError("[PaidNotifications] Delivery {DeliveryId} moved to dead letter after {Attempts} attempts", id, delivery.AttemptCount);
            }
        }
    }

    public static TimeSpan RetryDelay(int attemptCount) =>
        TimeSpan.FromMinutes(Math.Min(60, Math.Pow(2, Math.Clamp(attemptCount - 1, 0, 6))));

    private static async Task<bool> SendAsync(
        IServiceProvider services,
        OrderPaidNotification delivery,
        CancellationToken cancellationToken)
    {
        if (delivery.Channel == OrderPaidNotificationQueue.Email)
        {
            var db = services.GetRequiredService<ApplicationDbContext>();
            var resend = services.GetRequiredService<IResendEmailService>();
            var configuration = services.GetRequiredService<IConfiguration>();
            var logger = services.GetRequiredService<ILogger<OrderPaidNotificationHostedService>>();
            return await OrderPaidNotifier.TryNotifyPickupEmailAsync(
                db,
                resend,
                delivery.OrderId,
                logger,
                delivery.ContactEmail,
                configuration["Store:PickupAddress"] ?? "IGA Beverly Hills",
                cancellationToken);
        }
        if (delivery.Channel == OrderPaidNotificationQueue.Telegram)
            return await services.GetRequiredService<ITelegramNotificationService>()
                .NotifyOrderPaidAsync(delivery.OrderId, cancellationToken);

        throw new InvalidOperationException($"Unsupported notification channel: {delivery.Channel}");
    }
}
