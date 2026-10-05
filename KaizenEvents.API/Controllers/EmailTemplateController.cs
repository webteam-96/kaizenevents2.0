using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Per-campaign email template management. Each campaign gets 4 templates seeded
/// automatically at creation (registration_confirmed, payment_received, payment_otp,
/// registration_reminder). Admin can edit subject/body/CC/BCC/attach-PDF per template.
/// </summary>
[ApiController]
[Route("api/campaigns/{campaign_id}/email-templates")]
[Authorize]
public class EmailTemplateController : ApiControllerBase
{
    private readonly IEmailTemplateService _service;
    private readonly ICampaignRepository _campaigns;
    private readonly IUserRepository _users;
    private readonly IBrevoService _email;
    private readonly ILogger<EmailTemplateController> _logger;

    public EmailTemplateController(
        IEmailTemplateService service,
        ICampaignRepository campaigns,
        IUserRepository users,
        IBrevoService email,
        ILogger<EmailTemplateController> logger)
    {
        _service   = service;
        _campaigns = campaigns;
        _users     = users;
        _email     = email;
        _logger    = logger;
    }

    // ── GET /api/campaigns/{campaign_id}/email-templates ─────────────────────
    [HttpGet]
    public async Task<IActionResult> List(string campaign_id)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });

        var templates = await _service.GetByCampaignIdAsync(campaign_id);

        // If the campaign was created before this feature shipped, seed defaults now.
        // Idempotent — only inserts missing triggers.
        if (templates.Count < 4)
        {
            await _service.SeedDefaultsAsync(campaign_id);
            templates = await _service.GetByCampaignIdAsync(campaign_id);
        }

        return Ok(templates.Select(ToResponse));
    }

    // ── GET /api/campaigns/{campaign_id}/email-templates/{trigger} ──────────
    [HttpGet("{trigger}")]
    public async Task<IActionResult> GetOne(string campaign_id, string trigger)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });

        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'. Allowed: {string.Join(", ", IEmailTemplateService.Triggers)}." });

        var template = await _service.GetByCampaignAndTriggerAsync(campaign_id, trigger);
        if (template == null)
        {
            // Self-heal: seed on demand
            await _service.SeedDefaultsAsync(campaign_id);
            template = await _service.GetByCampaignAndTriggerAsync(campaign_id, trigger);
        }
        if (template == null) return NotFound(new { detail = "Template not found." });

        return Ok(ToResponse(template));
    }

    // ── PUT /api/campaigns/{campaign_id}/email-templates/{trigger} ──────────
    [HttpPut("{trigger}")]
    public async Task<IActionResult> Update(string campaign_id, string trigger, [FromBody] UpdateEmailTemplateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });

        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'. Allowed: {string.Join(", ", IEmailTemplateService.Triggers)}." });

        // Subject/body are only required for templates that will actually send.
        // A disabled template may be left blank.
        if (req.IsActive)
        {
            if (string.IsNullOrWhiteSpace(req.Subject))
                return BadRequest(new { detail = "Subject is required." });
            if (string.IsNullOrWhiteSpace(req.BodyHtml))
                return BadRequest(new { detail = "Body is required." });
        }

        // Attachment limits: Brevo caps messages at ~10MB and base64 inflates ~33%,
        // so keep raw attachments at 5MB total / 2MB each / 5 files.
        if (req.Attachments is { Count: > 0 })
        {
            if (req.Attachments.Count > MaxAttachmentCount)
                return BadRequest(new { detail = $"Too many attachments. Maximum is {MaxAttachmentCount} per template." });
            var oversize = req.Attachments.FirstOrDefault(a => a.Size > MaxAttachmentBytes);
            if (oversize != null)
                return BadRequest(new { detail = $"Attachment '{oversize.Name}' exceeds the 2MB per-file limit." });
            if (req.Attachments.Sum(a => a.Size) > MaxTotalAttachmentBytes)
                return BadRequest(new { detail = "Attachments exceed the 5MB combined limit for one email." });
        }

        var template = await _service.GetByCampaignAndTriggerAsync(campaign_id, trigger);
        if (template == null)
        {
            await _service.SeedDefaultsAsync(campaign_id);
            template = await _service.GetByCampaignAndTriggerAsync(campaign_id, trigger);
        }
        if (template == null) return NotFound(new { detail = "Template not found." });

        var updated = await _service.UpdateAsync(template.Id, req);
        return Ok(ToResponse(updated));
    }

    // ── POST /api/campaigns/{campaign_id}/email-templates/{trigger}/preview ──
    /// <summary>Renders the template against the most-recent registration (or dummy data) and returns the result.</summary>
    [HttpPost("{trigger}/preview")]
    public async Task<IActionResult> Preview(string campaign_id, string trigger)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });

        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'." });

        var rendered = await _service.RenderPreviewAsync(campaign_id, trigger);
        if (rendered == null)
            return BadRequest(new { detail = "Template has empty subject or body — fill them in before previewing." });

        return Ok(new
        {
            subject               = rendered.Subject,
            body_html             = rendered.BodyHtml,
            to_email              = rendered.ToEmail,
            to_name               = rendered.ToName,
            cc                    = rendered.Cc,
            bcc                   = rendered.Bcc,
            reply_to              = rendered.ReplyTo,
            attach_filled_form_pdf= rendered.AttachFilledFormPdf,
            attachments           = rendered.Attachments ?? new List<EmailAttachment>()
        });
    }

    // ── POST /api/campaigns/{campaign_id}/email-templates/{trigger}/send-test ──
    /// <summary>Renders the template against sample data and sends it to the given email address.</summary>
    [HttpPost("{trigger}/send-test")]
    public async Task<IActionResult> SendTest(string campaign_id, string trigger, [FromBody] SendTestRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });
        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'." });
        if (string.IsNullOrWhiteSpace(req.ToEmail))
            return BadRequest(new { detail = "to_email is required." });

        var rendered = await _service.RenderPreviewAsync(campaign_id, trigger);
        if (rendered == null)
            return BadRequest(new { detail = "Template has empty subject or body — fill them in before sending a test." });

        var sent = await _email.SendEmailAsync(req.ToEmail, "Test Recipient",
            $"[TEST] {rendered.Subject}", rendered.BodyHtml);
        return Ok(new { sent, sent_to = req.ToEmail });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private const int  MaxAttachmentCount      = 5;
    private const long MaxAttachmentBytes      = 2 * 1024 * 1024; // 2MB per file
    private const long MaxTotalAttachmentBytes = 5 * 1024 * 1024; // 5MB combined

    private static bool IsValidTrigger(string trigger) =>
        IEmailTemplateService.Triggers.Contains(trigger, StringComparer.OrdinalIgnoreCase);

    private async Task<bool> CampaignExistsAsync(string id) =>
        await _campaigns.GetByIdAsync(id) != null;

    private async Task<bool> HasAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }

    private static object ToResponse(EmailTemplate t) => new
    {
        id                     = t.Id,
        campaign_id            = t.CampaignId,
        trigger                = t.Trigger,
        is_active              = t.IsActive,
        subject                = t.Subject,
        body_html              = t.BodyHtml,
        to_override            = t.ToOverride,
        cc                     = ParseList(t.CcEmails),
        bcc                    = ParseList(t.BccEmails),
        reply_to               = t.ReplyTo,
        email_sender_id        = t.EmailSenderId,
        attach_filled_form_pdf = t.AttachFilledFormPdf,
        attachments            = EmailAttachment.ParseList(t.Attachments),
        created_at             = t.CreatedAt,
        updated_at             = t.UpdatedAt
    };

    private static List<string> ParseList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }
}

public record SendTestRequest(string ToEmail);
