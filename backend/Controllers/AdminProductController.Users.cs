using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Utils;

namespace igaServer.Controllers
{
    public partial class AdminProductController
    {
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            // 仅显示有过订单的用户（含访客 Guest）
            var query = _context.Users
                .Where(u => _context.Orders.Any(o => o.UserId == u.Id))
                .OrderByDescending(u => u.CreatedAt);
            var total = await query.CountAsync();
            var userRows = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new {
                    id = u.Id,
                    name = u.Email == "guest@iga.local" ? "Guest" : (u.Name ?? ""),
                    email = u.Email == "guest@iga.local" ? "(Guest order)" : u.Email,
                    phoneNumber = u.PhoneNumber,
                    role = u.Role,
                    createdAt = u.CreatedAt
                })
                .ToListAsync();
            var users = userRows.Select(u => new
            {
                u.id,
                u.name,
                u.email,
                phoneNumber = MaskPhone(u.phoneNumber),
                u.role,
                u.createdAt,
            }).ToList();
            AdminAuditLogHelper.Add(_context, User, "CustomerListViewed", "User", "page", $"page={page};pageSize={pageSize}");
            await _context.SaveChangesAsync();
            return Ok(new { items = users, total, page, pageSize });
        }

        [HttpGet("audit-logs")]
        public async Task<IActionResult> GetAuditLogs(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 50;

            var query = _context.AdminAuditLogs
                .AsNoTracking()
                .OrderByDescending(x => x.CreatedAtUtc);
            var total = await query.CountAsync();
            var items = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new { items, total, page, pageSize });
        }

        [HttpGet("users/{userId}")]
        public async Task<IActionResult> GetUser(int userId)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return NotFound();
            AdminAuditLogHelper.Add(_context, User, "CustomerViewed", "User", user.Id);
            await _context.SaveChangesAsync();
            var name = user.Email == "guest@iga.local" ? "Guest" : user.Name;
            var email = user.Email == "guest@iga.local" ? "(Guest order)" : user.Email;
            return Ok(new { id = user.Id, name = name, email = email, phoneNumber = user.PhoneNumber, role = user.Role, createdAt = user.CreatedAt });
        }

        private static string MaskPhone(string? phone)
        {
            if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
            var digits = new string(phone.Where(char.IsDigit).ToArray());
            if (digits.Length <= 4) return "••••";
            return $"••••••{digits[^4..]}";
        }
    }
}
