using System.Text.Json;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationController : ApiControllerBase
{
    private readonly INotificationSettingRepository _settings;
    private readonly INotificationLogRepository _logs;
    private readonly IRegistrationRepository _registrations;
    private readonly IUserRepository _users;
    private readonly IBrevoService _email;
    private readonly IEmailSenderResolver _senderResolver;

    public NotificationController(
        INotificationSettingRepository settings,
        INotificationLogRepository logs,
        IRegistrationRepository registrations,
        IUserRepository users,
        IBrevoService email,
        IEmailSenderResolver senderResolver)
    {
        _settings       = settings;
        _logs           = logs;
        _registrations  = registrations;
        _users          = users;
        _email          = email;
        _senderResolver = senderResolver;
    }

    // ── GET /api/notifications/settings/{campaign_id} ─────────────────────────
    [HttpGet("settings/{campaign_id}")]
    public async Task<IActionResult> GetSettings(string campaign_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var setting = await _settings.GetByCampaignIdAsync(campaign_id);
        if (setting == null)
            return Ok(new {
                campaign_id, email_enabled = false, whatsapp_enabled = false,
                email_cc = Array.Empty<string>(), email_bcc = Array.Empty<string>()
            });

        return Ok(new
        {
            campaign_id           = setting.CampaignId,
            email_enabled         = setting.EmailEnabled,
            whatsapp_enabled      = setting.WhatsappEnabled,
            email_subject         = setting.EmailSubject,
            email_template        = setting.EmailTemplate,
            whatsapp_template_name= setting.WhatsappTemplateName,
            has_resend_key        = !string.IsNullOrEmpty(setting.ResendApiKey),
            sender_email          = setting.SenderEmail,
            email_sender_id       = setting.EmailSenderId,
            email_cc              = ParseStringList(setting.CcEmails),
            email_bcc             = ParseStringList(setting.BccEmails)
        });
    }

    private static List<string> ParseStringList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<string>();
        try { return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new List<string>(); }
    }

    // ── PUT /api/notifications/settings/{campaign_id} ─────────────────────────
    [HttpPut("settings/{campaign_id}")]
    public async Task<IActionResult> UpdateSettings(
        string campaign_id, [FromBody] NotificationSettingsRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var setting = await _settings.GetByCampaignIdAsync(campaign_id)
                      ?? new KaizenEvents.Core.Entities.NotificationSetting
                      {
                          Id         = Guid.NewGuid().ToString(),
                          CampaignId = campaign_id,
                          CreatedAt  = DateTime.UtcNow
                      };

        if (req.EmailEnabled.HasValue)       setting.EmailEnabled         = req.EmailEnabled.Value;
        if (req.WhatsappEnabled.HasValue)    setting.WhatsappEnabled      = req.WhatsappEnabled.Value;
        if (req.EmailSubject != null)        setting.EmailSubject         = req.EmailSubject;
        // email_template is a MySQL JSON column — empty string is invalid JSON, store null instead
        if (req.EmailTemplate != null)       setting.EmailTemplate        = string.IsNullOrWhiteSpace(req.EmailTemplate) ? null : req.EmailTemplate;
        if (req.WhatsappTemplateName != null) setting.WhatsappTemplateName = req.WhatsappTemplateName;
        if (req.ResendApiKey != null)        setting.ResendApiKey         = req.ResendApiKey;
        if (req.SenderEmail != null)         setting.SenderEmail          = req.SenderEmail;
        // Empty string from the dropdown's "Select a registered sender..." option means
        // "no per-campaign sender" — store null so the resolver falls back to global.
        if (req.EmailSenderId != null)       setting.EmailSenderId        = string.IsNullOrWhiteSpace(req.EmailSenderId) ? null : req.EmailSenderId;
        if (req.EmailCc != null)             setting.CcEmails             = System.Text.Json.JsonSerializer.Serialize(req.EmailCc);
        if (req.EmailBcc != null)            setting.BccEmails            = System.Text.Json.JsonSerializer.Serialize(req.EmailBcc);
        setting.UpdatedAt = DateTime.UtcNow;

        await _settings.UpsertAsync(setting);
        return Ok(new { message = "Notification settings updated." });
    }

    // ── GET /api/notifications/logs/{campaign_id} ─────────────────────────────
    [HttpGet("logs/{campaign_id}")]
    public async Task<IActionResult> GetLogs(
        string campaign_id, [FromQuery] int limit = 50)
    {
        if (!IsSuperAdmin && !await HasCampaignAccessAsync(campaign_id))
            return Forbidden();

        var logs = await _logs.GetByCampaignIdAsync(campaign_id, limit);
        return Ok(logs.Select(l => new
        {
            id              = l.Id,
            campaign_id     = l.CampaignId,
            registration_id = l.RegistrationId,
            channel         = l.Type,
            recipient       = l.Recipient,
            status          = l.Status,
            sent_at         = l.CreatedAt,
            error_message   = l.Error
        }));
    }

    // ── POST /api/notifications/send ──────────────────────────────────────────
    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] SendNotificationRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var reg = await _registrations.GetByIdAsync(req.RegistrationId);
        if (reg == null) return NotFound(new { detail = "Registration not found." });

        // Notification sending integrated with Resend/Interakt — stub for now
        return Ok(new { message = "Notification queued for sending." });
    }

    // ── POST /api/notifications/test-email ────────────────────────────────────
    [HttpPost("test-email")]
    public async Task<IActionResult> TestEmail(
        [FromQuery] string campaign_id, [FromQuery] string test_email)
    {
        if (!IsSuperAdmin) return Forbidden();

        if (string.IsNullOrWhiteSpace(test_email))
            return BadRequest(new { detail = "test_email query parameter is required." });

        var html = $@"
<h2>Test Email from Kaizen Events</h2>
<p>This is a test email to verify your Brevo email configuration.</p>
<p>If you received this, your email setup is working correctly.</p>
<table style='border-collapse:collapse;margin:16px 0;'>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Campaign ID:</td><td style='font-family:monospace;'>{campaign_id}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Sent at:</td><td>{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC</td></tr>
</table>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";

        // Resolve the campaign's verified custom sender so the test reflects exactly
        // what registrants will see as the From (falls back to global if none/unverified).
        var (fromEmail, fromName) = await _senderResolver.ResolveAsync(campaign_id);
        var sent = await _email.SendEmailAsync(test_email, "Test Recipient", "Test Email — Kaizen Events", html, fromEmail, fromName);
        if (!sent)
            return BadRequest(new { detail = "Email send failed. Check Brevo.ApiKey in appsettings." });

        return Ok(new
        {
            message  = "Test email sent successfully.",
            email_id = Guid.NewGuid().ToString(),
            sent_from = fromEmail ?? "(platform default sender)"
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<bool> HasCampaignAccessAsync(string campaignId)
    {
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }
}

public record NotificationSettingsRequest(
    bool? EmailEnabled, bool? WhatsappEnabled,
    string? EmailSubject, string? EmailTemplate,
    string? WhatsappTemplateName, string? ResendApiKey, string? SenderEmail,
    string? EmailSenderId,
    List<string>? EmailCc, List<string>? EmailBcc);

public record SendNotificationRequest(string RegistrationId, List<string> Channels);
