using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/whatsapp")]
[Authorize]
public class WhatsAppController : ApiControllerBase
{
    private readonly ICampaignRepository _campaigns;
    private readonly ICampaignMemberRepository _members;
    private readonly IInteraktService _interakt;
    private readonly IConfiguration _config;

    public WhatsAppController(
        ICampaignRepository campaigns,
        ICampaignMemberRepository members,
        IInteraktService interakt,
        IConfiguration config)
    {
        _campaigns = campaigns;
        _members   = members;
        _interakt  = interakt;
        _config    = config;
    }

    // ── GET /api/whatsapp/template-guide ─────────────────────────────────────
    [HttpGet("template-guide")]
    [AllowAnonymous]
    public IActionResult GetTemplateGuide()
    {
        return Ok(new
        {
            title    = "WhatsApp Template Setup Guide",
            provider = "Interakt",
            instructions = new[]
            {
                "1. Log in to your Interakt dashboard at https://app.interakt.ai",
                "2. Go to 'Templates' section",
                "3. Create a new template with name: 'event_registration_invite'",
                "4. Use the following variables in your template:"
            },
            variables = new[]
            {
                new { placeholder = "{{1}}", maps_to = "member_name", description = "The member's name from your uploaded list" },
                new { placeholder = "{{2}}", maps_to = "event_name", description = "The name of your campaign/event" },
                new { placeholder = "{{3}}", maps_to = "registration_link", description = "The unique registration link for the member" },
                new { placeholder = "{{4}}", maps_to = "organization_name", description = "Your organization's name" },
                new { placeholder = "{{5}}", maps_to = "registration_fee", description = "The registration fee amount (if applicable)" }
            },
            notes = new[]
            {
                "Template must be approved by WhatsApp before it can be used",
                "Approval typically takes 24-48 hours",
                "The template language should be set to 'en' (English)"
            }
        });
    }

    // ── POST /api/whatsapp/campaigns/{campaign_id}/send-invites ──────────────
    [HttpPost("campaigns/{campaign_id}/send-invites")]
    public async Task<IActionResult> SendInvites(
        string campaign_id, [FromBody] SendWhatsAppInvitesRequest req)
    {
        if (!await IsOrganizerAccessAsync(campaign_id)) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (campaign.CampaignType != KaizenEvents.Core.Enums.CampaignType.ClosedGroup)
            return BadRequest(new { detail = "WhatsApp invites are only available for closed group campaigns." });

        if (!_interakt.IsConfigured())
            return BadRequest(new { detail = "WhatsApp integration is not configured." });

        var frontendUrl = _config["App:FrontendUrl"] ?? "https://kaizenevents.live";
        var formConfig  = campaign.FormConfig != null
            ? System.Text.Json.JsonDocument.Parse(campaign.FormConfig) : null;
        var basePrice = formConfig?.RootElement.TryGetProperty("base_price", out var bpEl) == true
            ? (bpEl.ValueKind == System.Text.Json.JsonValueKind.Number ? bpEl.GetDecimal() : 0m) : 0m;

        int totalSent   = 0;
        int totalFailed = 0;
        var errors      = new List<object>();

        foreach (var memberId in req.MemberIds)
        {
            var member = await _members.GetByIdAsync(memberId);
            if (member == null || member.CampaignId != campaign_id)
            {
                errors.Add(new { member_id = memberId, error = "Member not found." });
                totalFailed++;
                continue;
            }

            if (member.Status == KaizenEvents.Core.Enums.MemberStatus.Registered)
            {
                errors.Add(new { member_id = memberId, error = "Member already registered." });
                totalFailed++;
                continue;
            }

            if (string.IsNullOrEmpty(member.Mobile))
            {
                errors.Add(new { member_id = memberId, error = "Member has no mobile number." });
                totalFailed++;
                continue;
            }

            var registrationLink = $"{frontendUrl}/register/{campaign.Slug}?member={memberId}";
            var bodyValues = new[]
            {
                member.Name,
                campaign.Name,
                registrationLink,
                campaign.OrganizationName,
                basePrice > 0 ? $"₹{basePrice:F0}" : "Free"
            };

            var result = await _interakt.SendTemplateMessageAsync(
                member.Mobile, "91",
                req.TemplateName,
                bodyValues);

            if (result.Success)
            {
                totalSent++;
            }
            else
            {
                totalFailed++;
                errors.Add(new { member_id = memberId, member_name = member.Name, error = result.Error });
            }
        }

        return Ok(new { total_sent = totalSent, total_failed = totalFailed, errors });
    }

    // ── GET /api/whatsapp/campaigns/{campaign_id}/invite-status ──────────────
    [HttpGet("campaigns/{campaign_id}/invite-status")]
    public async Task<IActionResult> GetInviteStatus(string campaign_id)
    {
        if (!await IsOrganizerAccessAsync(campaign_id)) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (campaign.CampaignType != KaizenEvents.Core.Enums.CampaignType.ClosedGroup)
            return BadRequest(new { detail = "Only available for closed group campaigns." });

        var members     = await _members.GetByCampaignIdAsync(campaign_id);
        int registered  = members.Count(m => m.Status == KaizenEvents.Core.Enums.MemberStatus.Registered);
        int noMobile    = members.Count(m => string.IsNullOrEmpty(m.Mobile));
        int notSent     = members.Count(m => m.Status != KaizenEvents.Core.Enums.MemberStatus.Registered
                                          && !string.IsNullOrEmpty(m.Mobile));

        return Ok(new
        {
            campaign_id   = campaign_id,
            campaign_name = campaign.Name,
            summary       = new
            {
                total_members  = members.Count,
                registered,
                pending_invite = notSent,
                no_mobile      = noMobile
            },
            members = members.Select(m => new
            {
                id                  = m.Id,
                name                = m.Name,
                mobile              = m.Mobile,
                registration_status = m.Status.ToString().ToLowerInvariant()
            })
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<bool> IsOrganizerAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (IsOrgAdmin)
        {
            var userRepo = HttpContext.RequestServices.GetRequiredService<IUserRepository>();
            var ids      = await userRepo.GetCampaignIdsAsync(CurrentUserId!);
            return ids.Contains(campaignId);
        }
        return false;
    }
}

public record SendWhatsAppInvitesRequest(List<string> MemberIds, string TemplateName = "event_registration_invite");
