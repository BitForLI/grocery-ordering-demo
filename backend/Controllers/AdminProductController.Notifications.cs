using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;
using IGA.Services;

namespace igaServer.Controllers
{
    public partial class AdminProductController
    {
        private async Task<int> SyncRecentlyPaidPendingOrdersAsync()
        {
            var stripeSecret = (_configuration["Stripe:SecretKey"] ?? "").Trim();
            if (string.IsNullOrWhiteSpace(stripeSecret))
            {
                return 0;
            }

            var since = DateTime.UtcNow.AddDays(-2);
            var candidates = await _context.Orders
                .AsNoTracking()
                .Where(o => o.OrderStatus == "Pending" &&
                            o.StripeSessionId != null &&
                            o.StripeSessionId != "" &&
                            o.CreatedAt >= since)
                .OrderByDescending(o => o.CreatedAt)
                .Take(20)
                .ToListAsync();

            if (candidates.Count == 0) return 0;

            StripeConfiguration.ApiKey = stripeSecret;
            var sessionService = new SessionService();
            var updated = 0;

            foreach (var order in candidates)
            {
                try
                {
                    var session = await sessionService.GetAsync(order.StripeSessionId);
                    var paid = string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase);
                    var expectedCurrency = (_configuration["Stripe:CheckoutCurrency"] ?? "aud").Trim().ToLowerInvariant();
                    var expectedAmount = (long)Math.Round(order.TotalAmount * 100m, MidpointRounding.AwayFromZero);
                    if (!paid || !string.Equals(session.Id, order.StripeSessionId, StringComparison.Ordinal) ||
                        !string.Equals(session.ClientReferenceId, order.Id.ToString(), StringComparison.Ordinal) ||
                        !string.Equals(session.Mode, "payment", StringComparison.OrdinalIgnoreCase) ||
                        !string.Equals(session.Currency, expectedCurrency, StringComparison.OrdinalIgnoreCase) ||
                        session.AmountTotal != expectedAmount || string.IsNullOrWhiteSpace(session.PaymentIntentId))
                        continue;

                    await using var transaction = await _context.Database.BeginTransactionAsync();
                    var affectedRows = await _context.Orders
                        .Where(o => o.Id == order.Id && o.OrderStatus == "Pending")
                        .ExecuteUpdateAsync(setters => setters
                            .SetProperty(o => o.OrderStatus, "Paid")
                            .SetProperty(o => o.StripePaymentIntentId, session.PaymentIntentId));
                    if (affectedRows != 1)
                        continue;

                    OrderPaidNotificationQueue.Enqueue(
                        _context,
                        order.Id,
                        session.CustomerDetails?.Email ?? session.CustomerEmail);
                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();
                    updated++;
                }
                catch (StripeException ex)
                {
                    _ = ex;
                }
            }

            return updated;
        }

        [HttpGet("paid-notification-failures")]
        public async Task<IActionResult> GetPaidNotificationFailures(CancellationToken cancellationToken)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var failures = await _context.OrderPaidNotifications.AsNoTracking()
                .Where(x => x.DeadLetteredAtUtc != null)
                .OrderByDescending(x => x.DeadLetteredAtUtc)
                .Select(x => new
                {
                    x.Id,
                    x.OrderId,
                    x.Channel,
                    x.AttemptCount,
                    x.LastError,
                    x.DeadLetteredAtUtc,
                })
                .Take(100)
                .ToListAsync(cancellationToken);
            return Ok(failures);
        }

        [HttpPost("paid-notification-failures/{id:long}/retry")]
        public async Task<IActionResult> RetryPaidNotification(long id, CancellationToken cancellationToken)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var rows = await _context.OrderPaidNotifications
                .Where(x => x.Id == id && x.DeadLetteredAtUtc != null)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.AttemptCount, 0)
                    .SetProperty(x => x.AvailableAtUtc, DateTime.UtcNow)
                    .SetProperty(x => x.DeadLetteredAtUtc, (DateTime?)null)
                    .SetProperty(x => x.LockedUntilUtc, (DateTime?)null)
                    .SetProperty(x => x.LockToken, (string?)null)
                    .SetProperty(x => x.LastError, (string?)null), cancellationToken);
            return rows == 1 ? Ok(new { queued = true }) : NotFound();
        }
    }
}
