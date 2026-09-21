using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO;
using System.Text.Json;
using Stripe;
using Stripe.Checkout;
using IGA.Services;
using igaServer.Data;
using igaServer.Utils;
using igaServer.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using System.Data;
using System.Security.Cryptography;

namespace igaServer.Controllers
{
    /// <summary>
    /// 后台管理 API：仪表盘、订单、用户、商品
    /// </summary>
    [Route("api/admin")]
    [ApiController]
    [Authorize(Roles = "Admin,Staff")]
    public partial class AdminProductController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly IStripeService _stripeService;
        private readonly IResendEmailService _resendEmail;
        private readonly IOrderCompletionReceiptSender _completionReceiptSender;
        private readonly ILogger<AdminProductController> _logger;

        public AdminProductController(
            ApplicationDbContext context,
            IConfiguration configuration,
            IStripeService stripeService,
            IResendEmailService resendEmail,
            IOrderCompletionReceiptSender completionReceiptSender,
            ILogger<AdminProductController> logger)
        {
            _context = context;
            _configuration = configuration;
            _stripeService = stripeService;
            _resendEmail = resendEmail;
            _completionReceiptSender = completionReceiptSender;
            _logger = logger;
        }

        private async Task<IActionResult?> RequireAdminAsync()
        {
            var (ok, role) = await BackofficeAuthHelper.GetUserRoleAsync(Request, _context);
            if (!ok) return Unauthorized(new { error = "Sign in required" });
            if (!BackofficeAuthHelper.IsAdmin(role)) return StatusCode(403, new { error = "Admin only" });
            return null;
        }

        private async Task<IActionResult?> RequireStaffOrAdminAsync()
        {
            var (ok, role) = await BackofficeAuthHelper.GetUserRoleAsync(Request, _context);
            if (!ok) return Unauthorized(new { error = "Sign in required" });
            if (!BackofficeAuthHelper.IsStaffOrAdmin(role)) return StatusCode(403, new { error = "Staff or Admin only" });
            return null;
        }
    }
}
