using igaServer.DTOs;
using igaServer.Models;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;

namespace igaServer.Controllers
{
    public partial class OrderController
    {
        // ==========================================
        // 辅助方法：DTO 映射
        // ==========================================

        private OrderDetailDto MapToOrderDetailDto(Order order)
        {
            var isAdmin = User.IsInRole("Admin");
            var isStaff = User.IsInRole("Staff");
            return new OrderDetailDto
            {
                Id = order.Id,
                UserId = order.UserId,
                UserName = order.User?.Name,
                UserPhone = order.User?.PhoneNumber,
                TotalAmount = order.TotalAmount,
                FinalAmount = order.FinalAmount,
                RefundAmount = order.RefundAmount,
                RefundRejectionReason = order.RefundRejectionReason,
                RefundRequestReason = order.RefundRequestReason,
                RefundRequestedItemIds = ParseRefundItemIdList(order.RefundRequestedItemIdsJson),
                OrderStatus = order.OrderStatus,
                OrderType = order.OrderType,
                StripeSessionId = isAdmin ? order.StripeSessionId : null,
                StripePaymentIntentId = isAdmin ? order.StripePaymentIntentId : null,
                // Customers need their own code; staff must ask the customer for it instead of
                // reading it from the order response and bypassing the handoff check.
                PickupCode = isStaff ? null : order.PickupCode,
                PickupTime = order.PickupTime,
                DeliveryAddress = order.DeliveryAddress,
                DeliverySuburb = order.DeliverySuburb,
                DeliveryDistanceKm = order.DeliveryDistanceKm,
                PickedUpAt = order.PickedUpAt,
                Items = order.Items?.Select(oi => MapToOrderItemDetailDto(oi)).ToList(),
                CreatedAt = order.CreatedAt
            };
        }

        private static string GeneratePickupCode() =>
            RandomNumberGenerator.GetInt32(100000, 1000000).ToString("D6");

        private bool TryGetCurrentUserId(out int userId) =>
            int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

        private bool IsPrivileged() => User.IsInRole("Admin") || User.IsInRole("Staff");

        private bool CanAccessOrder(int ownerUserId) =>
            IsPrivileged() || (TryGetCurrentUserId(out var currentUserId) && currentUserId == ownerUserId);

        /// <summary>仅保留数字，用于比对取货码（允许用户粘贴带空格等）。</summary>
        private static string NormalizePickupDigits(string? input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            return new string(input.Where(char.IsDigit).ToArray());
        }

        private static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371;
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return R * c;
        }

        private OrderItemDetailDto MapToOrderItemDetailDto(OrderItem item)
        {
            return new OrderItemDetailDto
            {
                Id = item.Id,
                ProductId = item.ProductId,
                ProductName = item.ProductName,
                Quantity = item.Quantity,
                PriceAtPurchase = item.PriceAtPurchase,
                ExpectedWeight = item.ExpectedWeight,
                ActualWeight = item.ActualWeight,
                IsWeighingRequired = item.ExpectedWeight > 0,
                CustomerRefundCompletedAt = item.CustomerRefundCompletedAt,
            };
        }

        private static List<int>? ParseRefundItemIdList(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try
            {
                return System.Text.Json.JsonSerializer.Deserialize<List<int>>(json);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>该行顾客实付金额（与下单/称重逻辑一致）。</summary>
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

        private static bool TryResolveUnitPrice(
            Product product,
            string? requestedUnit,
            out string selectedUnit,
            out decimal unitPrice)
        {
            var options = ParseUnitPriceOptions(product.UnitPriceOptionsJson);
            if (options.Count == 0)
            {
                options.Add(new ProductUnitPriceOption
                {
                    Unit = string.IsNullOrWhiteSpace(product.Unit) ? "ea" : product.Unit.Trim(),
                    Price = Math.Round(product.Price, 2, MidpointRounding.AwayFromZero),
                });
            }

            var requested = string.IsNullOrWhiteSpace(requestedUnit)
                ? options[0].Unit
                : requestedUnit.Trim();
            var match = options.FirstOrDefault(x =>
                string.Equals(x.Unit, requested, StringComparison.OrdinalIgnoreCase));
            if (match is null || match.Price <= 0)
            {
                selectedUnit = string.Empty;
                unitPrice = 0;
                return false;
            }

            selectedUnit = match.Unit;
            unitPrice = match.Price;
            return true;
        }

        private static List<ProductUnitPriceOption> ParseUnitPriceOptions(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new();
            try
            {
                var list = JsonSerializer.Deserialize<List<ProductUnitPriceOption>>(json);
                if (list == null) return new();
                return list
                    .Where(x => !string.IsNullOrWhiteSpace(x.Unit) && x.Price > 0)
                    .Select(x => new ProductUnitPriceOption
                    {
                        Unit = x.Unit.Trim(),
                        Price = Math.Round(x.Price, 2, MidpointRounding.AwayFromZero),
                    })
                    .ToList();
            }
            catch
            {
                return new();
            }
        }

        private sealed class ProductUnitPriceOption
        {
            public string Unit { get; set; } = string.Empty;
            public decimal Price { get; set; }
        }
    }
}
