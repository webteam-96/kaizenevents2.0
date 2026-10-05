using System.Security.Cryptography;
using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Cashfree vendor KYC management.
///   Admin endpoints (auth required): list/create/update/delete/toggle/refresh.
///   Public endpoint (token-protected): /api/cashfree-kyc/onboard — for vendor self-onboarding via shared link.
/// </summary>
[ApiController]
[Route("api/cashfree-kyc")]
[Authorize]
public class CashfreeKycController : ApiControllerBase
{
    private readonly ICashfreeKycRepository _kyc;
    private readonly ICampaignRepository _campaigns;
    private readonly IUserRepository _users;
    private readonly ICashfreeService _cashfree;
    private readonly IOtpService _otp;
    private readonly IBrevoService _email;
    private readonly IEncryptionService _enc;
    private readonly IAuditLoggerService _audit;
    private readonly ILogger<CashfreeKycController> _logger;

    public CashfreeKycController(
        ICashfreeKycRepository kyc,
        ICampaignRepository campaigns,
        IUserRepository users,
        ICashfreeService cashfree,
        IOtpService otp,
        IBrevoService email,
        IEncryptionService enc,
        IAuditLoggerService audit,
        ILogger<CashfreeKycController> logger)
    {
        _kyc       = kyc;
        _campaigns = campaigns;
        _users     = users;
        _cashfree  = cashfree;
        _otp       = otp;
        _email     = email;
        _enc       = enc;
        _audit     = audit;
        _logger    = logger;
    }

    /// <summary>
    /// True if the current user is a Director (org_admin with can_approve_transfers = true).
    /// Directors get the same Cashfree-vendor visibility as Super Admins (see all vendors).
    /// </summary>
    private async Task<bool> IsDirectorAsync()
    {
        if (string.IsNullOrEmpty(CurrentUserId)) return false;
        var u = await _users.GetByIdAsync(CurrentUserId);
        return u?.CanApproveTransfers == true;
    }

    private async Task<bool> HasFullVisibilityAsync()
        => IsSuperAdmin || await IsDirectorAsync();

    /// <summary>
    /// Returns the campaign IDs the current user can act on, or null for full-visibility users (super_admin / director).
    /// </summary>
    private async Task<HashSet<string>?> GetAccessibleCampaignIdsAsync()
    {
        if (await HasFullVisibilityAsync() || string.IsNullOrEmpty(CurrentUserId)) return null;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.ToHashSet();
    }

    /// <summary>
    /// For users without full visibility: requires row.Role == "settlement" AND row.CampaignId in user's accessible list.
    /// </summary>
    private async Task<IActionResult?> CheckRowAccessAsync(CashfreeKyc row)
    {
        if (await HasFullVisibilityAsync()) return null;
        if (row.Role != "settlement")
            return Forbidden("Only Super Admin or Director can manage commission vendors.");
        if (string.IsNullOrEmpty(row.CampaignId))
            return Forbidden("This vendor is not linked to any event.");
        var accessible = await GetAccessibleCampaignIdsAsync();
        if (accessible == null || !accessible.Contains(row.CampaignId))
            return Forbidden("You don't have access to this event's vendor.");
        return null;
    }

    // ── GET /api/cashfree-kyc ─────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? campaign_id = null)
    {
        if (!IsAdminRole) return Forbidden();
        var rows = (string.IsNullOrEmpty(campaign_id)
            ? await _kyc.GetAllAsync()
            : await _kyc.GetByCampaignIdAsync(campaign_id)).AsEnumerable();

        if (!await HasFullVisibilityAsync())
        {
            // Org Admin (non-Director): only settlement vendors for campaigns they have access to
            var accessible = await GetAccessibleCampaignIdsAsync() ?? new HashSet<string>();
            rows = rows.Where(r =>
                r.Role == "settlement" &&
                !string.IsNullOrEmpty(r.CampaignId) &&
                accessible.Contains(r.CampaignId!));
        }

        return Ok(rows.Select(ToListResponse));
    }

    // ── GET /api/cashfree-kyc/{id} ────────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetDetail(string id)
    {
        if (!IsAdminRole) return Forbidden();
        var row = await _kyc.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Vendor KYC not found." });
        var accessErr = await CheckRowAccessAsync(row);
        if (accessErr != null) return accessErr;
        return Ok(ToDetailResponse(row));
    }

    // ── POST /api/cashfree-kyc/send-otp ───────────────────────────────────────
    /// <summary>Sends a 6-digit OTP to the admin's email (or to a target email for public onboarding).</summary>
    [HttpPost("send-otp")]
    public async Task<IActionResult> SendOtp([FromBody] SendOtpRequest req)
    {
        if (!IsAdminRole) return Forbidden();
        if (string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { detail = "Email is required." });

        var contextKey = $"kyc:admin:{CurrentUserId}";
        var otp = _otp.Generate(contextKey);

        var html = $@"
<h2>Cashfree Vendor KYC — OTP Verification</h2>
<p>Your 6-digit OTP is: <strong style='font-size:24px;'>{otp}</strong></p>
<p>Enter this OTP within 10 minutes to confirm vendor KYC submission.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";

        var sent = await _email.SendEmailAsync(req.Email, "Admin", "Vendor KYC OTP — Kaizen Events", html);
        if (!sent)
            return StatusCode(500, new { detail = "Failed to send OTP email." });

        return Ok(new { success = true, message = "OTP sent to " + req.Email });
    }

    // ── POST /api/cashfree-kyc ────────────────────────────────────────────────
    /// <summary>Verify OTP + save vendor + create in Cashfree. Used for both create AND update.</summary>
    [HttpPost]
    public async Task<IActionResult> CreateOrUpdate([FromBody] SaveKycRequest req)
    {
        if (!IsAdminRole) return Forbidden();

        // Non-super-admins can only manage settlement vendors (legacy label) and must specify a campaign.
        // Role is now informational only — split routing comes from campaign_vendor_splits + default vendor.
        if (!IsSuperAdmin)
        {
            req = req with { Role = string.IsNullOrWhiteSpace(req.Role) ? "settlement" : req.Role };
            if (string.IsNullOrWhiteSpace(req.CampaignId))
                return BadRequest(new { detail = "An event must be selected. Open the vendor form from Event Settings → Vendors." });
        }
        else if (string.IsNullOrWhiteSpace(req.Role))
        {
            req = req with { Role = "settlement" };
        }

        var validationError = ValidateForm(req);
        if (validationError != null) return BadRequest(new { detail = validationError });

        // Verify OTP
        var contextKey = $"kyc:admin:{CurrentUserId}";
        if (!_otp.VerifyAndConsume(contextKey, req.Otp ?? ""))
            return BadRequest(new { detail = "Invalid or expired OTP." });

        // Compute auto-generated vendor_id if not provided (per-event format: {slug}_{role})
        var vendorId = await ResolveVendorIdAsync(req);

        // Find existing row (update path) or create new
        CashfreeKyc? existing = !string.IsNullOrEmpty(req.KycId)
            ? await _kyc.GetByIdAsync(req.KycId!)
            : await _kyc.GetByVendorIdAsync(vendorId);
        var isUpdate = existing != null;

        if (isUpdate)
        {
            var accessErr = await CheckRowAccessAsync(existing!);
            if (accessErr != null) return accessErr;
        }
        else if (!IsSuperAdmin && !string.IsNullOrEmpty(req.CampaignId))
        {
            // Org Admin / Director creating: must have access to the target campaign
            var accessible = await GetAccessibleCampaignIdsAsync();
            if (accessible != null && !accessible.Contains(req.CampaignId))
                return Forbidden("You don't have access to this event.");
        }

        if (!isUpdate && await _kyc.VendorIdExistsAsync(vendorId))
            return BadRequest(new { detail = $"Vendor ID '{vendorId}' already exists. Pick a different name or update the existing record." });

        var entity = existing ?? new CashfreeKyc
        {
            Id        = Guid.NewGuid().ToString(),
            VendorId  = vendorId,
            CreatedAt = DateTime.UtcNow
        };

        // Apply form fields
        entity.CampaignId          = req.CampaignId;
        entity.Role                = req.Role.ToLowerInvariant();
        entity.Name                = req.Name.Trim();
        entity.Email               = req.Email.Trim();
        entity.Phone               = req.Phone.Trim();
        entity.AccountHolder       = req.AccountHolder.Trim();
        entity.AccountNumber       = _enc.Encrypt(req.AccountNumber.Trim());
        entity.AccountNumberMasked = MaskAccount(req.AccountNumber.Trim());
        entity.Ifsc                = req.Ifsc.Trim().ToUpperInvariant();
        entity.Pan                 = req.Pan.Trim().ToUpperInvariant();
        entity.Gst                 = string.IsNullOrWhiteSpace(req.Gst) ? null : req.Gst.Trim().ToUpperInvariant();
        entity.SubmittedAt         = DateTime.UtcNow;
        entity.UpdatedAt           = DateTime.UtcNow;

        // Call Cashfree Vendor API
        try
        {
            var cfReq = new CashfreeVendorRequest(
                VendorId:      vendorId,
                Name:          entity.Name,
                Email:         entity.Email,
                Phone:         entity.Phone,
                AccountNumber: req.AccountNumber.Trim(),
                AccountHolder: entity.AccountHolder,
                Ifsc:          entity.Ifsc,
                Pan:           entity.Pan,
                Gst:           entity.Gst);

            CashfreeVendorResult cfResult = isUpdate
                ? await _cashfree.UpdateVendorAsync(cfReq)
                : await _cashfree.CreateVendorAsync(cfReq);

            entity.Status       = cfResult.Status;
            entity.CashfreeJson = cfResult.RawJson;
            if (cfResult.Status == "ACTIVE") entity.VerifiedAt = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cashfree vendor API failed for {VendorId}", vendorId);
            entity.Status       = "REJECTED";
            entity.CashfreeJson = JsonSerializer.Serialize(new { error = ex.Message });
            // Save anyway so admin can see what was attempted
        }

        if (isUpdate) await _kyc.UpdateAsync(entity);
        else          await _kyc.CreateAsync(entity);

        return Ok(ToDetailResponse(entity));
    }

    // ── PATCH /api/cashfree-kyc/{id}/toggle-active ────────────────────────────
    [HttpPatch("{id}/toggle-active")]
    public async Task<IActionResult> ToggleActive(string id)
    {
        if (!IsAdminRole) return Forbidden();
        var row = await _kyc.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Vendor KYC not found." });
        var accessErr = await CheckRowAccessAsync(row);
        if (accessErr != null) return accessErr;

        row.IsActive  = !row.IsActive;
        row.UpdatedAt = DateTime.UtcNow;
        await _kyc.UpdateAsync(row);
        return Ok(new { success = true, is_active = row.IsActive });
    }

    // ── DELETE /api/cashfree-kyc/{id} ─────────────────────────────────────────
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        if (!IsAdminRole) return Forbidden();
        var row = await _kyc.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Vendor KYC not found." });
        var accessErr = await CheckRowAccessAsync(row);
        if (accessErr != null) return accessErr;

        if (row.IsActive)
            return BadRequest(new { detail = "Deactivate the vendor first before deleting." });

        await _kyc.DeleteAsync(row);
        return Ok(new { success = true });
    }

    // ── POST /api/cashfree-kyc/refresh-all ────────────────────────────────────
    [HttpPost("refresh-all")]
    public async Task<IActionResult> RefreshAll()
    {
        if (!IsAdminRole) return Forbidden();
        var all = (await _kyc.GetAllAsync()).AsEnumerable();

        if (!await HasFullVisibilityAsync())
        {
            var accessible = await GetAccessibleCampaignIdsAsync() ?? new HashSet<string>();
            all = all.Where(r =>
                r.Role == "settlement" &&
                !string.IsNullOrEmpty(r.CampaignId) &&
                accessible.Contains(r.CampaignId!));
        }

        var pending = all.Where(k => k.Status != "ACTIVE").ToList();
        int updated = 0;

        foreach (var row in pending)
        {
            try
            {
                var result = await _cashfree.GetVendorAsync(row.VendorId);
                if (row.Status != result.Status)
                {
                    row.Status = result.Status;
                    if (result.Status == "ACTIVE") row.VerifiedAt = DateTime.UtcNow;
                }
                row.CashfreeJson = result.RawJson;
                row.UpdatedAt    = DateTime.UtcNow;
                await _kyc.UpdateAsync(row);
                updated++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Refresh failed for vendor {Id}", row.VendorId);
            }
        }

        return Ok(new { success = true, message = $"Refreshed {updated} vendor(s).", updatedCount = updated });
    }

    // ── POST /api/cashfree-kyc/{id}/refresh ───────────────────────────────────
    [HttpPost("{id}/refresh")]
    public async Task<IActionResult> RefreshSingle(string id)
    {
        if (!IsAdminRole) return Forbidden();
        var row = await _kyc.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Vendor KYC not found." });
        var accessErr = await CheckRowAccessAsync(row);
        if (accessErr != null) return accessErr;

        try
        {
            var result = await _cashfree.GetVendorAsync(row.VendorId);
            row.Status       = result.Status;
            row.CashfreeJson = result.RawJson;
            row.UpdatedAt    = DateTime.UtcNow;
            if (result.Status == "ACTIVE" && row.VerifiedAt == null) row.VerifiedAt = DateTime.UtcNow;
            await _kyc.UpdateAsync(row);
            return Ok(new { success = true, status = row.Status });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cashfree refresh failed for vendor {Id}", row.VendorId);
            return StatusCode(500, new { detail = "Failed to refresh from Cashfree." });
        }
    }

    // ── POST /api/cashfree-kyc/{id}/share-link ────────────────────────────────
    /// <summary>Generates a fresh onboarding token for vendor self-fill. Returns the public URL.</summary>
    [HttpPost("{id}/share-link")]
    public async Task<IActionResult> GenerateShareLink(string id)
    {
        if (!IsAdminRole) return Forbidden();
        var row = await _kyc.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Vendor KYC not found." });
        var accessErr = await CheckRowAccessAsync(row);
        if (accessErr != null) return accessErr;

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        row.OnboardingToken = token;
        row.UpdatedAt       = DateTime.UtcNow;
        await _kyc.UpdateAsync(row);

        var frontend = HttpContext.RequestServices
            .GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>()["App:FrontendUrl"] ?? "http://localhost:3000";
        return Ok(new
        {
            success = true,
            url     = $"{frontend.TrimEnd('/')}/vendor-onboarding/{token}",
            token
        });
    }

    // ── GET /api/cashfree-kyc/onboarding/{token} (PUBLIC) ─────────────────────
    /// <summary>Vendor opens the share link → frontend GETs this to fetch any pre-filled context (name, role).</summary>
    [HttpGet("onboarding/{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetOnboardingContext(string token)
    {
        var row = await _kyc.GetByOnboardingTokenAsync(token);
        if (row == null)
            return NotFound(new { detail = "Onboarding link is invalid or has expired." });

        return Ok(new
        {
            vendor_role  = row.Role,
            campaign_id  = row.CampaignId,
            // Don't reveal the vendor_id to the vendor
            prefill = new
            {
                name           = row.Name,
                email          = row.Email,
                phone          = row.Phone,
                account_holder = row.AccountHolder
                // No bank account / PAN / IFSC — vendor must fill those fresh
            }
        });
    }

    // ── POST /api/cashfree-kyc/onboarding/{token}/send-otp (PUBLIC) ───────────
    [HttpPost("onboarding/{token}/send-otp")]
    [AllowAnonymous]
    public async Task<IActionResult> SendOnboardingOtp(string token, [FromBody] PublicSendOtpRequest req)
    {
        var row = await _kyc.GetByOnboardingTokenAsync(token);
        if (row == null) return NotFound(new { detail = "Onboarding link is invalid." });
        if (string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { detail = "Email is required." });

        var contextKey = $"kyc:onboarding:{token}";
        var otp = _otp.Generate(contextKey);

        var html = $@"
<h2>Vendor Onboarding — OTP</h2>
<p>Your 6-digit OTP is: <strong style='font-size:24px;'>{otp}</strong></p>
<p>Enter this OTP within 10 minutes to confirm your KYC submission.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";

        var sent = await _email.SendEmailAsync(req.Email, "Vendor", "Your KYC OTP — Kaizen Events", html);
        if (!sent) return StatusCode(500, new { detail = "Failed to send OTP." });

        return Ok(new { success = true, message = $"OTP sent to {req.Email}" });
    }

    // ── POST /api/cashfree-kyc/onboarding/{token}/submit (PUBLIC) ─────────────
    [HttpPost("onboarding/{token}/submit")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicSubmit(string token, [FromBody] SaveKycRequest req)
    {
        var row = await _kyc.GetByOnboardingTokenAsync(token);
        if (row == null) return NotFound(new { detail = "Onboarding link is invalid." });

        var validationError = ValidateForm(req, allowEmptyKycId: true);
        if (validationError != null) return BadRequest(new { detail = validationError });

        var contextKey = $"kyc:onboarding:{token}";
        if (!_otp.VerifyAndConsume(contextKey, req.Otp ?? ""))
            return BadRequest(new { detail = "Invalid or expired OTP." });

        // Apply form fields onto the existing row (vendor_id, role, campaign_id stay as set by admin)
        row.Name                = req.Name.Trim();
        row.Email               = req.Email.Trim();
        row.Phone               = req.Phone.Trim();
        row.AccountHolder       = req.AccountHolder.Trim();
        row.AccountNumber       = _enc.Encrypt(req.AccountNumber.Trim());
        row.AccountNumberMasked = MaskAccount(req.AccountNumber.Trim());
        row.Ifsc                = req.Ifsc.Trim().ToUpperInvariant();
        row.Pan                 = req.Pan.Trim().ToUpperInvariant();
        row.Gst                 = string.IsNullOrWhiteSpace(req.Gst) ? null : req.Gst.Trim().ToUpperInvariant();
        row.SubmittedAt         = DateTime.UtcNow;
        row.UpdatedAt           = DateTime.UtcNow;

        // Call Cashfree
        try
        {
            var cfReq = new CashfreeVendorRequest(row.VendorId, row.Name, row.Email, row.Phone,
                req.AccountNumber.Trim(), row.AccountHolder, row.Ifsc, row.Pan, row.Gst);
            var cfResult = await _cashfree.CreateVendorAsync(cfReq);
            row.Status       = cfResult.Status;
            row.CashfreeJson = cfResult.RawJson;
            if (cfResult.Status == "ACTIVE") row.VerifiedAt = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cashfree vendor create failed during public onboarding for {VendorId}", row.VendorId);
            row.Status       = "REJECTED";
            row.CashfreeJson = JsonSerializer.Serialize(new { error = ex.Message });
        }

        // Consume the token (one-shot)
        row.OnboardingToken = null;
        await _kyc.UpdateAsync(row);

        return Ok(new
        {
            success = true,
            status  = row.Status,
            message = row.Status == "ACTIVE"
                ? "KYC submitted and verified successfully."
                : "Submitted. Pending verification by Cashfree."
        });
    }

    // ── PUT /api/cashfree-kyc/{id}/set-default ────────────────────────────────
    /// <summary>
    /// Marks this vendor as the Kaizen default and stores the global percentage.
    /// Atomically clears the flag from any other vendor. Super-admin only.
    /// </summary>
    [HttpPut("{id}/set-default")]
    public async Task<IActionResult> SetDefault(string id, [FromBody] SetDefaultVendorRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var row = await _kyc.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Vendor KYC not found." });

        if (row.Status != "ACTIVE" || !row.IsActive)
            return BadRequest(new { detail = "Vendor must be ACTIVE and enabled before marking as default." });
        if (req.DefaultPercentage <= 0m || req.DefaultPercentage >= 100m)
            return BadRequest(new { detail = "default_percentage must be between 0 and 100 (exclusive)." });

        await _kyc.SetDefaultKaizenVendorAsync(id, req.DefaultPercentage);

        await _audit.LogAsync(AuditEventType.SystemConfig,
            resourceType: "cashfree_kyc", resourceId: id,
            actionDetails: new { kaizen_default = true, default_percentage = req.DefaultPercentage },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        var refreshed = await _kyc.GetByIdAsync(id);
        return Ok(ToDetailResponse(refreshed!));
    }

    // ── DELETE /api/cashfree-kyc/default ──────────────────────────────────────
    /// <summary>Clears the Kaizen-default flag from whichever vendor currently holds it. Super-admin only.</summary>
    [HttpDelete("default")]
    public async Task<IActionResult> ClearDefault()
    {
        if (!IsSuperAdmin) return Forbidden();
        await _kyc.ClearDefaultKaizenVendorAsync();

        await _audit.LogAsync(AuditEventType.SystemConfig,
            resourceType: "cashfree_kyc", resourceId: null,
            actionDetails: new { kaizen_default = (string?)null },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<string> ResolveVendorIdAsync(SaveKycRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.VendorId))
            return SanitizeVendorId(req.VendorId.Trim());

        var role = req.Role.ToLowerInvariant();

        // Auto-generate from event slug + role (strict alphanumeric — Cashfree rejects hyphens/underscores)
        if (!string.IsNullOrWhiteSpace(req.CampaignId))
        {
            var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
            if (campaign != null)
            {
                var cleanSlug = SanitizeVendorId(campaign.Slug.ToLowerInvariant());
                return $"{cleanSlug}{role}";
            }
        }

        // Fallback: random suffix
        return $"vendor{role}{Guid.NewGuid().ToString("N")[..8]}";
    }

    /// <summary>
    /// Cashfree vendor_id constraint: strictly alphanumeric (a-z, A-Z, 0-9).
    /// Strips hyphens, underscores, dots, spaces, etc.
    /// </summary>
    private static string SanitizeVendorId(string s)
    {
        var sb = new System.Text.StringBuilder(s.Length);
        foreach (var c in s)
            if (char.IsLetterOrDigit(c)) sb.Append(c);
        return sb.ToString();
    }

    private static string? ValidateForm(SaveKycRequest r, bool allowEmptyKycId = false)
    {
        if (string.IsNullOrWhiteSpace(r.Name))         return "Name is required.";
        if (string.IsNullOrWhiteSpace(r.Email))        return "Email is required.";
        if (string.IsNullOrWhiteSpace(r.Phone))        return "Phone is required.";
        if (string.IsNullOrWhiteSpace(r.AccountHolder)) return "Account holder name is required.";
        if (string.IsNullOrWhiteSpace(r.AccountNumber)) return "Account number is required.";
        if (string.IsNullOrWhiteSpace(r.Ifsc))         return "IFSC is required.";
        if (string.IsNullOrWhiteSpace(r.Pan))          return "PAN is required.";
        if (!System.Text.RegularExpressions.Regex.IsMatch(r.Pan.Trim().ToUpperInvariant(), @"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"))
            return "Invalid PAN format. Expected: ABCDE1234F";
        // Role is now optional/free-text — kept for display only. No validation.
        return null;
    }

    private static string MaskAccount(string number)
    {
        if (string.IsNullOrEmpty(number) || number.Length <= 4) return number;
        return "****" + number[^4..];
    }

    private static object ToListResponse(CashfreeKyc k) => new
    {
        id                       = k.Id,
        vendor_id                = k.VendorId,
        campaign_id              = k.CampaignId,
        role                     = k.Role,
        name                     = k.Name,
        email                    = k.Email,
        phone                    = k.Phone,
        account_holder           = k.AccountHolder,
        account_number           = k.AccountNumberMasked,    // masked, never plaintext
        ifsc                     = k.Ifsc,
        pan                      = k.Pan,
        gst                      = k.Gst,
        status                   = k.Status,
        is_active                = k.IsActive,
        is_default_kaizen_vendor = k.IsDefaultKaizenVendor,
        default_percentage       = k.DefaultPercentage,
        has_onboarding_token     = !string.IsNullOrEmpty(k.OnboardingToken),
        submitted_at             = k.SubmittedAt,
        verified_at              = k.VerifiedAt,
        created_at               = k.CreatedAt
    };

    private static object ToDetailResponse(CashfreeKyc k) => new
    {
        id                       = k.Id,
        vendor_id                = k.VendorId,
        campaign_id              = k.CampaignId,
        role                     = k.Role,
        name                     = k.Name,
        email                    = k.Email,
        phone                    = k.Phone,
        account_holder           = k.AccountHolder,
        account_number           = k.AccountNumberMasked,
        ifsc                     = k.Ifsc,
        pan                      = k.Pan,
        gst                      = k.Gst,
        status                   = k.Status,
        is_active                = k.IsActive,
        is_default_kaizen_vendor = k.IsDefaultKaizenVendor,
        default_percentage       = k.DefaultPercentage,
        has_onboarding_token     = !string.IsNullOrEmpty(k.OnboardingToken),
        submitted_at             = k.SubmittedAt,
        verified_at              = k.VerifiedAt,
        created_at               = k.CreatedAt,
        cashfree_json            = k.CashfreeJson
    };
}

public record SendOtpRequest(string Email);
public record PublicSendOtpRequest(string Email);
public record SetDefaultVendorRequest(decimal DefaultPercentage);

public record SaveKycRequest(
    string? KycId,
    string? VendorId,           // optional — auto-generated as {eventSlug}_{role} if blank
    string? CampaignId,
    string  Role,                // "commission" | "settlement"
    string  Name,
    string  Email,
    string  Phone,
    string  AccountHolder,
    string  AccountNumber,
    string  Ifsc,
    string  Pan,
    string? Gst,
    string? Otp);
