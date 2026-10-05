using KaizenEvents.Core.DTOs.Campaign;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[Route("api/campaigns")]
[Authorize]
public class CampaignController : ApiControllerBase
{
    private readonly ICampaignRepository _campaigns;
    private readonly IUserRepository _users;
    private readonly IRegistrationRepository _registrations;
    private readonly IPaymentAccountRepository _paymentAccounts;
    private readonly IEmailTemplateService _emailTemplates;
    private readonly IWhatsAppTemplateService _whatsappTemplates;
    private readonly IAuditLoggerService _audit;
    private readonly Microsoft.Extensions.Configuration.IConfiguration _config;
    private readonly ILogger<CampaignController> _logger;

    public CampaignController(
        ICampaignRepository campaigns,
        IUserRepository users,
        IRegistrationRepository registrations,
        IPaymentAccountRepository paymentAccounts,
        IEmailTemplateService emailTemplates,
        IWhatsAppTemplateService whatsappTemplates,
        IAuditLoggerService audit,
        Microsoft.Extensions.Configuration.IConfiguration config,
        ILogger<CampaignController> logger)
    {
        _campaigns         = campaigns;
        _users             = users;
        _registrations     = registrations;
        _paymentAccounts   = paymentAccounts;
        _emailTemplates    = emailTemplates;
        _whatsappTemplates = whatsappTemplates;
        _audit             = audit;
        _config            = config;
        _logger            = logger;
    }

    /// <summary>
    /// A campaign assigned a Razorpay Payment Account whose RazorpaySettlementMode is
    /// "single_account" is automatically forced onto FundCollectionMode.KaizenManaged, so it's
    /// picked up by the existing Fund Transfer payout flow. One-way: reassigning away from a
    /// single_account account does not revert FundCollectionMode — a human decides that.
    /// No-op for any other gateway or settlement mode.
    /// </summary>
    private async Task ApplyAutoFundCollectionModeAsync(Campaign campaign)
    {
        if (campaign.PaymentGateway != PaymentGateway.Razorpay) return;
        if (campaign.PaymentAccountId == null) return;

        var account = await _paymentAccounts.GetByIdAsync(campaign.PaymentAccountId);
        if (account?.RazorpaySettlementMode == "single_account")
            campaign.FundCollectionMode = FundCollectionMode.KaizenManaged;
    }

    /// <summary>
    /// Logs an advisory warning when a campaign uses KaizenManaged + Cashfree but the
    /// vendor-split toggle is disabled. Per-event splits live in campaign_vendor_splits
    /// and are validated at /api/campaigns/{id}/vendor-splits and at payment-create time.
    /// </summary>
    private void WarnIfCashfreeSplitsMisconfigured(Campaign c)
    {
        if (c.PaymentGateway != PaymentGateway.Cashfree) return;
        if (c.FundCollectionMode != FundCollectionMode.KaizenManaged) return;
        if (!_config.GetValue<bool>("CashfreeVendorSplits:Enabled"))
        {
            _logger.LogWarning(
                "Campaign {Id} uses Cashfree + KaizenManaged but CashfreeVendorSplits.Enabled=false. " +
                "Payment will fall back to direct Cashfree (single account, no proxy).",
                c.Id);
        }
    }

    private string? Ip => HttpContext.Connection.RemoteIpAddress?.ToString();

    // ── POST /api/campaigns ───────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCampaignRequest req)
    {
        if (!IsSuperAdmin)
            return Forbidden("Only super admins can create campaigns.");

        var slug = await SlugHelper.GenerateUniqueAsync(
            req.Name,
            (s, excl) => _campaigns.SlugExistsAsync(s, excl));

        var campaign = new Campaign
        {
            Id                      = Guid.NewGuid().ToString(),
            Name                    = req.Name.Trim(),
            Slug                    = slug,
            OrganizationName        = req.OrganizationName.Trim(),
            CampaignType            = req.CampaignType,
            PaymentEnabled          = req.PaymentEnabled,
            // Free events collect no money: drop any payment wiring the client may have sent.
            FundCollectionMode      = req.PaymentEnabled ? req.FundCollectionMode : null,
            PaymentCollectionMethod = req.PaymentEnabled ? req.PaymentCollectionMethod : "online",
            PaymentGateway          = req.PaymentGateway,
            PaymentAccountId        = req.PaymentEnabled ? req.PaymentAccountId : null,
            PaymentPurpose          = req.PaymentEnabled ? req.PaymentPurpose : null,
            Description             = req.Description,
            StartDate               = req.StartDate,
            EndDate                 = req.EndDate,
            RegistrationStartDate   = req.RegistrationStartDate,
            RegistrationEndDate     = req.RegistrationEndDate,
            MaxRegistrations        = req.MaxRegistrations,
            ShowOnHomepage          = req.ShowOnHomepage,
            KioskEnabled            = req.KioskEnabled,
            UseExternalForm         = req.UseExternalForm,
            ExternalFormUrl         = req.ExternalFormUrl,
            Status                  = CampaignStatus.Draft,
            RegistrationEnabled     = true,
            HasLandingPage          = true,
            CreatedBy               = CurrentUserId!,
            CreatedAt               = DateTime.UtcNow,
            UpdatedAt               = DateTime.UtcNow
        };

        await ApplyAutoFundCollectionModeAsync(campaign);
        await _campaigns.CreateAsync(campaign);

        // Seed the 4 default email templates (admin can customise later via the editor).
        // The campaign cannot be activated until each template has a non-empty subject + body.
        try { await _emailTemplates.SeedDefaultsAsync(campaign.Id); }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to seed email templates for campaign {CampaignId}", campaign.Id); }

        // Seed the WhatsApp templates too (opt-in / off by default until an approved template is configured).
        try { await _whatsappTemplates.SeedDefaultsAsync(campaign.Id); }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to seed WhatsApp templates for campaign {CampaignId}", campaign.Id); }

        // Grant access to the creating super admin
        var existingAccess = await _users.GetCampaignIdsAsync(CurrentUserId!);
        existingAccess.Add(campaign.Id);
        await _users.SetCampaignAccessAsync(CurrentUserId!, existingAccess);

        await _audit.LogAsync(AuditEventType.CampaignCreated,
            userId: CurrentUserId, resourceType: "campaign", resourceId: campaign.Id,
            actionDetails: new { name = campaign.Name, slug = campaign.Slug, campaign_type = campaign.CampaignType.ToString() },
            ipAddress: Ip);

        WarnIfCashfreeSplitsMisconfigured(campaign);

        return StatusCode(201, ToResponse(campaign));
    }

    // ── GET /api/campaigns ────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List()
    {
        List<Campaign> campaigns;

        if (IsSuperAdmin)
            campaigns = await _campaigns.GetAllAsync();
        else
            campaigns = await _campaigns.GetByAccessAsync(CurrentUserId!);

        return Ok(campaigns.Select(ToResponse));
    }

    // ── GET /api/campaigns/{campaign_id} ──────────────────────────────────────
    [HttpGet("{campaign_id}")]
    public async Task<IActionResult> Get(string campaign_id)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        if (!await HasAccessAsync(campaign_id))
            return Forbidden();

        return Ok(ToResponse(campaign));
    }

    // ── PUT /api/campaigns/{campaign_id} ──────────────────────────────────────
    [HttpPut("{campaign_id}")]
    public async Task<IActionResult> Update(string campaign_id, [FromBody] UpdateCampaignRequest req)
    {
        if (!IsSuperAdmin)
            return Forbidden("Only super admins can update campaigns.");

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        // Regenerate slug if name changed
        if (req.Name != null && req.Name.Trim() != campaign.Name)
        {
            campaign.Name = req.Name.Trim();
            campaign.Slug = await SlugHelper.GenerateUniqueAsync(
                campaign.Name,
                (s, excl) => _campaigns.SlugExistsAsync(s, excl),
                excludeId: campaign_id);
        }

        if (req.OrganizationName != null)        campaign.OrganizationName        = req.OrganizationName.Trim();
        if (req.CampaignType.HasValue)           campaign.CampaignType            = req.CampaignType.Value;
        if (req.FundCollectionMode.HasValue)     campaign.FundCollectionMode      = req.FundCollectionMode;
        if (req.PaymentCollectionMethod != null) campaign.PaymentCollectionMethod = req.PaymentCollectionMethod;
        if (req.PaymentGateway.HasValue)         campaign.PaymentGateway          = req.PaymentGateway.Value;
        if (req.PaymentAccountId != null)        campaign.PaymentAccountId        = req.PaymentAccountId;
        if (req.PaymentPurpose != null)          campaign.PaymentPurpose          = req.PaymentPurpose;
        if (req.PaymentEnabled.HasValue)
        {
            campaign.PaymentEnabled = req.PaymentEnabled.Value;
            // Switching an event to free clears its payment wiring so nothing lingers.
            if (!req.PaymentEnabled.Value)
            {
                campaign.PaymentAccountId   = null;
                campaign.PaymentPurpose     = null;
                campaign.FundCollectionMode = null;
            }
        }
        await ApplyAutoFundCollectionModeAsync(campaign);
        if (req.WhatsappEnabled.HasValue)        campaign.WhatsappEnabled         = req.WhatsappEnabled.Value;
        // Description / EventLogo / LogoUrl: null = "no change" (so partial PUTs — the
        // registration-window editor, the registration_enabled toggle, payment modals —
        // don't wipe them), empty string = "clear". EditCampaign sends "" (never null)
        // for these three, so it can still clear them.
        if (req.Description != null)             campaign.Description             = req.Description;
        if (req.StartDate.HasValue)              campaign.StartDate               = req.StartDate;
        if (req.EndDate.HasValue)                campaign.EndDate                 = req.EndDate;
        if (req.RegistrationStartDate.HasValue)  campaign.RegistrationStartDate   = req.RegistrationStartDate;
        if (req.RegistrationEndDate.HasValue)    campaign.RegistrationEndDate     = req.RegistrationEndDate;
        // Nulls above mean "no change", so an explicit flag is needed to remove the window
        if (req.ClearRegistrationDates == true)
        {
            campaign.RegistrationStartDate = null;
            campaign.RegistrationEndDate   = null;
        }
        if (req.MaxRegistrations.HasValue)       campaign.MaxRegistrations        = req.MaxRegistrations;
        // Custom ID sequences — empty string clears a prefix (null = no change);
        // next-number changes only affect future registrations.
        if (req.RegistrationIdPrefix != null)
        {
            var prefix = req.RegistrationIdPrefix.Trim();
            if (prefix.Length > 20)
                return BadRequest(new { detail = "Registration ID prefix must be 20 characters or fewer." });
            campaign.RegistrationIdPrefix = prefix.Length == 0 ? null : prefix;
        }
        if (req.InvoicePrefix != null)
        {
            var prefix = req.InvoicePrefix.Trim();
            if (prefix.Length > 20)
                return BadRequest(new { detail = "Invoice prefix must be 20 characters or fewer." });
            campaign.InvoicePrefix = prefix.Length == 0 ? null : prefix;
        }
        if (req.RegistrationNextNumber.HasValue)
        {
            if (req.RegistrationNextNumber.Value < 1)
                return BadRequest(new { detail = "Next registration number must be at least 1." });
            campaign.RegistrationNextNumber = req.RegistrationNextNumber.Value;
        }
        if (req.InvoiceNextNumber.HasValue)
        {
            if (req.InvoiceNextNumber.Value < 1)
                return BadRequest(new { detail = "Next invoice number must be at least 1." });
            campaign.InvoiceNextNumber = req.InvoiceNextNumber.Value;
        }
        if (req.ShowOnHomepage.HasValue)         campaign.ShowOnHomepage          = req.ShowOnHomepage.Value;
        if (req.ShowOrganizationName.HasValue)   campaign.ShowOrganizationName    = req.ShowOrganizationName.Value;
        if (req.ShowDescription.HasValue)        campaign.ShowDescription         = req.ShowDescription.Value;
        if (req.ShowEventLogo.HasValue)          campaign.ShowEventLogo           = req.ShowEventLogo.Value;
        if (req.KioskEnabled.HasValue)           campaign.KioskEnabled            = req.KioskEnabled.Value;
        if (req.RegistrationEnabled.HasValue)    campaign.RegistrationEnabled     = req.RegistrationEnabled.Value;
        if (req.HasLandingPage.HasValue)         campaign.HasLandingPage          = req.HasLandingPage.Value;
        if (req.UseExternalForm.HasValue)        campaign.UseExternalForm         = req.UseExternalForm.Value;
        if (req.ExternalFormUrl != null)         campaign.ExternalFormUrl         = req.ExternalFormUrl;
        if (req.EventLogo != null)               campaign.EventLogo               = req.EventLogo;
        if (req.LogoUrl != null)                 campaign.LogoUrl                 = req.LogoUrl;
        if (req.Status.HasValue &&
            req.Status.Value != CampaignStatus.Archived) // archive/unarchive via dedicated endpoints
        {
            // Activation gate: cannot transition draft → active until all 4 email
            // templates have a non-empty subject + body. Return 400 with the list of
            // incomplete triggers so the UI can show the "go to Email Templates" prompt.
            if (req.Status.Value == CampaignStatus.Active && campaign.Status != CampaignStatus.Active)
            {
                var incomplete = await _emailTemplates.GetIncompleteTemplatesAsync(campaign_id);
                if (incomplete.Count > 0)
                {
                    return BadRequest(new
                    {
                        detail              = "Email templates must be reviewed and saved before activating this event. " +
                                              "Please complete the missing templates first.",
                        incomplete_triggers = incomplete,
                        redirect_to         = $"/campaigns/{campaign_id}/email-templates"
                    });
                }
            }
            campaign.Status = req.Status.Value;
        }

        campaign.UpdatedAt = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        await _audit.LogAsync(AuditEventType.CampaignUpdated,
            userId: CurrentUserId, resourceType: "campaign", resourceId: campaign.Id,
            actionDetails: new { name = campaign.Name, status = campaign.Status.ToString() },
            ipAddress: Ip);

        WarnIfCashfreeSplitsMisconfigured(campaign);

        return Ok(ToResponse(campaign));
    }

    // ── PUT /api/campaigns/{campaign_id}/offline-payment-settings ─────────────
    /// <summary>
    /// Updates offline payment fields inside payment_config JSON. Available to org_admin
    /// who has campaign access (not just super_admin), since it's a per-event operational setting.
    /// </summary>
    [HttpPut("{campaign_id}/offline-payment-settings")]
    public async Task<IActionResult> UpdateOfflinePaymentSettings(string campaign_id, [FromBody] OfflinePaymentSettingsRequest req)
    {
        if (!IsAdminRole) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        // Org admin: must have access to this campaign
        if (!IsSuperAdmin)
        {
            var accessible = await _users.GetCampaignIdsAsync(CurrentUserId!);
            if (!accessible.Contains(campaign_id))
                return Forbidden("You don't have access to this event.");
        }

        // Merge into existing payment_config JSON
        var pc = string.IsNullOrWhiteSpace(campaign.PaymentConfig)
            ? new Dictionary<string, object?>()
            : System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object?>>(campaign.PaymentConfig)
                ?? new Dictionary<string, object?>();

        pc["allow_offline_payments"]         = req.AllowOfflinePayments;
        pc["offline_payment_deadline_date"]  = req.AllowOfflinePayments ? req.OfflinePaymentDeadlineDate : null;

        campaign.PaymentConfig = System.Text.Json.JsonSerializer.Serialize(pc);
        campaign.UpdatedAt     = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        await _audit.LogAsync(AuditEventType.CampaignUpdated,
            userId: CurrentUserId, resourceType: "campaign", resourceId: campaign.Id,
            actionDetails: new { offline_payments = req.AllowOfflinePayments },
            ipAddress: Ip);

        return Ok(new { success = true, payment_config = pc });
    }

    public record OfflinePaymentSettingsRequest(bool AllowOfflinePayments, string? OfflinePaymentDeadlineDate);

    // ── POST /api/campaigns/{campaign_id}/archive ─────────────────────────────
    [HttpPost("{campaign_id}/archive")]
    public async Task<IActionResult> Archive(string campaign_id)
    {
        if (!IsSuperAdmin)
            return Forbidden("Only super admins can archive campaigns.");

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        if (campaign.Status != CampaignStatus.Active)
            return BadRequest(new { detail = "Only active campaigns can be archived." });

        campaign.Status     = CampaignStatus.Archived;
        campaign.ArchivedAt = DateTime.UtcNow;
        campaign.UpdatedAt  = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        await _audit.LogAsync(AuditEventType.CampaignArchived,
            userId: CurrentUserId, resourceType: "campaign", resourceId: campaign.Id,
            actionDetails: new { name = campaign.Name }, ipAddress: Ip);

        return Ok(ToResponse(campaign));
    }

    // ── POST /api/campaigns/{campaign_id}/unarchive ───────────────────────────
    [HttpPost("{campaign_id}/unarchive")]
    public async Task<IActionResult> Unarchive(string campaign_id)
    {
        if (!IsSuperAdmin)
            return Forbidden("Only super admins can unarchive campaigns.");

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        if (campaign.Status != CampaignStatus.Archived)
            return BadRequest(new { detail = "Only archived campaigns can be unarchived." });

        // Unarchive is also a transition into Active — same gate as draft → active.
        var incomplete = await _emailTemplates.GetIncompleteTemplatesAsync(campaign_id);
        if (incomplete.Count > 0)
        {
            return BadRequest(new
            {
                detail              = "Email templates must be reviewed and saved before unarchiving this event.",
                incomplete_triggers = incomplete,
                redirect_to         = $"/campaigns/{campaign_id}/email-templates"
            });
        }

        campaign.Status     = CampaignStatus.Active;
        campaign.ArchivedAt = null;
        campaign.UpdatedAt  = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        await _audit.LogAsync(AuditEventType.CampaignUnarchived,
            userId: CurrentUserId, resourceType: "campaign", resourceId: campaign.Id,
            actionDetails: new { name = campaign.Name }, ipAddress: Ip);

        return Ok(ToResponse(campaign));
    }

    // ── DELETE /api/campaigns/{campaign_id} ───────────────────────────────────
    [HttpDelete("{campaign_id}")]
    public async Task<IActionResult> Delete(string campaign_id)
    {
        if (!IsSuperAdmin)
            return Forbidden("Only super admins can delete campaigns.");

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        await _campaigns.DeleteAsync(campaign);

        await _audit.LogAsync("CAMPAIGN_DELETED",
            userId: CurrentUserId, resourceType: "campaign", resourceId: campaign.Id,
            actionDetails: new { name = campaign.Name }, ipAddress: Ip);

        return Ok(new { detail = "Campaign deleted successfully." });
    }

    // ── GET /api/campaigns/{campaign_id}/stats ────────────────────────────────
    [HttpGet("{campaign_id}/stats")]
    public async Task<IActionResult> Stats(string campaign_id)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        if (!await HasAccessAsync(campaign_id))
            return Forbidden();

        var pendingTransfer = campaign.TotalRevenue - campaign.TotalTransferred;

        return Ok(new CampaignStatsResponse(
            CampaignId          : campaign.Id,
            Name                : campaign.Name,
            Status              : campaign.Status.ToString().ToLowerInvariant(),
            CurrentRegistrations: campaign.CurrentRegistrations,
            MaxRegistrations    : campaign.MaxRegistrations,
            RegistrationEnabled : campaign.RegistrationEnabled,
            TotalRevenue        : campaign.TotalRevenue,
            TotalTransferred    : campaign.TotalTransferred,
            PendingTransfer     : Math.Max(0, pendingTransfer)));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<bool> HasAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        var accessIds = await _users.GetCampaignIdsAsync(CurrentUserId!);
        return accessIds.Contains(campaignId);
    }

    private static CampaignResponse ToResponse(Campaign c) => new(
        Id                     : c.Id,
        Name                   : c.Name,
        Slug                   : c.Slug,
        OrganizationName       : c.OrganizationName,
        CampaignType           : ToSnake(c.CampaignType.ToString()),
        FundCollectionMode     : c.FundCollectionMode == null ? null : ToSnake(c.FundCollectionMode.Value.ToString()),
        PaymentCollectionMethod: c.PaymentCollectionMethod,
        KioskEnabled           : c.KioskEnabled,
        ShowOnHomepage         : c.ShowOnHomepage,
        ShowOrganizationName   : c.ShowOrganizationName,
        ShowDescription        : c.ShowDescription,
        ShowEventLogo          : c.ShowEventLogo,
        EventLogo              : c.EventLogo,
        LogoUrl                : c.LogoUrl,
        HasLandingPage         : c.HasLandingPage,
        RegistrationEnabled    : c.RegistrationEnabled,
        UseExternalForm        : c.UseExternalForm,
        ExternalFormUrl        : c.ExternalFormUrl,
        Status                 : ToSnake(c.Status.ToString()),
        StartDate              : c.StartDate,
        EndDate                : c.EndDate,
        RegistrationStartDate  : c.RegistrationStartDate,
        RegistrationEndDate    : c.RegistrationEndDate,
        PaymentGateway         : ToSnake(c.PaymentGateway.ToString()),
        PaymentAccountId       : c.PaymentAccountId,
        PaymentPurpose         : c.PaymentPurpose,
        PaymentEnabled         : c.PaymentEnabled,
        WhatsappEnabled        : c.WhatsappEnabled,
        MaxRegistrations       : c.MaxRegistrations,
        CurrentRegistrations   : c.CurrentRegistrations,
        RegistrationIdPrefix   : c.RegistrationIdPrefix,
        RegistrationNextNumber : c.RegistrationNextNumber,
        InvoicePrefix          : c.InvoicePrefix,
        InvoiceNextNumber      : c.InvoiceNextNumber,
        TotalRevenue           : c.TotalRevenue,
        TotalTransferred       : c.TotalTransferred,
        Description            : c.Description,
        CreatedBy              : c.CreatedBy,
        CreatedAt              : c.CreatedAt,
        UpdatedAt              : c.UpdatedAt,
        ArchivedAt             : c.ArchivedAt);

    /// <summary>
    /// PascalCase enum name → snake_case lowercase. e.g. "KaizenManaged" → "kaizen_managed".
    /// </summary>
    private static string ToSnake(string pascal)
        => System.Text.RegularExpressions.Regex
            .Replace(pascal, "(?<=[a-z0-9])([A-Z])", "_$1")
            .ToLowerInvariant();
}
