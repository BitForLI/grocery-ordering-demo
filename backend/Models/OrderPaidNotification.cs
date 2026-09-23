using System.ComponentModel.DataAnnotations;

namespace igaServer.Models;

/// <summary>A durable delivery request created in the same transaction as the Paid transition.</summary>
public sealed class OrderPaidNotification
{
    [Key]
    public long Id { get; set; }

    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;

    [MaxLength(16)]
    public string Channel { get; set; } = string.Empty;

    [MaxLength(320)]
    public string? ContactEmail { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime AvailableAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LockedUntilUtc { get; set; }

    [MaxLength(36)]
    public string? LockToken { get; set; }

    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? DeadLetteredAtUtc { get; set; }
    public int AttemptCount { get; set; }

    [MaxLength(500)]
    public string? LastError { get; set; }
}
