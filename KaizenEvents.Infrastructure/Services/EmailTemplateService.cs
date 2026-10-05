using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

public class EmailTemplateService : IEmailTemplateService
{
    private readonly IEmailTemplateRepository _repo;
    private readonly IRegistrationRepository _registrations;
    private readonly ICampaignRepository _campaigns;
    private readonly ILogger<EmailTemplateService> _logger;

    // ${name} or ${field:Some Label} — capture the inside
    private static readonly Regex PlaceholderRegex = new(
        @"\$\{(?<expr>[^}]+)\}",
        RegexOptions.Compiled);

    public EmailTemplateService(
        IEmailTemplateRepository repo,
        IRegistrationRepository registrations,
        ICampaignRepository campaigns,
        ILogger<EmailTemplateService> logger)
    {
        _repo          = repo;
        _registrations = registrations;
        _campaigns     = campaigns;
        _logger        = logger;
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    public Task<List<EmailTemplate>> GetByCampaignIdAsync(string campaignId)
        => _repo.GetByCampaignIdAsync(campaignId);

    public Task<EmailTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger)
        => _repo.GetByCampaignAndTriggerAsync(campaignId, trigger);

    // ── Update ────────────────────────────────────────────────────────────────

    public async Task<EmailTemplate> UpdateAsync(string id, UpdateEmailTemplateRequest req)
    {
        var t = await _repo.GetByIdAsync(id)
                ?? throw new InvalidOperationException($"Email template {id} not found.");
        t.Subject              = req.Subject;
        t.BodyHtml             = req.BodyHtml;
        t.ToOverride           = string.IsNullOrWhiteSpace(req.ToOverride) ? null : req.ToOverride;
        t.CcEmails             = req.Cc != null  ? JsonSerializer.Serialize(req.Cc)  : null;
        t.BccEmails            = req.Bcc != null ? JsonSerializer.Serialize(req.Bcc) : null;
        t.ReplyTo              = string.IsNullOrWhiteSpace(req.ReplyTo) ? null : req.ReplyTo;
        t.EmailSenderId        = string.IsNullOrWhiteSpace(req.EmailSenderId) ? null : req.EmailSenderId;
        t.AttachFilledFormPdf  = req.AttachFilledFormPdf;
        t.Attachments          = req.Attachments is { Count: > 0 } ? JsonSerializer.Serialize(req.Attachments) : null;
        t.IsActive             = req.IsActive;
        t.UpdatedAt            = DateTime.UtcNow;
        return await _repo.UpdateAsync(t);
    }

    // ── Seed defaults ─────────────────────────────────────────────────────────

    public async Task SeedDefaultsAsync(string campaignId)
    {
        var existing = await _repo.GetByCampaignIdAsync(campaignId);
        var have = existing.Select(t => t.Trigger).ToHashSet();
        var now = DateTime.UtcNow;
        var toCreate = new List<EmailTemplate>();
        foreach (var trigger in IEmailTemplateService.Triggers)
        {
            if (have.Contains(trigger)) continue;
            var (subj, body) = DefaultsFor(trigger);
            toCreate.Add(new EmailTemplate
            {
                Id          = Guid.NewGuid().ToString(),
                CampaignId  = campaignId,
                Trigger     = trigger,
                Subject     = subj,
                BodyHtml    = body,
                CreatedAt   = now,
                UpdatedAt   = now
            });
        }
        if (toCreate.Count > 0)
            await _repo.CreateManyAsync(toCreate);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    public async Task<RenderedEmail?> RenderAsync(
        string campaignId, string trigger, Registration registration, Campaign campaign, RenderContext? extra = null)
    {
        var template = await _repo.GetByCampaignAndTriggerAsync(campaignId, trigger);
        // Skip when disabled (admin turned this email off) or when subject/body is empty.
        if (template == null || !template.IsActive ||
            string.IsNullOrWhiteSpace(template.Subject) || string.IsNullOrWhiteSpace(template.BodyHtml))
            return null;

        var values = BuildValueMap(registration, campaign, extra);
        return RenderTemplate(template, values);
    }

    public async Task<RenderedEmail?> RenderPreviewAsync(string campaignId, string trigger)
    {
        var template = await _repo.GetByCampaignAndTriggerAsync(campaignId, trigger);
        if (template == null || string.IsNullOrWhiteSpace(template.Subject) || string.IsNullOrWhiteSpace(template.BodyHtml))
            return null;

        // Try most-recent registration for sample data; if none, use dummy values
        var regs = await _registrations.GetByCampaignIdAsync(campaignId);
        var sample = regs.OrderByDescending(r => r.CreatedAt).FirstOrDefault();
        var campaign = await _campaigns.GetByIdAsync(campaignId);

        Dictionary<string, string> values;
        if (sample != null && campaign != null)
        {
            values = BuildValueMap(sample, campaign, new RenderContext("RCPT-PREVIEW-12345678", "123456"));
        }
        else
        {
            values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["name"]             = "John Doe",
                ["email"]            = "john.doe@example.com",
                ["phone"]            = "+91 98765 43210",
                ["event_name"]       = "Sample Event",
                ["organization"]     = "Sample Organization",
                ["amount"]           = "Rs. 1,500.00",
                ["invoice_number"]   = "INV-20260518-PREVIEW1",
                ["registration_id"]  = "PREVIEW0",
                ["registration_date"]= FormatIst(DateTime.UtcNow, "dd MMM yyyy, hh:mm tt"),
                ["payment_status"]   = "completed",
                ["receipt_number"]   = "RCPT-PREVIEW-12345678",
                ["otp"]              = "123456",
                ["payment_id"]       = "pay_PREVIEW123456",
                ["event_date"]       = DateTime.UtcNow.AddDays(7).ToString("dd MMM yyyy", CultureInfo.InvariantCulture)
            };
        }

        return RenderTemplate(template, values);
    }

    public async Task<RenderedEmail?> RenderReminderAsync(Campaign campaign, string memberName, string memberEmail, string memberPhone)
    {
        var template = await _repo.GetByCampaignAndTriggerAsync(campaign.Id, EmailTemplateTrigger.RegistrationReminder);
        // Skip when disabled (admin turned this email off) or when subject/body is empty.
        if (template == null || !template.IsActive ||
            string.IsNullOrWhiteSpace(template.Subject) || string.IsNullOrWhiteSpace(template.BodyHtml))
            return null;

        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["name"]              = string.IsNullOrWhiteSpace(memberName)  ? "Member"             : memberName,
            ["email"]             = memberEmail ?? "",
            ["phone"]             = memberPhone ?? "",
            ["event_name"]        = campaign.Name ?? "",
            ["organization"]      = campaign.OrganizationName ?? "",
            ["registration_date"] = FormatIst(DateTime.UtcNow, "dd MMM yyyy, hh:mm tt"),
            ["event_date"]        = campaign.StartDate?.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) ?? "",
            // Members don't have a registration yet, so these are empty placeholders
            ["amount"]            = "",
            ["invoice_number"]    = "",
            ["registration_id"]   = "",
            ["payment_status"]    = "",
            ["receipt_number"]    = "",
            ["otp"]               = "",
            ["payment_id"]        = ""
        };
        return RenderTemplate(template, values);
    }

    // ── Activation gate ───────────────────────────────────────────────────────

    public async Task<List<string>> GetIncompleteTemplatesAsync(string campaignId)
    {
        var existing = await _repo.GetByCampaignIdAsync(campaignId);
        var byTrigger = existing.ToDictionary(t => t.Trigger);
        var incomplete = new List<string>();
        foreach (var trigger in IEmailTemplateService.Triggers)
        {
            // A disabled template is exempt — it won't send, so it needn't have subject/body.
            if (byTrigger.TryGetValue(trigger, out var t) && !t.IsActive)
                continue;

            if (t == null ||
                string.IsNullOrWhiteSpace(t.Subject) ||
                string.IsNullOrWhiteSpace(t.BodyHtml))
            {
                incomplete.Add(trigger);
            }
        }
        return incomplete;
    }

    // ── Internals: value-map + substitution ───────────────────────────────────

    private static Dictionary<string, string> BuildValueMap(
        Registration reg, Campaign campaign, RenderContext? extra)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // Resolve name/email/phone from form_data using campaign.form_config
        var (regName, regEmail, regPhone) = ResolveContactFromForm(reg, campaign);

        map["name"]              = regName;
        map["email"]             = regEmail;
        map["phone"]             = regPhone;
        map["event_name"]        = campaign.Name ?? "";
        map["organization"]      = campaign.OrganizationName ?? "";
        map["amount"]            = $"Rs. {reg.TotalAmount:N2}";
        map["invoice_number"]    = reg.InvoiceNumber ?? "";
        map["registration_id"]   = reg.RegistrationNumber ??
                                   (reg.Id.Length >= 8 ? reg.Id[..8].ToUpperInvariant() : reg.Id.ToUpperInvariant());
        map["registration_date"] = FormatIst(reg.CreatedAt, "dd MMM yyyy, hh:mm tt");
        map["payment_status"]    = reg.PaymentStatus.ToString().ToLowerInvariant();
        map["receipt_number"]    = extra?.ReceiptNumber ?? reg.ReceiptNumber ?? "";
        map["otp"]               = extra?.Otp ?? reg.OtpCode ?? "";
        map["payment_id"]        = reg.GatewayPaymentId ?? "";
        if (campaign.StartDate.HasValue)
            map["event_date"]    = campaign.StartDate.Value.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);
        else
            map["event_date"]    = "";

        // Per-form-field values: keyed under `field:<label>` for ${field:Label} placeholders
        if (!string.IsNullOrWhiteSpace(reg.FormData) && !string.IsNullOrWhiteSpace(campaign.FormConfig))
        {
            try
            {
                using var dataDoc = JsonDocument.Parse(reg.FormData);
                using var cfgDoc  = JsonDocument.Parse(campaign.FormConfig);

                // A question the registrant never saw resolves to nothing, even if an answer
                // they switched away from is still sitting in form_data on an older row.
                var hidden = FieldVisibility.AllHiddenFieldIds(campaign.FormConfig, reg.FormData);

                if (cfgDoc.RootElement.TryGetProperty("fields", out var fieldsEl) &&
                    fieldsEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var field in fieldsEl.EnumerateArray())
                    {
                        var label = field.TryGetProperty("label", out var lEl) ? lEl.GetString() : null;
                        var id    = field.TryGetProperty("id",    out var iEl) ? iEl.GetString() : null;
                        var type  = field.TryGetProperty("type",  out var tEl) ? tEl.GetString() : null;
                        if (string.IsNullOrWhiteSpace(label) || string.IsNullOrWhiteSpace(id)) continue;

                        if (hidden.Contains(id))
                        {
                            map[$"field:{label}"] = "";
                            map[$"field:{id}"]    = "";
                            continue;
                        }

                        // Choice answers are stored as slugs; show the label the
                        // registrant picked, not "thana_west".
                        var val = FormContact.ReadFieldValue(dataDoc.RootElement, field, id, type);
                        map[$"field:{label}"] = val;
                        map[$"field:{id}"]    = val;
                    }
                }
            }
            catch { /* ignore parse errors */ }
        }

        return map;
    }

    /// <summary>
    /// Formats a UTC DateTime in India Standard Time (UTC+5:30). DB datetimes don't
    /// carry a Kind, so we explicitly treat them as UTC. Avoids platform-specific
    /// timezone-id lookups ("India Standard Time" on Windows vs "Asia/Kolkata" on
    /// Linux) which are a deployment-time foot-gun.
    /// </summary>
    private static string FormatIst(DateTime utc, string format)
    {
        var ist = DateTime.SpecifyKind(utc, DateTimeKind.Utc).AddHours(5).AddMinutes(30);
        return ist.ToString(format, CultureInfo.InvariantCulture);
    }

    private static RenderedEmail RenderTemplate(EmailTemplate template, Dictionary<string, string> values)
    {
        string Substitute(string? input) =>
            string.IsNullOrEmpty(input) ? "" : PlaceholderRegex.Replace(input, m =>
            {
                var expr = m.Groups["expr"].Value.Trim();
                return values.TryGetValue(expr, out var v) ? v : "";
            });

        var cc  = ParseList(template.CcEmails).Select(Substitute).Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
        var bcc = ParseList(template.BccEmails).Select(Substitute).Where(s => !string.IsNullOrWhiteSpace(s)).ToList();

        var toEmail = Substitute(template.ToOverride);
        if (string.IsNullOrWhiteSpace(toEmail))
            values.TryGetValue("email", out toEmail!);
        // Empty toName is fine — Brevo / mail clients show just the address.
        // "Guest" would mislabel every recipient if the name lookup ever returns blank.
        var toName = values.TryGetValue("name", out var n) ? (n ?? "") : "";

        return new RenderedEmail(
            Subject              : Substitute(template.Subject),
            BodyHtml             : Substitute(template.BodyHtml),
            ToEmail              : toEmail ?? "",
            ToName               : toName,
            Cc                   : cc,
            Bcc                  : bcc,
            ReplyTo              : string.IsNullOrWhiteSpace(template.ReplyTo) ? null : Substitute(template.ReplyTo),
            AttachFilledFormPdf  : template.AttachFilledFormPdf,
            SenderId             : template.EmailSenderId,
            Attachments          : EmailAttachment.ParseList(template.Attachments));
    }

    private static List<string> ParseList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }

    // ── Form-data lookup: same logic as RegistrationEmailService ─────────────

    /// <summary>
    /// Who this registration belongs to. Delegated to the shared resolver so the email,
    /// the WhatsApp message and the sheet always name the same person.
    /// </summary>
    private static (string Name, string Email, string Phone) ResolveContactFromForm(
        Registration reg, Campaign campaign) =>
        FormContact.Resolve(campaign.FormConfig, reg.FormData);

    // ── Defaults — admin can customize via the editor; these are the seed values ──

    private static (string Subject, string Body) DefaultsFor(string trigger) => trigger switch
    {
        EmailTemplateTrigger.RegistrationConfirmed => (
            "Registration Confirmed — ${event_name}",
            @"<h2>Registration Confirmed</h2>
<p>Hello ${name},</p>
<p>Your registration for <strong>${event_name}</strong> is confirmed.</p>
<p style='line-height:1.8;'>
  <strong style='color:#666;'>Registration ID:</strong> <span style='font-family:monospace;'>${registration_id}</span><br>
  <strong style='color:#666;'>Amount:</strong> ${amount}<br>
  <strong style='color:#666;'>Invoice:</strong> <span style='font-family:monospace;'>${invoice_number}</span>
</p>
<p>Organized by <strong>${organization}</strong>.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>"),

        EmailTemplateTrigger.PaymentReceived => (
            "Payment Received — ${event_name}",
            @"<h2>Payment Received</h2>
<p>Hello ${name},</p>
<p>We've received your cash payment at the venue for <strong>${event_name}</strong>. Your registration is now fully confirmed.</p>
<p style='line-height:1.8;'>
  <strong style='color:#666;'>Receipt Number:</strong> <span style='font-family:monospace;'>${receipt_number}</span><br>
  <strong style='color:#666;'>Registration ID:</strong> <span style='font-family:monospace;'>${registration_id}</span><br>
  <strong style='color:#666;'>Amount Paid:</strong> ${amount}<br>
  <strong style='color:#666;'>Invoice:</strong> <span style='font-family:monospace;'>${invoice_number}</span>
</p>
<p>Please keep this email as your proof of payment.</p>
<p>Organized by <strong>${organization}</strong>.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>"),

        EmailTemplateTrigger.PaymentOtp => (
            "Your OTP for ${event_name}",
            @"<h2>Your Registration OTP</h2>
<p>Hello ${name},</p>
<p>Your registration for <strong>${event_name}</strong> is submitted. Show this OTP at the venue to complete payment:</p>
<h1 style='background:#f4f4f4;padding:20px;text-align:center;letter-spacing:8px;font-family:monospace;color:#7c3aed;'>${otp}</h1>
<p><strong>Amount due:</strong> ${amount}</p>
<p>This OTP expires in 10 minutes.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— ${organization}</p>"),

        EmailTemplateTrigger.RegistrationReminder => (
            "Reminder: Register for ${event_name}",
            @"<h2>Reminder: Register for ${event_name}</h2>
<p>Hello ${name},</p>
<p>This is a friendly reminder to register for <strong>${event_name}</strong>.</p>
<p style='margin:24px 0;'>
  <a href='#' style='background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;'>Register Now</a>
</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— ${organization}</p>"),

        _ => ("", "")
    };
}
