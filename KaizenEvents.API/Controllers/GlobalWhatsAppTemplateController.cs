using System.Text.Json;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Cross-campaign WhatsApp template management — lets a Super Admin configure one trigger once
/// and push it to every event (or a chosen subset) in a single action, instead of visiting each
/// campaign's Settings → WhatsApp tab individually. A bulk apply reuses
/// <see cref="IWhatsAppTemplateService.UpdateAsync"/> exactly as the per-campaign
/// <see cref="WhatsAppTemplateController"/> does — same validation, same locked body values for
/// the standard triggers, same mutual-exclusivity handling — so it behaves identically to doing
/// it one campaign at a time, just looped.
/// </summary>
[ApiController]
[Route("api/whatsapp-templates")]
[Authorize]
public class GlobalWhatsAppTemplateController : ApiControllerBase
{
    private readonly IWhatsAppTemplateService _service;
    private readonly ICampaignRepository _campaigns;
    private readonly IInteraktService _interakt;

    public GlobalWhatsAppTemplateController(
        IWhatsAppTemplateService service,
        ICampaignRepository campaigns,
        IInteraktService interakt)
    {
        _service   = service;
        _campaigns = campaigns;
        _interakt  = interakt;
    }

    private const int MaxBodyValues = 20;

    // ── GET /api/whatsapp-templates/overview ──────────────────────────────────
    /// <summary>Every campaign's state for every trigger, in one call — feeds the cross-campaign
    /// management screen without an N+1 fetch per campaign.</summary>
    [HttpGet("overview")]
    public async Task<IActionResult> Overview()
    {
        if (!IsSuperAdmin) return Forbidden();

        var campaigns = await _campaigns.GetAllAsync();
        var all = await _service.GetAllAsync();
        var byCampaign = all.GroupBy(t => t.CampaignId).ToDictionary(g => g.Key, g => g.ToList());

        var rows = campaigns
            .OrderBy(c => c.Name)
            .Select(c => new
            {
                campaign_id      = c.Id,
                campaign_name    = c.Name,
                whatsapp_enabled = c.WhatsappEnabled,
                templates = IWhatsAppTemplateService.Triggers.Select(trigger =>
                {
                    var t = byCampaign.TryGetValue(c.Id, out var list)
                        ? list.FirstOrDefault(x => string.Equals(x.Trigger, trigger, StringComparison.OrdinalIgnoreCase))
                        : null;
                    return new
                    {
                        trigger,
                        is_active               = t?.IsActive ?? false,
                        template_name           = t?.TemplateName ?? "",
                        effective_template_name = _service.EffectiveTemplateName(trigger, t?.TemplateName),
                        body_values              = ParseList(t?.BodyValues)
                    };
                })
            });

        return Ok(new
        {
            configured = _interakt.IsConfigured(),
            triggers   = IWhatsAppTemplateService.Triggers,
            campaigns  = rows
        });
    }

    // ── PUT /api/whatsapp-templates/bulk-apply ─────────────────────────────────
    /// <summary>
    /// Applies one trigger's configuration to every campaign, or only to <c>campaign_ids</c> when
    /// given. Also covers "delete": submit with <c>is_active = false</c> to switch it off across
    /// the target campaigns. One campaign failing doesn't stop the rest — failures come back
    /// per-campaign instead of aborting the whole batch.
    /// </summary>
    [HttpPut("bulk-apply")]
    public async Task<IActionResult> BulkApply([FromBody] BulkApplyWhatsAppTemplateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (!IsValidTrigger(req.Trigger))
            return BadRequest(new { detail = $"Invalid trigger '{req.Trigger}'. Allowed: {string.Join(", ", IWhatsAppTemplateService.Triggers)}." });
        if (req.IsActive && string.IsNullOrWhiteSpace(_service.EffectiveTemplateName(req.Trigger, req.TemplateName)))
            return BadRequest(new { detail = "An approved WhatsApp template name is required to enable this message." });
        if (req.BodyValues is { Count: > MaxBodyValues })
            return BadRequest(new { detail = $"Too many variables. A WhatsApp template supports at most {MaxBodyValues} body variables." });

        var campaigns = await _campaigns.GetAllAsync();
        var targets = req.CampaignIds is { Count: > 0 }
            ? campaigns.Where(c => req.CampaignIds.Contains(c.Id)).ToList()
            : campaigns;

        if (targets.Count == 0)
            return BadRequest(new { detail = "No matching campaigns to apply to." });

        var updateReq = new UpdateWhatsAppTemplateRequest(
            req.TemplateName ?? "", req.BodyValues, req.LanguageCode, req.CountryCode, req.IsActive);

        var updatedIds = new List<string>();
        var failed = new List<object>();

        foreach (var campaign in targets)
        {
            try
            {
                var template = await _service.GetByCampaignAndTriggerAsync(campaign.Id, req.Trigger);
                if (template == null)
                {
                    await _service.SeedDefaultsAsync(campaign.Id);
                    template = await _service.GetByCampaignAndTriggerAsync(campaign.Id, req.Trigger);
                }
                if (template == null)
                {
                    failed.Add(new { campaign_id = campaign.Id, campaign_name = campaign.Name, error = "Template row not found." });
                    continue;
                }

                await _service.UpdateAsync(template.Id, updateReq);
                updatedIds.Add(campaign.Id);
            }
            catch (Exception ex)
            {
                failed.Add(new { campaign_id = campaign.Id, campaign_name = campaign.Name, error = ex.Message });
            }
        }

        return Ok(new { updated_count = updatedIds.Count, failed_count = failed.Count, failed });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static bool IsValidTrigger(string trigger) =>
        IWhatsAppTemplateService.Triggers.Contains(trigger, StringComparer.OrdinalIgnoreCase);

    private static List<string> ParseList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }
}

public record BulkApplyWhatsAppTemplateRequest(
    string Trigger,
    string? TemplateName,
    List<string>? BodyValues,
    string? LanguageCode,
    string? CountryCode,
    bool IsActive,
    List<string>? CampaignIds = null);
