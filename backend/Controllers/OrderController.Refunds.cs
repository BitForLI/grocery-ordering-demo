using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using igaServer.DTOs;
using igaServer.Models;
using igaServer.Utils;
using System.Data;

namespace igaServer.Controllers
{
    public partial class OrderController
    {
        // ==========================================
        // 4. 顾客申请退款（可选部分商品；已完成订单须填理由）
        // POST: api/order/{orderId}/refund-request
        // ==========================================
        [HttpPost("{orderId}/refund-request")]
        public async Task<ActionResult<OrderDetailDto>> RequestRefund(
            int orderId,
            [FromBody] RefundRequestDto? body)
        {
            if (!_configuration.GetValue("Operations:AcceptRefunds", true))
                return StatusCode(503, new { error = "Refund requests are temporarily paused." });
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound(new { error = "Order not found" });
            }

            if (order.UserId != userId)
            {
                return StatusCode(403, new { error = "You can only request refund for your own order" });
            }

            if (order.OrderStatus == "RefundRequested")
            {
                return Ok(MapToOrderDetailDto(order));
            }

            var refundableStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Paid",
                "Preparing",
                "Prepared",
                "Completed"
            };

            if (!refundableStatuses.Contains(order.OrderStatus ?? ""))
            {
                return BadRequest(new { error = $"Order status is {order.OrderStatus}; refund request is not available" });
            }

            var items = order.Items?.Where(oi => oi.CustomerRefundCompletedAt == null).ToList() ?? new List<OrderItem>();
            if (items.Count == 0)
            {
                return BadRequest(new { error = "No refundable items remain on this order." });
            }

            var reason = (body?.Reason ?? "").Trim();
            if (reason.Length > 1000) return BadRequest(new { error = "Refund reason is too long." });
            var requestedIds = (body?.ItemIds ?? new List<int>()).Where(id => id > 0).Distinct().ToList();

            List<int> selectedIds;
            if (items.Count == 1)
            {
                selectedIds = new List<int> { items[0].Id };
                if (requestedIds.Count > 0 && (requestedIds.Count != 1 || requestedIds[0] != selectedIds[0]))
                {
                    return BadRequest(new { error = "Invalid item selection for this order." });
                }
            }
            else
            {
                if (requestedIds.Count == 0)
                {
                    return BadRequest(new { error = "Please select at least one item to refund." });
                }

                var allowed = items.Select(i => i.Id).ToHashSet();
                if (requestedIds.Any(id => !allowed.Contains(id)))
                {
                    return BadRequest(new { error = "One or more selected items are invalid or already refunded." });
                }

                selectedIds = requestedIds;
            }

            if (string.Equals(order.OrderStatus, "Completed", StringComparison.OrdinalIgnoreCase))
            {
                if (reason.Length < 5)
                {
                    return BadRequest(new { error = "Please enter a refund reason (at least 5 characters)." });
                }
            }

            var selectedLines = items.Where(i => selectedIds.Contains(i.Id)).ToList();
            var sum = selectedLines.Sum(LineChargeForRefund);
            if (sum <= 0)
            {
                return BadRequest(new { error = "Selected items have no refundable amount." });
            }

            order.RefundRequestPreviousStatus = order.OrderStatus;
            order.RefundRejectionReason = null;
            order.RefundRequestReason = string.IsNullOrEmpty(reason) ? null : reason;
            order.RefundRequestedItemIdsJson = System.Text.Json.JsonSerializer.Serialize(selectedIds);
            order.OrderStatus = "RefundRequested";
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();

            return Ok(MapToOrderDetailDto(order));
        }

        // ==========================================
        // 7. 更新订单项重量（称重退款逻辑）
        // PUT: api/order/item/{itemId}/weight
        // ==========================================
        /// <summary>
        /// 称重退款：按「预估 − 实际」计算本行应退总额；相对上次录入计算**增量**退款，避免重复提交时累计错误。
        /// 已支付且存在 StripePaymentIntentId 时，对 PaymentIntent 发起部分退款（Stripe）。
        /// 若新实际重量比上次更轻（应减少已退金额），Stripe 无法自动收回已退款，接口会拒绝并提示人工处理。
        /// </summary>
        [HttpPut("item/{itemId}/weight")]
        [Authorize(Roles = "Admin,Staff")]
        [EnableRateLimiting("sensitive")]
        public async Task<ActionResult<OrderItemDetailDto>> UpdateItemWeight(
            int itemId,
            [FromBody] WeightUpdateDto request)
        {
            if (request == null || request.ActualWeight < 0 || request.ActualWeight > 100 ||
                double.IsNaN(request.ActualWeight) || double.IsInfinity(request.ActualWeight))
                return BadRequest(new { error = "Actual weight must be between 0 and 100 kg" });
            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, HttpContext.RequestAborted);

            // 查找订单项
            var orderItem = await _context.OrderItems
                .Include(oi => oi.Product)
                .Include(oi => oi.Order)
                .FirstOrDefaultAsync(oi => oi.Id == itemId);

            if (orderItem == null)
            {
                return NotFound("Order item not found");
            }

            // 验证商品是否需要称重
            if (orderItem.ExpectedWeight <= 0)
            {
                return BadRequest($"Product {orderItem.Product.Name} does not require weighing");
            }

            var order = orderItem.Order;
            var previousActual = orderItem.ActualWeight;

            if (!string.Equals(order.OrderStatus, "Preparing", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { error = "Actual weight can only be entered while the order is in Preparing status." });
            }

            if (previousActual.HasValue)
            {
                return BadRequest(new { error = "Actual weight for this line has already been saved and cannot be changed again." });
            }

            // 购物车里的 Quantity 对称重商品表示预估购买重量；不要再乘一次 Quantity，否则会把退款放大。
            decimal expectedTotalWeight = (decimal)orderItem.ExpectedWeight;
            decimal newActualTotalWeight = (decimal)request.ActualWeight;
            decimal oldActualTotalWeight = previousActual.HasValue
                ? (decimal)previousActual.Value
                : newActualTotalWeight;

            decimal refundPerKg = orderItem.PriceAtPurchase;

            static decimal LineRefundForWeight(decimal expectedKg, decimal actualKg, decimal pricePerKg)
            {
                var diff = expectedKg - actualKg;
                if (diff <= 0) return 0;
                return pricePerKg * diff;
            }

            decimal newLineRefund = Math.Round(LineRefundForWeight(expectedTotalWeight, newActualTotalWeight, refundPerKg), 2, MidpointRounding.AwayFromZero);
            decimal oldLineRefund = previousActual.HasValue
                ? Math.Round(LineRefundForWeight(expectedTotalWeight, oldActualTotalWeight, refundPerKg), 2, MidpointRounding.AwayFromZero)
                : 0;
            decimal requestedDeltaRefund = newLineRefund - oldLineRefund;
            decimal refundableRemaining = Math.Max(0, order.TotalAmount - order.RefundAmount);
            decimal deltaRefund = requestedDeltaRefund > 0
                ? Math.Min(requestedDeltaRefund, refundableRemaining)
                : requestedDeltaRefund;
            var staffRefundLimit = Math.Clamp(
                _configuration.GetValue("Security:StaffWeightRefundLimitAud", 100m),
                0m,
                100000m);
            var projectedRefundTotal = order.RefundAmount + Math.Max(0m, deltaRefund);
            if (!User.IsInRole("Admin") && projectedRefundTotal > staffRefundLimit)
            {
                return StatusCode(403, new
                {
                    error = $"Cumulative refunds above ${staffRefundLimit:0.00} require an administrator.",
                    refundAmount = deltaRefund,
                    projectedRefundTotal,
                });
            }
            var canStripeRefund = deltaRefund > 0.01m &&
                !string.IsNullOrWhiteSpace(order.StripePaymentIntentId) &&
                !string.Equals(order.OrderStatus, "Pending", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(order.OrderStatus, "Cancelled", StringComparison.OrdinalIgnoreCase);

            if (deltaRefund < -0.01m)
            {
                return BadRequest(new
                {
                    error =
                        "本次录入的实际重量比上次更重，按业务应减少已退差价；Stripe 无法自动收回已发起的退款，请通过 Stripe 后台人工处理或联系客服。",
                    deltaRefund,
                });
            }

            // 已支付且已关联 PaymentIntent：Stripe 部分退款（仅增量 > 0）
            string? stripeRefundId = null;
            if (deltaRefund > 0.01m)
            {
                if (!_configuration.GetValue("Operations:AcceptRefunds", true))
                    return StatusCode(503, new { error = "Refund processing is temporarily paused." });
                if (!canStripeRefund)
                {
                    return BadRequest(new
                    {
                        error = "订单未关联可退款的 Stripe PaymentIntent，无法自动退款。",
                        orderStatus = order.OrderStatus,
                        hasPaymentIntent = !string.IsNullOrWhiteSpace(order.StripePaymentIntentId),
                    });
                }

                var minorUnits = (long)Math.Round(deltaRefund * 100m, MidpointRounding.AwayFromZero);
                if (minorUnits < 1)
                {
                    return BadRequest(new { error = "退款金额过小，无法通过 Stripe 处理（最小 1 分）。" });
                }

                if (refundableRemaining <= 0.01m)
                {
                    return BadRequest(new
                    {
                        error = "该订单可退金额已用完，不能超过实付金额。",
                        orderTotal = order.TotalAmount,
                        refundedSoFar = order.RefundAmount,
                        requestedDeltaRefund,
                    });
                }

                var idempotencyKey = $"weigh-refund-{order.Id}-item-{itemId}-{minorUnits}-{newActualTotalWeight:0.####}";
                var (ok, errMsg, refundId) = await _stripeService.CreatePartialRefundAsync(
                    order.StripePaymentIntentId!,
                    minorUnits,
                    idempotencyKey,
                    HttpContext.RequestAborted);

                if (!ok)
                {
                    _logger.LogError("[Order] Stripe 部分退款失败 order={OrderId} item={ItemId} amountMinor={Minor} {Error}",
                        order.Id, itemId, minorUnits, errMsg);
                    return StatusCode(502, new { error = "Stripe 退款失败", detail = errMsg });
                }

                stripeRefundId = refundId;
                _logger.LogInformation(
                    "[Order] Stripe 部分退款成功 order={OrderId} item={ItemId} amountMinor={Minor} refundId={RefundId}",
                    order.Id, itemId, minorUnits, stripeRefundId);
            }

            // 持久化：先写重量与订单金额
            orderItem.ActualWeight = request.ActualWeight;
            _context.OrderItems.Update(orderItem);

            if (deltaRefund != 0)
            {
                order.RefundAmount += deltaRefund;
                order.FinalAmount = order.TotalAmount - order.RefundAmount;
                _context.Orders.Update(order);
            }
            AdminAuditLogHelper.Add(_context, User, "WeightRecorded", "OrderItem", itemId, $"order={order.Id};refund={deltaRefund:0.00}");

            await _context.SaveChangesAsync();
            await transaction.CommitAsync(HttpContext.RequestAborted);

            var itemDto = MapToOrderItemDetailDto(orderItem);
            return Ok(new
            {
                message = deltaRefund > 0.01m
                    ? (stripeRefundId != null
                        ? "Weight updated; Stripe refund processed."
                        : "Weight updated; refund recorded (order not paid via Stripe).")
                    : "Weight updated.",
                orderItem = itemDto,
                refundInfo = new
                {
                    expectedWeight = orderItem.ExpectedWeight,
                    actualWeight = request.ActualWeight,
                    newLineRefund,
                    oldLineRefund,
                    requestedDeltaRefund,
                    deltaRefund,
                    refundableRemaining,
                    cappedByPaidAmount = requestedDeltaRefund > deltaRefund,
                    stripeRefundId,
                    needsRefund = newLineRefund > 0,
                },
            });
        }
    }
}
