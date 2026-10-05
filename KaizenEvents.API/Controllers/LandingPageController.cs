using System.Text.Json;
using System.Text.Json.Nodes;
using KaizenEvents.Core.DTOs.LandingPage;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
public class LandingPageController : ApiControllerBase
{
    private readonly ICampaignRepository _campaigns;
    private readonly IContactInquiryRepository _contacts;
    private readonly IAuditLoggerService _audit;
    private readonly IUserRepository _users;
    private readonly IBrevoService _email;
    private readonly ICaptchaService _captcha;

    public LandingPageController(
        ICampaignRepository campaigns,
        IContactInquiryRepository contacts,
        IAuditLoggerService audit,
        IUserRepository users,
        IBrevoService email,
        ICaptchaService captcha)
    {
        _campaigns = campaigns;
        _contacts  = contacts;
        _audit     = audit;
        _users     = users;
        _email     = email;
        _captcha   = captcha;
    }

    private string? Ip => HttpContext.Connection.RemoteIpAddress?.ToString();

    // ── GET /api/campaigns/{campaign_id}/landing-page (Public) ───────────────
    // Returns landing page config directly (not wrapped).
    [HttpGet("api/campaigns/{campaign_id}/landing-page")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(string campaign_id)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (string.IsNullOrEmpty(campaign.LandingPageConfig))
            return Ok((object?)null);

        using var doc = JsonDocument.Parse(campaign.LandingPageConfig);
        return Ok(doc.RootElement.Clone());
    }

    // ── PUT /api/campaigns/{campaign_id}/landing-page (Super Admin) ───────────
    // Frontend sends landing page config directly as body (not wrapped).
    [HttpPut("api/campaigns/{campaign_id}/landing-page")]
    [Authorize]
    public async Task<IActionResult> Update(string campaign_id, [FromBody] JsonNode? req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        campaign.LandingPageConfig = JsonSerializer.Serialize(req);
        campaign.UpdatedAt         = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        await _audit.LogAsync("LANDING_PAGE_UPDATED",
            userId: CurrentUserId, resourceType: "landing_page", resourceId: campaign.Id,
            actionDetails: new { campaign_name = campaign.Name }, ipAddress: Ip);

        return Ok(req);
    }

    // ── DELETE /api/campaigns/{campaign_id}/landing-page (Super Admin) ────────
    [HttpDelete("api/campaigns/{campaign_id}/landing-page")]
    [Authorize]
    public async Task<IActionResult> Delete(string campaign_id)
    {
        if (!IsSuperAdmin) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        campaign.LandingPageConfig = null;
        campaign.UpdatedAt         = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        await _audit.LogAsync("LANDING_PAGE_DELETED",
            userId: CurrentUserId, resourceType: "landing_page", resourceId: campaign.Id,
            actionDetails: new { campaign_name = campaign.Name }, ipAddress: Ip);

        return Ok(new { message = "Landing page deleted." });
    }

    // ── GET /api/public/campaigns/{slug}/landing-page (Public) ───────────────
    [HttpGet("api/public/campaigns/{slug}/landing-page")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicLandingPage(string slug)
    {
        if (!IsValidSlug(slug)) return BadRequest(new { detail = "Invalid slug format." });

        var campaign = await _campaigns.GetBySlugAsync(slug);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (campaign.Status == CampaignStatus.Archived)
            return StatusCode(410, new { detail = "This event has ended." });

        if (campaign.Status != CampaignStatus.Active && campaign.Status != CampaignStatus.Draft)
            return NotFound(new { detail = "Campaign not found." });

        if (string.IsNullOrEmpty(campaign.LandingPageConfig))
            return Ok((object?)null);

        using var doc = JsonDocument.Parse(campaign.LandingPageConfig);
        return Ok(doc.RootElement.Clone());
    }

    // ── GET /api/public/campaigns/{slug} (Public) ─────────────────────────────
    [HttpGet("api/public/campaigns/{slug}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicCampaign(string slug)
    {
        if (!IsValidSlug(slug)) return BadRequest(new { detail = "Invalid slug format." });

        var campaign = await _campaigns.GetBySlugAsync(slug);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (campaign.Status == CampaignStatus.Archived)
            return StatusCode(410, new { detail = "This event has ended." });

        return Ok(ToCampaignPublicResponse(campaign));
    }

    // ── GET /api/public/events (Public) ───────────────────────────────────────
    [HttpGet("api/public/events")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicEvents()
    {
        var active = await _campaigns.GetPublicActiveAsync();
        return Ok(active
            .Take(100)
            .Select(c => new
            {
                id                  = c.Id,
                name                = c.Name,
                slug                = c.Slug,
                organization_name   = c.OrganizationName,
                description         = c.Description,
                event_logo          = c.EventLogo,
                logo_url            = ResolveCardImage(c),
                registration_enabled= c.RegistrationEnabled,
                start_date          = c.StartDate,
                end_date            = c.EndDate,
                status              = c.Status.ToString().ToLowerInvariant(),
                has_landing_page    = c.HasLandingPage,
                created_at          = c.CreatedAt
            }));
    }

    // Events-listing card image: prefer the campaign logo, then the legacy event_logo,
    // then fall back to the form's banner / header image — so events that only had a
    // form banner uploaded (no Event Logo) still show an image on the public listing.
    private static string? ResolveCardImage(Campaign c)
    {
        if (!string.IsNullOrWhiteSpace(c.LogoUrl)) return c.LogoUrl;
        if (!string.IsNullOrWhiteSpace(c.EventLogo)) return c.EventLogo;
        if (string.IsNullOrEmpty(c.FormConfig)) return null;
        try
        {
            using var doc = JsonDocument.Parse(c.FormConfig);
            var root = doc.RootElement;
            foreach (var key in new[] { "banner_image", "header_image" })
            {
                if (root.TryGetProperty(key, out var el) &&
                    el.ValueKind == JsonValueKind.String)
                {
                    var s = el.GetString();
                    if (!string.IsNullOrWhiteSpace(s)) return s;
                }
            }
        }
        catch { /* malformed form_config — ignore, just show no image */ }
        return null;
    }

    // ── POST /api/contact-sales (Public) ──────────────────────────────────────
    [HttpPost("api/contact-sales")]
    [AllowAnonymous]
    public async Task<IActionResult> ContactSales([FromBody] ContactSalesRequest req)
    {
        // Checked before anything is written or emailed, so a failed captcha costs
        // nothing but the round trip. Every token is single-use: the browser must
        // fetch a fresh question before it can try again.
        if (!_captcha.Verify(req.CaptchaToken, req.CaptchaAnswer))
            return BadRequest(new { detail = "Captcha answer is incorrect or expired. Please try the new question." });

        var inquiry = new ContactInquiry
        {
            Id                   = Guid.NewGuid().ToString(),
            ContactName          = req.ContactName,
            MobileNumber         = req.MobileNumber,
            Email                = req.Email,
            ClubName             = req.ClubName,
            District             = req.District,
            Designation          = req.Designation,
            Purpose              = req.Purpose,
            EstimatedRegistrants = req.EstimatedRegistrants,
            EventDate            = req.EventDate,
            Status               = "new",
            CreatedAt            = DateTime.UtcNow
        };
        await _contacts.CreateAsync(inquiry);

        // Notify all super admins of the new inquiry
        try
        {
            var admins = (await _users.GetAllAsync())
                .Where(u => u.Role == KaizenEvents.Core.Enums.UserRole.SuperAdmin && u.IsActive)
                .ToList();

            var adminHtml = $@"
<h2>New Host Inquiry</h2>
<p>A new inquiry has been submitted via the Contact Sales form:</p>
<table style='border-collapse:collapse;margin:16px 0;'>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Name:</td><td><strong>{inquiry.ContactName}</strong></td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Mobile:</td><td>{inquiry.MobileNumber}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Email:</td><td>{inquiry.Email}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Club:</td><td>{inquiry.ClubName}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>District:</td><td>{inquiry.District}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Designation:</td><td>{inquiry.Designation}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Attendees:</td><td>{inquiry.EstimatedRegistrants}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Event Date:</td><td>{inquiry.EventDate}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;vertical-align:top;'>Purpose:</td><td>{inquiry.Purpose}</td></tr>
</table>
<p>Please reach out within 24 hours.</p>";

            // Always notify the standing inboxes, plus every super admin (deduped).
            var standingInboxes = new[]
            {
                (Email: "events@kaizeninfotech.com",        Name: "Kaizen Events"),
                (Email: "communication@kaizeninfotech.com", Name: "Kaizen Communication")
            };
            var recipients = admins
                .Select(a => (Email: a.Email, Name: a.Name))
                .Where(r => !string.IsNullOrWhiteSpace(r.Email))
                .ToList();
            foreach (var inbox in standingInboxes)
                if (!recipients.Any(r => string.Equals(r.Email, inbox.Email, StringComparison.OrdinalIgnoreCase)))
                    recipients.Add(inbox);

            foreach (var (email, name) in recipients)
                await _email.SendEmailAsync(email, name, $"New Host Inquiry: {inquiry.ContactName}", adminHtml);

            // Acknowledgment email to the submitter
            var userHtml = $@"
<h2>Thanks for reaching out!</h2>
<p>Hello {inquiry.ContactName},</p>
<p>We've received your inquiry to host <strong>{inquiry.Purpose}</strong>. Our team will contact you within 24 hours.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";
            await _email.SendEmailAsync(inquiry.Email, inquiry.ContactName, "We received your inquiry — Kaizen Events", userHtml);
        }
        catch { /* non-critical */ }

        return Ok(new { message = "Thank you! We'll be in touch shortly.", id = inquiry.Id });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static bool IsValidSlug(string slug) =>
        System.Text.RegularExpressions.Regex.IsMatch(slug, @"^[a-zA-Z0-9\-_]+$");

    private static object ToCampaignPublicResponse(KaizenEvents.Core.Entities.Campaign c) => new
    {
        id                       = c.Id,
        name                     = c.Name,
        slug                     = c.Slug,
        organization_name        = c.OrganizationName,
        description              = c.Description,
        event_logo               = c.EventLogo,
        logo_url                 = c.LogoUrl,
        show_organization_name   = c.ShowOrganizationName,
        show_description         = c.ShowDescription,
        show_event_logo          = c.ShowEventLogo,
        has_landing_page         = c.HasLandingPage,
        registration_enabled     = c.RegistrationEnabled,
        use_external_form        = c.UseExternalForm,
        external_form_url        = c.ExternalFormUrl,
        landing_page_config      = ParseJson(c.LandingPageConfig),
        form_config              = ParseJson(c.FormConfig),
        payment_config           = ParseJson(c.PaymentConfig),
        payment_collection_method= c.PaymentCollectionMethod,
        payment_gateway          = c.PaymentGateway.ToString().ToLowerInvariant(),
        payment_account_id       = c.PaymentAccountId,
        payment_enabled          = c.PaymentEnabled,
        status                   = ToSnake(c.Status.ToString()),
        campaign_type            = ToSnake(c.CampaignType.ToString()),
        registration_start_date  = c.RegistrationStartDate,
        registration_end_date    = c.RegistrationEndDate,
        start_date               = c.StartDate,
        end_date                 = c.EndDate
    };

    private static object? ParseJson(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonDocument.Parse(json).RootElement.Clone(); } catch { return null; }
    }

    // Converts PascalCase enum names (e.g. "ClosedGroup") to snake_case ("closed_group")
    // so the frontend's `campaign_type === 'closed_group'` check works.
    private static string ToSnake(string pascal)
        => System.Text.RegularExpressions.Regex
            .Replace(pascal, "(?<=[a-z0-9])([A-Z])", "_$1")
            .ToLowerInvariant();
}
