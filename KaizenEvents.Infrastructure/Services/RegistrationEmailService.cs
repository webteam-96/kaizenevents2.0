using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Transactional email sender for registration-flow emails. Resolves the per-campaign
/// email template (auto-seeded at campaign creation, customizable in the admin UI),
/// substitutes placeholders, and dispatches via Brevo.
/// </summary>
public class RegistrationEmailService : IRegistrationEmailService
{
    private readonly IBrevoService _email;
    private readonly IEmailTemplateService _templates;
    private readonly IEmailSenderResolver _senderResolver;
    private readonly INotificationSettingRepository _settings;
    private readonly INotificationLogRepository _notifications;
    private readonly IInvoiceService _invoice;
    private readonly IRegistrationWhatsAppService _whatsapp;
    private readonly IHostEnvironment _env;
    private readonly ILogger<RegistrationEmailService> _logger;

    public RegistrationEmailService(
        IBrevoService email,
        IEmailTemplateService templates,
        IEmailSenderResolver senderResolver,
        INotificationSettingRepository settings,
        INotificationLogRepository notifications,
        IInvoiceService invoice,
        IRegistrationWhatsAppService whatsapp,
        IHostEnvironment env,
        ILogger<RegistrationEmailService> logger)
    {
        _email          = email;
        _templates      = templates;
        _senderResolver = senderResolver;
        _settings       = settings;
        _notifications  = notifications;
        _invoice        = invoice;
        _whatsapp       = whatsapp;
        _env            = env;
        _logger         = logger;
    }

    /// <summary>
    /// Fires the parallel WhatsApp message for a trigger. WhatsApp is an independent channel:
    /// it sends whenever its per-campaign template is enabled + configured, regardless of the
    /// email outcome. Never throws — a WhatsApp failure must not affect the email/registration.
    /// </summary>
    private async Task FireWhatsAppAsync(string trigger, Registration reg, Campaign campaign, RenderContext? extra)
    {
        try { await _whatsapp.SendForTriggerAsync(trigger, reg, campaign, extra); }
        catch (Exception ex) { _logger.LogWarning(ex, "WhatsApp {Trigger} send failed for registration {RegId}", trigger, reg.Id); }
    }

    // notification_logs.type is varchar(20); map each trigger to a short, stable code.
    // The reconciliation worker keys off type == "confirmed" + status == "sent".
    internal static string ShortType(string trigger) => trigger switch
    {
        EmailTemplateTrigger.RegistrationConfirmed => "confirmed",
        EmailTemplateTrigger.PaymentReceived       => "received",
        EmailTemplateTrigger.PaymentOtp            => "otp",
        EmailTemplateTrigger.RegistrationReminder  => "reminder",
        _                                          => trigger.Length > 20 ? trigger[..20] : trigger
    };

    /// <summary>
    /// Durably records the outcome of a registration email in notification_logs so failures
    /// are visible and the reconciliation worker can retry them. Never throws — logging must
    /// not break the send path.
    /// </summary>
    private async Task RecordOutcomeAsync(
        string campaignId, string? registrationId, string trigger,
        string recipient, string? subject, string status, string? error)
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
                Subject        = subject != null && subject.Length > 500 ? subject[..500] : subject,
                // "sent" | "failed" | "skipped" ("skipped" = intentionally off; reconciliation treats it as terminal).
                Status         = status,
                Error          = error,
                CreatedAt      = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to write notification_logs row for registration {RegId}", registrationId);
        }
    }

    /// <summary>
    /// Merges the CC/BCC from the email template (rendered.Cc/Bcc) with the per-campaign
    /// notification_settings CC/BCC, so addresses configured in either UI are honoured.
    /// </summary>
    private async Task<(List<string> Cc, List<string> Bcc)> ResolveCcBccAsync(string campaignId, RenderedEmail rendered)
    {
        var cc  = new List<string>(rendered.Cc  ?? new List<string>());
        var bcc = new List<string>(rendered.Bcc ?? new List<string>());
        try
        {
            var settings = await _settings.GetByCampaignIdAsync(campaignId);
            if (settings != null)
            {
                cc.AddRange(ParseJsonList(settings.CcEmails));
                bcc.AddRange(ParseJsonList(settings.BccEmails));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load notification-settings CC/BCC for campaign {CampaignId}", campaignId);
        }
        return (cc, bcc);
    }

    private static List<string> ParseJsonList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }

    /// <summary>
    /// Resolves the From sender with the precedence: per-template sender → per-campaign
    /// notification-settings sender → global Brevo sender (null,null). Only verified DKIM
    /// senders are honoured; anything else falls through.
    /// </summary>
    private async Task<(string? Email, string? Name)> ResolveSenderAsync(string campaignId, string? templateSenderId)
    {
        var (email, name) = await _senderResolver.ResolveBySenderIdAsync(templateSenderId);
        if (email == null)
            (email, name) = await _senderResolver.ResolveAsync(campaignId);
        return (email, name);
    }

    public async Task<bool> SendConfirmationAsync(Registration reg, Campaign campaign)
    {
        var sent = await SendRenderedAsync(
            EmailTemplateTrigger.RegistrationConfirmed, reg, campaign,
            extra: null,
            logContext: "confirmation");
        await FireWhatsAppAsync(WhatsAppTemplateTrigger.RegistrationConfirmed, reg, campaign, null);
        return sent;
    }

    public async Task<bool> SendCashReceivedAsync(Registration reg, Campaign campaign, string receiptNumber)
    {
        var extra = new RenderContext(ReceiptNumber: receiptNumber);
        var sent = await SendRenderedAsync(
            EmailTemplateTrigger.PaymentReceived, reg, campaign,
            extra: extra,
            logContext: "cash-received");
        await FireWhatsAppAsync(WhatsAppTemplateTrigger.PaymentReceived, reg, campaign, extra);
        return sent;
    }

    public async Task<bool> SendOtpAsync(Registration reg, Campaign campaign, string otp)
    {
        var extra = new RenderContext(Otp: otp);
        var sent = await SendRenderedAsync(
            EmailTemplateTrigger.PaymentOtp, reg, campaign,
            extra: extra,
            logContext: "otp");
        await FireWhatsAppAsync(WhatsAppTemplateTrigger.PaymentOtp, reg, campaign, extra);
        return sent;
    }

    public async Task<bool> SendReminderAsync(string memberName, string memberEmail, string memberPhone, Campaign campaign)
    {
        // WhatsApp reminder is an independent channel — fire it even when the member has no
        // email on file (as long as a phone + an enabled WhatsApp reminder template exist).
        try { await _whatsapp.SendReminderAsync(campaign, memberName, memberPhone); }
        catch (Exception ex) { _logger.LogWarning(ex, "WhatsApp reminder send failed for campaign {CampaignId}", campaign.Id); }

        if (string.IsNullOrWhiteSpace(memberEmail))
        {
            _logger.LogWarning("Skipping reminder email — no email on file for member.");
            return false;
        }
        var rendered = await _templates.RenderReminderAsync(campaign, memberName, memberEmail, memberPhone);
        if (rendered == null)
        {
            _logger.LogWarning("Skipping reminder email — registration_reminder template not configured for campaign {CampaignId}", campaign.Id);
            return false;
        }
        // For reminders we use the member's email as the To (template might not have form_data),
        // overriding whatever the template's to_override placeholder resolved to.
        var toEmail = string.IsNullOrWhiteSpace(rendered.ToEmail) ? memberEmail : rendered.ToEmail;
        var (fromEmail, fromName) = await ResolveSenderAsync(campaign.Id, rendered.SenderId);
        var (cc, bcc) = await ResolveCcBccAsync(campaign.Id, rendered);

        var attachments = LoadTemplateAttachments(rendered);
        var sent = attachments.Count > 0
            ? await _email.SendEmailWithAttachmentsAsync(toEmail, rendered.ToName, rendered.Subject, rendered.BodyHtml, attachments, fromEmail, fromName, cc, bcc)
            : await _email.SendEmailAsync(toEmail, rendered.ToName, rendered.Subject, rendered.BodyHtml, fromEmail, fromName, cc, bcc);
        if (!sent)
            _logger.LogWarning("Reminder email to {Email} was not sent.", toEmail);
        return sent;
    }

    /// <summary>
    /// Loads the template's custom attachments from disk. Stored paths are relative to
    /// the uploads root (same content root the upload controller writes to). A missing
    /// or unreadable file is skipped with a warning — it never blocks the email.
    /// </summary>
    private List<(string Filename, byte[] Bytes)> LoadTemplateAttachments(RenderedEmail rendered)
    {
        var result = new List<(string, byte[])>();
        if (rendered.Attachments == null || rendered.Attachments.Count == 0) return result;

        // Trailing separator so the prefix check can't be fooled by a sibling dir like "uploads-x".
        var uploadRoot = System.IO.Path.GetFullPath(System.IO.Path.Combine(_env.ContentRootPath, "uploads"))
            .TrimEnd(System.IO.Path.DirectorySeparatorChar) + System.IO.Path.DirectorySeparatorChar;
        foreach (var att in rendered.Attachments)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(att.Path)) continue;
                var fullPath = System.IO.Path.GetFullPath(System.IO.Path.Combine(
                    uploadRoot, att.Path.Replace('/', System.IO.Path.DirectorySeparatorChar)));
                // Stored paths come from the admin UI, but guard against traversal anyway.
                if (!fullPath.StartsWith(uploadRoot, StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogWarning("Skipping template attachment with out-of-root path: {Path}", att.Path);
                    continue;
                }
                if (!File.Exists(fullPath))
                {
                    _logger.LogWarning("Skipping template attachment — file not found: {Path}", att.Path);
                    continue;
                }
                var name = string.IsNullOrWhiteSpace(att.Name) ? System.IO.Path.GetFileName(fullPath) : att.Name;
                result.Add((name, File.ReadAllBytes(fullPath)));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read template attachment {Path}; sending without it.", att.Path);
            }
        }
        return result;
    }

    private async Task<bool> SendRenderedAsync(string trigger, Registration reg, Campaign campaign, RenderContext? extra, string logContext)
    {
        var rendered = await _templates.RenderAsync(campaign.Id, trigger, reg, campaign, extra);
        if (rendered == null)
        {
            // RenderAsync returns null both when the template is intentionally OFF and when
            // it is misconfigured (empty subject/body). Distinguish them so the reconciliation
            // worker retries only genuine failures — a disabled template is terminal ("skipped").
            var tpl = await _templates.GetByCampaignAndTriggerAsync(campaign.Id, trigger);
            if (tpl != null && !tpl.IsActive)
            {
                _logger.LogInformation(
                    "Skipping {LogContext} email for registration {RegId}: template '{Trigger}' is turned off.",
                    logContext, reg.Id, trigger);
                await RecordOutcomeAsync(campaign.Id, reg.Id, trigger, "", null, "skipped",
                    $"Template '{trigger}' is turned off.");
                return false;
            }

            _logger.LogWarning(
                "Skipping {LogContext} email for registration {RegId}: template '{Trigger}' is missing or has empty subject/body.",
                logContext, reg.Id, trigger);
            await RecordOutcomeAsync(campaign.Id, reg.Id, trigger, "", null, "failed",
                $"Template '{trigger}' missing or has empty subject/body.");
            return false;
        }
        if (string.IsNullOrWhiteSpace(rendered.ToEmail))
        {
            _logger.LogWarning(
                "Skipping {LogContext} email for registration {RegId}: no email could be resolved from form_data.",
                logContext, reg.Id);
            await RecordOutcomeAsync(campaign.Id, reg.Id, trigger, "", rendered.Subject, "failed",
                "No recipient email could be resolved from form_data.");
            return false;
        }

        var (fromEmail, fromName) = await ResolveSenderAsync(campaign.Id, rendered.SenderId);
        var (cc, bcc) = await ResolveCcBccAsync(campaign.Id, rendered);

        // When the template has "Attach Filled Form as PDF" on, generate a PDF of the
        // registrant's answers and send it as an attachment. PDF failure never blocks
        // the email — fall back to sending without the attachment.
        byte[]? pdf = null;
        if (rendered.AttachFilledFormPdf)
        {
            try { pdf = _invoice.GenerateFilledFormPdf(reg, campaign); }
            catch (Exception ex) { _logger.LogWarning(ex, "Filled-form PDF generation failed for registration {RegId}; sending without attachment.", reg.Id); }
        }

        // Assemble attachments: the optional filled-form PDF first, then the template's
        // custom attachments loaded from disk (missing files are skipped, never blocking).
        var attachments = new List<(string Filename, byte[] Bytes)>();
        if (pdf is { Length: > 0 })
        {
            var fileName = $"Registration-{(reg.Id.Length >= 8 ? reg.Id[..8].ToUpperInvariant() : reg.Id)}.pdf";
            attachments.Add((fileName, pdf));
        }
        attachments.AddRange(LoadTemplateAttachments(rendered));

        bool sent;
        if (attachments.Count > 0)
        {
            sent = await _email.SendEmailWithAttachmentsAsync(
                rendered.ToEmail, rendered.ToName, rendered.Subject, rendered.BodyHtml,
                attachments, fromEmail, fromName, cc, bcc);
        }
        else
        {
            sent = await _email.SendEmailAsync(
                rendered.ToEmail, rendered.ToName, rendered.Subject, rendered.BodyHtml,
                fromEmail, fromName, cc, bcc);
        }

        if (!sent)
            _logger.LogWarning("{LogContext} email to {Email} for registration {RegId} was not sent.", logContext, rendered.ToEmail, reg.Id);

        await RecordOutcomeAsync(campaign.Id, reg.Id, trigger, rendered.ToEmail, rendered.Subject,
            sent ? "sent" : "failed",
            sent ? null : "Brevo send returned false — see BrevoService logs for HTTP status / exception.");
        return sent;
    }
}
