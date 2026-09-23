using IGA.Services;
using igaServer.Data;
using igaServer.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace igaServer.Tests;

public sealed class OrderPaidNotificationTests
{
    [Fact]
    public async Task WinningPaidTransitionQueuesEachChannelOnce()
    {
        await using var fixture = await TestFixture.CreateAsync();
        var orderId = await fixture.CreateOrderAsync();

        await using (var transaction = await fixture.Db.Database.BeginTransactionAsync())
        {
            var won = await fixture.Db.Orders
                .Where(x => x.Id == orderId && x.OrderStatus == "Pending")
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.OrderStatus, "Paid"));
            Assert.Equal(1, won);
            OrderPaidNotificationQueue.Enqueue(fixture.Db, orderId, "customer@example.com");
            await fixture.Db.SaveChangesAsync();
            await transaction.CommitAsync();
        }

        var duplicate = await fixture.Db.Orders
            .Where(x => x.Id == orderId && x.OrderStatus == "Pending")
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.OrderStatus, "Paid"));
        Assert.Equal(0, duplicate);
        var deliveries = await fixture.Db.OrderPaidNotifications.AsNoTracking().ToListAsync();
        Assert.Equal(2, deliveries.Count);
        Assert.Contains(deliveries, x => x.Channel == OrderPaidNotificationQueue.Email);
        Assert.Contains(deliveries, x => x.Channel == OrderPaidNotificationQueue.Telegram);
    }

    [Fact]
    public async Task FailedDeliveryIsRetriedAndThenCompleted()
    {
        await using var fixture = await TestFixture.CreateAsync();
        var orderId = await fixture.CreateOrderAsync();
        await fixture.CreateTelegramDeliveryAsync(orderId);
        var worker = fixture.CreateWorker();

        await worker.RunOnceAsync();
        var afterFailure = await fixture.Db.OrderPaidNotifications.AsNoTracking().SingleAsync();
        Assert.Equal(1, afterFailure.AttemptCount);
        Assert.Null(afterFailure.CompletedAtUtc);
        Assert.Null(afterFailure.LockToken);
        Assert.True(afterFailure.AvailableAtUtc > DateTime.UtcNow);

        await fixture.Db.OrderPaidNotifications.ExecuteUpdateAsync(setters => setters
            .SetProperty(x => x.AvailableAtUtc, DateTime.UtcNow.AddSeconds(-1)));
        fixture.Telegram.ShouldSucceed = true;
        await worker.RunOnceAsync();

        var completed = await fixture.Db.OrderPaidNotifications.AsNoTracking().SingleAsync();
        Assert.Equal(2, completed.AttemptCount);
        Assert.NotNull(completed.CompletedAtUtc);
        Assert.Null(completed.DeadLetteredAtUtc);
        Assert.Equal(2, fixture.Telegram.SendCount);
    }

    [Fact]
    public async Task EighthFailureMovesDeliveryToDeadLetter()
    {
        await using var fixture = await TestFixture.CreateAsync();
        var orderId = await fixture.CreateOrderAsync();
        await fixture.CreateTelegramDeliveryAsync(orderId, attemptCount: 7);

        await fixture.CreateWorker().RunOnceAsync();

        var delivery = await fixture.Db.OrderPaidNotifications.AsNoTracking().SingleAsync();
        Assert.Equal(8, delivery.AttemptCount);
        Assert.NotNull(delivery.DeadLetteredAtUtc);
        Assert.Null(delivery.CompletedAtUtc);
        Assert.Equal(TimeSpan.FromMinutes(60), OrderPaidNotificationHostedService.RetryDelay(8));
    }

    private sealed class TestFixture : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;
        private readonly ServiceProvider _services;

        private TestFixture(SqliteConnection connection, ServiceProvider services, ApplicationDbContext db, FakeTelegram telegram)
        {
            _connection = connection;
            _services = services;
            Db = db;
            Telegram = telegram;
        }

        public ApplicationDbContext Db { get; }
        public FakeTelegram Telegram { get; }

        public static async Task<TestFixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var telegram = new FakeTelegram();
            var services = new ServiceCollection()
                .AddLogging()
                .AddDbContext<ApplicationDbContext>(options => options.UseSqlite(connection))
                .AddSingleton<ITelegramNotificationService>(telegram)
                .BuildServiceProvider();
            var db = services.GetRequiredService<ApplicationDbContext>();
            await db.Database.EnsureCreatedAsync();
            return new TestFixture(connection, services, db, telegram);
        }

        public async Task<int> CreateOrderAsync()
        {
            var user = new User
            {
                Name = "Customer",
                Email = "customer@example.com",
                PasswordHash = "test",
            };
            var order = new Order
            {
                User = user,
                OrderStatus = "Pending",
                TotalAmount = 12m,
            };
            Db.Orders.Add(order);
            await Db.SaveChangesAsync();
            return order.Id;
        }

        public async Task CreateTelegramDeliveryAsync(int orderId, int attemptCount = 0)
        {
            Db.OrderPaidNotifications.Add(new OrderPaidNotification
            {
                OrderId = orderId,
                Channel = OrderPaidNotificationQueue.Telegram,
                AttemptCount = attemptCount,
                AvailableAtUtc = DateTime.UtcNow.AddSeconds(-1),
            });
            await Db.SaveChangesAsync();
        }

        public OrderPaidNotificationHostedService CreateWorker() => new(
            _services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<OrderPaidNotificationHostedService>.Instance);

        public async ValueTask DisposeAsync()
        {
            await Db.DisposeAsync();
            await _services.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }

    private sealed class FakeTelegram : ITelegramNotificationService
    {
        public bool ShouldSucceed { get; set; }
        public int SendCount { get; private set; }

        public Task<bool> NotifyOrderPaidAsync(int orderId, CancellationToken cancellationToken = default)
        {
            SendCount++;
            return Task.FromResult(ShouldSucceed);
        }
    }
}
