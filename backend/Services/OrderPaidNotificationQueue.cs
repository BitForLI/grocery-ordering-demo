using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

public static class OrderPaidNotificationQueue
{
    public const string Email = "Email";
    public const string Telegram = "Telegram";

    /// <summary>Call only after the Pending → Paid update won, before committing its transaction.</summary>
    public static void Enqueue(ApplicationDbContext db, int orderId, string? contactEmail)
    {
        var now = DateTime.UtcNow;
        db.OrderPaidNotifications.AddRange(
            new OrderPaidNotification
            {
                OrderId = orderId,
                Channel = Email,
                ContactEmail = contactEmail?.Trim(),
                CreatedAtUtc = now,
                AvailableAtUtc = now,
            },
            new OrderPaidNotification
            {
                OrderId = orderId,
                Channel = Telegram,
                CreatedAtUtc = now,
                AvailableAtUtc = now,
            });
    }
}
