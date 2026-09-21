using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using igaServer.DTOs;
using igaServer.Utils;

namespace igaServer.Controllers
{
    public partial class OrderController
    {
        // ==========================================
        // 5. 更新订单状态（仅 Admin 可用）
        // PUT: api/order/{orderId}/status
        // ==========================================
        /// <summary>
        /// 管理员更新履约状态。Paid 只能由已验证的 Stripe 回调/同步产生。
        /// </summary>
        [HttpPut("{orderId}/status")]
        [Authorize(Roles = "Admin")]
        public async Task<ActionResult<OrderDetailDto>> UpdateOrderStatus(
            int orderId,
            [FromBody] UpdateOrderStatusRequest? request)
        {
            var newStatus = request?.NewStatus?.Trim();
            if (string.IsNullOrWhiteSpace(newStatus))
                return BadRequest(new { error = "NewStatus is required" });

            // 查找订单
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound("Order not found");
            }

            // 验证状态流转
            var validStatusTransitions = new Dictionary<string, List<string>>
            {
                // An unpaid order may be cancelled. Paid/refund states must use their dedicated
                // Stripe-backed flows so money and local status can never diverge.
                { "Pending", new List<string> { "Cancelled" } },
                { "Paid", new List<string> { "Preparing" } },
                { "Preparing", new List<string> { "Prepared" } },
                { "Prepared", new List<string> { "Completed" } },
                { "RefundRequested", new List<string>() },
                { "Refunded", new List<string>() },
                { "Completed", new List<string>() },
                { "Cancelled", new List<string>() }
            };

            var currentStatus = order.OrderStatus ?? string.Empty;
            if (!validStatusTransitions.TryGetValue(currentStatus, out var allowedNextStatuses) ||
                !allowedNextStatuses.Contains(newStatus))
            {
                return BadRequest($"Cannot transition from {currentStatus} to {newStatus}");
            }

            // 更新订单状态
            order.OrderStatus = newStatus;
            AdminAuditLogHelper.Add(_context, User, "OrderStatusChanged", "Order", order.Id, $"{currentStatus}->{newStatus}");
            var completedNow = string.Equals(newStatus, "Completed", StringComparison.OrdinalIgnoreCase);
            if (completedNow)
                order.PickedUpAt ??= DateTime.UtcNow;
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();
            if (completedNow)
                await TrySendCompletionReceiptNowAsync(order.Id, HttpContext.RequestAborted);

            var dto = MapToOrderDetailDto(order);
            return Ok(dto);
        }

        // ==========================================
        // 6. 核销订单（6 位取货码验证）
        // POST: api/order/{orderId}/verify
        // ==========================================
        /// <summary>
        /// 验证订单取货
        /// 1. 检查订单状态是否为 Prepared（已备货）
        /// 2. 验证邮件中的 6 位取货码是否与订单 PickupCode 一致
        /// 3. 订单标记为 Completed
        /// 4. 返回订单信息
        /// </summary>
        [HttpPost("{orderId}/verify")]
        [Authorize(Roles = "Admin,Staff")]
        [EnableRateLimiting("sensitive")]
        public async Task<ActionResult<OrderDetailDto>> VerifyOrder(int orderId, [FromBody] OrderVerifyDto request)
        {
            // 查找订单
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound("Order not found");
            }

            // 检查订单状态
            if (order.OrderStatus != "Prepared")
            {
                return BadRequest($"Order status is {order.OrderStatus}, can only verify prepared orders");
            }

            var expected = order.PickupCode ?? "";
            var entered = NormalizePickupDigits(request.PickupCode);
            if (expected.Length != 6 || entered.Length != 6 || entered != expected)
            {
                return BadRequest("Invalid pickup code");
            }

            // 更新订单状态为已完成，并记录交接时间，后续发票邮件只依赖这个完成标记发送。
            order.OrderStatus = "Completed";
            order.PickedUpAt ??= DateTime.UtcNow;
            AdminAuditLogHelper.Add(_context, User, "OrderVerified", "Order", order.Id);
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();
            await TrySendCompletionReceiptNowAsync(order.Id, HttpContext.RequestAborted);

            var dto = MapToOrderDetailDto(order);
            return Ok(new { message = "Order verified", order = dto });
        }

        private async Task TrySendCompletionReceiptNowAsync(int orderId, CancellationToken cancellationToken)
        {
            try
            {
                await _completionReceiptSender.TrySendForOrderAsync(orderId, TimeSpan.Zero, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[CompletionReceipt] Immediate receipt send failed for order {OrderId}", orderId);
            }
        }
    }

    // ==========================================
    // 请求 DTO
    // ==========================================
    public class UpdateOrderStatusRequest
    {
        public string? NewStatus { get; set; }
    }
}
