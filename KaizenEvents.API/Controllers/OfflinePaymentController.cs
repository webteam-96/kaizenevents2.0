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
[Authorize]
public class OfflinePaymentController : ApiControllerBase
{
    private readonly IRegistrationRepository _registrations;
    private readonly ICampaignRepository _campaigns;
    private readonly ICampaignMemberRepository _members;
    private readonly IAuditLoggerService _audit;
    private readonly IBrevoService _email;
    private readonly IInteraktService _whatsapp;
    private readonly IRegistrationEmailService _regEmail;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<OfflinePaymentController> _logger;

    public OfflinePaymentController(
        IRegistrationRepository registrations,
        ICampaignRepository campaigns,
        ICampaignMemberRepository members,
        IAuditLoggerService audit,
        IBrevoService email,
        IInteraktService whatsapp,
        IRegistrationEmailService regEmail,
        IWebHostEnvironment env,
        ILogger<OfflinePaymentController> logger)
    {
        _registrations = registrations;
        _campaigns     = campaigns;
        _members       = members;
        _audit         = audit;
        _email         = email;
        _whatsapp      = whatsapp;
        _regEmail      = regEmail;
        _env           = env;
        _logger        = logger;
    }

    // ── POST /api/registrations/offline/submit ────────────────────────────────
    [HttpPost("api/registrations/offline/submit")]
    [AllowAnonymous]
    public async Task<IActionResult> SubmitOffline([FromBody] OfflineRegistrationSubmitRequest req)
    {
        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });
        if (campaign.Status != CampaignStatus.Active)
            return BadRequest(new { detail = "Campaign is not accepting registrations." });

        // Max registrations check
        if (campaign.MaxRegistrations.HasValue && campaign.CurrentRegistrations >= campaign.MaxRegistrations.Value)
            return BadRequest(new { detail = "Campaign is full." });

        // Closed group member check
        string? memberId = req.MemberId;
        if (campaign.CampaignType == CampaignType.ClosedGroup)
        {
            if (string.IsNullOrEmpty(memberId))
                return BadRequest(new { detail = "Member ID required for closed group campaign." });
            var member = await _members.GetByIdAsync(memberId);
            if (member == null) return NotFound(new { detail = "Member not found." });
            if (member.Status == MemberStatus.Registered)
                return BadRequest(new { detail = "Member already registered." });
        }

        // Generate OTP (6 digits, 10 min expiry)
        var otp       = GenerateOtp();
        var now       = DateTime.UtcNow;
        var db        = HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var invoiceNo = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now);

        // Answers to questions the registrant never saw are dropped here for the same reason
        // as on the online path — see FieldVisibility.StripHiddenAnswers.
        var strippedFieldIds = FieldVisibility.StripHiddenAnswers(campaign.FormConfig, req.FormData);
        if (strippedFieldIds.Count > 0)
        {
            _logger.LogInformation(
                "Dropped {Count} hidden field answer(s) from an offline submission to campaign {CampaignId}: {Fields}",
                strippedFieldIds.Count, campaign.Id, string.Join(", ", strippedFieldIds));
        }

        // Same rule as the public form — see RegistrantUploadNaming.
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
            PaymentStatus        = PaymentStatus.Pending,
            RegistrationStatus   = RegistrationStatus.Submitted,
            RegistrationNumber   = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign),
            InvoiceNumber        = invoiceNo,
            MemberId             = memberId,
            Source               = "offline",
            OtpCode              = otp,
            OtpExpiresAt         = now.AddMinutes(10),
            CouponCode           = req.CouponCode,
            CreatedAt            = now,
            UpdatedAt            = now
        };
        try { await _registrations.CreateAsync(registration); }
        catch (DbUpdateException)
        {
            // Concurrent claim raced on a unique number index — retry once with fresh numbers
            registration.RegistrationNumber = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign);
            registration.InvoiceNumber      = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now);
            await _registrations.CreateAsync(registration);
        }

        await _audit.LogAsync(AuditEventType.OfflineRegistration,
            resourceType: "registration", resourceId: registration.Id,
            actionDetails: new { campaign_id = req.CampaignId, amount = req.TotalAmount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        // Update member status
        if (!string.IsNullOrEmpty(memberId))
        {
            var member  = await _members.GetByIdAsync(memberId);
            if (member != null)
            {
                member.Status         = MemberStatus.Registered;
                member.RegistrationId = registration.Id;
                member.RegisteredAt   = now;
                member.UpdatedAt      = now;
                await _members.UpdateAsync(member);
            }
        }

        // Send OTP via email + WhatsApp.
        // Resolve recipient by walking campaign.form_config to find name/email/phone
        // fields by TYPE — Form Builder field ids are like `field_abc123`, so a
        // literal "email" key lookup against form_data is almost always empty.
        var fdStr = ToStringMap(req.FormData);
        var (recipientName, recipientEmail, recipientPhone) = ResolveContact(campaign, fdStr);
        if (string.IsNullOrWhiteSpace(recipientName)) recipientName = "Guest";

        bool emailSent = false, whatsappSent = false;

        // Email OTP — uses the campaign's `payment_otp` email template
        try { emailSent = await _regEmail.SendOtpAsync(registration, campaign, otp); }
        catch (Exception ex) { _logger.LogWarning(ex, "OTP email failed for registration {RegId}", registration.Id); }

        // WhatsApp OTP (requires a pre-approved Interakt template — name configurable)
        if (!string.IsNullOrWhiteSpace(recipientPhone) && _whatsapp.IsConfigured())
        {
            try
            {
                var result = await _whatsapp.SendTemplateMessageAsync(
                    phoneNumber  : recipientPhone,
                    countryCode  : "91",
                    templateName : "kaizen_otp",
                    bodyValues   : new[] { recipientName, otp, campaign.Name });
                whatsappSent = result.Success;
                if (!result.Success)
                    _logger.LogWarning("WhatsApp OTP failed for {Phone}: {Error}", recipientPhone, result.Error);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "WhatsApp OTP exception for {Phone}", recipientPhone); }
        }

        return Ok(new
        {
            registration_id = registration.Id,
            otp             = otp,
            otp_expires_at  = registration.OtpExpiresAt,
            message         = "Registration submitted. Use your OTP at the venue to pay.",
            email_sent      = emailSent,
            whatsapp_sent   = whatsappSent,
            amount_due      = req.TotalAmount
        });
    }

    // ── POST /api/registrations/offline/verify-otp ───────────────────────────
    [HttpPost("api/registrations/offline/verify-otp")]
    public async Task<IActionResult> VerifyOtp([FromBody] OtpVerifyRequest req)
    {
        if (!IsOrganizerOrHigher()) return Forbidden();

        Registration? registration;
        if (!string.IsNullOrEmpty(req.RegistrationId))
            registration = await _registrations.GetByIdAsync(req.RegistrationId);
        else
        {
            var all  = await _registrations.GetByCampaignIdAsync(req.CampaignId ?? "");
            registration = all.FirstOrDefault(r => r.OtpCode == req.Otp && r.Source == "offline");
        }

        if (registration == null || registration.OtpCode != req.Otp)
            return NotFound(new { detail = "Invalid OTP or registration not found." });

        if (registration.OtpExpiresAt.HasValue && registration.OtpExpiresAt.Value < DateTime.UtcNow)
            return BadRequest(new { detail = "OTP has expired." });

        if (registration.CashCollected)
            return BadRequest(new { detail = "Payment already confirmed for this registration." });

        await _audit.LogAsync(AuditEventType.OtpVerified,
            userId: CurrentUserId,
            resourceType: "registration", resourceId: registration.Id,
            actionDetails: new { campaign_id = registration.CampaignId },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        var otpCampaign = await _campaigns.GetByIdAsync(registration.CampaignId);
        var (otpName, otpEmail, otpPhone) = RegistrationController.ResolveContactInfo(
            registration.FormData, otpCampaign?.FormConfig, nameFallback: "");

        return Ok(new
        {
            registration_id  = registration.Id,
            registrant_name  = otpName,
            registrant_email = otpEmail,
            registrant_phone = otpPhone,
            amount_due       = registration.TotalAmount,
            otp_verified     = true,
            form_data        = req.IncludeFormData ? ParseFormDataRaw(registration.FormData) : null
        });
    }

    // ── POST /api/registrations/offline/confirm-payment ──────────────────────
    [HttpPost("api/registrations/offline/confirm-payment")]
    public async Task<IActionResult> ConfirmPayment([FromBody] ConfirmOfflinePaymentRequest req)
    {
        if (!IsOrganizerOrHigher()) return Forbidden();

        var registration = await _registrations.GetByIdAsync(req.RegistrationId);
        if (registration == null) return NotFound(new { detail = "Registration not found." });

        if (registration.CashCollected)
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
        registration.OtpVerified        = true;
        registration.UpdatedAt          = now;
        await _registrations.UpdateAsync(registration);

        // Update campaign stats
        var campaign = await _campaigns.GetByIdAsync(registration.CampaignId);
        if (campaign != null)
        {
            campaign.CurrentRegistrations++;
            campaign.TotalRevenue += registration.TotalAmount;
            campaign.UpdatedAt    = now;
            await _campaigns.UpdateAsync(campaign);
        }

        await _audit.LogAsync(AuditEventType.CashConfirmed,
            userId: CurrentUserId,
            resourceType: "registration", resourceId: registration.Id,
            actionDetails: new { campaign_id = registration.CampaignId, amount = registration.TotalAmount, receipt_number = receiptNumber },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        // Email the registrant their payment-received receipt
        if (campaign != null)
        {
            try { await _regEmail.SendCashReceivedAsync(registration, campaign, receiptNumber); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to send cash-received email for registration {RegId}", registration.Id); }
        }

        var (cashName, _, _) = RegistrationController.ResolveContactInfo(
            registration.FormData, campaign?.FormConfig, nameFallback: "");

        return Ok(new
        {
            registration_id  = registration.Id,
            receipt_number   = receiptNumber,
            registrant_name  = cashName,
            amount_received  = registration.TotalAmount,
            confirmed_at     = now,
            message          = "Payment confirmed successfully!"
        });
    }

    // ── GET /api/campaigns/{campaign_id}/offline-payments/pending ────────────
    [HttpGet("api/campaigns/{campaign_id}/offline-payments/pending")]
    public async Task<IActionResult> GetPendingOfflinePayments(string campaign_id)
    {
        if (!IsOrganizerOrHigher()) return Forbidden();

        var regs        = await _registrations.GetByCampaignIdAsync(campaign_id);
        var campaign    = await _campaigns.GetByIdAsync(campaign_id);

        var pending = regs
            .Where(r => r.Source == "offline" && !r.CashCollected &&
                        r.PaymentStatus == PaymentStatus.Pending)
            .Select(r =>
            {
                var fd = ParseFormData(r.FormData);
                var (rName, rEmail, rPhone) = ResolveContact(campaign, fd);
                return (object)new
                {
                    registration_id  = r.Id,
                    registrant_name  = rName,
                    registrant_email = rEmail,
                    registrant_phone = rPhone,
                    amount_due       = r.TotalAmount,
                    otp              = r.OtpCode,
                    otp_expires_at   = r.OtpExpiresAt,
                    created_at       = r.CreatedAt
                };
            }).ToList();

        return Ok(pending);
    }

    // ── POST /api/registrations/{registration_id}/mark-no-show ───────────────
    [HttpPost("api/registrations/{registration_id}/mark-no-show")]
    public async Task<IActionResult> MarkNoShow(string registration_id)
    {
        if (!IsOrganizerOrHigher()) return Forbidden();

        var registration = await _registrations.GetByIdAsync(registration_id);
        if (registration == null) return NotFound(new { detail = "Registration not found." });

        if (registration.CashCollected)
            return BadRequest(new { detail = "Cannot mark as no-show — payment already confirmed." });

        registration.PaymentStatus      = PaymentStatus.NoShow;
        registration.RegistrationStatus = RegistrationStatus.NoShow;
        registration.UpdatedAt          = DateTime.UtcNow;
        await _registrations.UpdateAsync(registration);

        return Ok(new { message = "Registration marked as no-show.", registration_id });
    }

    // ── GET /api/registrations/{registration_id}/resend-otp ──────────────────
    [HttpGet("api/registrations/{registration_id}/resend-otp")]
    public async Task<IActionResult> ResendOtp(string registration_id)
    {
        if (!IsKioskOrOrganizer()) return Forbidden();

        var registration = await _registrations.GetByIdAsync(registration_id);
        if (registration == null) return NotFound(new { detail = "Registration not found." });
        if (registration.Source != "offline")
            return BadRequest(new { detail = "Not an offline registration." });

        // Generate fresh OTP
        var now = DateTime.UtcNow;
        registration.OtpCode      = GenerateOtp();
        registration.OtpExpiresAt = now.AddMinutes(10);
        registration.UpdatedAt    = now;
        await _registrations.UpdateAsync(registration);

        // Extract contact info from the registration's form_data.
        // Resolve by field TYPE (Form Builder ids are like `field_abc123`,
        // not literal "name"/"email"/"phone" keys).
        var campaign = await _campaigns.GetByIdAsync(registration.CampaignId);
        var fd = ParseFormData(registration.FormData);
        var (name, email, phone) = ResolveContact(campaign, fd);
        if (string.IsNullOrWhiteSpace(name)) name = "Guest";

        var campaignName = campaign?.Name ?? "the event";
        var orgName = campaign?.OrganizationName ?? "Kaizen Events";

        bool emailSent = false, whatsappSent = false;

        // OTP resend — reuses the campaign's payment_otp template (just substitutes the new OTP)
        if (campaign != null && registration.OtpCode != null)
        {
            try { emailSent = await _regEmail.SendOtpAsync(registration, campaign, registration.OtpCode); }
            catch (Exception ex) { _logger.LogWarning(ex, "OTP resend email failed for registration {RegId}", registration.Id); }
        }

        if (!string.IsNullOrWhiteSpace(phone) && _whatsapp.IsConfigured())
        {
            try
            {
                var result = await _whatsapp.SendTemplateMessageAsync(
                    phoneNumber  : phone,
                    countryCode  : "91",
                    templateName : "kaizen_otp",
                    bodyValues   : new[] { name, registration.OtpCode ?? "", campaignName });
                whatsappSent = result.Success;
            }
            catch (Exception ex) { _logger.LogWarning(ex, "OTP resend WhatsApp failed for {Phone}", phone); }
        }

        return Ok(new
        {
            message        = "OTP refreshed and sent.",
            otp            = registration.OtpCode,
            otp_expires_at = registration.OtpExpiresAt,
            email_sent     = emailSent,
            whatsapp_sent  = whatsappSent
        });
    }

    // ── POST /api/verify-otp  (registration-specific kiosk OTP check) ─────────
    [HttpPost("api/verify-otp")]
    public async Task<IActionResult> VerifyOtpByRegistration([FromBody] KioskOtpVerifyRequest req)
    {
        if (!IsKioskOrOrganizer()) return Forbidden();

        var registration = await _registrations.GetByIdAsync(req.RegistrationId);
        if (registration == null || registration.OtpCode != req.Otp)
            return NotFound(new { detail = "Invalid OTP." });

        if (registration.OtpExpiresAt.HasValue && registration.OtpExpiresAt.Value < DateTime.UtcNow)
            return BadRequest(new { detail = "OTP expired." });

        var fd = ParseFormData(registration.FormData);
        return Ok(new
        {
            registration_id  = registration.Id,
            registrant_name  = fd.GetValueOrDefault("name", ""),
            registrant_email = fd.GetValueOrDefault("email", ""),
            registrant_phone = fd.GetValueOrDefault("phone", ""),
            amount_due       = registration.TotalAmount,
            otp_verified     = true
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private bool IsOrganizerOrHigher()
        => IsSuperAdmin || IsOrgAdmin || (CurrentUser()?.CanApproveTransfers == true);

    private bool IsKioskOrOrganizer()
        => IsOrganizerOrHigher() || CurrentUserRole == KaizenEvents.Core.Enums.UserRole.KioskVolunteer;

    private KaizenEvents.Core.Entities.User? CurrentUser()
    {
        // CanApproveTransfers check via HttpContext items if set by middleware
        return null; // simplified — director check done at service level if needed
    }

    private static string GenerateOtp()
    {
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[4];
        rng.GetBytes(bytes);
        var num = BitConverter.ToUInt32(bytes, 0) % 1_000_000;
        return num.ToString("D6");
    }

    private static string GenerateHex()
    {
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[4];
        rng.GetBytes(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
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

    private static Dictionary<string, object?> ParseFormDataRaw(string json)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, object?>>(json) ?? new(); }
        catch { return new(); }
    }

    // Convert a Dictionary<string, object> (request body) into Dictionary<string, string>
    // for downstream form-data field lookups. Handles JsonElement values properly.
    private static Dictionary<string, string> ToStringMap(Dictionary<string, object>? src)
    {
        var dst = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (src == null) return dst;
        foreach (var kv in src)
        {
            dst[kv.Key] = kv.Value switch
            {
                null => "",
                JsonElement je => je.ValueKind switch
                {
                    JsonValueKind.String => je.GetString() ?? "",
                    JsonValueKind.Null   => "",
                    _ => je.ToString()
                },
                _ => kv.Value.ToString() ?? ""
            };
        }
        return dst;
    }

    // Resolve recipient name/email/phone from form_data using campaign.form_config
    // to map field types ("name"/"email"/"phone"/"tel") to their generated field ids
    // (e.g. "field_abc123"). Falls back to literal keys if no typed field is found.
    // Required because Form Builder fields are keyed by id, not by label.
    private static (string Name, string Email, string Phone) ResolveContact(
        Campaign? campaign, Dictionary<string, string> fd)
    {
        string Get(string key) => fd.TryGetValue(key, out var v) ? v ?? "" : "";

        string? typedName = null, typedEmail = null, typedPhone = null;

        if (campaign != null && !string.IsNullOrWhiteSpace(campaign.FormConfig))
        {
            try
            {
                using var doc = JsonDocument.Parse(campaign.FormConfig);
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
            catch { /* ignore parse errors, fall through to literal keys */ }
        }

        var name  = !string.IsNullOrWhiteSpace(typedName)  ? typedName!  : Get("name");
        var email = !string.IsNullOrWhiteSpace(typedEmail) ? typedEmail! : Get("email");
        var phone = !string.IsNullOrWhiteSpace(typedPhone) ? typedPhone! : (Get("phone").Length > 0 ? Get("phone") : Get("mobile"));
        return (name, email, phone);
    }
}

public record OfflineRegistrationSubmitRequest(
    string CampaignId,
    Dictionary<string, object> FormData,
    double TotalAmount,
    string? CouponCode = null,
    string? MemberId = null);

public record OtpVerifyRequest(
    string Otp,
    string? RegistrationId = null,
    string? CampaignId = null,
    bool IncludeFormData = false);

public record ConfirmOfflinePaymentRequest(
    string RegistrationId,
    double AmountReceived,
    string PaymentMethod = "cash",
    string? Notes = null);

public record KioskOtpVerifyRequest(string RegistrationId, string Otp);
