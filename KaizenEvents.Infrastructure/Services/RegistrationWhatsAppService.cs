using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Sends registration-flow WhatsApp messages via Interakt, mirroring RegistrationEmailService.
/// Invoked from the email service so every existing confirmation/payment/otp/reminder trigger
/// point fires WhatsApp too. Every method is defensive — a WhatsApp failure never throws.
/// Outcomes are recorded in notification_logs with a "wa_" type prefix so the two channels are
/// distinguishable in reporting.
/// </summary>
public class RegistrationWhatsAppService : IRegistrationWhatsAppService
{
    private readonly IWhatsAppTemplateService _templates;
    private readonly IInteraktService _interakt;
    private readonly INotificationLogRepository _notifications;
    private readonly ILogger<RegistrationWhatsAppService> _logger;

    public RegistrationWhatsAppService(
        IWhatsAppTemplateService templates,
        IInteraktService interakt,
        INotificationLogRepository notifications,
        ILogger<RegistrationWhatsAppService> logger)
    {
        _templates     = templates;
        _interakt      = interakt;
        _notifications = notifications;
        _logger        = logger;
    }

    // notification_logs.type is varchar(20) — map each trigger to a short "wa_" code.
    private static string ShortType(string trigger) => trigger switch
    {
        WhatsAppTemplateTrigger.RegistrationConfirmed => "wa_confirmed",
        WhatsAppTemplateTrigger.PaymentReceived       => "wa_received",
        WhatsAppTemplateTrigger.PaymentOtp            => "wa_otp",
        WhatsAppTemplateTrigger.RegistrationReminder  => "wa_reminder",
        _                                             => ("wa_" + trigger).Length > 20 ? ("wa_" + trigger)[..20] : "wa_" + trigger
    };

    public async Task<bool> SendForTriggerAsync(string trigger, Registration reg, Campaign campaign, RenderContext? extra = null)
    {
        if (!campaign.WhatsappEnabled) return false;   // master switch off for this campaign
        if (!_interakt.IsConfigured()) return false;

        RenderedWhatsApp? rendered;
        try
        {
            rendered = await _templates.RenderAsync(campaign.Id, trigger, reg, campaign, extra);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WhatsApp render failed for trigger {Trigger} / registration {RegId}", trigger, reg.Id);
            return false;
        }

        // null = template disabled or no approved template configured — silently skip (not a failure).
        if (rendered == null) return false;

        return await DispatchAsync(campaign.Id, reg.Id, trigger, rendered);
    }

    public async Task<bool> SendReminderAsync(Campaign campaign, string memberName, string memberPhone)
    {
        if (!campaign.WhatsappEnabled) return false;   // master switch off for this campaign
        if (!_interakt.IsConfigured()) return false;
        if (string.IsNullOrWhiteSpace(memberPhone)) return false;

        RenderedWhatsApp? rendered;
        try
        {
            rendered = await _templates.RenderReminderAsync(campaign, memberName, memberPhone);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WhatsApp reminder render failed for campaign {CampaignId}", campaign.Id);
            return false;
        }

        if (rendered == null) return false;
        return await DispatchAsync(campaign.Id, null, WhatsAppTemplateTrigger.RegistrationReminder, rendered);
    }

    private async Task<bool> DispatchAsync(string campaignId, string? registrationId, string trigger, RenderedWhatsApp r)
    {
        if (string.IsNullOrWhiteSpace(r.Phone))
        {
            await RecordAsync(campaignId, registrationId, trigger, "", "failed", "No phone number could be resolved.");
            return false;
        }

        InteraktResult result;
        try
        {
            result = await _interakt.SendTemplateMessageAsync(r.Phone, r.CountryCode, r.TemplateName, r.BodyValues, r.LanguageCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Interakt send threw for trigger {Trigger} / registration {RegId}", trigger, registrationId);
            await RecordAsync(campaignId, registrationId, trigger, BuildRecipient(r), "failed", ex.Message);
            return false;
        }

        if (!result.Success)
            _logger.LogWarning("WhatsApp {Trigger} to {Phone} for registration {RegId} was not sent: {Error}",
                trigger, r.Phone, registrationId, result.Error);

        await RecordAsync(campaignId, registrationId, trigger, BuildRecipient(r),
            result.Success ? "sent" : "failed", result.Success ? null : result.Error);
        return result.Success;
    }

    private static string BuildRecipient(RenderedWhatsApp r)
    {
        var digits = new string((r.Phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith(r.CountryCode) && digits.Length > r.CountryCode.Length)
            digits = digits[r.CountryCode.Length..];
        var full = $"{r.CountryCode}{digits}";
        return full.Length > 254 ? full[..254] : full;
    }

    /// <summary>Durably record the outcome in notification_logs. Never throws — logging must not break the send path.</summary>
    private async Task RecordAsync(string campaignId, string? registrationId, string trigger, string recipient, string status, string? error)
    {
        try
        {
            await _notifications.CreateAsync(new NotificationLog
            {
                Id             = Guid.NewGuid().ToString(),
                CampaignId     = campaignId,
                RegistrationId = registrationId,
                Type           = ShortType(trigger),
                Recipient      = recipient.Length > 254 ? recipient[..254] : recipient,
                Subject        = null,
                Status         = status,
                Error          = error,
                CreatedAt      = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to write WhatsApp notification_logs row for registration {RegId}", registrationId);
        }
    }
}
