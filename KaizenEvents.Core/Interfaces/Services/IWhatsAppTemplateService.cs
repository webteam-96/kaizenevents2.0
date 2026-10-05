using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Per-campaign WhatsApp templates: the WhatsApp counterpart of <see cref="IEmailTemplateService"/>.
/// Same 4 triggers, auto-seeded at campaign creation (edit-only, no create endpoint). Because
/// WhatsApp only sends pre-approved templates, a "render" produces an approved template name +
/// an ordered list of resolved body values, not a message body.
/// </summary>
public interface IWhatsAppTemplateService
{
    /// <summary>Every trigger a campaign gets a row for.</summary>
    public static readonly string[] Triggers = new[]
    {
        WhatsAppTemplateTrigger.CommonConfirmation,
        WhatsAppTemplateTrigger.CommonConfirmationDetailed,
        WhatsAppTemplateTrigger.RegistrationConfirmed,
        WhatsAppTemplateTrigger.PaymentReceived,
        WhatsAppTemplateTrigger.PaymentOtp,
        WhatsAppTemplateTrigger.RegistrationReminder
    };

    /// <summary>
    /// The ways a campaign can send its registration confirmation — either of the shared standard
    /// templates, or the campaign's own approved one. At most one is ever active: activating any
    /// one through <see cref="UpdateAsync"/> switches the others off.
    /// </summary>
    public static readonly string[] ConfirmationTriggers = new[]
    {
        WhatsAppTemplateTrigger.CommonConfirmation,
        WhatsAppTemplateTrigger.CommonConfirmationDetailed,
        WhatsAppTemplateTrigger.RegistrationConfirmed
    };

    /// <summary>
    /// The standard template's variables, fixed in this order: {{1}} name, {{2}} event name,
    /// {{3}} email. Not admin-editable — the approved template's wording depends on them.
    /// </summary>
    public static readonly string[] CommonBodyValues = new[] { "${name}", "${event_name}", "${email}" };

    /// <summary>
    /// The detailed standard template's variables, fixed in this order: {{1}} name, {{2}} event
    /// name, {{3}} email, {{4}} registration type, {{5}} amount paid. Registration type is read
    /// from a form field literally labelled "Registration Type"; events that don't have one send
    /// blank for {{4}} rather than failing — the field is optional per event, not in the template.
    /// Not admin-editable, same reason as <see cref="CommonBodyValues"/>.
    /// </summary>
    public static readonly string[] CommonBodyValuesDetailed = new[]
    {
        "${name}", "${event_name}", "${email}", "${field:Registration Type}", "${amount}"
    };

    /// <summary>
    /// The template name that will actually be sent for this trigger. For
    /// <see cref="WhatsAppTemplateTrigger.CommonConfirmation"/> a blank per-campaign value falls
    /// back to the server-wide <c>Interakt:CommonTemplateName</c> setting, so the standard
    /// template can be named once and apply to every event.
    /// </summary>
    string EffectiveTemplateName(string trigger, string? templateName);

    Task<List<WhatsAppTemplate>> GetByCampaignIdAsync(string campaignId);

    /// <summary>Every template row across every campaign — backs the cross-campaign management screen.</summary>
    Task<List<WhatsAppTemplate>> GetAllAsync();

    Task<WhatsAppTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger);

    /// <summary>Update one template. Trigger and campaign_id are immutable.</summary>
    Task<WhatsAppTemplate> UpdateAsync(string id, UpdateWhatsAppTemplateRequest req);

    /// <summary>Seed the default templates for a newly-created campaign. Idempotent.</summary>
    Task SeedDefaultsAsync(string campaignId);

    /// <summary>
    /// Render for sending: substitutes placeholders in the configured body values against the
    /// registration + campaign, and resolves the recipient phone from form_data. Returns null when
    /// the template is missing, disabled, or has no template name configured.
    /// </summary>
    Task<RenderedWhatsApp?> RenderAsync(string campaignId, string trigger, Registration registration, Campaign campaign, RenderContext? extra = null);

    /// <summary>Render against sample data for the Preview dialog (most-recent registration, else dummy values).</summary>
    Task<RenderedWhatsApp?> RenderPreviewAsync(string campaignId, string trigger);

    /// <summary>Render the registration_reminder template against a member (no form_data yet).</summary>
    Task<RenderedWhatsApp?> RenderReminderAsync(Campaign campaign, string memberName, string memberPhone);
}

public static class WhatsAppTemplateTrigger
{
    /// <summary>
    /// The shared standard confirmation template, identical across every event:
    /// "Hello {{1}}, your registration for {{2}} has been confirmed… sent to {{3}}."
    /// WhatsApp-only — it has no email counterpart, and it fires on the same registration-confirmed
    /// moment as <see cref="RegistrationConfirmed"/>, taking precedence when active.
    /// </summary>
    public const string CommonConfirmation = "common_confirmation";

    /// <summary>
    /// A second shared standard template, identical across every event, that adds registration
    /// type and amount paid to the plain <see cref="CommonConfirmation"/> wording. Mutually
    /// exclusive with it and with <see cref="RegistrationConfirmed"/> — see
    /// <see cref="ConfirmationTriggers"/>.
    /// </summary>
    public const string CommonConfirmationDetailed = "common_confirmation_detailed";

    // Same string values as EmailTemplateTrigger — the trigger vocabulary is shared across channels.
    public const string RegistrationConfirmed = "registration_confirmed";
    public const string PaymentReceived       = "payment_received";
    public const string PaymentOtp            = "payment_otp";
    public const string RegistrationReminder  = "registration_reminder";
}

/// <summary>Body of PUT /api/campaigns/{id}/whatsapp-templates/{trigger}.</summary>
public record UpdateWhatsAppTemplateRequest(
    string TemplateName,
    List<string>? BodyValues,
    string? LanguageCode = "en",
    string? CountryCode = "91",
    // When false, this trigger's WhatsApp message is not sent. Defaults false (opt-in).
    bool IsActive = false);

/// <summary>Fully-resolved WhatsApp message ready to hand to Interakt.</summary>
public record RenderedWhatsApp(
    string Phone,
    string CountryCode,
    string TemplateName,
    string LanguageCode,
    List<string> BodyValues,
    string ToName);
