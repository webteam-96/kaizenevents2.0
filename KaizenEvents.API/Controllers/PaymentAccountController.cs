using KaizenEvents.Core.DTOs.PaymentAccount;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/payment-accounts")]
[Authorize]
public class PaymentAccountController : ApiControllerBase
{
    private readonly IPaymentAccountRepository _accounts;
    private readonly ICampaignRepository _campaigns;
    private readonly IEncryptionService _enc;

    public PaymentAccountController(
        IPaymentAccountRepository accounts,
        ICampaignRepository campaigns,
        IEncryptionService enc)
    {
        _accounts  = accounts;
        _campaigns = campaigns;
        _enc       = enc;
    }

    // ── POST /api/payment-accounts ────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePaymentAccountRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        if (await _accounts.NameExistsAsync(req.Name))
            return BadRequest(new { detail = "Payment account name already exists." });

        if (!Enum.TryParse<PaymentGatewayType>(ToPascal(req.GatewayType), out var gwType))
            return BadRequest(new { detail = "Invalid gateway_type." });

        var settlementMode = req.RazorpaySettlementMode ?? "route";
        if (!IsValidSettlementMode(settlementMode))
            return BadRequest(new { detail = "Invalid razorpay_settlement_mode. Must be 'route' or 'single_account'." });

        var account = new PaymentAccount
        {
            Id                  = Guid.NewGuid().ToString(),
            Name                = req.Name,
            GatewayType         = gwType,
            Description         = req.Description,
            IsActive            = req.IsActive,
            InstamojoApiKey     = EncryptNullable(req.InstamojoApiKey),
            InstamojoAuthToken  = EncryptNullable(req.InstamojoAuthToken),
            InstamojoSalt       = EncryptNullable(req.InstamojoSalt),
            InstamojoMode       = req.InstamojoMode ?? "sandbox",
            RazorpayKeyId       = EncryptNullable(req.RazorpayKeyId),
            RazorpayKeySecret   = EncryptNullable(req.RazorpayKeySecret),
            RazorpayMode        = req.RazorpayMode ?? "test",
            RazorpaySettlementMode = settlementMode,
            CashfreeAppId       = EncryptNullable(req.CashfreeAppId),
            CashfreeSecretKey   = EncryptNullable(req.CashfreeSecretKey),
            CashfreeMode        = req.CashfreeMode ?? "sandbox",
            CreatedBy           = CurrentUserId ?? "",
            CreatedAt           = DateTime.UtcNow,
            UpdatedAt           = DateTime.UtcNow
        };
        await _accounts.CreateAsync(account);
        return StatusCode(201, ToResponse(account));
    }

    // ── GET /api/payment-accounts ─────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!IsSuperAdmin) return Forbidden();
        var all = await _accounts.GetAllAsync();
        return Ok(all.Select(ToResponse));
    }

    // ── GET /api/payment-accounts/list (dropdown — any authenticated) ─────────
    [HttpGet("list")]
    public async Task<IActionResult> ListDropdown()
    {
        var active = await _accounts.GetActiveAsync();
        return Ok(active.Select(a => new
        {
            id           = a.Id,
            name         = a.Name,
            gateway_type = a.GatewayType.ToString().ToLowerInvariant(),
            is_active    = a.IsActive,
            razorpay_settlement_mode = a.RazorpaySettlementMode
        }));
    }

    // ── GET /api/payment-accounts/{account_id} ────────────────────────────────
    [HttpGet("{account_id}")]
    public async Task<IActionResult> GetById(string account_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var account = await _accounts.GetByIdAsync(account_id);
        if (account == null) return NotFound(new { detail = "Payment account not found." });
        return Ok(ToResponse(account));
    }

    // ── PUT /api/payment-accounts/{account_id} ────────────────────────────────
    [HttpPut("{account_id}")]
    public async Task<IActionResult> Update(string account_id, [FromBody] UpdatePaymentAccountRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var account = await _accounts.GetByIdAsync(account_id);
        if (account == null) return NotFound(new { detail = "Payment account not found." });

        if (req.Name != null)             account.Name              = req.Name;
        if (req.Description != null)      account.Description       = req.Description;
        if (req.IsActive.HasValue)        account.IsActive          = req.IsActive.Value;
        if (req.InstamojoApiKey != null)  account.InstamojoApiKey   = EncryptNullable(req.InstamojoApiKey);
        if (req.InstamojoAuthToken != null) account.InstamojoAuthToken = EncryptNullable(req.InstamojoAuthToken);
        if (req.InstamojoSalt != null)    account.InstamojoSalt     = EncryptNullable(req.InstamojoSalt);
        if (req.InstamojoMode != null)    account.InstamojoMode     = req.InstamojoMode;
        if (req.RazorpayKeyId != null)    account.RazorpayKeyId     = EncryptNullable(req.RazorpayKeyId);
        if (req.RazorpayKeySecret != null) account.RazorpayKeySecret = EncryptNullable(req.RazorpayKeySecret);
        if (req.RazorpayMode != null)     account.RazorpayMode      = req.RazorpayMode;
        if (req.RazorpaySettlementMode != null)
        {
            if (!IsValidSettlementMode(req.RazorpaySettlementMode))
                return BadRequest(new { detail = "Invalid razorpay_settlement_mode. Must be 'route' or 'single_account'." });
            account.RazorpaySettlementMode = req.RazorpaySettlementMode;
        }
        if (req.CashfreeAppId != null)    account.CashfreeAppId     = EncryptNullable(req.CashfreeAppId);
        if (req.CashfreeSecretKey != null) account.CashfreeSecretKey = EncryptNullable(req.CashfreeSecretKey);
        if (req.CashfreeMode != null)     account.CashfreeMode      = req.CashfreeMode;

        account.UpdatedAt = DateTime.UtcNow;
        await _accounts.UpdateAsync(account);
        return Ok(ToResponse(account));
    }

    // ── DELETE /api/payment-accounts/{account_id} ─────────────────────────────
    [HttpDelete("{account_id}")]
    public async Task<IActionResult> Delete(string account_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var account = await _accounts.GetByIdAsync(account_id);
        if (account == null) return NotFound(new { detail = "Payment account not found." });

        // Check if any campaigns use this account
        var all = await _campaigns.GetAllAsync();
        var count = all.Count(c => c.PaymentAccountId == account_id);
        if (count > 0)
            return BadRequest(new { detail = $"Cannot delete: {count} campaign(s) are using this payment account. Please reassign them first." });

        await _accounts.DeleteAsync(account);
        return Ok(new { message = "Payment account deleted successfully." });
    }

    // ── GET /api/payment-accounts/{account_id}/stats ──────────────────────────
    [HttpGet("{account_id}/stats")]
    public async Task<IActionResult> GetStats(string account_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var account = await _accounts.GetByIdAsync(account_id);
        if (account == null) return NotFound(new { detail = "Payment account not found." });

        return Ok(new
        {
            account_id           = account.Id,
            account_name         = account.Name,
            gateway_type         = account.GatewayType.ToString().ToLowerInvariant(),
            available_balance    = (decimal?)null,
            pending_balance      = (decimal?)null,
            total_transactions   = account.TotalTransactions,
            total_amount         = account.TotalAmountCollected,
            last_transaction_at  = account.LastTransactionAt,
            last_updated         = DateTime.UtcNow
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private object ToResponse(PaymentAccount a) => new
    {
        id                         = a.Id,
        name                       = a.Name,
        gateway_type               = a.GatewayType.ToString().ToLowerInvariant(),
        description                = a.Description,
        is_active                  = a.IsActive,
        instamojo_mode             = a.InstamojoMode,
        razorpay_mode              = a.RazorpayMode,
        razorpay_settlement_mode   = a.RazorpaySettlementMode,
        cashfree_mode              = a.CashfreeMode,
        has_instamojo_credentials  = !string.IsNullOrEmpty(a.InstamojoApiKey) &&
                                     !string.IsNullOrEmpty(a.InstamojoAuthToken),
        has_razorpay_credentials   = !string.IsNullOrEmpty(a.RazorpayKeyId) &&
                                     !string.IsNullOrEmpty(a.RazorpayKeySecret),
        has_cashfree_credentials   = !string.IsNullOrEmpty(a.CashfreeAppId) &&
                                     !string.IsNullOrEmpty(a.CashfreeSecretKey),
        total_transactions         = a.TotalTransactions,
        total_amount_collected     = a.TotalAmountCollected,
        last_transaction_at        = a.LastTransactionAt,
        created_at                 = a.CreatedAt,
        updated_at                 = a.UpdatedAt
    };

    private static bool IsValidSettlementMode(string mode) =>
        mode is "route" or "single_account";

    private string? EncryptNullable(string? val) =>
        string.IsNullOrEmpty(val) ? val : _enc.Encrypt(val);

    private static string ToPascal(string snake) =>
        string.Join("", snake.Split('_').Select(p =>
            p.Length == 0 ? "" : char.ToUpperInvariant(p[0]) + p[1..]));
}
