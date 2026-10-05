using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KaizenEvents.API.Helpers;
using KaizenEvents.Core.Constants;
using KaizenEvents.Core.DTOs.Registration;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api")]
public class RegistrationController : ApiControllerBase
{
    /// <summary>
    /// How long an unpaid registration stays payable — and, for the same window, correctable.
    ///
    /// The resume link used to have no expiry at all: the token check only asked whether the
    /// payment was still outstanding, so an abandoned attempt stayed payable forever and could
    /// be settled long after the event, under whatever name it was abandoned with. A registrant
    /// who means to come back does so in days, not months.
    /// </summary>
    public static readonly TimeSpan PendingPaymentLifetime = TimeSpan.FromDays(7);

    private readonly IRegistrationRepository _registrations;
    private readonly ICampaignRepository _campaigns;
    private readonly IPaymentRepository _payments;
    private readonly IPaymentAccountRepository _paymentAccounts;
    private readonly ICampaignMemberRepository _members;
    private readonly ICouponCodeRepository _coupons;
    private readonly IRefundRepository _refunds;
    private readonly IUserRepository _users;
    private readonly IRazorpayService _razorpay;
    private readonly IInstamojoService _instamojo;
    private readonly ICashfreeService _cashfree;
    private readonly ICashfreeSplitResolver _cashfreeSplits;
    private readonly IRazorpaySplitResolver _razorpaySplits;
    private readonly IInvoiceService _invoice;
    private readonly IGoogleSheetsService _sheets;
    private readonly IEncryptionService _enc;
    private readonly IAuditLoggerService _audit;
    private readonly IBrevoService _email;
    private readonly IRegistrationEmailService _regEmail;
    private readonly IKaizenGatewayService _kaizenGateway;
    private readonly Microsoft.Extensions.Configuration.IConfiguration _config;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<RegistrationController> _logger;

    /// <summary>Where UploadController writes registrant files; kept identical to it.</summary>
    private string UploadRoot => Path.Combine(_env.ContentRootPath, "uploads");

    public RegistrationController(
        IRegistrationRepository registrations,
        ICampaignRepository campaigns,
        IPaymentRepository payments,
        IPaymentAccountRepository paymentAccounts,
        ICampaignMemberRepository members,
        ICouponCodeRepository coupons,
        IRefundRepository refunds,
        IUserRepository users,
        IRazorpayService razorpay,
        IInstamojoService instamojo,
        ICashfreeService cashfree,
        ICashfreeSplitResolver cashfreeSplits,
        IRazorpaySplitResolver razorpaySplits,
        IInvoiceService invoice,
        IGoogleSheetsService sheets,
        IEncryptionService enc,
        IAuditLoggerService audit,
        IBrevoService email,
        IRegistrationEmailService regEmail,
        IKaizenGatewayService kaizenGateway,
        Microsoft.Extensions.Configuration.IConfiguration config,
        IWebHostEnvironment env,
        ILogger<RegistrationController> logger)
    {
        _registrations  = registrations;
        _campaigns      = campaigns;
        _payments       = payments;
        _paymentAccounts= paymentAccounts;
        _members        = members;
        _coupons        = coupons;
        _refunds        = refunds;
        _users          = users;
        _razorpay       = razorpay;
        _instamojo      = instamojo;
        _cashfree       = cashfree;
        _cashfreeSplits = cashfreeSplits;
        _razorpaySplits = razorpaySplits;
        _invoice        = invoice;
        _sheets         = sheets;
        _enc            = enc;
        _audit          = audit;
        _email          = email;
        _regEmail       = regEmail;
        _kaizenGateway  = kaizenGateway;
        _config         = config;
        _env            = env;
        _logger         = logger;
    }

    // ── POST /api/registrations/submit ────────────────────────────────────────
    [HttpPost("registrations/submit")]
    [AllowAnonymous]
    public async Task<IActionResult> Submit([FromBody] SubmitRegistrationRequest req)
    {
        // 1. Load campaign
        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        // 2. Validate campaign is open for registration
        if (campaign.Status != CampaignStatus.Active)
            return BadRequest(new { detail = campaign.Status switch
            {
                CampaignStatus.Paused    => "Registrations are temporarily paused. Please check back soon.",
                CampaignStatus.Completed => "This event has been completed and is no longer accepting registrations.",
                CampaignStatus.Closed    => "Registrations are closed for this event.",
                _                        => "Campaign is not active."
            }});
        if (!campaign.RegistrationEnabled)
            return BadRequest(new { detail = "Registration is currently disabled." });
        if (campaign.RegistrationStartDate.HasValue && DateTime.UtcNow < campaign.RegistrationStartDate.Value)
            return BadRequest(new { detail = "Registration has not started yet." });
        if (campaign.RegistrationEndDate.HasValue && DateTime.UtcNow > campaign.RegistrationEndDate.Value)
            return BadRequest(new { detail = "Registration has closed." });
        if (campaign.MaxRegistrations.HasValue &&
            campaign.CurrentRegistrations >= campaign.MaxRegistrations.Value)
            return BadRequest(new { detail = "Campaign is full." });

        // 2b. Is this the registrant correcting the attempt they just made, rather than a new
        // one? "Back to form" on the payment screen leaves the form filled, so changing a name
        // and submitting again used to mint a second registration and leave the first payable
        // under the old name. Amending in place keeps one row per attempt — same id, same
        // registration and invoice numbers, same resume link, now describing the right person.
        //
        // Every condition has to hold, and a failure is silent: the submission simply becomes a
        // new registration, which is what it would have been anyway. That keeps this endpoint
        // from answering questions about registrations the caller can't already prove it owns.
        var amending = await ResolveAmendableRegistrationAsync(campaign, req);

        // 3. Closed group validation
        CampaignMember? member = null;
        if (campaign.CampaignType == CampaignType.ClosedGroup)
        {
            if (string.IsNullOrWhiteSpace(req.MemberId))
                return BadRequest(new { detail = "member_id is required for closed group campaigns." });

            member = await _members.GetByIdAsync(req.MemberId);
            if (member == null || member.CampaignId != campaign.Id)
                return BadRequest(new { detail = "Member not found in this campaign." });

            // The attempt being amended already claimed this member — that is not a clash with
            // someone else, it is the same person submitting again, so it must not be rejected.
            var claimedByThisAttempt = amending != null && member.RegistrationId == amending.Id;
            if (member.Status == MemberStatus.Registered && !claimedByThisAttempt)
                return BadRequest(new { detail = "Member is already registered." });
        }

        // 3b. Drop answers to questions the registrant never saw. A registrant who picks a
        // COG name, then switches "Member type" to Rotarian and types a name, submits BOTH —
        // the browser hides the dropdown but keeps what was chosen in it. Stored as-is, the
        // registration carries two names and every downstream reader (payment page, receipt,
        // confirmation email, Sheets report) has to guess which one is the person.
        //
        // Done here, before validation and pricing, so the stripped data is what gets checked,
        // priced, stored and echoed back — there is no copy of the submission that still has it.
        var strippedFieldIds = FieldVisibility.StripHiddenAnswers(campaign.FormConfig, req.FormData);
        if (strippedFieldIds.Count > 0)
        {
            _logger.LogInformation(
                "Dropped {Count} hidden field answer(s) from a submission to campaign {CampaignId}: {Fields}",
                strippedFieldIds.Count, campaign.Id, string.Join(", ", strippedFieldIds));
        }

        // 4. Validate form fields (required, email format, phone, number). custom_amount
        // (donation) fields are additionally floored/ceilinged to the assigned gateway's real
        // per-transaction limits, regardless of whatever min_value/max_value the admin set —
        // see ValidateFormFields.
        var (gatewayMin, gatewayMax) = PaymentGatewayLimits.For(campaign.PaymentGateway);
        if (!string.IsNullOrEmpty(campaign.FormConfig))
        {
            var fieldErrors = ValidateFormFields(campaign.FormConfig, req.FormData, req.HiddenFieldIds,
                campaign.PaymentEnabled, gatewayMin, gatewayMax);
            if (fieldErrors.Count > 0)
                return BadRequest(new { detail = fieldErrors.First().Value, errors = fieldErrors });
        }

        // 5. Server-side price recalculation + validation.
        // Free events (payment_enabled == false) never collect money: the total is forced to
        // ₹0 regardless of any pricing left in the form config, and the client-supplied amount
        // is not validated (there is nothing to pay).
        var (calculatedTotal, couponDiscount, couponError) =
            await RecalculatePriceAsync(campaign, req.FormData, req.CouponCode);
        var rounded = Math.Round(calculatedTotal, 2, MidpointRounding.AwayFromZero);
        var effectiveTotal = campaign.PaymentEnabled ? req.TotalAmount : 0m;

        // A coupon that stopped being redeemable between page load and submit (expired,
        // switched off, or its last use claimed by someone else) is reported as itself.
        // Without this the registrant only ever saw "Amount mismatch", because the server
        // recalculates at full price while the client still shows the discounted one.
        if (couponError != null)
            return BadRequest(new { detail = couponError });

        if (campaign.PaymentEnabled && Math.Abs(rounded - req.TotalAmount) > 0.01m)
            return BadRequest(new { detail = $"Amount mismatch. Expected {rounded}, got {req.TotalAmount}." });

        // Backstop for any pricing path that isn't a plain custom_amount field (pricing rules,
        // a master formula, or a fixed base price) landing outside what the gateway will
        // actually accept. A total of exactly 0 is left alone here — that's the legitimate
        // "fully covered by a coupon" case, which never touches the gateway at all.
        if (campaign.PaymentEnabled && rounded != 0 && (rounded < gatewayMin || rounded > gatewayMax))
        {
            return BadRequest(new
            {
                detail = rounded < gatewayMin
                    ? $"The amount payable (₹{rounded}) is below ₹{gatewayMin}, the minimum our payment gateway accepts."
                    : $"The amount payable (₹{rounded}) is above ₹{gatewayMax}, the maximum our payment gateway accepts."
            });
        }

        // 6. Build registration
        var formDataJson = JsonSerializer.Serialize(req.FormData,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower });

        // Files picked before the registrant had typed their name were stored under a
        // random name. The full form is known now, so rename them to carry the person's
        // name — done BEFORE the row is written, so the DB, the Sheets row and the API
        // response all reference the same path.
        var (registrantName, _, _) = ResolveContactInfo(formDataJson, campaign.FormConfig, nameFallback: "");
        formDataJson = RegistrantUploadNaming.ApplyRegistrantName(
            formDataJson, UploadRoot, registrantName, _logger);

        var now = DateTime.UtcNow;
        var db  = HttpContext.RequestServices.GetRequiredService<AppDbContext>();

        Registration reg;
        CampaignMember? releasedMember = null;

        if (amending != null)
        {
            // Amend the attempt in place. Id, registration number, invoice number, resume token
            // and created_at all stay — the link already in the registrant's inbox keeps working
            // and now describes the corrected submission, and the number sequences don't gap.
            reg = amending;

            if (!string.IsNullOrEmpty(reg.MemberId) && reg.MemberId != req.MemberId)
            {
                // They picked a different member this time; the one this attempt had claimed goes
                // back on the list, or nobody could ever register as them again.
                releasedMember = await _members.GetByIdAsync(reg.MemberId);
            }

            reg.FormData           = formDataJson;
            reg.TotalAmount        = effectiveTotal;
            reg.CouponCode         = req.CouponCode?.Trim().ToUpperInvariant();
            reg.CouponDiscount     = campaign.PaymentEnabled ? couponDiscount : 0m;
            reg.MemberId           = req.MemberId;
            reg.UpdatedAt          = now;

            if (effectiveTotal == 0)
            {
                reg.PaymentStatus      = PaymentStatus.Completed;
                reg.RegistrationStatus = RegistrationStatus.Confirmed;
            }

            await _registrations.UpdateAsync(reg);
        }
        else
        {
            reg = new Registration
            {
                Id                   = Guid.NewGuid().ToString(),
                CampaignId           = campaign.Id,
                FormData             = formDataJson,
                TotalAmount          = effectiveTotal,
                PaymentStatus        = PaymentStatus.Pending,
                RegistrationStatus   = RegistrationStatus.Submitted,
                CouponCode           = req.CouponCode?.Trim().ToUpperInvariant(),
                // Only meaningful on a paying campaign — a free event discounts nothing.
                CouponDiscount       = campaign.PaymentEnabled ? couponDiscount : 0m,
                MemberId             = req.MemberId,
                Source               = "web",
                RegistrationNumber   = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign),
                InvoiceNumber        = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now),
                PaymentToken         = GeneratePaymentToken(),
                CreatedAt            = now,
                UpdatedAt            = now
            };

            // Free registration — confirm immediately with completed payment status
            if (effectiveTotal == 0)
            {
                reg.PaymentStatus      = PaymentStatus.Completed;
                reg.RegistrationStatus = RegistrationStatus.Confirmed;
            }

            try { await _registrations.CreateAsync(reg); }
            catch (DbUpdateException)
            {
                // Concurrent claim raced on a unique number index — retry once with fresh numbers
                reg.RegistrationNumber = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign);
                reg.InvoiceNumber      = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now);
                await _registrations.CreateAsync(reg);
            }
        }

        if (releasedMember != null)
        {
            releasedMember.Status         = MemberStatus.Unregistered;
            releasedMember.RegistrationId = null;
            releasedMember.RegisteredAt   = null;
            releasedMember.UpdatedAt      = now;
            await _members.UpdateAsync(releasedMember);
        }

        // 6. For free registrations, increment coupon usage and campaign stats immediately
        // (paid registrations: coupon usage incremented after payment verified)
        if (effectiveTotal == 0 && !string.IsNullOrWhiteSpace(req.CouponCode))
        {
            var coupon = await _coupons.GetByCodeAsync(campaign.Id, req.CouponCode.Trim().ToUpperInvariant());
            if (coupon != null)
                await ConsumeCouponAsync(coupon, reg.Id);
        }

        // 7. For free registrations, increment campaign stats
        if (effectiveTotal == 0)
        {
            campaign.CurrentRegistrations++;
            campaign.TotalRevenue += reg.TotalAmount;
            campaign.UpdatedAt    = now;
            await _campaigns.UpdateAsync(campaign);
        }

        // 8. Update member status for closed group
        if (member != null)
        {
            member.Status         = MemberStatus.Registered;
            member.RegistrationId = reg.Id;
            member.RegisteredAt   = now;
            member.UpdatedAt      = now;
            await _members.UpdateAsync(member);
        }

        // 9. Sync to Google Sheets (await to keep DbContext alive; sync is lightweight)
        try { await _sheets.SyncRegistrationAsync(reg, campaign); } catch { }

        // 10. Send confirmation email (only for free/confirmed registrations; paid ones get email after payment verified).
        // A failure here is recorded in notification_logs and retried by ConfirmationEmailReconciliationService —
        // never swallowed silently.
        if (reg.PaymentStatus == PaymentStatus.Completed)
        {
            try { await _regEmail.SendConfirmationAsync(reg, campaign); }
            catch (Exception ex) { _logger.LogError(ex, "Confirmation email threw for registration {RegId}", reg.Id); }
        }

        // 11. Audit log
        await _audit.LogAsync(AuditEventType.RegistrationCreated,
            resourceType: "registration", resourceId: reg.Id,
            actionDetails: new
            {
                campaign_id    = campaign.Id,
                amount         = reg.TotalAmount,
                payment_status = reg.PaymentStatus,
                // Distinguishes a correction to an abandoned attempt from a genuinely new one,
                // so the log doesn't read as two registrations where there was one person.
                amended        = amending != null
            },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return StatusCode(201, ToResponse(reg, includePaymentToken: true));
    }

    /// <summary>
    /// The pending registration this submission is amending, or null to create a new one.
    ///
    /// Deliberately silent about why it declined: this endpoint is anonymous, so answering
    /// "that registration exists but your token is wrong" would turn it into an oracle. Every
    /// rejection just means a new registration, which is what used to happen in every case.
    /// </summary>
    private async Task<Registration?> ResolveAmendableRegistrationAsync(
        Campaign campaign, SubmitRegistrationRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.ExistingRegistrationId) ||
            string.IsNullOrWhiteSpace(req.PaymentToken))
            return null;

        var candidate = await _registrations.GetByIdAsync(req.ExistingRegistrationId);
        if (candidate == null || candidate.CampaignId != campaign.Id) return null;

        // The resume token is the proof of ownership — the same secret the resume link carries.
        if (string.IsNullOrEmpty(candidate.PaymentToken)) return null;
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(candidate.PaymentToken),
                Encoding.UTF8.GetBytes(req.PaymentToken)))
            return null;

        // Only an attempt that is still outstanding may be rewritten. Anything paid, confirmed
        // or cancelled is settled history — amending it would silently restate what someone
        // already paid for.
        if (candidate.PaymentStatus != PaymentStatus.Pending) return null;
        if (candidate.RegistrationStatus != RegistrationStatus.Submitted) return null;

        // Correctable for exactly as long as it is payable.
        if (DateTime.UtcNow - candidate.CreatedAt > PendingPaymentLifetime) return null;

        return candidate;
    }


    // Decrypt Cashfree credentials from a payment account; returns null to let the service fall back to global config
    private CashfreeCredentials? BuildCashfreeCredentials(PaymentAccount? account)
    {
        if (account?.CashfreeAppId == null || account.CashfreeSecretKey == null) return null;
        try
        {
            return new CashfreeCredentials(
                AppId    : _enc.Decrypt(account.CashfreeAppId),
                SecretKey: _enc.Decrypt(account.CashfreeSecretKey),
                Mode     : account.CashfreeMode ?? "sandbox");
        }
        catch
        {
            return null; // decryption failure — fall back to global
        }
    }

    // ── GET /api/campaigns/{campaign_id}/registrations ────────────────────────
    [HttpGet("campaigns/{campaign_id}/registrations")]
    [Authorize]
    public async Task<IActionResult> ListRegistrations(string campaign_id)
    {
        if (!await HasCampaignAccessAsync(campaign_id))
            return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var list = await _registrations.GetByCampaignIdAsync(campaign_id);
        return Ok(list.Select(r => ToResponse(r)));
    }

    // ── PUT /api/registrations/{registration_id} ──────────────────────────────
    [HttpPut("registrations/{registration_id}")]
    [Authorize]
    public async Task<IActionResult> UpdateRegistration(
        string registration_id,
        [FromBody] UpdateRegistrationRequest req)
    {
        var reg = await _registrations.GetByIdAsync(registration_id);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        if (!await HasCampaignAccessAsync(reg.CampaignId))
            return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var previousAmount = reg.TotalAmount;
        var newAmount      = req.TotalAmount ?? previousAmount;

        // Update form data — only when provided, so a registration-ID-only edit can't wipe it.
        if (req.FormData != null)
        {
            reg.FormData = JsonSerializer.Serialize(req.FormData,
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower });
        }
        reg.UpdatedAt = DateTime.UtcNow;

        // Admin override of the human-facing registration ID. Null = leave as-is; empty = clear
        // to the auto-generated fallback; otherwise validate length + per-campaign uniqueness.
        if (req.RegistrationNumber != null)
        {
            var newNumber = req.RegistrationNumber.Trim();
            if (newNumber.Length == 0)
            {
                reg.RegistrationNumber = null;
            }
            else
            {
                if (newNumber.Length > 50)
                    return BadRequest(new { detail = "Registration ID must be 50 characters or fewer." });

                var dbCheck = HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var clash = await dbCheck.Registrations.AsNoTracking().AnyAsync(r =>
                    r.CampaignId == reg.CampaignId &&
                    r.RegistrationNumber == newNumber &&
                    r.Id != reg.Id);
                if (clash)
                    return BadRequest(new { detail = $"Registration ID '{newNumber}' is already used in this campaign." });

                reg.RegistrationNumber = newNumber;
            }
        }

        string? paymentLink    = null;
        bool   refundRequired  = false;
        decimal? refundAmount  = null;
        string message;

        if (req.TotalAmount.HasValue && req.TotalAmount.Value != previousAmount)
        {
            var difference = req.TotalAmount.Value - previousAmount;
            reg.TotalAmount = req.TotalAmount.Value;

            if (difference > 0 && reg.PaymentStatus == PaymentStatus.Completed)
            {
                // Generate additional payment link
                reg.AdditionalPaymentRequired = true;
                reg.AdditionalPaymentAmount   = difference;

                var (name, email, phone) = ResolveContactInfo(
                    reg.FormData, campaign.FormConfig,
                    emailFallback: "guest@example.com");

                try
                {
                    var account = campaign.PaymentAccountId != null
                        ? await _paymentAccounts.GetByIdAsync(campaign.PaymentAccountId)
                        : null;

                    if (account?.GatewayType == PaymentGatewayType.Instamojo)
                    {
                        var instaResult = await _instamojo.CreatePaymentRequestAsync(
                            difference,
                            $"Additional payment for {campaign.Name}",
                            name, email, phone);
                        paymentLink = instaResult.PaymentUrl;
                        reg.AdditionalPaymentLink = paymentLink;
                        reg.AdditionalPaymentGateway = "instamojo";
                    }
                    else
                    {
                        // Default: Razorpay
                        var rzpResult = await _razorpay.CreatePaymentLinkAsync(
                            difference,
                            $"Additional payment for {campaign.Name}",
                            name, email, phone);
                        paymentLink = rzpResult.ShortUrl;
                        reg.AdditionalPaymentLink    = paymentLink;
                        reg.AdditionalPaymentLinkId  = rzpResult.PaymentLinkId;
                        reg.AdditionalPaymentGateway = "razorpay";
                    }
                    message = $"Registration updated. Additional payment of ₹{difference:N2} required.";
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to create additional payment link for registration {Id}", reg.Id);
                    message = "Registration updated. Failed to generate additional payment link — contact support.";
                }
            }
            else if (difference < 0 && reg.PaymentStatus == PaymentStatus.Completed)
            {
                reg.RefundPending = true;
                reg.RefundAmount  = Math.Abs(difference);
                refundRequired    = true;
                refundAmount      = Math.Abs(difference);
                message           = $"Registration updated. Refund of ₹{Math.Abs(difference):N2} is pending approval.";

                // Notify super admins + directors (non-blocking)
                _ = NotifyRefundRequiredAsync(reg, campaign, Math.Abs(difference));
            }
            else
            {
                message = "Registration updated successfully.";
            }
        }
        else
        {
            message = "Registration updated successfully.";
        }

        try
        {
            await _registrations.UpdateAsync(reg);
        }
        catch (DbUpdateException) when (req.RegistrationNumber != null)
        {
            // Lost the race on ux_registrations_campaign_reg_number after the pre-check.
            return BadRequest(new { detail = "That registration ID is already used in this campaign." });
        }

        return Ok(new PaymentAdjustmentResponse(
            RegistrationId: reg.Id,
            Message       : message,
            PaymentLink   : paymentLink,
            RefundRequired: refundRequired,
            RefundAmount  : refundAmount,
            PreviousAmount: previousAmount,
            NewAmount     : reg.TotalAmount));
    }

    // ── POST /api/registrations/{registration_id}/confirm-refund ─────────────
    [HttpPost("registrations/{registration_id}/confirm-refund")]
    [Authorize]
    public async Task<IActionResult> ConfirmRefund(string registration_id)
    {
        if (!IsSuperAdmin && !(await IsDirectorAsync()))
            return Forbidden("Only Super Admins and Directors can confirm refunds.");

        var reg = await _registrations.GetByIdAsync(registration_id);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        if (!reg.RefundPending)
            return BadRequest(new { detail = "No pending refund for this registration." });

        reg.RefundPending     = false;
        reg.RefundConfirmed   = true;
        reg.RefundConfirmedAt = DateTime.UtcNow;
        reg.RefundConfirmedBy = CurrentUserId;
        reg.UpdatedAt         = DateTime.UtcNow;
        await _registrations.UpdateAsync(reg);

        return Ok(new { message = $"Refund of ₹{reg.RefundAmount:N2} confirmed successfully." });
    }

    // ── POST /api/registrations/resend-confirmation ───────────────────────────
    /// <summary>
    /// Super-admin: re-send the registration-confirmation email for one or more existing
    /// registrations, using the exact same app pipeline as a live registration (template
    /// rendering, verified sender, CC/BCC, and the filled-form PDF when the template enables
    /// it). Used to backfill confirmations for payments that were reconciled manually and so
    /// never triggered FinalizeRegistrationAsync.
    /// </summary>
    [HttpPost("registrations/resend-confirmation")]
    [Authorize]
    public async Task<IActionResult> ResendConfirmation([FromBody] ResendConfirmationRequest req)
    {
        if (!IsSuperAdmin)
            return Forbidden("Only Super Admins can resend confirmation emails.");
        if (req?.RegistrationIds == null || req.RegistrationIds.Count == 0)
            return BadRequest(new { detail = "registration_ids is required." });

        var results = new List<object>();
        int sent = 0;
        foreach (var regId in req.RegistrationIds.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct())
        {
            var reg = await _registrations.GetByIdAsync(regId);
            if (reg == null) { results.Add(new { registration_id = regId, status = "not_found" }); continue; }

            var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
            if (campaign == null) { results.Add(new { registration_id = regId, status = "campaign_not_found" }); continue; }

            try
            {
                var ok = await _regEmail.SendConfirmationAsync(reg, campaign);
                if (ok) sent++;
                results.Add(new { registration_id = regId, status = ok ? "sent" : "not_sent" });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Resend confirmation failed for registration {RegId}", regId);
                results.Add(new { registration_id = regId, status = "error", error = ex.Message });
            }
        }

        return Ok(new { total = results.Count, sent, results });
    }

    // ── POST /api/registrations/payment/initiate ──────────────────────────────
    [HttpPost("registrations/payment/initiate")]
    [AllowAnonymous]
    public async Task<IActionResult> InitiatePayment([FromBody] PaymentInitiateRequest req)
    {
        var reg = await _registrations.GetByIdAsync(req.RegistrationId);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        if (reg.PaymentStatus == PaymentStatus.Completed)
            return BadRequest(new { detail = "Payment already completed." });

        var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        // Free events never collect money — a paid registration on such a campaign is confirmed
        // at ₹0 on submit, so there is nothing to initiate here.
        if (!campaign.PaymentEnabled)
            return BadRequest(new { detail = "This is a free event; no payment is required." });

        // Determine effective gateway
        var gateway = req.PaymentGateway?.ToLowerInvariant() ?? "razorpay";

        // Load payment account credentials if configured
        PaymentAccount? account = null;
        if (campaign.PaymentAccountId != null)
            account = await _paymentAccounts.GetByIdAsync(campaign.PaymentAccountId);

        if (gateway == "razorpay")
        {
            // Route splits: when the account is in Route mode, build transfers[] via the
            // resolver and use CreateOrderWithTransfersAsync. single_account-mode accounts
            // always take the plain path — see RazorpaySplitResolver.DecideAsync.
            RazorpayOrderResult order;
            string? razorpaySplitsJson = null;
            var decision = await _razorpaySplits.DecideAsync(campaign, account, reg.TotalAmount);
            if (decision.ErrorDetail != null)
                return BadRequest(new { detail = decision.ErrorDetail });

            if (decision.UseRoute)
            {
                order = await _razorpay.CreateOrderWithTransfersAsync(
                    reg.TotalAmount, reg.InvoiceNumber ?? reg.Id, decision.Splits!.Transfers!);
                razorpaySplitsJson = decision.Splits.TransfersJson;
            }
            else
            {
                order = await _razorpay.CreateOrderAsync(reg.TotalAmount, reg.InvoiceNumber ?? reg.Id);
            }

            // Persist payment record
            var payment = new Payment
            {
                Id           = Guid.NewGuid().ToString(),
                CampaignId   = campaign.Id,
                RegistrationId = reg.Id,
                Amount       = reg.TotalAmount,
                Gateway      = "razorpay",
                PaymentAccountId = campaign.PaymentAccountId,
                GatewayOrderId = order.OrderId,
                VendorSplitsJson = razorpaySplitsJson,
                Status       = "pending",
                Purpose      = campaign.PaymentPurpose ?? $"Registration for {campaign.Name}",
                Source       = "web",
                CreatedAt    = DateTime.UtcNow,
                UpdatedAt    = DateTime.UtcNow
            };

            // Fill buyer info from form_data (resolved against form_config so we get
            // the actual name/email/phone, not the literal "Guest" fallback).
            var (rzpName, rzpEmail, rzpPhone) = ResolveContactInfo(reg.FormData, campaign.FormConfig);
            payment.BuyerName  = rzpName;
            payment.BuyerEmail = rzpEmail;
            payment.BuyerPhone = rzpPhone;

            await _payments.CreateAsync(payment);

            // Store order ID on registration
            reg.PaymentId  = payment.Id;
            reg.PaymentGateway = "razorpay";
            reg.UpdatedAt  = DateTime.UtcNow;
            await _registrations.UpdateAsync(reg);

            // Key ID for frontend: try per-account decryption; fall back to global config on failure
            var keyId = HttpContext.RequestServices
                .GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>()["Razorpay:KeyId"] ?? string.Empty;
            if (!string.IsNullOrEmpty(account?.RazorpayKeyId))
            {
                try { keyId = _enc.Decrypt(account.RazorpayKeyId); }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to decrypt RazorpayKeyId for account {Id} — using global config", account.Id); }
            }

            return Ok(new RazorpayInitiateResponse(
                OrderId : order.OrderId,
                Amount  : order.AmountPaise,
                Currency: order.Currency,
                KeyId   : keyId));
        }
        else if (gateway == "instamojo")
        {
            var (name, email, phone) = ResolveContactInfo(
                reg.FormData, campaign.FormConfig,
                emailFallback: "guest@example.com");

            var pr = await _instamojo.CreatePaymentRequestAsync(
                reg.TotalAmount,
                campaign.PaymentPurpose ?? $"Registration for {campaign.Name}",
                name, email, phone);

            var payment = new Payment
            {
                Id                        = Guid.NewGuid().ToString(),
                CampaignId                = campaign.Id,
                RegistrationId            = reg.Id,
                Amount                    = reg.TotalAmount,
                Gateway                   = "instamojo",
                PaymentAccountId          = campaign.PaymentAccountId,
                GatewayPaymentRequestId   = pr.PaymentRequestId,
                Status                    = "pending",
                Purpose                   = campaign.PaymentPurpose ?? $"Registration for {campaign.Name}",
                Source                    = "web",
                BuyerName                 = name,
                BuyerEmail                = email,
                BuyerPhone                = phone,
                CreatedAt                 = DateTime.UtcNow,
                UpdatedAt                 = DateTime.UtcNow
            };
            await _payments.CreateAsync(payment);

            reg.PaymentId      = payment.Id;
            reg.PaymentGateway = "instamojo";
            reg.UpdatedAt      = DateTime.UtcNow;
            await _registrations.UpdateAsync(reg);

            return Ok(new InstamojoInitiateResponse(
                PaymentRequestId: pr.PaymentRequestId,
                PaymentUrl      : pr.PaymentUrl));
        }
        else if (gateway == "cashfree")
        {
            // Direct-to-organizer with Easy Split. No Kaizen proxy. Vendor splits resolved
            // via the shared resolver and attached to the order at creation time.
            var (name, email, phone) = ResolveContactInfo(
                reg.FormData, campaign.FormConfig,
                emailFallback: "guest@example.com");

            var cfOrderId = $"CF-{reg.Id[..8].ToUpperInvariant()}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
            var returnUrl = req.ReturnUrl ?? "";

            IReadOnlyList<CashfreeVendorSplit>? vendorSplits = null;
            string? vendorSplitsJson = null;
            if (_config.GetValue<bool>("CashfreeVendorSplits:Enabled"))
            {
                var resolved = await _cashfreeSplits.ResolveAsync(campaign.Id, reg.TotalAmount);
                if (resolved.ErrorDetail != null)
                    return BadRequest(new { detail = resolved.ErrorDetail });
                vendorSplits     = resolved.Splits;
                vendorSplitsJson = resolved.SplitsJson;
            }

            var cfCreds = BuildCashfreeCredentials(account);
            var cfOrder = await _cashfree.CreateOrderAsync(
                reg.TotalAmount, cfOrderId, name, email, string.IsNullOrEmpty(phone) ? "9999999999" : phone,
                returnUrl, cfCreds, notifyUrl: null, vendorSplits);

            var payment = new Payment
            {
                Id                = Guid.NewGuid().ToString(),
                CampaignId        = campaign.Id,
                RegistrationId    = reg.Id,
                Amount            = reg.TotalAmount,
                Gateway           = "cashfree",
                PaymentAccountId  = campaign.PaymentAccountId,
                GatewayOrderId    = cfOrder.OrderId,
                VendorSplitsJson  = vendorSplitsJson,
                Status            = "pending",
                Purpose           = campaign.PaymentPurpose ?? $"Registration for {campaign.Name}",
                Source            = "web",
                BuyerName         = name,
                BuyerEmail        = email,
                BuyerPhone        = phone,
                CreatedAt         = DateTime.UtcNow,
                UpdatedAt         = DateTime.UtcNow
            };
            await _payments.CreateAsync(payment);

            reg.PaymentId      = payment.Id;
            reg.PaymentGateway = "cashfree";
            reg.UpdatedAt      = DateTime.UtcNow;
            await _registrations.UpdateAsync(reg);

            // Frontend uses Cashfree.js SDK with PaymentSessionId
            return Ok(new CashfreeInitiateResponse(
                OrderId          : cfOrder.OrderId,
                PaymentSessionId : cfOrder.PaymentSessionId,
                Amount           : cfOrder.Amount,
                Currency         : cfOrder.Currency));
        }

        return BadRequest(new { detail = $"Unsupported payment gateway: {gateway}." });
    }

    // ── GET /api/registrations/pending/{id} (token-protected, anonymous) ─────
    /// <summary>
    /// Fetch a pending registration's summary using the payment token from the reminder email.
    /// Public — any anonymous user with the correct token can view the minimum required data.
    /// </summary>
    [HttpGet("registrations/pending/{registration_id}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPendingRegistration(
        string registration_id,
        [FromQuery] string token)
    {
        var reg = await _registrations.GetByIdAsync(registration_id);
        if (reg == null || string.IsNullOrEmpty(reg.PaymentToken) ||
            !CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.UTF8.GetBytes(reg.PaymentToken),
                System.Text.Encoding.UTF8.GetBytes(token ?? "")))
        {
            return NotFound(new { detail = "Registration not found or link is invalid." });
        }

        // A payment left outstanding this long is not going to be completed by the person who
        // started it. Left open, the link stayed payable indefinitely — an attempt abandoned
        // under a name the registrant had already corrected could still be settled months later,
        // registering the wrong person. Checked after the token so an expired link and a wrong
        // one are indistinguishable to anyone guessing.
        if (DateTime.UtcNow - reg.CreatedAt > PendingPaymentLifetime && reg.PaymentStatus != PaymentStatus.Completed)
        {
            return StatusCode(410, new { detail = "This payment link has expired. Please register again to continue." });
        }

        if (reg.PaymentStatus == PaymentStatus.Completed)
            return Ok(new { already_paid = true, registration_id = reg.Id });

        var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var (buyerName, buyerEmail, buyerPhone) = ResolveContactInfo(reg.FormData, campaign.FormConfig);
        return Ok(new
        {
            registration_id   = reg.Id,
            campaign_id       = campaign.Id,
            campaign_name     = campaign.Name,
            organization_name = campaign.OrganizationName,
            payment_gateway   = (campaign.PaymentGateway.ToString().ToLowerInvariant()),
            total_amount      = reg.TotalAmount,
            invoice_number    = reg.InvoiceNumber,
            buyer_name        = buyerName,
            buyer_email       = buyerEmail,
            buyer_phone       = buyerPhone,
            payment_status    = reg.PaymentStatus.ToString().ToLowerInvariant()
        });
    }

    // ── POST /api/registrations/pending/{id}/retry-payment ──────────────────
    /// <summary>
    /// Re-initiate a payment order for a pending registration. Token-protected, anonymous.
    /// Returns the same shape as InitiatePayment so the frontend can open the gateway popup.
    /// </summary>
    [HttpPost("registrations/pending/{registration_id}/retry-payment")]
    [AllowAnonymous]
    public async Task<IActionResult> RetryPendingPayment(
        string registration_id,
        [FromQuery] string token,
        [FromBody] RetryPendingPaymentRequest? req)
    {
        var reg = await _registrations.GetByIdAsync(registration_id);
        if (reg == null || string.IsNullOrEmpty(reg.PaymentToken) ||
            !CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.UTF8.GetBytes(reg.PaymentToken),
                System.Text.Encoding.UTF8.GetBytes(token ?? "")))
        {
            return NotFound(new { detail = "Registration not found or link is invalid." });
        }

        // A payment left outstanding this long is not going to be completed by the person who
        // started it. Left open, the link stayed payable indefinitely — an attempt abandoned
        // under a name the registrant had already corrected could still be settled months later,
        // registering the wrong person. Checked after the token so an expired link and a wrong
        // one are indistinguishable to anyone guessing.
        if (DateTime.UtcNow - reg.CreatedAt > PendingPaymentLifetime && reg.PaymentStatus != PaymentStatus.Completed)
        {
            return StatusCode(410, new { detail = "This payment link has expired. Please register again to continue." });
        }

        if (reg.PaymentStatus == PaymentStatus.Completed)
            return BadRequest(new { detail = "Payment already completed for this registration." });

        // Delegate to the existing InitiatePayment flow by calling it directly
        var initReq = new PaymentInitiateRequest(
            RegistrationId : reg.Id,
            PaymentGateway : req?.PaymentGateway,
            ReturnUrl      : req?.ReturnUrl);

        return await InitiatePayment(initReq);
    }

    // ── POST /api/registrations/payment/verify/razorpay ──────────────────────
    [HttpPost("registrations/payment/verify/razorpay")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyRazorpay([FromBody] VerifyRazorpayRequest req)
    {
        var reg = await _registrations.GetByIdAsync(req.RegistrationId);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        if (reg.PaymentStatus == PaymentStatus.Completed)
            return Ok(new PaymentVerifyResponse("success", "Payment already verified."));

        // Verify HMAC signature
        if (!_razorpay.VerifyPaymentSignature(req.RazorpayOrderId, req.RazorpayPaymentId, req.RazorpaySignature))
            return BadRequest(new { detail = "Invalid payment signature." });

        // Update payment record
        var payment = await _payments.GetByGatewayOrderIdAsync(req.RazorpayOrderId);
        if (payment != null)
        {
            payment.GatewayPaymentId = req.RazorpayPaymentId;
            payment.Status           = "completed";
            payment.PaidAt           = DateTime.UtcNow;
            payment.UpdatedAt        = DateTime.UtcNow;
            await _payments.UpdateAsync(payment);

            // Update payment account stats
            if (payment.PaymentAccountId != null)
            {
                var account = await _paymentAccounts.GetByIdAsync(payment.PaymentAccountId);
                if (account != null)
                {
                    account.TotalTransactions++;
                    account.TotalAmountCollected += payment.Amount;
                    account.LastTransactionAt    = DateTime.UtcNow;
                    account.UpdatedAt            = DateTime.UtcNow;
                    await _paymentAccounts.UpdateAsync(account);
                }
            }
        }

        // Update registration
        reg.PaymentStatus      = PaymentStatus.Completed;
        reg.RegistrationStatus = RegistrationStatus.Confirmed;
        reg.GatewayPaymentId   = req.RazorpayPaymentId;
        reg.UpdatedAt          = DateTime.UtcNow;
        await _registrations.UpdateAsync(reg);

        // Increment campaign stats
        var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
        if (campaign != null)
        {
            campaign.CurrentRegistrations++;
            campaign.TotalRevenue += reg.TotalAmount;
            campaign.UpdatedAt    = DateTime.UtcNow;
            await _campaigns.UpdateAsync(campaign);

            // Sync to Google Sheets
            try { await _sheets.SyncRegistrationAsync(reg, campaign); } catch { }
        }

        // Increment coupon usage now that payment is confirmed
        if (!string.IsNullOrWhiteSpace(reg.CouponCode))
        {
            var coupon = await _coupons.GetByCodeAsync(reg.CampaignId, reg.CouponCode);
            if (coupon != null)
                await ConsumeCouponAsync(coupon, reg.Id);
        }

        // Send confirmation email with invoice
        if (campaign != null)
        {
            try { await _regEmail.SendConfirmationAsync(reg, campaign); }
            catch (Exception ex) { _logger.LogError(ex, "Confirmation email threw for registration {RegId}", reg.Id); }
        }

        await _audit.LogAsync(AuditEventType.PaymentVerified,
            resourceType: "registration", resourceId: reg.Id,
            actionDetails: new { gateway_payment_id = reg.GatewayPaymentId, amount = reg.TotalAmount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new PaymentVerifyResponse("success", "Payment verified successfully."));
    }

    // ── POST /api/registrations/payment/verify/cashfree ─────────────────────
    [HttpPost("registrations/payment/verify/cashfree")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyCashfree([FromBody] VerifyCashfreeRequest req)
    {
        var reg = await _registrations.GetByIdAsync(req.RegistrationId);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        if (reg.PaymentStatus == PaymentStatus.Completed)
            return Ok(new PaymentVerifyResponse("success", "Payment already verified."));

        // Load per-account credentials
        var paymentForCreds = reg.PaymentId != null ? await _payments.GetByIdAsync(reg.PaymentId) : null;
        var cfAccount = paymentForCreds?.PaymentAccountId != null
            ? await _paymentAccounts.GetByIdAsync(paymentForCreds.PaymentAccountId)
            : null;
        var cfCreds = BuildCashfreeCredentials(cfAccount);

        // Check order status with Cashfree (using the same credentials that created the order)
        var status = await _cashfree.GetOrderStatusAsync(req.OrderId, cfCreds);

        if (status.OrderStatus != "PAID")
            return BadRequest(new { detail = $"Payment not completed. Status: {status.OrderStatus}" });

        // Update payment record
        var payment = await _payments.GetByGatewayOrderIdAsync(req.OrderId);
        if (payment != null)
        {
            payment.GatewayPaymentId = status.CfPaymentId;
            payment.Status           = "completed";
            payment.PaidAt           = DateTime.UtcNow;
            payment.UpdatedAt        = DateTime.UtcNow;
            await _payments.UpdateAsync(payment);

            if (payment.PaymentAccountId != null)
            {
                var account = await _paymentAccounts.GetByIdAsync(payment.PaymentAccountId);
                if (account != null)
                {
                    account.TotalTransactions++;
                    account.TotalAmountCollected += payment.Amount;
                    account.LastTransactionAt    = DateTime.UtcNow;
                    account.UpdatedAt            = DateTime.UtcNow;
                    await _paymentAccounts.UpdateAsync(account);
                }
            }
        }

        // Update registration
        reg.PaymentStatus      = PaymentStatus.Completed;
        reg.RegistrationStatus = RegistrationStatus.Confirmed;
        reg.GatewayPaymentId   = status.CfPaymentId;
        reg.UpdatedAt          = DateTime.UtcNow;
        await _registrations.UpdateAsync(reg);

        // Increment campaign stats
        var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
        if (campaign != null)
        {
            campaign.CurrentRegistrations++;
            campaign.TotalRevenue += reg.TotalAmount;
            campaign.UpdatedAt    = DateTime.UtcNow;
            await _campaigns.UpdateAsync(campaign);

            try { await _sheets.SyncRegistrationAsync(reg, campaign); } catch { }
        }

        // Increment coupon usage
        if (!string.IsNullOrWhiteSpace(reg.CouponCode))
        {
            var coupon = await _coupons.GetByCodeAsync(reg.CampaignId, reg.CouponCode);
            if (coupon != null)
                await ConsumeCouponAsync(coupon, reg.Id);
        }

        // Send confirmation email
        if (campaign != null)
        {
            try { await _regEmail.SendConfirmationAsync(reg, campaign); }
            catch (Exception ex) { _logger.LogError(ex, "Confirmation email threw for registration {RegId}", reg.Id); }
        }

        await _audit.LogAsync(AuditEventType.PaymentVerified,
            resourceType: "registration", resourceId: reg.Id,
            actionDetails: new { gateway = "cashfree", cf_payment_id = status.CfPaymentId, amount = reg.TotalAmount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new PaymentVerifyResponse("success", "Payment verified successfully."));
    }

    // ── POST /api/registrations/payment/callback ──────────────────────────────
    // Called by the frontend for free registrations (amount = 0) to confirm them.
    // Idempotent: submit endpoint already finalizes free regs, so this is mostly a no-op.
    [HttpPost("registrations/payment/callback")]
    [AllowAnonymous]
    public async Task<IActionResult> PaymentCallback([FromBody] PaymentCallbackRequest req)
    {
        var reg = await _registrations.GetByIdAsync(req.RegistrationId);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        // Already finalized (e.g. free reg confirmed at submit time) — return success
        if (reg.PaymentStatus == PaymentStatus.Completed)
            return Ok(new { status = "success", message = "Already confirmed." });

        // This endpoint is unauthenticated and req.Status is asserted by the caller with no
        // gateway signature or server-side re-check behind it — by design, it only exists to
        // let the client rubber-stamp a registration that already owes nothing (see doc
        // comment above). A registration with a real amount due must be confirmed through a
        // verified gateway path (Razorpay signature verify/webhook, Instamojo webhook,
        // Cashfree order-status re-check) — never here, or anyone holding a registration_id
        // could mark any amount "paid" and trigger the confirmation email with no money moved.
        if (reg.TotalAmount > 0)
            return BadRequest(new { detail = "This registration requires payment verification through the payment gateway." });

        if (req.Status == "success")
        {
            reg.PaymentStatus      = PaymentStatus.Completed;
            reg.RegistrationStatus = RegistrationStatus.Confirmed;
            if (!string.IsNullOrWhiteSpace(req.PaymentId))
                reg.GatewayPaymentId = req.PaymentId;
            reg.UpdatedAt = DateTime.UtcNow;
            await _registrations.UpdateAsync(reg);

            var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
            if (campaign != null)
            {
                campaign.CurrentRegistrations++;
                campaign.TotalRevenue += reg.TotalAmount;
                campaign.UpdatedAt    = DateTime.UtcNow;
                await _campaigns.UpdateAsync(campaign);

                try { await _sheets.SyncRegistrationAsync(reg, campaign); } catch { }

                // Confirm by email on this completion path too (was previously missing here).
                // Failure is recorded + retried by ConfirmationEmailReconciliationService.
                try { await _regEmail.SendConfirmationAsync(reg, campaign); }
                catch (Exception ex) { _logger.LogError(ex, "Confirmation email threw for registration {RegId}", reg.Id); }
            }
        }
        else
        {
            reg.PaymentStatus = PaymentStatus.Failed;
            reg.UpdatedAt     = DateTime.UtcNow;
            await _registrations.UpdateAsync(reg);
        }

        return Ok(new { status = "success", message = "Payment processed." });
    }

    // ── GET /api/registrations/{registration_id}/invoice ─────────────────────
    [HttpGet("registrations/{registration_id}/invoice")]
    [AllowAnonymous]
    public async Task<IActionResult> GetInvoice(string registration_id)
    {
        var reg = await _registrations.GetByIdAsync(registration_id);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        if (reg.PaymentStatus != PaymentStatus.Completed)
            return BadRequest(new { detail = "Invoice is only available for completed payments." });

        var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var pdf      = _invoice.GenerateInvoicePdf(reg, campaign);
        var filename = $"invoice_{reg.InvoiceNumber ?? reg.Id}.pdf";

        return File(pdf, "application/pdf", filename);
    }

    // ── POST /api/registrations/refund ────────────────────────────────────────
    [HttpPost("registrations/refund")]
    [Authorize]
    public async Task<IActionResult> CreateRefund([FromBody] CreateRefundRequest req)
    {
        if (!IsSuperAdmin)
            return Forbidden();

        var reg = await _registrations.GetByIdAsync(req.RegistrationId);
        if (reg == null)
            return NotFound(new { detail = "Registration not found." });

        if (reg.PaymentStatus != PaymentStatus.Completed)
            return BadRequest(new { detail = "Cannot refund an incomplete payment." });

        // Attempt gateway refund through the original gateway
        string? refundId = null;
        if (!string.IsNullOrEmpty(reg.GatewayPaymentId))
        {
            var gateway = (reg.PaymentGateway ?? "razorpay").ToLowerInvariant();
            try
            {
                if (gateway == "razorpay")
                {
                    var result = await _razorpay.CreateRefundAsync(reg.GatewayPaymentId, req.Amount);
                    refundId = result.RefundId;
                }
                else if (gateway == "instamojo")
                {
                    var result = await _instamojo.CreateRefundAsync(reg.GatewayPaymentId, req.Amount, req.Reason);
                    refundId = result.RefundId;
                }
                else if (gateway == "cashfree")
                {
                    // Cashfree refunds use the original order_id, not payment_id
                    var payment = reg.PaymentId != null ? await _payments.GetByIdAsync(reg.PaymentId) : null;
                    var orderId = payment?.GatewayOrderId;
                    if (string.IsNullOrEmpty(orderId))
                    {
                        _logger.LogWarning("Cashfree refund: no gateway_order_id on payment record for registration {Id}", reg.Id);
                    }
                    else
                    {
                        // Use the same credentials that created the order
                        var cfAccount = payment?.PaymentAccountId != null
                            ? await _paymentAccounts.GetByIdAsync(payment.PaymentAccountId)
                            : null;
                        var cfCreds = BuildCashfreeCredentials(cfAccount);
                        var result = await _cashfree.CreateRefundAsync(orderId, req.Amount, req.Reason, cfCreds);
                        refundId = result.RefundId;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Gateway} refund failed for registration {Id}", gateway, reg.Id);
                return StatusCode(502, new { detail = $"{gateway} refund failed. Please try again." });
            }
        }

        // Create refund record
        var refund = new Refund
        {
            Id             = Guid.NewGuid().ToString(),
            RegistrationId = reg.Id,
            Amount         = req.Amount,
            Reason         = req.Reason,
            Status         = "processed",
            RefundId       = refundId,
            CreatedAt      = DateTime.UtcNow
        };
        await _refunds.CreateAsync(refund);

        // Update registration payment status
        reg.PaymentStatus = req.Amount >= reg.TotalAmount
            ? PaymentStatus.Refunded
            : PaymentStatus.PartialRefund;
        reg.UpdatedAt = DateTime.UtcNow;
        await _registrations.UpdateAsync(reg);

        return StatusCode(201, new RefundResponse(
            Id            : refund.Id,
            RegistrationId: refund.RegistrationId,
            Amount        : refund.Amount,
            Status        : refund.Status,
            RefundId      : refund.RefundId,
            Reason        : refund.Reason,
            CreatedAt     : refund.CreatedAt));
    }

    /// <summary>
    /// Claims one use of a coupon, atomically.
    ///
    /// Deliberately never fails the caller. By the time this runs the registration
    /// exists and — on a paid campaign — the money has already been taken, so refusing
    /// here would strand a paying registrant over a counter. What the usage limit is
    /// actually there to guarantee is that the counter never climbs past it, and
    /// <see cref="ICouponCodeRepository.TryConsumeAsync"/> enforces that in SQL. The
    /// rare loser of a race for the final use is logged so it can be reconciled.
    /// </summary>
    private async Task ConsumeCouponAsync(CouponCode coupon, string registrationId)
    {
        var claimed = await _coupons.TryConsumeAsync(coupon.Id);
        if (!claimed)
            _logger.LogWarning(
                "Coupon {Code} on campaign {CampaignId} was already at its usage limit ({Limit}) " +
                "when registration {RegistrationId} redeemed it. The registration stands; the " +
                "usage counter was left at the limit.",
                coupon.Code, coupon.CampaignId, coupon.UsageLimit, registrationId);
    }

    // ── Price recalculation (mirrors FormController.CalculatePrice) ───────────
    private async Task<(decimal Total, decimal CouponDiscount, string? CouponError)> RecalculatePriceAsync(
        Campaign campaign,
        Dictionary<string, JsonElement> formData,
        string? couponCode)
    {
        if (string.IsNullOrEmpty(campaign.FormConfig))
            return (0, 0, null);

        using var formDoc = JsonDocument.Parse(campaign.FormConfig);
        var root = formDoc.RootElement;

        decimal basePrice = 0;
        if (root.TryGetProperty("base_price", out var bp) && bp.ValueKind == JsonValueKind.Number)
            basePrice = bp.GetDecimal();

        var vars = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
            { ["base_price"] = (double)basePrice };

        // Choice fields (dropdown/radio/checkbox): resolve selected option(s) → sum price_modifiers
        var choiceFieldModifiers = new Dictionary<string, Dictionary<string, double>>(StringComparer.OrdinalIgnoreCase);
        // custom_amount fields: registrant-entered amount joins the total as-is. Min/max
        // (admin-configured or gateway-implied) are enforced entirely by ValidateFormFields,
        // which already ran before this method — an out-of-range value never reaches here.
        // Clamping it here too used to silently round e.g. an optional field's deliberate 0 up
        // to the gateway floor, showing "₹1" instead of "₹0" with no error — see ClampCustomAmount.
        var customAmountFieldIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fieldTypes = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("fields", out var fieldsEl) && fieldsEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var field in fieldsEl.EnumerateArray())
            {
                var fieldId   = field.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                var fieldType = field.TryGetProperty("type", out var tEl) ? tEl.GetString() : null;
                if (string.IsNullOrEmpty(fieldId)) continue;
                fieldTypes[fieldId] = fieldType;
                if (fieldType == "custom_amount")
                {
                    customAmountFieldIds.Add(fieldId);
                    continue;
                }
                if (fieldType != "dropdown" && fieldType != "radio" && fieldType != "checkbox") continue;
                if (!field.TryGetProperty("options", out var optsEl) || optsEl.ValueKind != JsonValueKind.Array) continue;

                var optMap = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                foreach (var opt in optsEl.EnumerateArray())
                {
                    var optValue = opt.TryGetProperty("value", out var vEl) ? vEl.GetString() : null;
                    double modifier = 0;
                    if (opt.TryGetProperty("price_modifier", out var pmEl))
                    {
                        if (pmEl.ValueKind == JsonValueKind.Number) modifier = pmEl.GetDouble();
                        else if (pmEl.ValueKind == JsonValueKind.String &&
                                 double.TryParse(pmEl.GetString(), System.Globalization.NumberStyles.Float,
                                     System.Globalization.CultureInfo.InvariantCulture, out var pd))
                            modifier = pd;
                    }
                    if (!string.IsNullOrEmpty(optValue)) optMap[optValue] = modifier;
                }
                choiceFieldModifiers[fieldId] = optMap;
            }
        }

        // Fields hidden by conditional rules (given the submitted data) must NOT affect the
        // price — their value lingers in form_data after the user switches away. Mirrors the
        // client's visibility-aware calculateTotal so the two totals match.
        var hasFieldRules = root.TryGetProperty("field_rules", out var fieldRulesEl)
                            && fieldRulesEl.ValueKind == JsonValueKind.Array;
        bool FieldHidden(string fieldId) =>
            hasFieldRules && IsFieldHidden(fieldId, fieldRulesEl, formData, fieldTypes);

        foreach (var (key, val) in formData)
        {
            // Hidden field → contributes 0 to formulas (don't let a stale value leak in).
            if (FieldHidden(key))
            {
                vars[key] = 0;
                continue;
            }

            if (choiceFieldModifiers.TryGetValue(key, out var optMap))
            {
                double sum = 0;
                if (val.ValueKind == JsonValueKind.String)
                {
                    if (optMap.TryGetValue(val.GetString() ?? "", out var m)) sum = m;
                }
                else if (val.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in val.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.String &&
                            optMap.TryGetValue(item.GetString() ?? "", out var m)) sum += m;
                    }
                }
                vars[key] = sum;
                continue;
            }

            if (val.ValueKind == JsonValueKind.Number)
                vars[key] = val.GetDouble();
            else if (val.ValueKind == JsonValueKind.String &&
                     double.TryParse(val.GetString(),
                         System.Globalization.NumberStyles.Float,
                         System.Globalization.CultureInfo.InvariantCulture, out var d))
                vars[key] = d;
        }

        decimal subtotal = basePrice;

        // Pricing rules
        if (root.TryGetProperty("pricing_rules", out var rulesEl) &&
            rulesEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var rule in rulesEl.EnumerateArray()
                .Select(r => r.Clone())
                .OrderByDescending(r => r.TryGetProperty("priority", out var p) ? p.GetInt32() : 0))
            {
                bool met = true;
                if (rule.TryGetProperty("conditions", out var condsEl) &&
                    condsEl.ValueKind == JsonValueKind.Array)
                {
                    var conds = condsEl.EnumerateArray()
                        .Select(c => new FieldCondition(
                            c.TryGetProperty("field_id", out var f) ? f.GetString() ?? "" : "",
                            c.TryGetProperty("operator", out var op) ? op.GetString() ?? "" : "",
                            c.TryGetProperty("value", out var v)
                                ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString())
                                : null))
                        .ToList();
                    // Raw JsonElement form data so checkbox arrays get membership semantics
                    met = FieldRulesEvaluator.EvaluateConditions(conds, formData);
                }
                if (!met) continue;

                if (rule.TryGetProperty("formula", out var fEl) && fEl.ValueKind == JsonValueKind.String)
                {
                    vars["current_total"] = (double)subtotal;
                    try { subtotal += Math.Round((decimal)FormulaEngine.Evaluate(fEl.GetString()!, vars), 2, MidpointRounding.AwayFromZero); }
                    catch { /* skip */ }
                }
            }
        }

        // Master formula (overrides the default sum). If no formula set,
        // auto-sum option price_modifiers from choice fields (dropdown/radio/checkbox).
        var hasFormula = root.TryGetProperty("pricing_formula", out var pf)
            && pf.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(pf.GetString());

        if (hasFormula)
        {
            vars["current_total"] = (double)subtotal;
            try { subtotal = Math.Round((decimal)FormulaEngine.Evaluate(pf.GetString()!, vars), 2, MidpointRounding.AwayFromZero); }
            catch { /* keep */ }
        }
        else
        {
            // Auto-sum selected option price_modifiers across choice fields, skipping any
            // field hidden by conditional rules (so it doesn't get charged after the
            // registrant switches away from the selection that revealed it).
            foreach (var (fieldId, optMap) in choiceFieldModifiers)
            {
                if (!formData.TryGetValue(fieldId, out var val)) continue;
                if (FieldHidden(fieldId)) continue;
                if (val.ValueKind == JsonValueKind.String)
                {
                    if (optMap.TryGetValue(val.GetString() ?? "", out var m))
                        subtotal += (decimal)m;
                }
                else if (val.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in val.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.String &&
                            optMap.TryGetValue(item.GetString() ?? "", out var m))
                            subtotal += (decimal)m;
                    }
                }
            }

            // custom_amount: registrant-entered amount joins the total as typed (bounds
            // already enforced by ValidateFormFields — see the comment where
            // customAmountFieldIds is built), skipping hidden fields as above. With a
            // master formula the organizer references the field variable instead.
            foreach (var fieldId in customAmountFieldIds)
            {
                if (!formData.TryGetValue(fieldId, out var val)) continue;
                if (FieldHidden(fieldId)) continue;
                subtotal += (decimal)SafeCustomAmount(val);
            }
        }

        // Coupon — all rules and arithmetic live in CouponCalculator so this path, the
        // /calculate-price preview and /validate-coupon can never disagree.
        string? couponError   = null;
        decimal couponDiscount = 0m;
        if (!string.IsNullOrWhiteSpace(couponCode))
        {
            var coupon = await _coupons.GetByCodeAsync(campaign.Id, couponCode.Trim().ToUpperInvariant());
            if (coupon == null)
            {
                couponError = CouponCalculator.ErrorNotFound;
            }
            else
            {
                (couponDiscount, couponError) =
                    CouponCalculator.Apply(coupon.ToTerms(), subtotal, DateTime.UtcNow, vars);
                if (couponError == null)
                    subtotal -= couponDiscount;
            }
        }

        return (Math.Round(Math.Max(0, subtotal), 2, MidpointRounding.AwayFromZero),
                couponDiscount,
                couponError);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Dictionary<string, string> ValidateFormFields(
        string formConfig,
        Dictionary<string, JsonElement> formData,
        List<string>? clientHiddenFieldIds = null,
        bool paymentEnabled = false,
        decimal gatewayMin = 0m,
        decimal gatewayMax = decimal.MaxValue)
    {
        var errors = new Dictionary<string, string>();
        var clientHidden = clientHiddenFieldIds is { Count: > 0 }
            ? new HashSet<string>(clientHiddenFieldIds, StringComparer.Ordinal)
            : null;

        var skippedPageFields = PageFlow.SkippedPageFieldIds(
            formConfig, JsonSerializer.Serialize(formData));

        try
        {
            using var doc = JsonDocument.Parse(formConfig);
            if (!doc.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array)
                return errors;

            // Build a field-type lookup (id → type) for conditional-rule evaluation
            var fieldTypes = new Dictionary<string, string?>();
            foreach (var f in fieldsEl.EnumerateArray())
            {
                if (f.TryGetProperty("id", out var fid) && fid.GetString() is { } fidStr)
                    fieldTypes[fidStr] = f.TryGetProperty("type", out var ft) ? ft.GetString() : null;
            }

            // Conditional rules — used to skip required/type validation for hidden fields.
            JsonElement rulesEl = default;
            var hasRules = doc.RootElement.TryGetProperty("field_rules", out rulesEl)
                           && rulesEl.ValueKind == JsonValueKind.Array;

            foreach (var field in fieldsEl.EnumerateArray())
            {
                var fieldId = field.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrEmpty(fieldId)) continue;

                var fieldType = field.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;
                var label     = field.TryGetProperty("label", out var lEl) ? lEl.GetString() : fieldId;
                var required  = field.TryGetProperty("required", out var reqEl) && reqEl.GetBoolean();

                // Skip display-only fields
                if (fieldType is "section_header" or "calculated" or "price") continue;

                // Skip fields the admin hid outright via the field's Visibility setting.
                // These are never rendered, so a registrant cannot fill one — enforcing
                // "required" on it rejects every submission. Checked here rather than
                // relying on hidden_field_ids so an older cached bundle still submits.
                if (field.TryGetProperty("visibility", out var visEl)
                    && visEl.ValueKind == JsonValueKind.String
                    && visEl.GetString() == "hide")
                    continue;

                // Skip fields the client reported hidden (field rules / skipped pages). The
                // client is authoritative for what the registrant actually saw — this avoids
                // false "required" errors from any client/server visibility-evaluation drift.
                if (clientHidden != null && clientHidden.Contains(fieldId))
                    continue;

                // Skip fields hidden by conditional rules — a hidden field is allowed to be empty
                // even if marked required (mirrors the client-side getFieldState() behavior).
                // Kept as a fallback for older clients that don't send hidden_field_ids.
                if (hasRules && IsFieldHidden(fieldId, rulesEl, formData, fieldTypes))
                    continue;

                // Skip fields on pages of a multi-page form this submission routes past. The
                // registrant was never shown them, and their answers have just been stripped, so
                // enforcing "required" here would reject a submission for not answering a
                // question it was never asked.
                if (skippedPageFields.Contains(fieldId))
                    continue;

                formData.TryGetValue(fieldId, out var valueEl);
                var rawValue = valueEl.ValueKind == JsonValueKind.String
                    ? valueEl.GetString()?.Trim()
                    : valueEl.ValueKind == JsonValueKind.Undefined ? null : valueEl.ToString();

                // Composite "name" fields don't store a value under {id}; their parts live under
                // {id}_first / {id}_middle / {id}_last (matching the rest of the server, e.g. the
                // WhatsApp/email contact resolution). Derive the effective value from those so the
                // required/emptiness check is correct — otherwise a required name field can never
                // be submitted.
                if (fieldType == "name")
                {
                    string NamePart(string suffix) =>
                        formData.TryGetValue($"{fieldId}_{suffix}", out var pe) && pe.ValueKind == JsonValueKind.String
                            ? (pe.GetString() ?? "").Trim() : "";
                    var composed = string.Join(" ",
                        new[] { NamePart("first"), NamePart("middle"), NamePart("last") }
                            .Where(s => !string.IsNullOrWhiteSpace(s)));
                    if (!string.IsNullOrWhiteSpace(composed)) rawValue = composed;
                }

                // Array-valued fields (checkbox multi-select, etc.) stringify to "[]" for an
                // empty selection — not null/whitespace, so the generic check below would
                // never flag a required-but-untouched checkbox as empty. Mirrors the client's
                // isFieldEmpty(): `Array.isArray(val) && val.length === 0`. Bug found and fixed
                // 2026-09-22 while testing min_selections/max_selections — pre-existing, not
                // introduced by that feature, but it meant a `required: true` checkbox could be
                // submitted with zero selections via a direct API call.
                var isEmpty = valueEl.ValueKind == JsonValueKind.Array
                    ? valueEl.GetArrayLength() == 0
                    : string.IsNullOrWhiteSpace(rawValue);

                // Resolves the message for a failed rule: the admin's per-field wording
                // from validation_messages when set, otherwise the built-in default.
                // Mirrors utils/fieldValidation.js on the client — same keys, same
                // {label}/{min}/{max}/{count} placeholders — so a registrant sees the
                // same sentence whether the client or the server rejected the value.
                string Msg(string key, string fallback, object? min = null, object? max = null, object? count = null)
                    => ResolveFieldMessage(field, key, fallback, label, min, max, count);

                // terms_checkbox: JSON false stringifies to "False" and would pass the
                // empty check — required is satisfied only by an actual JSON true.
                if (fieldType == "terms_checkbox")
                {
                    if (required && valueEl.ValueKind != JsonValueKind.True)
                        errors[fieldId] = Msg("required", "{label} is required.");
                    continue;
                }

                // Required check
                if (required && isEmpty)
                {
                    errors[fieldId] = Msg("required", "{label} is required.");
                    continue;
                }

                if (isEmpty) continue; // optional + empty — skip type validation

                // Character limits — text-like scalar fields only. `name` is excluded:
                // its limit caps each part as the registrant types, and the value here is
                // the three parts joined, which would fail a limit the client never applied.
                if (fieldType is "text" or "textarea" or "email" or "address")
                {
                    var minLen = ReadDoubleOrNull(field, "min_length");
                    var maxLen = ReadDoubleOrNull(field, "max_length");
                    var len    = rawValue!.Length;
                    if (minLen.HasValue && len < minLen.Value)
                    {
                        errors[fieldId] = Msg("min_length", "{label} must be at least {min} characters.",
                            Fmt(minLen), Fmt(maxLen), len);
                        continue;
                    }
                    if (maxLen.HasValue && len > maxLen.Value)
                    {
                        errors[fieldId] = Msg("max_length", "{label} cannot be longer than {max} characters.",
                            Fmt(minLen), Fmt(maxLen), len);
                        continue;
                    }
                }

                // Selection count limits — checkbox (a "select multiple") only. Mirrors
                // utils/fieldValidation.js's min_selections/max_selections block: read the
                // raw JSON array directly rather than the stringified `rawValue`, since a
                // checkbox field's value never behaves like a scalar for this check.
                if (fieldType == "checkbox" && valueEl.ValueKind == JsonValueKind.Array)
                {
                    var minSel = ReadDoubleOrNull(field, "min_selections");
                    var maxSel = ReadDoubleOrNull(field, "max_selections");
                    var count  = valueEl.GetArrayLength();
                    if (minSel.HasValue && count < minSel.Value)
                    {
                        errors[fieldId] = Msg("min_selections", "{label}: please select at least {min}.",
                            Fmt(minSel), Fmt(maxSel), count);
                        continue;
                    }
                    if (maxSel.HasValue && count > maxSel.Value)
                    {
                        errors[fieldId] = Msg("max_selections", "{label}: please select no more than {max}.",
                            Fmt(minSel), Fmt(maxSel), count);
                        continue;
                    }
                }

                // Word limits — multi-line fields only.
                if (fieldType == "textarea")
                {
                    var minWords = ReadDoubleOrNull(field, "min_words");
                    var maxWords = ReadDoubleOrNull(field, "max_words");
                    if (minWords.HasValue || maxWords.HasValue)
                    {
                        var words = rawValue!.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;
                        if (minWords.HasValue && words < minWords.Value)
                        {
                            errors[fieldId] = Msg("min_words", "{label} must be at least {min} words.",
                                Fmt(minWords), Fmt(maxWords), words);
                            continue;
                        }
                        if (maxWords.HasValue && words > maxWords.Value)
                        {
                            errors[fieldId] = Msg("max_words", "{label} cannot be longer than {max} words.",
                                Fmt(minWords), Fmt(maxWords), words);
                            continue;
                        }
                    }
                }

                // Type-specific validation
                switch (fieldType)
                {
                    case "email":
                        if (!IsValidEmail(rawValue!))
                            errors[fieldId] = Msg("email", "{label} doesn't look like a valid email address.");
                        break;

                    case "phone":
                        if (!IsValidPhone(rawValue!))
                            errors[fieldId] = Msg("phone", "{label} doesn't look like a valid phone number.");
                        break;

                    // Numeric fields: the value must parse, and must sit inside the range
                    // configured in the builder. Enforced here rather than trusting the
                    // client — the range is a business rule, not a typing convenience.
                    case "number":
                    case "currency":
                    case "percentage":
                    case "slider":
                        if (!double.TryParse(rawValue, System.Globalization.NumberStyles.Float,
                                System.Globalization.CultureInfo.InvariantCulture, out var numericValue)
                            || !double.IsFinite(numericValue))
                        {
                            errors[fieldId] = Msg("number", "{label} must be a number.");
                        }
                        else
                        {
                            var minValue = ReadDoubleOrNull(field, "min_value");
                            var maxValue = ReadDoubleOrNull(field, "max_value");
                            if (minValue.HasValue && numericValue < minValue.Value)
                                errors[fieldId] = Msg("min_value", "{label} must be at least {min}.",
                                    Fmt(minValue), Fmt(maxValue), Fmt(numericValue));
                            else if (maxValue.HasValue && numericValue > maxValue.Value)
                                errors[fieldId] = Msg("max_value", "{label} cannot be more than {max}.",
                                    Fmt(minValue), Fmt(maxValue), Fmt(numericValue));
                        }
                        break;

                    // custom_amount: the registrant's own typed donation/payment amount. This
                    // is the exact field that let a ₹0 (or astronomically large) "donation"
                    // through and trigger a false thank-you email — the payment gateway would
                    // have rejected it outright, but nothing on our side checked. When the
                    // campaign actually charges (paymentEnabled), the gateway's own floor/
                    // ceiling always applies on top of whatever the admin configured — an
                    // admin-set bound can only narrow it further, never widen past the gateway.
                    case "custom_amount":
                        if (!double.TryParse(rawValue, System.Globalization.NumberStyles.Float,
                                System.Globalization.CultureInfo.InvariantCulture, out var amountValue)
                            || !double.IsFinite(amountValue))
                        {
                            errors[fieldId] = Msg("number", "{label} must be a number.");
                        }
                        else
                        {
                            var minValue = ReadDoubleOrNull(field, "min_value");
                            var maxValue = ReadDoubleOrNull(field, "max_value");
                            if (paymentEnabled)
                            {
                                minValue = minValue.HasValue ? Math.Max(minValue.Value, (double)gatewayMin) : (double)gatewayMin;
                                maxValue = maxValue.HasValue ? Math.Min(maxValue.Value, (double)gatewayMax) : (double)gatewayMax;
                            }

                            // Leaving the field blank already short-circuited above (isEmpty →
                            // continue, for an optional field) — that's the only way to opt out
                            // of a contribution. Once the registrant has typed ANYTHING, including
                            // literally "0", it must clear the gateway floor/ceiling regardless of
                            // required — an explicitly-typed 0 is a real attempt, not "no answer",
                            // so it gets the same "please enter more" treatment as any other
                            // sub-minimum amount rather than being silently accepted as free.
                            if (minValue.HasValue && amountValue < minValue.Value)
                                errors[fieldId] = Msg("min_value",
                                    "Please enter at least ₹{min} for {label} — that's the minimum amount our payment gateway accepts due to gateway limitations.",
                                    Fmt(minValue), Fmt(maxValue), Fmt(amountValue));
                            else if (maxValue.HasValue && amountValue > maxValue.Value)
                                errors[fieldId] = Msg("max_value",
                                    "Please enter at most ₹{max} for {label} — that's the maximum amount our payment gateway accepts due to gateway limitations.",
                                    Fmt(minValue), Fmt(maxValue), Fmt(amountValue));
                        }
                        break;

                    case "date":
                        if (!DateTime.TryParse(rawValue, out _))
                            errors[fieldId] = Msg("date", "{label} is not a valid date.");
                        break;

                    case "rating":
                        // max_rating configured in the builder (default 5, clamped 3..10).
                        var maxRating = (int)Math.Clamp(ReadDoubleOrNull(field, "max_rating") ?? 5, 3, 10);
                        if (!int.TryParse(rawValue, out var rating) || rating < 1 || rating > maxRating)
                            errors[fieldId] = Msg("rating", "Please choose a rating between 1 and {max} for {label}.",
                                1, maxRating, rawValue);
                        break;
                }
            }
        }
        catch { /* malformed form_config — skip validation */ }

        return errors;
    }

    // ── Conditional-rule visibility (server-side mirror of usePublicForm.getFieldState) ──

    /// <summary>
    /// Returns true when the field is hidden by the form's conditional rules given the
    /// submitted data. Mirrors the client logic (usePublicForm.getFieldState): "show" is
    /// OR across ALL rules — a field targeted by any show-action is hidden by default and
    /// becomes visible if AT LEAST ONE show-rule's conditions are met, so overlapping rules
    /// (e.g. per-group-size rules on the same fields) don't clobber each other. A matched
    /// 'hide' always wins.
    /// </summary>
    private static bool IsFieldHidden(
        string fieldId,
        JsonElement fieldRules,
        Dictionary<string, JsonElement> formData,
        Dictionary<string, string?> fieldTypes)
    {
        bool hasShowRule = false;
        bool shownByMatch = false;
        bool hiddenByMatch = false;

        foreach (var rule in fieldRules.EnumerateArray())
        {
            if (!rule.TryGetProperty("actions", out var actionsEl) || actionsEl.ValueKind != JsonValueKind.Array)
                continue;

            // Does this rule target the field at all?
            var affectsField = actionsEl.EnumerateArray().Any(a =>
                a.TryGetProperty("target_field_id", out var t) && t.GetString() == fieldId);
            if (!affectsField) continue;

            var matchType = rule.TryGetProperty("match_type", out var mt) ? mt.GetString() : "all";
            var conditions = rule.TryGetProperty("conditions", out var cEl) && cEl.ValueKind == JsonValueKind.Array
                ? cEl.EnumerateArray().ToList()
                : new List<JsonElement>();

            bool conditionsMet = matchType == "any"
                ? conditions.Any(c => EvaluateCondition(c, formData, fieldTypes))
                : conditions.All(c => EvaluateCondition(c, formData, fieldTypes));

            foreach (var action in actionsEl.EnumerateArray())
            {
                if (!action.TryGetProperty("target_field_id", out var tEl) || tEl.GetString() != fieldId) continue;
                var actName = action.TryGetProperty("action", out var aEl) ? aEl.GetString() : null;

                if (actName == "show")
                {
                    hasShowRule = true;
                    if (conditionsMet) shownByMatch = true;
                }
                else if (actName == "hide" && conditionsMet)
                {
                    hiddenByMatch = true;
                }
            }
        }

        bool visible = true;
        if (hasShowRule) visible = shownByMatch;
        if (hiddenByMatch) visible = false;
        return !visible;
    }

    private static bool EvaluateCondition(
        JsonElement condition,
        Dictionary<string, JsonElement> formData,
        Dictionary<string, string?> fieldTypes)
    {
        var condFieldId = condition.TryGetProperty("field_id", out var f) ? f.GetString() : null;
        if (string.IsNullOrEmpty(condFieldId)) return false;
        var op = condition.TryGetProperty("operator", out var o) ? o.GetString() : null;
        var compareValue = condition.TryGetProperty("value", out var v)
            ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString())
            : null;

        // Checkbox (multi-select) fields store an ARRAY of selected values. For these,
        // equals/not_equals/contains test membership, mirroring the client — otherwise
        // the array stringifies to "[\"x\"]" and never matches the scalar value.
        if (formData.TryGetValue(condFieldId, out var rawEl) && rawEl.ValueKind == JsonValueKind.Array)
        {
            var selected = rawEl.EnumerateArray()
                .Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString())
                .Where(s => s != null)
                .Select(s => s!)
                .ToList();
            bool Has(string? target) => selected.Any(s => string.Equals(s, target, StringComparison.Ordinal));
            switch (op)
            {
                case "equals":
                case "contains":     return Has(compareValue);
                case "not_equals":   return !Has(compareValue);
                case "is_empty":     return selected.Count == 0;
                case "is_not_empty": return selected.Count > 0;
                default:             return false;
            }
        }

        var fieldValue = GetConditionFieldValue(condFieldId, formData, fieldTypes);

        switch (op)
        {
            case "equals":       return string.Equals(fieldValue, compareValue, StringComparison.Ordinal);
            case "not_equals":   return !string.Equals(fieldValue, compareValue, StringComparison.Ordinal);
            case "contains":     return (fieldValue ?? "").ToLowerInvariant().Contains((compareValue ?? "").ToLowerInvariant());
            case "greater_than": return double.TryParse(fieldValue, out var a1) && double.TryParse(compareValue, out var b1) && a1 > b1;
            case "less_than":    return double.TryParse(fieldValue, out var a2) && double.TryParse(compareValue, out var b2) && a2 < b2;
            case "is_empty":     return string.IsNullOrEmpty(fieldValue);
            case "is_not_empty": return !string.IsNullOrEmpty(fieldValue);
            default:             return false;
        }
    }

    private static string? GetConditionFieldValue(
        string fieldId,
        Dictionary<string, JsonElement> formData,
        Dictionary<string, string?> fieldTypes)
    {
        // 'name' fields are split into _first / _middle / _last parts
        if (fieldTypes.TryGetValue(fieldId, out var t) && t == "name")
        {
            string Part(string suffix) =>
                formData.TryGetValue($"{fieldId}{suffix}", out var p) && p.ValueKind == JsonValueKind.String
                    ? p.GetString() ?? "" : "";
            return $"{Part("_first")}{Part("_middle")}{Part("_last")}".Trim();
        }

        if (!formData.TryGetValue(fieldId, out var el)) return null;
        return el.ValueKind switch
        {
            JsonValueKind.String                       => el.GetString(),
            JsonValueKind.Number or JsonValueKind.True
                or JsonValueKind.False                 => el.ToString(),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _                                          => el.ToString()
        };
    }

    private static bool IsValidEmail(string email)
    {
        // Must match: local@domain.tld — requires a dot in the domain part
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254) return false;
        try
        {
            var addr = new System.Net.Mail.MailAddress(email);
            if (addr.Address != email) return false;
            // Ensure domain contains at least one dot (e.g. gmail.com)
            var domain = addr.Host;
            return domain.Contains('.') && !domain.StartsWith('.') && !domain.EndsWith('.');
        }
        catch { return false; }
    }

    private static bool IsValidPhone(string phone)
    {
        // International: 7–15 digits per ITU-T E.164
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return digits.Length >= 7 && digits.Length <= 15;
    }

    /// <summary>
    /// Formats a bound for display inside a validation message: whole numbers lose their
    /// trailing ".0" (a 5-character minimum reads "5", not "5.0"), and formatting is
    /// always invariant so the number never picks up a server-locale decimal comma.
    /// </summary>
    private static string Fmt(double? value)
    {
        if (!value.HasValue) return "";
        var v = value.Value;
        return v == Math.Floor(v) && Math.Abs(v) < 1e15
            ? ((long)v).ToString(System.Globalization.CultureInfo.InvariantCulture)
            : v.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string Fmt(double value) => Fmt((double?)value);

    /// <summary>
    /// Message shown when a field's validation rule fails. Uses the admin's per-field
    /// wording from <c>validation_messages.{key}</c> when they set one, otherwise the
    /// built-in <paramref name="fallback"/>. Either way the {label}, {min}, {max} and
    /// {count} placeholders are filled, so a custom message can use them too.
    ///
    /// Mirrors resolveMessage() in the frontend's utils/fieldValidation.js — the same
    /// keys and placeholders must exist on both sides.
    /// </summary>
    private static string ResolveFieldMessage(
        JsonElement field, string key, string fallback, string? label,
        object? min = null, object? max = null, object? count = null)
    {
        var template = fallback;

        if (field.ValueKind == JsonValueKind.Object &&
            field.TryGetProperty("validation_messages", out var msgs) &&
            msgs.ValueKind == JsonValueKind.Object &&
            msgs.TryGetProperty(key, out var custom) &&
            custom.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(custom.GetString()))
        {
            template = custom.GetString()!.Trim();
        }

        return template
            .Replace("{label}", label ?? "This field")
            .Replace("{min}",   min?.ToString()   ?? "")
            .Replace("{max}",   max?.ToString()   ?? "")
            .Replace("{count}", count?.ToString() ?? "");
    }

    // Reads a numeric field-config property (e.g. min_value/max_value) that may be
    // a JSON number or a numeric string. Null when absent or non-numeric.
    private static double? ReadDoubleOrNull(JsonElement obj, string propertyName)
    {
        if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(propertyName, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number) return el.GetDouble();
        if (el.ValueKind == JsonValueKind.String &&
            double.TryParse(el.GetString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var d))
            return d;
        return null;
    }

    // custom_amount contribution: missing/non-numeric → 0, otherwise the typed value as-is
    // (numeric-safety only — NOT clamped to min/max). ValidateFormFields already rejected
    // the submission if the typed amount was out of bounds, so by the time this runs the
    // value is either already valid, or — for an optional field left at exactly 0 — a
    // deliberate "no contribution" that must reach the total as 0, not get silently rounded
    // up to a floor. Clamping here used to do exactly that (see git history), which is what
    // made an optional donation field show "₹1" instead of "₹0" with no error shown.
    private static double SafeCustomAmount(JsonElement val)
    {
        double amount;
        if (val.ValueKind == JsonValueKind.Number) amount = val.GetDouble();
        else if (val.ValueKind == JsonValueKind.String &&
                 double.TryParse(val.GetString(), System.Globalization.NumberStyles.Float,
                     System.Globalization.CultureInfo.InvariantCulture, out var d))
            amount = d;
        else return 0;

        // Reject NaN/±Infinity (parseable from "NaN"/"Infinity" strings) so the later
        // (decimal) cast can't throw OverflowException → 500.
        if (!double.IsFinite(amount)) return 0;

        // Guard the decimal cast against absurd magnitudes (e.g. "1e300") that overflow decimal.
        const double DecimalSafeBound = 7.9e28;
        if (amount > DecimalSafeBound) amount = DecimalSafeBound;
        if (amount < -DecimalSafeBound) amount = -DecimalSafeBound;
        return amount;
    }

    private async Task<bool> HasCampaignAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }

    private async Task<bool> IsDirectorAsync()
    {
        if (CurrentUserId == null) return false;
        var user = await _users.GetByIdAsync(CurrentUserId);
        return user?.CanApproveTransfers == true;
    }

    // 32-char cryptographically random token used to protect the resume-payment URL
    private static string GeneratePaymentToken()
    {
        var bytes = new byte[24]; // 24 bytes → 32 chars base64url
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
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
        catch { /* ignore */ }
        return result;
    }

    /// <summary>
    /// Resolves the registrant's name, email and phone from a submission, falling back to the
    /// supplied defaults for anything the form doesn't capture.
    ///
    /// The ranking itself lives in <see cref="FormContact.Resolve"/>, shared with the
    /// confirmation email, the WhatsApp message and the Sheets report — while each kept its own
    /// copy they disagreed about the same registration. A form with both "Select Name (COG)"
    /// and "Name" on it is the case that matters: taking the first label containing "name" put
    /// the wrong person on the payment page.
    /// </summary>
    public static (string Name, string Email, string Phone) ResolveContactInfo(
        string? formDataJson,
        string? formConfigJson,
        string nameFallback  = "Guest",
        string emailFallback = "",
        string phoneFallback = "")
    {
        // Mind the argument order — this takes data-then-config, FormContact config-then-data.
        var (name, email, phone) = FormContact.Resolve(formConfigJson, formDataJson);

        return (string.IsNullOrWhiteSpace(name)  ? nameFallback  : name,
                string.IsNullOrWhiteSpace(email) ? emailFallback : email,
                string.IsNullOrWhiteSpace(phone) ? phoneFallback : phone);
    }

    /// <param name="includePaymentToken">
    /// Only the create/amend response sets this — that reply goes to the browser that just made
    /// the registration, and the token is what lets it amend its own attempt rather than start a
    /// second one. Every other caller (the admin list, an update) leaves it null.
    /// </param>
    private static RegistrationResponse ToResponse(Registration r, bool includePaymentToken = false)
    {
        JsonElement formDataEl;
        try { formDataEl = JsonDocument.Parse(r.FormData).RootElement.Clone(); }
        catch { formDataEl = JsonDocument.Parse("{}").RootElement; }

        return new RegistrationResponse(
            Id                      : r.Id,
            CampaignId              : r.CampaignId,
            FormData                : formDataEl,
            TotalAmount             : r.TotalAmount,
            PaymentStatus           : r.PaymentStatus.ToString().ToLowerInvariant(),
            RegistrationStatus      : r.RegistrationStatus.ToString().ToLowerInvariant(),
            PaymentId               : r.PaymentId,
            GatewayPaymentId        : r.GatewayPaymentId,
            InvoiceNumber           : r.InvoiceNumber,
            RegistrationNumber      : r.RegistrationNumber,
            CouponCode              : r.CouponCode,
            MemberId                : r.MemberId,
            Source                  : r.Source,
            AdditionalPaymentRequired: r.AdditionalPaymentRequired,
            AdditionalPaymentAmount : r.AdditionalPaymentAmount,
            AdditionalPaymentLink   : r.AdditionalPaymentLink,
            RefundPending           : r.RefundPending,
            RefundAmount            : r.RefundAmount,
            CreatedAt               : r.CreatedAt,
            UpdatedAt               : r.UpdatedAt,
            PaymentToken            : includePaymentToken ? r.PaymentToken : null);
    }

    private Task NotifyRefundRequiredAsync(Registration reg, Campaign campaign, decimal refundAmount)
    {
        // Email notification to super admins + directors — implemented in NotificationController (Step 13)
        _logger.LogInformation(
            "Refund required: Registration {RegId}, Campaign {CampaignId}, Amount {Amount}",
            reg.Id, campaign.Id, refundAmount);
        return Task.CompletedTask;
    }
}
