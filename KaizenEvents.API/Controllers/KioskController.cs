using System.Security.Cryptography;
using System.Text.Json;
using KaizenEvents.API.Helpers;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/kiosk")]
[Authorize]
public class KioskController : ApiControllerBase
{
    private readonly ICampaignRepository _campaigns;
    private readonly IRegistrationRepository _registrations;
    private readonly ICampaignMemberRepository _members;
    private readonly IKioskVolunteerRepository _volunteers;
    private readonly IRegistrationEmailService _regEmail;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<KioskController> _logger;

    public KioskController(
        ICampaignRepository campaigns,
        IRegistrationRepository registrations,
        ICampaignMemberRepository members,
        IKioskVolunteerRepository volunteers,
        IRegistrationEmailService regEmail,
        IWebHostEnvironment env,
        ILogger<KioskController> logger)
    {
        _campaigns     = campaigns;
        _registrations = registrations;
        _members       = members;
        _volunteers    = volunteers;
        _regEmail      = regEmail;
        _env           = env;
        _logger        = logger;
    }

    // ── GET /api/kiosk/campaigns/{campaign_id}/info ───────────────────────────
    [HttpGet("campaigns/{campaign_id}/info")]
    public async Task<IActionResult> GetCampaignInfo(string campaign_id)
    {
        if (!await HasKioskAccessAsync(campaign_id)) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var formConfig   = ParseJson(campaign.FormConfig);
        var hasFormConfig = formConfig.ValueKind == JsonValueKind.Object;

        decimal basePrice = 0m;
        object[] formFields = Array.Empty<object>();
        if (hasFormConfig)
        {
            if (formConfig.TryGetProperty("base_price", out var bpEl) && bpEl.ValueKind == JsonValueKind.Number)
                basePrice = bpEl.GetDecimal();
            if (formConfig.TryGetProperty("fields", out var fieldsEl) && fieldsEl.ValueKind == JsonValueKind.Array)
                formFields = fieldsEl.Deserialize<object[]>() ?? Array.Empty<object>();
        }

        return Ok(new
        {
            id                         = campaign.Id,
            name                       = campaign.Name,
            organization_name          = campaign.OrganizationName,
            campaign_type              = ToSnake(campaign.CampaignType.ToString()),
            payment_collection_method  = campaign.PaymentCollectionMethod.ToString().ToLowerInvariant(),
            base_price                 = basePrice,
            form_fields                = formFields,
            current_registrations      = campaign.CurrentRegistrations,
            max_registrations          = campaign.MaxRegistrations,
            status                     = campaign.Status.ToString().ToLowerInvariant()
        });
    }

    // ── POST /api/kiosk/search ────────────────────────────────────────────────
    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] KioskSearchRequest req)
    {
        if (!await HasKioskAccessAsync(req.CampaignId)) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var query   = req.Query.Trim().ToLowerInvariant();
        var results = new List<object>();

        // Search existing registrations
        var regs = await _registrations.GetByCampaignIdAsync(req.CampaignId);
        foreach (var reg in regs)
        {
            var fd = ParseFormData(reg.FormData);
            var (name, email, phone) = ResolveContactFromForm(fd, campaign.FormConfig);
            var nameLc  = name.ToLowerInvariant();
            var emailLc = email.ToLowerInvariant();
            var phoneLc = phone.ToLowerInvariant();
            var idPfx   = reg.Id[..Math.Min(8, reg.Id.Length)].ToLowerInvariant();

            if (nameLc.Contains(query) || emailLc.Contains(query) ||
                phoneLc.Contains(query) || idPfx.Contains(query))
            {
                results.Add(new
                {
                    registration_id = reg.Id,
                    member_id       = reg.MemberId,
                    name,
                    email,
                    phone,
                    status          = reg.PaymentStatus == PaymentStatus.Completed ? "completed"
                                        : reg.PaymentStatus.ToString().ToLowerInvariant(),
                    amount_due      = reg.PaymentStatus == PaymentStatus.Completed ? 0m : reg.TotalAmount,
                    otp             = reg.OtpCode,
                    is_new          = false
                });
            }
        }

        // For closed group, also search unregistered members
        if (campaign.CampaignType == CampaignType.ClosedGroup)
        {
            var reggedMemberIds = new HashSet<string>(
                regs.Where(r => r.MemberId != null).Select(r => r.MemberId!));

            var allMembers = await _members.GetByCampaignIdAsync(req.CampaignId);
            var formConfig = ParseJson(campaign.FormConfig);
            var basePrice  = formConfig.ValueKind == JsonValueKind.Object
                && formConfig.TryGetProperty("base_price", out var bpEl)
                && bpEl.ValueKind == JsonValueKind.Number
                    ? bpEl.GetDecimal() : 0m;

            foreach (var m in allMembers.Where(m => m.Status != MemberStatus.Registered && !reggedMemberIds.Contains(m.Id)))
            {
                var mName  = m.Name.ToLowerInvariant();
                var mEmail = (m.Email ?? "").ToLowerInvariant();
                var mPhone = m.Mobile.ToLowerInvariant();

                if (mName.Contains(query) || mEmail.Contains(query) || mPhone.Contains(query))
                {
                    results.Add(new
                    {
                        registration_id = (string?)null,
                        member_id       = m.Id,
                        name            = m.Name,
                        email           = m.Email ?? "",
                        phone           = m.Mobile,
                        status          = "not_registered",
                        amount_due      = basePrice,
                        otp             = (string?)null,
                        is_new          = true
                    });
                }
            }
        }

        return Ok(results.Take(20).ToList());
    }

    // ── POST /api/kiosk/register ──────────────────────────────────────────────
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] KioskRegistrationRequest req)
    {
        if (!await HasKioskAccessAsync(req.CampaignId)) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });
        if (campaign.Status != CampaignStatus.Active)
            return BadRequest(new { detail = "Campaign is not active." });
        if (campaign.MaxRegistrations.HasValue && campaign.CurrentRegistrations >= campaign.MaxRegistrations.Value)
            return BadRequest(new { detail = "Registration limit reached." });

        CampaignMember? memberDoc = null;
        if (campaign.CampaignType == CampaignType.ClosedGroup)
        {
            if (string.IsNullOrEmpty(req.MemberId))
                return BadRequest(new { detail = "Member ID required for closed group campaign." });

            memberDoc = await _members.GetByIdAsync(req.MemberId);
            if (memberDoc == null) return NotFound(new { detail = "Member not found." });
            if (memberDoc.Status == MemberStatus.Registered)
                return BadRequest(new { detail = "Member already registered." });
        }

        var now       = DateTime.UtcNow;
        var db        = HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var invoiceNo = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now);
        var isFree    = req.TotalAmount <= 0;

        // Answers to questions the volunteer never saw are dropped, same as the public form —
        // a kiosk runs the same conditional form, so switching a member type mid-entry strands
        // the earlier answer here too. See FieldVisibility.StripHiddenAnswers.
        var strippedFieldIds = FieldVisibility.StripHiddenAnswers(campaign.FormConfig, req.FormData);
        if (strippedFieldIds.Count > 0)
        {
            _logger.LogInformation(
                "Dropped {Count} hidden field answer(s) from a kiosk registration on campaign {CampaignId}: {Fields}",
                strippedFieldIds.Count, campaign.Id, string.Join(", ", strippedFieldIds));
        }

        // Same rule as the public form: uploads carry the registrant's name (see
        // RegistrantUploadNaming). A kiosk visitor can pick a file before typing a name
        // just as easily, so the backfill has to happen here too.
        var formDataJson = JsonSerializer.Serialize(req.FormData);
        var (registrantName, _, _) = RegistrationController.ResolveContactInfo(
            formDataJson, campaign.FormConfig, nameFallback: "");
        formDataJson = RegistrantUploadNaming.ApplyRegistrantName(
            formDataJson, Path.Combine(_env.ContentRootPath, "uploads"), registrantName, _logger);

        var registration = new Registration
        {
            Id                   = Guid.NewGuid().ToString(),
            CampaignId           = req.CampaignId,
            FormData             = formDataJson,
            TotalAmount          = (decimal)req.TotalAmount,
            PaymentStatus        = isFree ? PaymentStatus.Completed : PaymentStatus.Pending,
            RegistrationStatus   = isFree ? RegistrationStatus.Confirmed : RegistrationStatus.Submitted,
            RegistrationNumber   = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign),
            InvoiceNumber        = invoiceNo,
            MemberId             = req.MemberId,
            Source               = "kiosk",
            PaymentGateway       = "offline",
            CreatedAt            = now,
            UpdatedAt            = now
        };
        try { await _registrations.CreateAsync(registration); }
        catch (DbUpdateException)
        {
            // Concurrent claim raced on a unique number index — retry once with fresh numbers
            registration.RegistrationNumber = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign);
            invoiceNo                       = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now);
            registration.InvoiceNumber      = invoiceNo;
            await _registrations.CreateAsync(registration);
        }

        if (memberDoc != null)
        {
            memberDoc.Status         = MemberStatus.Registered;
            memberDoc.RegistrationId = registration.Id;
            memberDoc.RegisteredAt   = now;
            memberDoc.UpdatedAt      = now;
            await _members.UpdateAsync(memberDoc);
        }

        var fd = ParseFormData(registration.FormData);
        var (rName, rEmail, rPhone) = ResolveContactFromForm(fd, campaign.FormConfig);

        // Free walk-ins are already complete; send Registration Confirmed email now.
        // Paid registrations get their email later at ConfirmPayment (after cash is collected).
        if (isFree)
        {
            try { await _regEmail.SendConfirmationAsync(registration, campaign); }
            catch (Exception ex) { _logger.LogWarning(ex, "Kiosk: confirmation email failed for {RegId}", registration.Id); }
        }

        return Ok(new
        {
            registration_id  = registration.Id,
            invoice_number   = invoiceNo,
            registrant_name  = rName,
            registrant_email = rEmail,
            registrant_phone = rPhone,
            amount_due       = req.TotalAmount,
            message          = isFree ? "Registration confirmed." : "Registration created. Please collect payment."
        });
    }

    // ── POST /api/kiosk/confirm-payment ───────────────────────────────────────
    [HttpPost("confirm-payment")]
    public async Task<IActionResult> ConfirmPayment([FromBody] KioskConfirmPaymentRequest req)
    {
        var registration = await _registrations.GetByIdAsync(req.RegistrationId);
        if (registration == null) return NotFound(new { detail = "Registration not found." });

        if (!await HasKioskAccessAsync(registration.CampaignId)) return Forbidden();

        if (registration.PaymentStatus == PaymentStatus.Completed)
            return BadRequest(new { detail = "Payment already confirmed." });

        var now           = DateTime.UtcNow;
        var receiptNumber = $"RCPT-{now:yyyyMMdd}-{GenerateHex().ToUpper()}";

        registration.PaymentStatus      = PaymentStatus.Completed;
        registration.RegistrationStatus = RegistrationStatus.Confirmed;
        registration.CashCollected      = true;
        registration.CashCollectedBy    = CurrentUserId;
        registration.CashCollectedAt    = now;
        registration.ReceiptNumber      = receiptNumber;
        registration.CheckInAt          = now;
        registration.CheckedInBy        = CurrentUserId;
        registration.UpdatedAt          = now;
        await _registrations.UpdateAsync(registration);

        // Update campaign stats
        var campaign = await _campaigns.GetByIdAsync(registration.CampaignId);
        if (campaign != null)
        {
            campaign.CurrentRegistrations++;
            campaign.TotalRevenue += (decimal)req.AmountReceived;
            campaign.UpdatedAt    = now;
            await _campaigns.UpdateAsync(campaign);
        }

        // Update member status if closed group
        if (!string.IsNullOrEmpty(registration.MemberId))
        {
            var member = await _members.GetByIdAsync(registration.MemberId);
            if (member != null)
            {
                member.Status    = MemberStatus.Registered;
                member.UpdatedAt = now;
                await _members.UpdateAsync(member);
            }
        }

        var fd = ParseFormData(registration.FormData);
        var (rName, _, _) = ResolveContactFromForm(fd, campaign?.FormConfig);

        // Email the registrant their payment-received receipt
        if (campaign != null)
        {
            try { await _regEmail.SendCashReceivedAsync(registration, campaign, receiptNumber); }
            catch (Exception ex) { _logger.LogWarning(ex, "Kiosk: cash-received email failed for {RegId}", registration.Id); }
        }

        return Ok(new
        {
            registration_id  = registration.Id,
            receipt_number   = receiptNumber,
            registrant_name  = rName,
            amount_received  = req.AmountReceived,
            payment_method   = req.PaymentMethod,
            confirmed_at     = now,
            message          = "Payment confirmed successfully!"
        });
    }

    // ── POST /api/kiosk/check-in ──────────────────────────────────────────────
    [HttpPost("check-in")]
    public async Task<IActionResult> CheckIn([FromBody] KioskCheckInRequest req)
    {
        var registration = await _registrations.GetByIdAsync(req.RegistrationId);
        if (registration == null) return NotFound(new { detail = "Registration not found." });

        if (!await HasKioskAccessAsync(registration.CampaignId)) return Forbidden();

        // Already checked in
        if (registration.CheckInAt.HasValue)
            return Ok(new
            {
                registration_id = registration.Id,
                message         = "Already checked in.",
                checked_in_at   = registration.CheckInAt
            });

        var now = DateTime.UtcNow;
        registration.CheckInAt   = now;
        registration.CheckedInBy = CurrentUserId;
        registration.UpdatedAt   = now;
        await _registrations.UpdateAsync(registration);

        var fd = ParseFormData(registration.FormData);
        var campaignForLookup = await _campaigns.GetByIdAsync(registration.CampaignId);
        var (rName, _, _) = ResolveContactFromForm(fd, campaignForLookup?.FormConfig);

        return Ok(new
        {
            registration_id  = registration.Id,
            registrant_name  = rName,
            message          = "Check-in successful!",
            checked_in_at    = now
        });
    }

    // ── GET /api/kiosk/campaigns/{campaign_id}/stats ──────────────────────────
    [HttpGet("campaigns/{campaign_id}/stats")]
    public async Task<IActionResult> GetStats(string campaign_id)
    {
        if (!await HasKioskAccessAsync(campaign_id)) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var regs = await _registrations.GetByCampaignIdAsync(campaign_id);

        int totalRegistrations  = regs.Count;
        int checkedIn           = regs.Count(r => r.CheckInAt.HasValue);
        int pendingPayment      = regs.Count(r => r.PaymentStatus == PaymentStatus.Pending);
        int completedPayments   = regs.Count(r => r.PaymentStatus == PaymentStatus.Completed);

        var kioskRevenue = regs
            .Where(r => r.Source == "kiosk" && r.PaymentStatus == PaymentStatus.Completed)
            .Sum(r => r.TotalAmount);

        return Ok(new
        {
            campaign_id   = campaign_id,
            campaign_name = campaign.Name,
            stats = new
            {
                total_registrations  = totalRegistrations,
                checked_in           = checkedIn,
                pending_check_in     = completedPayments - checkedIn,
                pending_payment      = pendingPayment,
                completed_payments   = completedPayments,
                total_revenue        = campaign.TotalRevenue,
                kiosk_revenue        = kioskRevenue
            },
            updated_at = DateTime.UtcNow
        });
    }

    // ── POST /api/kiosk/verify-otp ────────────────────────────────────────────
    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyOtp([FromQuery] string otp, [FromQuery] string campaign_id)
    {
        if (!await HasKioskAccessAsync(campaign_id)) return Forbidden();

        var regs = await _registrations.GetByCampaignIdAsync(campaign_id);
        var registration = regs.FirstOrDefault(r =>
            r.OtpCode == otp && r.Source == "offline" && !r.CashCollected);

        if (registration == null)
            return NotFound(new { detail = "Invalid OTP or registration not found." });

        var fd = ParseFormData(registration.FormData);
        var campaignForLookup = await _campaigns.GetByIdAsync(registration.CampaignId);
        var (rName, rEmail, rPhone) = ResolveContactFromForm(fd, campaignForLookup?.FormConfig);

        return Ok(new
        {
            registration_id  = registration.Id,
            registrant_name  = rName,
            registrant_email = rEmail,
            registrant_phone = rPhone,
            amount_due       = registration.TotalAmount,
            form_data        = JsonSerializer.Deserialize<object>(registration.FormData),
            otp_verified     = true
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<bool> HasKioskAccessAsync(string campaignId)
    {
        if (IsSuperAdmin || IsOrgAdmin) return true;
        if (CurrentUserRole == KaizenEvents.Core.Enums.UserRole.KioskVolunteer)
        {
            var vol = await _volunteers.GetByUserIdAsync(CurrentUserId ?? "");
            if (vol == null) return false;
            try
            {
                var ids = System.Text.Json.JsonSerializer.Deserialize<List<string>>(vol.CampaignIds) ?? new();
                return ids.Contains(campaignId);
            }
            catch { return false; }
        }
        return false;
    }

    private static Dictionary<string, string> ParseFormData(string json)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var prop in doc.RootElement.EnumerateObject())
                result[prop.Name] = prop.Value.ValueKind == JsonValueKind.String
                    ? prop.Value.GetString() ?? "" : prop.Value.ToString();
        }
        catch { }
        return result;
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrEmpty(json)) return default;
        try
        {
            // Clone so the returned JsonElement outlives the JsonDocument (which gets disposed).
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.Clone();
        }
        catch { return default; }
    }

    private static string GenerateHex()
    {
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[4];
        rng.GetBytes(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    // Converts PascalCase enum names (e.g. "ClosedGroup") to snake_case ("closed_group")
    private static string ToSnake(string pascal)
        => System.Text.RegularExpressions.Regex
            .Replace(pascal, "(?<=[a-z0-9])([A-Z])", "_$1")
            .ToLowerInvariant();

    // Resolve registrant name/email/phone from form_data using form_config to map
    // field types ("name"/"email"/"phone"/"tel") to their generated field ids.
    // Required because Form Builder fields are keyed by id (e.g. `field_abc123`),
    // not by label. Falls back to literal keys for legacy data.
    private static (string Name, string Email, string Phone) ResolveContactFromForm(
        Dictionary<string, string> fd, string? formConfigJson)
    {
        string Get(string key) => fd.TryGetValue(key, out var v) ? v ?? "" : "";

        string? typedName = null, typedEmail = null, typedPhone = null;

        if (!string.IsNullOrWhiteSpace(formConfigJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(formConfigJson);
                if (doc.RootElement.TryGetProperty("fields", out var fields) &&
                    fields.ValueKind == JsonValueKind.Array)
                {
                    foreach (var field in fields.EnumerateArray())
                    {
                        if (!field.TryGetProperty("type", out var typeEl)) continue;
                        if (!field.TryGetProperty("id",   out var idEl))   continue;
                        var type = typeEl.GetString();
                        var id   = idEl.GetString();
                        if (string.IsNullOrWhiteSpace(id)) continue;

                        if (type == "name" && string.IsNullOrEmpty(typedName))
                        {
                            var first  = Get($"{id}_first");
                            var middle = Get($"{id}_middle");
                            var last   = Get($"{id}_last");
                            var combined = string.Join(" ",
                                new[] { first, middle, last }.Where(s => !string.IsNullOrWhiteSpace(s)));
                            typedName = !string.IsNullOrWhiteSpace(combined) ? combined.Trim() : Get(id);
                        }
                        else if (type == "email" && string.IsNullOrEmpty(typedEmail))
                            typedEmail = Get(id);
                        else if ((type == "phone" || type == "tel") && string.IsNullOrEmpty(typedPhone))
                            typedPhone = Get(id);
                    }
                }
            }
            catch { /* ignore parse errors */ }
        }

        var name  = !string.IsNullOrWhiteSpace(typedName)  ? typedName!  : Get("name");
        var email = !string.IsNullOrWhiteSpace(typedEmail) ? typedEmail! : Get("email");
        var phone = !string.IsNullOrWhiteSpace(typedPhone) ? typedPhone! : (Get("phone").Length > 0 ? Get("phone") : Get("mobile"));
        return (name, email, phone);
    }
}

public record KioskSearchRequest(string Query, string CampaignId);
public record KioskRegistrationRequest(
    string CampaignId,
    Dictionary<string, object> FormData,
    double TotalAmount,
    string? MemberId = null);
public record KioskConfirmPaymentRequest(
    string RegistrationId,
    double AmountReceived,
    string PaymentMethod = "cash",
    string? Notes = null);
public record KioskCheckInRequest(string RegistrationId);
