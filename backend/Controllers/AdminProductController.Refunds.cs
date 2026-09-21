using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using igaServer.Models;
using igaServer.Utils;
using System.Data;
using System.Text.Json;

namespace igaServer.Controllers
{
    public partial class AdminProductController
    {
        [HttpPost("order-refund-approve/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public async Task<IActionResult> ApproveRefundRequest(int orderId)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (!_configuration.GetValue("Operations:AcceptRefunds", true))
                return StatusCode(503, new { error = "Refund processing is temporarily paused." });
            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, HttpContext.RequestAborted);
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items!)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "RefundRequested")
                return BadRequest("Can only approve RefundRequested orders");

            var refundableRemaining = Math.Max(0, order.TotalAmount - order.RefundAmount);
            if (refundableRemaining <= 0.01m)
            {
                order.FinalAmount = 0;
                order.OrderStatus = "Refunded";
                order.RefundRequestPreviousStatus = null;
                order.RefundRequestReason = null;
                order.RefundRequestedItemIdsJson = null;
                await _context.SaveChangesAsync();
                await transaction.CommitAsync(HttpContext.RequestAborted);
                return Ok(new { id = order.Id, orderStatus = order.OrderStatus, refundAmount = order.RefundAmount, message = "Order already fully refunded" });
            }

            if (string.IsNullOrWhiteSpace(order.StripePaymentIntentId))
            {
                return BadRequest(new { error = "Order is missing StripePaymentIntentId; cannot refund through Stripe." });
            }

            List<int> requestedItemIds;
            if (string.IsNullOrWhiteSpace(order.RefundRequestedItemIdsJson))
            {
                requestedItemIds = order.Items!
                    .Where(i => i.CustomerRefundCompletedAt == null)
                    .Select(i => i.Id)
                    .ToList();
            }
            else
            {
                try
                {
                    requestedItemIds = JsonSerializer.Deserialize<List<int>>(order.RefundRequestedItemIdsJson!) ?? new List<int>();
                }
                catch
                {
                    return BadRequest(new { error = "Invalid refund request item list." });
                }
            }

            if (requestedItemIds.Count == 0)
            {
                return BadRequest(new { error = "No items in this refund request." });
            }

            var lineItems = order.Items!
                .Where(i => requestedItemIds.Contains(i.Id) && i.CustomerRefundCompletedAt == null)
                .ToList();
            if (lineItems.Count != requestedItemIds.Count)
            {
                return BadRequest(new { error = "Refund request refers to unknown or already processed items." });
            }

            var requestedSum = lineItems.Sum(LineChargeForRefund);
            if (requestedSum <= 0)
            {
                return BadRequest(new { error = "Refund amount for selected items is zero." });
            }

            var refundNow = Math.Round(Math.Min(requestedSum, refundableRemaining), 2, MidpointRounding.AwayFromZero);
            var minorUnits = (long)Math.Round(refundNow * 100m, MidpointRounding.AwayFromZero);
            if (minorUnits < 1)
            {
                return BadRequest(new { error = "Refund amount is too small for Stripe." });
            }

            var idempotencyKey = $"customer-refund-order-{order.Id}-{minorUnits}-{string.Join("-", requestedItemIds.OrderBy(x => x))}";
            var (ok, errMsg, refundId) = await _stripeService.CreatePartialRefundAsync(
                order.StripePaymentIntentId,
                minorUnits,
                idempotencyKey,
                HttpContext.RequestAborted);

            if (!ok)
            {
                return StatusCode(502, new { error = "Stripe refund failed", detail = errMsg });
            }

            order.RefundAmount += refundNow;
            order.FinalAmount = order.TotalAmount - order.RefundAmount;
            foreach (var li in lineItems)
            {
                li.CustomerRefundCompletedAt = DateTime.UtcNow;
            }

            var fullyRefunded = order.RefundAmount >= order.TotalAmount - 0.01m;
            if (fullyRefunded)
            {
                order.OrderStatus = "Refunded";
                order.FinalAmount = 0;
            }
            else
            {
                order.OrderStatus = string.IsNullOrWhiteSpace(order.RefundRequestPreviousStatus)
                    ? "Completed"
                    : order.RefundRequestPreviousStatus!;
            }

            order.RefundRequestPreviousStatus = null;
            order.RefundRequestReason = null;
            order.RefundRequestedItemIdsJson = null;
            AdminAuditLogHelper.Add(_context, User, "RefundApproved", "Order", order.Id, $"amount={refundNow:0.00}");
            await _context.SaveChangesAsync();
            await transaction.CommitAsync(HttpContext.RequestAborted);

            await TrySendRefundApprovedEmailAsync(order, refundNow, HttpContext.RequestAborted);

            return Ok(new
            {
                id = order.Id,
                orderStatus = order.OrderStatus,
                refundAmount = order.RefundAmount,
                finalAmount = order.FinalAmount,
                stripeRefundId = refundId,
                refundedThisApproval = refundNow,
                message = "Refund approved and processed through Stripe"
            });
        }

        private static decimal LineChargeForRefund(OrderItem oi)
        {
            if (oi.ExpectedWeight > 0)
            {
                var kg = (decimal)(oi.ActualWeight ?? oi.ExpectedWeight);
                if (kg < 0) kg = 0;
                return oi.PriceAtPurchase * kg;
            }

            return oi.PriceAtPurchase * oi.Quantity;
        }

        [HttpPost("order-refund-reject/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public async Task<IActionResult> RejectRefundRequest(int orderId, [FromBody] RejectRefundRequestDto? request)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var reason = request?.Reason?.Trim();
            if (string.IsNullOrWhiteSpace(reason))
                return BadRequest(new { error = "Rejection reason is required." });
            if (reason.Length > 1000)
                return BadRequest(new { error = "Rejection reason is too long." });

            var order = await _context.Orders
                .Include(o => o.User)
                .FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "RefundRequested")
                return BadRequest("Can only reject RefundRequested orders");

            order.OrderStatus = string.IsNullOrWhiteSpace(order.RefundRequestPreviousStatus)
                ? "Paid"
                : order.RefundRequestPreviousStatus;
            order.RefundRejectionReason = reason;
            order.RefundRequestPreviousStatus = null;
            order.RefundRequestReason = null;
            order.RefundRequestedItemIdsJson = null;
            AdminAuditLogHelper.Add(_context, User, "RefundRejected", "Order", order.Id);
            await _context.SaveChangesAsync();

            await TrySendRefundRejectedEmailAsync(order, reason, HttpContext.RequestAborted);

            return Ok(new
            {
                id = order.Id,
                orderStatus = order.OrderStatus,
                refundRejectionReason = order.RefundRejectionReason,
                message = "Refund request rejected"
            });
        }

        private async Task TrySendRefundApprovedEmailAsync(Order order, decimal amount, CancellationToken cancellationToken)
        {
            var email = order.User?.Email?.Trim();
            if (string.IsNullOrWhiteSpace(email) || email.EndsWith("@iga.local", StringComparison.OrdinalIgnoreCase))
                return;

            var ok = await _resendEmail.SendRefundApprovedAsync(
                email,
                order.User?.Name ?? "Customer",
                order.Id,
                amount,
                DateTime.UtcNow,
                cancellationToken);

            if (!ok)
                _logger.LogWarning("[Refund] Approved email failed for order {OrderId}", order.Id);
        }

        private async Task TrySendRefundRejectedEmailAsync(Order order, string reason, CancellationToken cancellationToken)
        {
            var email = order.User?.Email?.Trim();
            if (string.IsNullOrWhiteSpace(email) || email.EndsWith("@iga.local", StringComparison.OrdinalIgnoreCase))
                return;

            var ok = await _resendEmail.SendRefundRejectedAsync(
                email,
                order.User?.Name ?? "Customer",
                order.Id,
                reason,
                DateTime.UtcNow,
                cancellationToken);

            if (!ok)
                _logger.LogWarning("[Refund] Rejected email failed for order {OrderId}", order.Id);
        }

        public sealed class RejectRefundRequestDto
        {
            public string? Reason { get; set; }
        }
    }
}
