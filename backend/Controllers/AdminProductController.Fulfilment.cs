using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using igaServer.Utils;
using System.Security.Cryptography;

namespace igaServer.Controllers
{
    public partial class AdminProductController
    {
        /// <summary>
        /// 接单：将待接单(Paid)订单变为备货中(Preparing)，停止播报
        /// </summary>
        [HttpPost("order-accept/{orderId}")]
        public async Task<IActionResult> AcceptOrder(int orderId)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders
                .Include(o => o.User)
                .FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "Paid")
                return BadRequest("Can only accept Paid orders");
            order.OrderStatus = "Preparing";
            AdminAuditLogHelper.Add(_context, User, "OrderAccepted", "Order", order.Id);
            await _context.SaveChangesAsync();
            return Ok(new { id = order.Id, orderStatus = "Preparing", message = "Order accepted, moved to preparing" });
        }

        /// <summary>
        /// 备货完成：将备货中(Preparing)订单变为待取货(Prepared)
        /// </summary>
        [HttpPost("order-ready/{orderId}")]
        public async Task<IActionResult> MarkOrderReady(int orderId)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders.FindAsync(orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "Preparing")
                return BadRequest("Can only mark Preparing orders as ready");
            order.OrderStatus = "Prepared";
            AdminAuditLogHelper.Add(_context, User, "OrderMarkedReady", "Order", order.Id);
            await _context.SaveChangesAsync();
            return Ok(new { id = order.Id, orderStatus = "Prepared", message = "Moved to ready for pickup" });
        }

        /// <summary>
        /// 标记顾客已取货/已交接：仍为 Prepared；从 Ready 列表消失，出现在 Completed pickup/delivery 列表。
        /// </summary>
        [HttpPost("order-picked-up/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public Task<IActionResult> MarkOrderPickedUp(int orderId, [FromBody] MarkOrderPickedUpDto? request) =>
            MarkOrderPickedUpCore(orderId, request);

        /// <summary>同上，REST 风格备用路径。</summary>
        [HttpPost("orders/{orderId}/picked-up")]
        [EnableRateLimiting("sensitive")]
        public Task<IActionResult> MarkOrderPickedUpRest(int orderId, [FromBody] MarkOrderPickedUpDto? request) =>
            MarkOrderPickedUpCore(orderId, request);

        /// <summary>旧版路径，兼容已部署客户端。</summary>
        [HttpPost("order-mark-picked-up/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public Task<IActionResult> MarkOrderPickedUpLegacy(int orderId, [FromBody] MarkOrderPickedUpDto? request) =>
            MarkOrderPickedUpCore(orderId, request);

        private async Task<IActionResult> MarkOrderPickedUpCore(int orderId, MarkOrderPickedUpDto? request)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders.FindAsync(orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "Prepared")
                return BadRequest("Can only mark Prepared orders as picked up");
            if (order.PickedUpAt.HasValue)
                return BadRequest("Already marked as picked up");
            if (string.Equals(order.OrderType, "Pickup", StringComparison.OrdinalIgnoreCase))
            {
                var expected = order.PickupCode ?? string.Empty;
                var entered = new string((request?.PickupCode ?? string.Empty).Where(char.IsDigit).ToArray());
                if (expected.Length != 6 || entered.Length != 6 ||
                    !CryptographicOperations.FixedTimeEquals(
                        System.Text.Encoding.ASCII.GetBytes(expected),
                        System.Text.Encoding.ASCII.GetBytes(entered)))
                    return BadRequest(new { error = "Invalid pickup code." });
            }
            order.PickedUpAt = DateTime.UtcNow;
            AdminAuditLogHelper.Add(_context, User, "OrderHandedOff", "Order", order.Id);
            await _context.SaveChangesAsync();
            await TrySendCompletionReceiptNowAsync(order.Id, HttpContext.RequestAborted);
            return Ok(new { id = order.Id, orderStatus = order.OrderStatus, pickedUpAt = order.PickedUpAt, message = "Marked as picked up" });
        }

        public sealed class MarkOrderPickedUpDto
        {
            public string? PickupCode { get; set; }
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
}
