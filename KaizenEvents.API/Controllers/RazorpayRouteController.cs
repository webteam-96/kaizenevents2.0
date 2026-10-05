using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Razorpay Route linked-account registry + onboarding. Admin onboards Linked Accounts
/// directly from the app — backend calls Razorpay v2 /accounts → /stakeholders → /products
/// and stores the returned ids + activation status locally.
/// </summary>
[ApiController]
[Route("api/razorpay-route")]
[Authorize]
public class RazorpayRouteController : ApiControllerBase
{
    private readonly IRazorpayRouteAccountRepository _accounts;
    private readonly IRazorpayService _razorpay;
    private readonly IOtpService _otp;
    private readonly IBrevoService _email;
    private readonly IEncryptionService _enc;
    private readonly IAuditLoggerService _audit;
    private readonly ILogger<RazorpayRouteController> _logger;

    public RazorpayRouteController(
        IRazorpayRouteAccountRepository accounts,
        IRazorpayService razorpay,
        IOtpService otp,
        IBrevoService email,
        IEncryptionService enc,
        IAuditLoggerService audit,
        ILogger<RazorpayRouteController> logger)
    {
        _accounts = accounts;
        _razorpay = razorpay;
        _otp      = otp;
        _email    = email;
        _enc      = enc;
        _audit    = audit;
        _logger   = logger;
    }

    // ── GET /api/razorpay-route ──────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!IsAdminRole) return Forbidden();
        var rows = await _accounts.GetAllAsync();
        return Ok(rows.Select(ToResponse));
    }

    // ── GET /api/razorpay-route/{id} ─────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetDetail(string id)
    {
        if (!IsAdminRole) return Forbidden();
        var row = await _accounts.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Razorpay route account not found." });
        return Ok(ToResponse(row));
    }

    // ── POST /api/razorpay-route/send-otp ────────────────────────────────────
    [HttpPost("send-otp")]
    public async Task<IActionResult> SendOtp([FromBody] SendOtpRequest req)
    {
        if (!IsAdminRole) return Forbidden();
        if (string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { detail = "Email is required." });

        var contextKey = $"razorpay-route:admin:{CurrentUserId}";
        var otp = _otp.Generate(contextKey);

        var html = $@"
<h2>Razorpay Route Onboarding — OTP Verification</h2>
<p>Your 6-digit OTP is: <strong style='font-size:24px;'>{otp}</strong></p>
<p>Enter this OTP within 10 minutes to confirm linked account onboarding.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";

        var sent = await _email.SendEmailAsync(req.Email, "Admin", "Razorpay Route OTP — Kaizen Events", html);
        if (!sent)
            return StatusCode(500, new { detail = "Failed to send OTP email." });

        return Ok(new { success = true, message = "OTP sent to " + req.Email });
    }

    // ── POST /api/razorpay-route ─────────────────────────────────────────────
    /// <summary>
    /// Verify OTP → call Razorpay v2 /accounts → /stakeholders → /products(route)
    /// → save row. On any v2 API exception, persist the row with Status="REJECTED"
    /// and raw error in razorpay_json so admin can see what was attempted.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateOrUpdate([FromBody] SaveRazorpayAccountRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var validationError = ValidateForm(req);
        if (validationError != null) return BadRequest(new { detail = validationError });

        // Verify OTP
        var contextKey = $"razorpay-route:admin:{CurrentUserId}";
        if (!_otp.VerifyAndConsume(contextKey, req.Otp ?? ""))
            return BadRequest(new { detail = "Invalid or expired OTP." });

        RazorpayRouteAccount? existing = !string.IsNullOrEmpty(req.Id)
            ? await _accounts.GetByIdAsync(req.Id!)
            : null;
        var isUpdate = existing != null;

        var entity = existing ?? new RazorpayRouteAccount
        {
            Id        = Guid.NewGuid().ToString(),
            CreatedAt = DateTime.UtcNow
        };

        var role = string.IsNullOrWhiteSpace(req.Role) ? "settlement" : req.Role.Trim();

        // Apply form fields
        entity.Role               = role;
        entity.Name               = req.Name.Trim();
        entity.Email              = req.Email.Trim();
        entity.Phone              = req.Phone.Trim();
        entity.AccountHolder      = string.IsNullOrWhiteSpace(req.AccountHolder) ? null : req.AccountHolder.Trim();
        entity.Ifsc               = string.IsNullOrWhiteSpace(req.Ifsc) ? null : req.Ifsc.Trim().ToUpperInvariant();
        entity.Pan                = string.IsNullOrWhiteSpace(req.Pan)  ? null : req.Pan.Trim().ToUpperInvariant();
        entity.Gst                = string.IsNullOrWhiteSpace(req.Gst)  ? null : req.Gst.Trim().ToUpperInvariant();
        entity.LegalBusinessName  = string.IsNullOrWhiteSpace(req.LegalBusinessName) ? null : req.LegalBusinessName.Trim();
        entity.BusinessType       = string.IsNullOrWhiteSpace(req.BusinessType) ? null : req.BusinessType.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(req.AccountNumber))
        {
            entity.AccountNumber       = _enc.Encrypt(req.AccountNumber.Trim());
            entity.AccountNumberMasked = MaskAccount(req.AccountNumber.Trim());
        }
        entity.SubmittedAt = entity.SubmittedAt ?? DateTime.UtcNow;
        entity.UpdatedAt   = DateTime.UtcNow;

        // Build registered address from the request. Razorpay rejects empty street2,
        // so when blank we mirror street1 so the field is non-empty.
        string OrDefault(string? v, string fallback) => string.IsNullOrWhiteSpace(v) ? fallback : v!.Trim();
        var street1Resolved = OrDefault(req.Street1, "Kaizen Events");
        var address = new RazorpayAddress(
            Street1   : street1Resolved,
            Street2   : OrDefault(req.Street2, street1Resolved),
            City      : OrDefault(req.City, "Mumbai"),
            State     : OrDefault(req.State, "MAHARASHTRA"),
            PostalCode: OrDefault(req.PostalCode, "400001"),
            Country   : OrDefault(req.Country, "IN"));

        try
        {
            // 1. Linked account (create or update)
            var accReq = new LinkedAccountRequest(
                Email:                      entity.Email,
                Phone:                      entity.Phone,
                LegalBusinessName:          entity.LegalBusinessName ?? entity.Name,
                BusinessType:               entity.BusinessType ?? "individual",
                CustomerFacingBusinessName: entity.Name,
                ProfileCategory:            OrDefault(req.ProfileCategory, "others"),
                ProfileSubcategory:         OrDefault(req.ProfileSubcategory, "others"),
                RegisteredAddress:          address,
                Pan:                        entity.Pan,
                Gst:                        entity.Gst,
                ContactName:                string.IsNullOrWhiteSpace(req.ContactName) ? entity.Name : req.ContactName!.Trim(),
                ReferenceId:                string.IsNullOrWhiteSpace(req.ReferenceId) ? null : req.ReferenceId!.Trim());

            RazorpayAccountResult accResult;
            if (isUpdate && !string.IsNullOrEmpty(entity.AccountId))
                accResult = await _razorpay.UpdateLinkedAccountAsync(entity.AccountId, accReq);
            else
                accResult = await _razorpay.CreateLinkedAccountAsync(accReq);

            entity.AccountId    = accResult.AccountId;
            entity.Status       = string.IsNullOrEmpty(accResult.Status) ? "under_review" : accResult.Status;
            entity.RazorpayJson = accResult.RawJson;
            var statusLower = entity.Status.ToLowerInvariant();
            if (statusLower == "activated" || statusLower == "active")
                entity.VerifiedAt = entity.VerifiedAt ?? DateTime.UtcNow;

            // 2. Stakeholder — only on create (Razorpay supports multiple stakeholders per account,
            //                  but we keep one). On update, skip.
            if (!isUpdate || string.IsNullOrEmpty(entity.StakeholderId))
            {
                var sthReq = new StakeholderRequest(
                    Name:               entity.AccountHolder ?? entity.Name,
                    Email:              entity.Email,
                    PrimaryPhone:       entity.Phone,
                    Pan:                entity.Pan,
                    ResidentialAddress: address);
                try
                {
                    var sthResult = await _razorpay.CreateStakeholderAsync(entity.AccountId, sthReq);
                    entity.StakeholderId = sthResult.StakeholderId;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Stakeholder create failed for {AccountId} — continuing", entity.AccountId);
                }
            }

            // 3. Route product request — POST creates the product entry (no settlements here;
            //    those go in step 4's PATCH). Only on create.
            if (!isUpdate || string.IsNullOrEmpty(entity.ProductId))
            {
                if (!string.IsNullOrWhiteSpace(req.AccountNumber) && !string.IsNullOrEmpty(entity.Ifsc))
                {
                    var prodReq = new RouteProductRequest(
                        AccountNumber:   req.AccountNumber.Trim(),
                        IfscCode:        entity.Ifsc,
                        BeneficiaryName: entity.AccountHolder ?? entity.Name);
                    try
                    {
                        var prodResult = await _razorpay.RequestRouteProductAsync(entity.AccountId, prodReq);
                        entity.ProductId = prodResult.ProductId;
                        if (!string.IsNullOrEmpty(prodResult.Status))
                            entity.Status = prodResult.Status;

                        // 4. PATCH product with settlement bank details → moves activation_status
                        //    from needs_clarification → under_review (and eventually → activated
                        //    once Razorpay verifies the bank account).
                        try
                        {
                            var patchResult = await _razorpay.UpdateRouteProductAsync(entity.AccountId, entity.ProductId, prodReq);
                            if (!string.IsNullOrEmpty(patchResult.Status))
                                entity.Status = patchResult.Status;
                            entity.RazorpayJson = patchResult.RawJson;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Route product activation (PATCH) failed for {AccountId}/{ProductId} — continuing", entity.AccountId, entity.ProductId);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Route product request failed for {AccountId} — continuing", entity.AccountId);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Razorpay v2 onboarding failed");
            entity.Status       = "REJECTED";
            entity.RazorpayJson = JsonSerializer.Serialize(new { error = ex.Message });
            // Generate a placeholder account_id so the row can be persisted (NOT NULL column)
            if (string.IsNullOrEmpty(entity.AccountId))
                entity.AccountId = $"pending_{Guid.NewGuid().ToString("N")[..16]}";
        }

        if (isUpdate) await _accounts.UpdateAsync(entity);
        else          await _accounts.CreateAsync(entity);

        await _audit.LogAsync(AuditEventType.SystemConfig,
            resourceType: "razorpay_route_account", resourceId: entity.Id,
            actionDetails: new { account_id = entity.AccountId, status = entity.Status, is_update = isUpdate },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(ToResponse(entity));
    }

    // ── PATCH /api/razorpay-route/{id}/toggle-active ─────────────────────────
    [HttpPatch("{id}/toggle-active")]
    public async Task<IActionResult> ToggleActive(string id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var row = await _accounts.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Account not found." });
        row.IsActive  = !row.IsActive;
        row.UpdatedAt = DateTime.UtcNow;
        await _accounts.UpdateAsync(row);
        return Ok(new { success = true, is_active = row.IsActive });
    }

    // ── POST /api/razorpay-route/{id}/refresh ────────────────────────────────
    [HttpPost("{id}/refresh")]
    public async Task<IActionResult> RefreshSingle(string id)
    {
        if (!IsAdminRole) return Forbidden();
        var row = await _accounts.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Account not found." });
        if (string.IsNullOrEmpty(row.AccountId) || !row.AccountId.StartsWith("acc_"))
            return BadRequest(new { detail = "Account has no live Razorpay account id." });

        try
        {
            var result = await _razorpay.GetLinkedAccountAsync(row.AccountId);
            row.Status       = string.IsNullOrEmpty(result.Status) ? row.Status : result.Status;
            row.RazorpayJson = result.RawJson;

            // The account-level status only reports `created` / `suspended`. The dashboard's
            // "Account Status" reflects the PRODUCT's activation_status — fetch it if we have one.
            if (!string.IsNullOrEmpty(row.ProductId))
            {
                try
                {
                    var prod = await _razorpay.GetRouteProductAsync(row.AccountId, row.ProductId);
                    if (!string.IsNullOrEmpty(prod.Status))
                    {
                        row.Status       = prod.Status;
                        row.RazorpayJson = prod.RawJson;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Product status fetch failed for {AccountId}/{ProductId}", row.AccountId, row.ProductId);
                }
            }

            row.UpdatedAt    = DateTime.UtcNow;
            var sl = row.Status.ToLowerInvariant();
            if ((sl == "activated" || sl == "active") && row.VerifiedAt == null)
                row.VerifiedAt = DateTime.UtcNow;
            await _accounts.UpdateAsync(row);
            return Ok(new { success = true, status = row.Status });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Razorpay refresh failed for {AccountId}", row.AccountId);
            return StatusCode(500, new { detail = "Failed to refresh from Razorpay." });
        }
    }

    // ── POST /api/razorpay-route/refresh-all ─────────────────────────────────
    [HttpPost("refresh-all")]
    public async Task<IActionResult> RefreshAll()
    {
        if (!IsAdminRole) return Forbidden();
        var all = await _accounts.GetAllAsync();
        var pending = all.Where(r =>
        {
            var s = (r.Status ?? "").ToLowerInvariant();
            return s != "activated" && s != "active";
        }).ToList();
        int updated = 0;

        foreach (var row in pending)
        {
            if (string.IsNullOrEmpty(row.AccountId) || !row.AccountId.StartsWith("acc_")) continue;
            try
            {
                var result = await _razorpay.GetLinkedAccountAsync(row.AccountId);
                row.RazorpayJson = result.RawJson;

                // Prefer the product's activation_status (matches dashboard's "Account Status")
                string? effectiveStatus = result.Status;
                if (!string.IsNullOrEmpty(row.ProductId))
                {
                    try
                    {
                        var prod = await _razorpay.GetRouteProductAsync(row.AccountId, row.ProductId);
                        if (!string.IsNullOrEmpty(prod.Status))
                        {
                            effectiveStatus  = prod.Status;
                            row.RazorpayJson = prod.RawJson;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Product status fetch failed for {AccountId}/{ProductId}", row.AccountId, row.ProductId);
                    }
                }

                if (!string.IsNullOrEmpty(effectiveStatus) && row.Status != effectiveStatus)
                {
                    row.Status = effectiveStatus;
                    var sl = effectiveStatus.ToLowerInvariant();
                    if ((sl == "activated" || sl == "active") && row.VerifiedAt == null)
                        row.VerifiedAt = DateTime.UtcNow;
                }
                row.UpdatedAt = DateTime.UtcNow;
                await _accounts.UpdateAsync(row);
                updated++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Refresh failed for Razorpay account {AccountId}", row.AccountId);
            }
        }

        return Ok(new { success = true, message = $"Refreshed {updated} account(s).", updatedCount = updated });
    }

    // ── PUT /api/razorpay-route/{id}/set-default ─────────────────────────────
    [HttpPut("{id}/set-default")]
    public async Task<IActionResult> SetDefault(string id, [FromBody] SetDefaultVendorRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var row = await _accounts.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Razorpay route account not found." });

        var statusLower = (row.Status ?? "").ToLowerInvariant();
        var statusOk = statusLower == "activated" || statusLower == "active";
        if (!statusOk || !row.IsActive)
            return BadRequest(new { detail = "Account must be activated and enabled before marking as default." });
        if (req.DefaultPercentage <= 0m || req.DefaultPercentage >= 100m)
            return BadRequest(new { detail = "default_percentage must be between 0 and 100 (exclusive)." });

        await _accounts.SetDefaultKaizenVendorAsync(id, req.DefaultPercentage);

        await _audit.LogAsync(AuditEventType.SystemConfig,
            resourceType: "razorpay_route_account", resourceId: id,
            actionDetails: new { kaizen_default = true, default_percentage = req.DefaultPercentage },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        var refreshed = await _accounts.GetByIdAsync(id);
        return Ok(ToResponse(refreshed!));
    }

    // ── DELETE /api/razorpay-route/default ───────────────────────────────────
    [HttpDelete("default")]
    public async Task<IActionResult> ClearDefault()
    {
        if (!IsSuperAdmin) return Forbidden();
        await _accounts.ClearDefaultKaizenVendorAsync();

        await _audit.LogAsync(AuditEventType.SystemConfig,
            resourceType: "razorpay_route_account", resourceId: null,
            actionDetails: new { kaizen_default = (string?)null },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    // ── DELETE /api/razorpay-route/{id} ──────────────────────────────────────
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var row = await _accounts.GetByIdAsync(id);
        if (row == null) return NotFound(new { detail = "Account not found." });
        if (row.IsActive)
            return BadRequest(new { detail = "Deactivate the account first before deleting." });
        await _accounts.DeleteAsync(row);
        return Ok(new { success = true });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    private static string? ValidateForm(SaveRazorpayAccountRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name))                return "Name is required.";
        if (string.IsNullOrWhiteSpace(r.Email))               return "Email is required.";
        if (string.IsNullOrWhiteSpace(r.Phone))               return "Phone is required.";
        if (string.IsNullOrWhiteSpace(r.LegalBusinessName))   return "Legal business name is required.";
        if (string.IsNullOrWhiteSpace(r.BusinessType))        return "Business type is required.";
        if (string.IsNullOrWhiteSpace(r.AccountNumber))       return "Bank account number is required.";
        if (string.IsNullOrWhiteSpace(r.Ifsc))                return "IFSC is required.";
        if (string.IsNullOrWhiteSpace(r.Pan))                 return "PAN is required.";
        if (!System.Text.RegularExpressions.Regex.IsMatch(r.Pan.Trim().ToUpperInvariant(), @"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"))
            return "Invalid PAN format. Expected: ABCDE1234F";
        return null;
    }

    private static string MaskAccount(string number)
    {
        if (string.IsNullOrEmpty(number) || number.Length <= 4) return number;
        return "****" + number[^4..];
    }

    private static object ToResponse(RazorpayRouteAccount r) => new
    {
        id                       = r.Id,
        account_id               = r.AccountId,
        role                     = r.Role,
        name                     = r.Name,
        email                    = r.Email,
        phone                    = r.Phone,
        account_holder           = r.AccountHolder,
        account_number           = r.AccountNumberMasked,
        ifsc                     = r.Ifsc,
        pan                      = r.Pan,
        gst                      = r.Gst,
        status                   = r.Status,
        is_active                = r.IsActive,
        is_default_kaizen_vendor = r.IsDefaultKaizenVendor,
        default_percentage       = r.DefaultPercentage,
        stakeholder_id           = r.StakeholderId,
        product_id               = r.ProductId,
        legal_business_name      = r.LegalBusinessName,
        business_type            = r.BusinessType,
        razorpay_json            = r.RazorpayJson,
        submitted_at             = r.SubmittedAt,
        verified_at              = r.VerifiedAt,
        created_at               = r.CreatedAt
    };
}

public record SaveRazorpayAccountRequest(
    string?  Id,
    string?  AccountId,         // optional — backend now creates this via v2 API
    string?  Role,
    string   Name,
    string   Email,
    string   Phone,
    string?  AccountHolder,
    string?  AccountNumber,
    string?  Ifsc,
    string?  Pan,
    string?  Gst,
    string?  LegalBusinessName,
    string?  BusinessType,
    string?  Otp,
    // Razorpay v2 profile + address fields (required by /v2/accounts)
    string?  ContactName       = null,
    string?  ReferenceId       = null,
    string?  ProfileCategory   = null,
    string?  ProfileSubcategory= null,
    string?  Street1            = null,
    string?  Street2            = null,
    string?  City               = null,
    string?  State              = null,
    string?  PostalCode         = null,
    string?  Country            = null);
