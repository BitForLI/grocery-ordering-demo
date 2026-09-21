using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using igaServer.Models;
using igaServer.Utils;

namespace igaServer.Controllers
{
    public partial class AdminProductController
    {
        [HttpGet("products")]
        public async Task<IActionResult> GetProducts(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? search = null)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;

            // 从 Query 读取 category（避免部分环境下 [FromQuery] string? category 未绑定导致筛选失效）
            var categoryRaw = Request.Query["category"].FirstOrDefault();

            var query = _context.Products.AsQueryable();

            // 分类精确匹配（不区分大小写）；常见误写 Vegetable -> Vegetables、Fruits -> Fruit
            if (!string.IsNullOrWhiteSpace(categoryRaw))
            {
                var c = categoryRaw.Trim();
                if (string.Equals(c, "Vegetable", StringComparison.OrdinalIgnoreCase))
                    c = "Vegetables";
                if (string.Equals(c, "Fruits", StringComparison.OrdinalIgnoreCase))
                    c = "Fruit";
                query = query.Where(p => p.Category != null && EF.Functions.ILike(p.Category, c));
            }

            // ILIKE：英文大小写不敏感（PostgreSQL）
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(p => EF.Functions.ILike(p.Name, $"%{term}%"));
            }

            query = query.OrderBy(p => p.Name).ThenBy(p => p.Id);

            var total = await query.CountAsync();
            var items = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                items,
                total,
                page,
                pageSize
            });
        }

        /// <summary>后台编辑商品：拉取完整字段（含成本价）</summary>
        [HttpGet("products/{id:int}")]
        public async Task<IActionResult> GetProduct(int id)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var p = await _context.Products.FindAsync(id);
            if (p == null) return NotFound();
            return Ok(p);
        }

        /// <summary>上传商品图片（保存到数据库，返回可直接访问的 /api/product/image/{id}）</summary>
        [HttpPost("products/upload-image")]
        [RequestSizeLimit(5 * 1024 * 1024)]
        [EnableRateLimiting("sensitive")]
        public async Task<IActionResult> UploadProductImage(IFormFile? file)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var (image, error) = await ImageUploadValidator.ValidateAsync(file, 5 * 1024 * 1024, HttpContext.RequestAborted);
            if (image == null) return BadRequest(new { error });
            var id = Guid.NewGuid();
            _context.ProductImages.Add(new ProductImage
            {
                Id = id,
                ImageBytes = image.Bytes,
                ContentType = image.ContentType,
                CreatedAtUtc = DateTime.UtcNow,
            });
            await _context.SaveChangesAsync();

            var url = $"/api/product/image/{id:D}";
            return Ok(new { url });
        }
    }
}
