using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Email-template feature: per-campaign customisable templates for 4 triggers.
/// Replaces the hard-coded HTML in transactional emails. Templates are auto-seeded
/// with defaults when a campaign is created — there's no "create" endpoint, only edit.
/// </summary>
public interface IEmailTemplateService
{
    /// <summary>The 4 trigger names. Order is what GetByCampaignIdAsync returns.</summary>
    public static readonly string[] Triggers = new[]
    {
        EmailTemplateTrigger.RegistrationConfirmed,
        EmailTemplateTrigger.PaymentReceived,
        EmailTemplateTrigger.PaymentOtp,
        EmailTemplateTrigger.RegistrationReminder
    };

    Task<List<EmailTemplate>> GetByCampaignIdAsync(string campaignId);

    Task<EmailTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger);

    /// <summary>Update one template's content. Trigger and campaign_id are immutable.</summary>
    Task<EmailTemplate> UpdateAsync(string id, UpdateEmailTemplateRequest req);

    /// <summary>
    /// Seed the 4 default templates for a newly-created campaign. Idempotent — if any
    /// already exist, leaves them alone.
    /// </summary>
    Task SeedDefaultsAsync(string campaignId);

    /// <summary>
    /// Render a template for sending: substitutes placeholders against the registration's
    /// form_data + campaign + system fields. Returns null if template is missing or has empty subject/body.
    /// </summary>
    Task<RenderedEmail?> RenderAsync(string campaignId, string trigger, Registration registration, Campaign campaign, RenderContext? extra = null);

    /// <summary>
    /// Render a template against sample data for the Preview dialog. If a real
    /// registration exists for the campaign, uses the most-recent one; else falls
    /// back to dummy placeholders. Returns null if template missing/empty.
    /// </summary>
    Task<RenderedEmail?> RenderPreviewAsync(string campaignId, string trigger);

    /// <summary>
    /// Render the registration_reminder template against a CampaignMember (who hasn't
    /// registered yet — so there's no form_data). Form-field placeholders (${field:...})
    /// resolve to empty since none exist. System placeholders work normally.
    /// </summary>
    Task<RenderedEmail?> RenderReminderAsync(Campaign campaign, string memberName, string memberEmail, string memberPhone);

    /// <summary>
    /// Activation gate — returns the list of trigger names that are missing OR have
    /// empty subject/body, so the UI can prompt the admin to fix them before activating.
    /// Returns an empty list if all 4 templates pass validation.
    /// </summary>
    Task<List<string>> GetIncompleteTemplatesAsync(string campaignId);
}

public static class EmailTemplateTrigger
{
    public const string RegistrationConfirmed   = "registration_confirmed";
    public const string PaymentReceived         = "payment_received";
    public const string PaymentOtp              = "payment_otp";
    public const string RegistrationReminder    = "registration_reminder";
}

/// <summary>Body of PUT /api/campaigns/{id}/email-templates/{triggerOrId}.</summary>
public record UpdateEmailTemplateRequest(
    string Subject,
    string BodyHtml,
    string? ToOverride,
    List<string>? Cc,
    List<string>? Bcc,
    string? ReplyTo,
    bool AttachFilledFormPdf,
    string? EmailSenderId = null,
    List<EmailAttachment>? Attachments = null,
    // When false, this trigger's email is not sent. Defaults true (send) when omitted.
    bool IsActive = true);

/// <summary>
/// A custom file attachment on an email template. Path is relative to the uploads
/// root (written by POST /api/uploads/email-attachment). JsonPropertyName attributes
/// keep the DB-stored JSON snake_case regardless of serializer options.
/// </summary>
public record EmailAttachment(
    [property: System.Text.Json.Serialization.JsonPropertyName("name")]         string Name,
    [property: System.Text.Json.Serialization.JsonPropertyName("path")]         string Path,
    [property: System.Text.Json.Serialization.JsonPropertyName("size")]         long Size,
    [property: System.Text.Json.Serialization.JsonPropertyName("content_type")] string ContentType)
{
    public static List<EmailAttachment> ParseList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return System.Text.Json.JsonSerializer.Deserialize<List<EmailAttachment>>(json) ?? new(); }
        catch { return new(); }
    }
}

/// <summary>Fully-resolved email ready to hand to Brevo.</summary>
public record RenderedEmail(
    string Subject,
    string BodyHtml,
    string ToEmail,
    string ToName,
    List<string> Cc,
    List<string> Bcc,
    string? ReplyTo,
    bool AttachFilledFormPdf,
    string? SenderId = null,
    List<EmailAttachment>? Attachments = null);

/// <summary>Trigger-specific extras that aren't in the registration row.</summary>
public record RenderContext(
    string? ReceiptNumber = null,
    string? Otp = null);
