using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using IGA.Services;
using igaServer.Data;
using igaServer.Models;
using igaServer.DTOs;
using igaServer.Utils;
using System.Text.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using System.Data;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    [EnableRateLimiting("orders")]
    public partial class OrderController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IStripeService _stripeService;
        private readonly IOrderCompletionReceiptSender _completionReceiptSender;
        private readonly IConfiguration _configuration;
        private readonly ILogger<OrderController> _logger;

        public OrderController(
            ApplicationDbContext context,
            IStripeService stripeService,
            IOrderCompletionReceiptSender completionReceiptSender,
            IConfiguration configuration,
            ILogger<OrderController> logger)
        {
            _context = context;
            _stripeService = stripeService;
            _completionReceiptSender = completionReceiptSender;
            _configuration = configuration;
            _logger = logger;
        }

        // ==========================================
        // 1. 创建订单（购物车转订单）
        // POST: api/order/create
        // ==========================================
        [HttpPost("create")]
        public async Task<ActionResult<OrderDetailDto>> CreateOrder([FromBody] OrderCreateDto request)
        {
            if (!_configuration.GetValue("Operations:AcceptOrders", true))
                return StatusCode(503, new { error = "New orders are temporarily paused." });
            if (request == null) return BadRequest(new { error = "Invalid JSON body" });
            if (!TryGetCurrentUserId(out var currentUserId)) return Unauthorized();
            var user = await _context.Users.FindAsync(currentUserId);
            if (user == null || !user.EmailVerified) return Unauthorized();

            var clientRequestId = request.ClientRequestId?.Trim().ToLowerInvariant();
            if (!Guid.TryParseExact(clientRequestId, "D", out _))
            {
                return BadRequest(new { error = "ClientRequestId must be a UUID. Refresh the page and try again." });
            }

            var existingOrder = await _context.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.UserId == currentUserId && o.ClientRequestId == clientRequestId);
            if (existingOrder != null)
            {
                return Ok(new
                {
                    message = "Order already created",
                    orderId = existingOrder.Id,
                    totalAmount = existingOrder.TotalAmount,
                    idempotentReplay = true,
                });
            }

            // === 步骤 2: 验证购物车不为空 ===
            if (request.Items == null || request.Items.Count == 0 || request.Items.Count > 100)
            {
                return BadRequest(new { error = "Cart must contain between 1 and 100 items" });
            }
            var orderType = (request.OrderType ?? "").Trim();
            if (orderType != "Pickup" && orderType != "Delivery")
                return BadRequest(new { error = "OrderType must be Pickup or Delivery" });
            if ((request.DeliveryAddress?.Length ?? 0) > 500 || (request.DeliverySuburb?.Length ?? 0) > 100)
                return BadRequest(new { error = "Delivery details are too long" });
            if (request.PickupTime is { } pickup && (pickup < DateTime.UtcNow.AddMinutes(-5) || pickup > DateTime.UtcNow.AddDays(30)))
                return BadRequest(new { error = "Pickup time must be within the next 30 days" });

            // === 步骤 3: 获取商品信息（验证商品存在且上架） ===
            var productIds = request.Items.Select(x => x.ProductId).ToList();
            var products = await _context.Products
                .Where(p => productIds.Contains(p.Id))
                .ToListAsync();

            foreach (var item in request.Items)
            {
                if (item.ProductId <= 0 || item.Quantity < 1 || item.Quantity > 100 ||
                    double.IsNaN(item.ExpectedWeight) || double.IsInfinity(item.ExpectedWeight) || item.ExpectedWeight < 0 || item.ExpectedWeight > 100 ||
                    (item.SelectedUnit?.Length ?? 0) > 20)
                    return BadRequest(new { error = "One or more cart items have invalid values" });
                var product = products.FirstOrDefault(p => p.Id == item.ProductId);
                if (product == null)
                {
                    return BadRequest(new { error = $"Product {item.ProductId} not found" });
                }

                if (!product.IsActive)
                {
                    return BadRequest(new { error = $"Product {product.Name} is not available" });
                }
            }

            // === 步骤 3.5: 配送订单需校验区域（运费在商品小计后按分区 + 满额包邮计算） ===
            StoreConfig? store = null;
            if (orderType == "Delivery")
            {
                store = await _context.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync();

                var suburb = (request.DeliverySuburb ?? "").Trim();
                if (string.IsNullOrEmpty(suburb))
                    return BadRequest(new { error = "Please select delivery suburb" });
                if (!StoreDeliveryHelper.IsAllowedSuburb(suburb, store?.DeliveryZoneFeesJson))
                {
                    var names = string.Join(", ", StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(StoreDeliveryHelper.DisplaySuburb));
                    return BadRequest(new { error = $"We only deliver to {names}" });
                }
            }

            // === 步骤 4: 创建订单对象 ===
            var order = new Order
            {
                UserId = user.Id,
                ClientRequestId = clientRequestId,
                OrderType = orderType,
                OrderStatus = "Pending", // 初始状态：待支付
                PickupTime = request.PickupTime.HasValue ? DateTime.SpecifyKind(request.PickupTime.Value, DateTimeKind.Utc) : null, // 转换为 UTC
                DeliveryAddress = orderType == "Delivery" ? request.DeliveryAddress?.Trim() : null,
                DeliverySuburb = orderType == "Delivery" ? (request.DeliverySuburb ?? "").Trim() : null,
                Items = new List<OrderItem>()
            };

            // === 步骤 5: 添加订单项 ===
            decimal totalAmount = 0;

            foreach (var item in request.Items)
            {
                var product = products.First(p => p.Id == item.ProductId);
                if (!TryResolveUnitPrice(product, item.SelectedUnit, out var selectedUnit, out var unitPrice))
                {
                    return BadRequest(new { error = $"Invalid unit for product: {product.Name}" });
                }

                // Only a server-validated catalog unit may choose the weighing path. Never let an
                // arbitrary client string change quantity semantics after falling back to another price.
                var isWeighed = string.Equals(selectedUnit, "kg", StringComparison.OrdinalIgnoreCase);

                decimal lineAmount;
                var orderItem = new OrderItem
                {
                    ProductId = product.Id,
                    ProductName = product.Name,
                    PriceAtPurchase = unitPrice,
                };

                if (isWeighed)
                {
                    var w = item.ExpectedWeight;
                    if (w <= 0 || double.IsNaN(w) || double.IsInfinity(w))
                    {
                        return BadRequest(new { error = $"Estimated weight (kg) is required for weighed item: {product.Name}" });
                    }

                    orderItem.Quantity = 1;
                    orderItem.ExpectedWeight = w;
                    lineAmount = Math.Round(unitPrice * (decimal)w, 2, MidpointRounding.AwayFromZero);
                }
                else
                {
                    if (item.ExpectedWeight > 0)
                    {
                        return BadRequest(new { error = $"Weight is only valid for kg items: {product.Name}" });
                    }

                    orderItem.Quantity = item.Quantity;
                    orderItem.ExpectedWeight = 0;
                    lineAmount = Math.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
                }

                order.Items.Add(orderItem);
                totalAmount += lineAmount;
            }

            // 配送订单：分区运费（StoreConfigs.DeliveryZoneFeesJson，空则每区默认 $10），满 FreeDeliveryThreshold 包邮
            if (orderType == "Delivery")
            {
                store = await _context.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync();
                var freeMin = store != null && store.FreeDeliveryThreshold > 0
                    ? store.FreeDeliveryThreshold
                    : StoreDeliveryHelper.DefaultFreeShippingMinAud;
                var itemsSubtotal = totalAmount;
                var deliveryFee = StoreDeliveryHelper.ComputeDeliveryFeeAud(
                    request.DeliverySuburb,
                    itemsSubtotal,
                    store?.DeliveryZoneFeesJson,
                    freeMin);
                totalAmount += deliveryFee;
            }

            if (totalAmount <= 0 || totalAmount > 100000m)
                return BadRequest(new { error = "Order total is outside the allowed range" });
            order.TotalAmount = Math.Round(totalAmount, 2, MidpointRounding.AwayFromZero);

            // === 步骤 6: 取件码（6 位数字，支付成功后邮件通知） ===
            order.PickupCode = GeneratePickupCode();

            // === 步骤 7: 保存到数据库 ===
            _context.Orders.Add(order);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // A concurrent retry may win the unique (UserId, ClientRequestId) insert.
                // Return that order instead of surfacing a conflict or creating another order.
                _context.ChangeTracker.Clear();
                existingOrder = await _context.Orders.AsNoTracking()
                    .FirstOrDefaultAsync(o => o.UserId == currentUserId && o.ClientRequestId == clientRequestId);
                if (existingOrder == null) throw;
                return Ok(new
                {
                    message = "Order already created",
                    orderId = existingOrder.Id,
                    totalAmount = existingOrder.TotalAmount,
                    idempotentReplay = true,
                });
            }

            // === 步骤 8: 返回订单详情（后续会添加 Stripe PaymentIntent） ===
            return Ok(new { message = "Order created", orderId = order.Id, totalAmount = order.TotalAmount });
        }
    }
}
