using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Models;
using igaServer.Utils;

namespace igaServer.Controllers
{
    public partial class AdminProductController
    {
        [HttpGet("dashboard")]
        public async Task<IActionResult> GetDashboard()
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var today = DateTime.UtcNow.Date;
            var tomorrow = today.AddDays(1);
            var todaySales = await _context.Orders
                .Where(o => o.CreatedAt >= today && o.CreatedAt < tomorrow &&
                    (o.OrderStatus == "Paid" || o.OrderStatus == "Preparing" || o.OrderStatus == "Prepared" || o.OrderStatus == "Completed"))
                .SumAsync(o => o.FinalAmount ?? o.TotalAmount);
            var pendingCount = await _context.Orders
                .CountAsync(o => o.OrderStatus == "Pending" || o.OrderStatus == "Paid" || o.OrderStatus == "Preparing" || o.OrderStatus == "Prepared");
            return Ok(new { todaySales, pendingOrderCount = pendingCount });
        }

        [HttpGet("orders/counts")]
        public async Task<IActionResult> GetOrderCounts()
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            await SyncRecentlyPaidPendingOrdersAsync();
            var counts = await _context.Orders
                .GroupBy(o => o.OrderStatus)
                .Select(g => new { status = g.Key ?? "", count = g.Count() })
                .ToListAsync();
            var total = await _context.Orders.CountAsync();
            var dict = counts.ToDictionary(x => string.IsNullOrEmpty(x.status) ? "" : x.status, x => x.count);
            var refundHistoryCount = await _context.Orders.CountAsync(o => o.RefundAmount > 0m || o.OrderStatus == "RefundRequested");
            // Ready：Prepared 且尚未标记取走/交接；Completed*：已标记（仍存为 Prepared + PickedUpAt）
            var preparedPickup = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Pickup" && !o.PickedUpAt.HasValue);
            var preparedDelivery = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Delivery" && !o.PickedUpAt.HasValue);
            var completedPickup = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Pickup" && o.PickedUpAt.HasValue);
            var completedDelivery = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Delivery" && o.PickedUpAt.HasValue);
            var totalPrepared = preparedPickup + preparedDelivery + completedPickup + completedDelivery;
            return Ok(new
            {
                total,
                Paid = dict.GetValueOrDefault("Paid", 0),
                Preparing = dict.GetValueOrDefault("Preparing", 0),
                Prepared = dict.GetValueOrDefault("Prepared", 0),
                PreparedPickup = preparedPickup,
                PreparedDelivery = preparedDelivery,
                CompletedPickup = completedPickup,
                CompletedDelivery = completedDelivery,
                TotalPrepared = totalPrepared,
                Completed = dict.GetValueOrDefault("Completed", 0),
                Pending = dict.GetValueOrDefault("Pending", 0),
                RefundRequested = dict.GetValueOrDefault("RefundRequested", 0),
                RefundHistory = refundHistoryCount,
                Cancelled = dict.GetValueOrDefault("Cancelled", 0)
            });
        }

        [HttpGet("orders")]
        public async Task<IActionResult> GetOrders(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? status = null,
            [FromQuery] string? orderType = null,
            [FromQuery] bool? pickedUp = null,
            [FromQuery] string? pickupCode = null,
            [FromQuery] string? deliverySuburb = null,
            [FromQuery] bool refundHistoryOnly = false)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var isAdmin = User.IsInRole("Admin");
            if (string.IsNullOrEmpty(status) || status == "Pending" || status == "Paid")
            {
                await SyncRecentlyPaidPendingOrdersAsync();
            }
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            IQueryable<Order> query = _context.Orders.Include(o => o.User);
            if (refundHistoryOnly)
            {
                query = query.Where(o => o.OrderStatus == "RefundRequested" || o.RefundAmount > 0m);
            }
            else if (!string.IsNullOrEmpty(status))
                query = query.Where(o => o.OrderStatus == status);
            if (!string.IsNullOrEmpty(orderType))
                query = query.Where(o => o.OrderType == orderType);

            var pickupDigits = string.IsNullOrWhiteSpace(pickupCode)
                ? null
                : new string(pickupCode.Where(char.IsDigit).ToArray());
            if (!string.IsNullOrEmpty(pickupDigits))
            {
                query = query.Where(o => o.PickupCode != null && o.PickupCode.Contains(pickupDigits));
            }

            if (!string.IsNullOrWhiteSpace(deliverySuburb))
            {
                var key = deliverySuburb.Trim().ToLowerInvariant();
                if (StoreDeliveryHelper.IsAllowedSuburb(key))
                {
                    query = query.Where(o =>
                        o.OrderType == "Delivery" &&
                        (
                            (o.DeliverySuburb != null && o.DeliverySuburb.Trim() != "" && o.DeliverySuburb.Trim().ToLower() == key) ||
                            ((o.DeliverySuburb == null || o.DeliverySuburb.Trim() == "") &&
                             o.DeliveryAddress != null &&
                             o.DeliveryAddress.ToLower().Contains(key))
                        ));
                }
            }

            // Prepared + 指定 Pickup/Delivery：默认只列「待取/待交接」；pickedUp=true 只列已完成（有 PickedUpAt）
            if (string.Equals(status, "Prepared", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(orderType))
            {
                if (pickedUp == true)
                    query = query.Where(o => o.PickedUpAt != null);
                else
                    query = query.Where(o => o.PickedUpAt == null);
                query = pickedUp == true
                    ? query.OrderByDescending(o => o.PickedUpAt)
                    : query.OrderByDescending(o => o.CreatedAt);
            }
            else if (string.Equals(status, "Prepared", StringComparison.OrdinalIgnoreCase))
            {
                query = query
                    .OrderBy(o => o.PickedUpAt.HasValue)
                    .ThenByDescending(o => o.PickedUpAt ?? o.CreatedAt);
            }
            else
            {
                query = query.OrderByDescending(o => o.CreatedAt);
            }
            var total = await query.CountAsync();
            var orders = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(o => new
                {
                    id = o.Id,
                    userId = o.UserId,
                    userName = o.User != null ? o.User.Name : "",
                    userPhone = isAdmin && o.User != null ? o.User.PhoneNumber : "",
                    totalAmount = o.TotalAmount,
                    finalAmount = o.FinalAmount,
                    orderStatus = o.OrderStatus,
                    orderType = o.OrderType,
                    pickupTime = o.PickupTime,
                    pickupCode = isAdmin ? o.PickupCode : null,
                    deliveryAddress = isAdmin ? o.DeliveryAddress : null,
                    deliverySuburb = o.DeliverySuburb,
                    stripeSessionId = isAdmin ? o.StripeSessionId : null,
                    stripePaymentIntentId = isAdmin ? o.StripePaymentIntentId : null,
                    pickedUpAt = o.PickedUpAt,
                    createdAt = o.CreatedAt
                })
                .ToListAsync();
            return Ok(new { items = orders, total, page, pageSize });
        }
    }
}
