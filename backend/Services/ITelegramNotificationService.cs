using igaServer.Models;

namespace IGA.Services;

/// <summary>
/// Sends merchant notifications via Telegram Bot. Configure Bot Token and ChatId (env or StoreConfigs.TelegramChatId).
/// </summary>
public interface ITelegramNotificationService
{
    /// <summary>Returns false on a delivery error; an unconfigured optional channel is a successful no-op.</summary>
    Task<bool> NotifyOrderPaidAsync(int orderId, CancellationToken cancellationToken = default);
}
