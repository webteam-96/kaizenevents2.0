using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Per-campaign WhatsApp template management — the WhatsApp counterpart of
/// <see cref="EmailTemplateController"/>. Each campaign gets one template per trigger, seeded at
/// creation. Because WhatsApp only sends pre-approved templates, the admin configures the approved
/// template name + ordered variable values (with ${...} placeholders) rather than a message body.
/// </summary>
[ApiController]
[Route("api/campaigns/{campaign_id}/whatsapp-templates")]
[Authorize]
public class WhatsAppTemplateController : ApiControllerBase
{
    private readonly IWhatsAppTemplateService _service;
    private readonly ICampaignRepository _campaigns;
    private readonly IUserRepository _users;
    private readonly IInteraktService _interakt;
    private readonly ILogger<WhatsAppTemplateController> _logger;

    public WhatsAppTemplateController(
        IWhatsAppTemplateService service,
        ICampaignRepository campaigns,
        IUserRepository users,
        IInteraktService interakt,
        ILogger<WhatsAppTemplateController> logger)
    {
        _service   = service;
        _campaigns = campaigns;
        _users     = users;
        _interakt  = interakt;
        _logger    = logger;
    }

    // ── GET /api/campaigns/{campaign_id}/whatsapp-templates ──────────────────
    [HttpGet]
    public async Task<IActionResult> List(string campaign_id)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });

        var templates = await _service.GetByCampaignIdAsync(campaign_id);

        // Self-heal campaigns created before this feature shipped. Idempotent.
        if (templates.Count < IWhatsAppTemplateService.Triggers.Length)
        {
            await _service.SeedDefaultsAsync(campaign_id);
            templates = await _service.GetByCampaignIdAsync(campaign_id);
        }

        return Ok(new
        {
            configured = _interakt.IsConfigured(),
            templates  = templates.Select(ToResponse)
        });
    }

    // ── GET /api/campaigns/{campaign_id}/whatsapp-templates/{trigger} ────────
    [HttpGet("{trigger}")]
    public async Task<IActionResult> GetOne(string campaign_id, string trigger)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });
        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'. Allowed: {string.Join(", ", IWhatsAppTemplateService.Triggers)}." });

        var template = await _service.GetByCampaignAndTriggerAsync(campaign_id, trigger);
        if (template == null)
        {
            await _service.SeedDefaultsAsync(campaign_id);
            template = await _service.GetByCampaignAndTriggerAsync(campaign_id, trigger);
        }
        if (template == null) return NotFound(new { detail = "Template not found." });

        return Ok(ToResponse(template));
    }

    // ── PUT /api/campaigns/{campaign_id}/whatsapp-templates/{trigger} ────────
    [HttpPut("{trigger}")]
    public async Task<IActionResult> Update(string campaign_id, string trigger, [FromBody] UpdateWhatsAppTemplateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });
        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'. Allowed: {string.Join(", ", IWhatsAppTemplateService.Triggers)}." });

        // A live template must name an approved WhatsApp template; a disabled one may be blank.
        // The standard template may leave it blank and inherit the server-wide name.
        if (req.IsActive && string.IsNullOrWhiteSpace(_service.EffectiveTemplateName(trigger, req.TemplateName)))
            return BadRequest(new { detail = "An approved WhatsApp template name is required to enable this message." });

        if (req.BodyValues is { Count: > MaxBodyValues })
            return BadRequest(new { detail = $"Too many variables. A WhatsApp template supports at most {MaxBodyValues} body variables." });

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

    // ── POST /api/campaigns/{campaign_id}/whatsapp-templates/{trigger}/preview ──
    /// <summary>Resolves the template against the most-recent registration (or dummy data).</summary>
    [HttpPost("{trigger}/preview")]
    public async Task<IActionResult> Preview(string campaign_id, string trigger)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });
        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'." });

        var rendered = await _service.RenderPreviewAsync(campaign_id, trigger);
        if (rendered == null)
            return BadRequest(new { detail = "Set an approved template name before previewing." });

        return Ok(new
        {
            template_name = rendered.TemplateName,
            language_code = rendered.LanguageCode,
            country_code  = rendered.CountryCode,
            to_phone      = rendered.Phone,
            to_name       = rendered.ToName,
            body_values   = rendered.BodyValues
        });
    }

    // ── POST /api/campaigns/{campaign_id}/whatsapp-templates/{trigger}/send-test ──
    /// <summary>Renders against sample data and sends the WhatsApp message to the given phone.</summary>
    [HttpPost("{trigger}/send-test")]
    public async Task<IActionResult> SendTest(string campaign_id, string trigger, [FromBody] SendWhatsAppTestRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });
        if (!IsValidTrigger(trigger))
            return BadRequest(new { detail = $"Invalid trigger '{trigger}'." });
        if (string.IsNullOrWhiteSpace(req.ToPhone))
            return BadRequest(new { detail = "to_phone is required." });
        if (!_interakt.IsConfigured())
            return BadRequest(new { detail = "WhatsApp integration is not configured." });

        var rendered = await _service.RenderPreviewAsync(campaign_id, trigger);
        if (rendered == null)
            return BadRequest(new { detail = "Set an approved template name before sending a test." });

        var result = await _interakt.SendTemplateMessageAsync(
            req.ToPhone!,
            string.IsNullOrWhiteSpace(req.CountryCode) ? rendered.CountryCode : req.CountryCode!,
            rendered.TemplateName,
            rendered.BodyValues,
            rendered.LanguageCode);

        return Ok(new { sent = result.Success, sent_to = req.ToPhone, error = result.Error });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private const int MaxBodyValues = 20;

    private static bool IsValidTrigger(string trigger) =>
        IWhatsAppTemplateService.Triggers.Contains(trigger, StringComparer.OrdinalIgnoreCase);

    private async Task<bool> CampaignExistsAsync(string id) =>
        await _campaigns.GetByIdAsync(id) != null;

    private async Task<bool> HasAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }

    private object ToResponse(WhatsAppTemplate t) => new
    {
        id            = t.Id,
        campaign_id   = t.CampaignId,
        trigger       = t.Trigger,
        is_active     = t.IsActive,
        // Raw is what this campaign has stored; effective is what would actually be sent, which
        // for the standard template falls back to the server-wide name when the row is blank.
        template_name = t.TemplateName,
        effective_template_name = _service.EffectiveTemplateName(t.Trigger, t.TemplateName),
        language_code = t.LanguageCode,
        country_code  = t.CountryCode,
        body_values   = ParseList(t.BodyValues),
        created_at    = t.CreatedAt,
        updated_at    = t.UpdatedAt
    };

    private static List<string> ParseList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }
}

public record SendWhatsAppTestRequest(string? ToPhone, string? CountryCode = null);
