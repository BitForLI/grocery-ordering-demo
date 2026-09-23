using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.DTOs;
using igaServer.Utils;

namespace igaServer.Controllers
{
    public partial class OrderController
    {
        // ==========================================
        // 2. 获取订单详情
        // GET: api/order/{orderId}
        // ==========================================
        [HttpGet("{orderId}")]
        public async Task<ActionResult<OrderDetailDto>> GetOrder(int orderId)
        {
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound("Order not found");
            }

            if (!CanAccessOrder(order.UserId)) return Forbid();

            if (User.IsInRole("Admin") || User.IsInRole("Staff"))
            {
                AdminAuditLogHelper.Add(_context, User, "OrderViewed", "Order", order.Id);
                await _context.SaveChangesAsync();
            }

            var dto = MapToOrderDetailDto(order);
            return Ok(dto);
        }

        // ==========================================
        // 3. 获取用户的所有订单
        // GET: api/order/user/{userId}
        // ==========================================
        [HttpGet("user/{userId}")]
        public async Task<ActionResult<List<OrderDetailDto>>> GetUserOrders(int userId)
        {
            if (!User.IsInRole("Admin") &&
                (!TryGetCurrentUserId(out var currentUserId) || currentUserId != userId))
                return Forbid();
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
            {
                return BadRequest("用户不存在");
            }

            var orders = await _context.Orders
                .Where(o => o.UserId == userId)
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

            if (User.IsInRole("Admin"))
            {
                AdminAuditLogHelper.Add(_context, User, "CustomerOrderHistoryViewed", "User", userId);
                await _context.SaveChangesAsync();
            }

            var dtos = orders.Select(o => MapToOrderDetailDto(o)).ToList();
            return Ok(dtos);
        }
    }
}
