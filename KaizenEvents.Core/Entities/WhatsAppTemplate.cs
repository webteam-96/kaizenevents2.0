using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Per-campaign WhatsApp templates — the WhatsApp counterpart of <see cref="EmailTemplate"/>.
/// One per trigger, auto-seeded at campaign creation. Unlike email (free subject + body),
/// WhatsApp Business only sends *pre-approved* Interakt/Meta templates, so this row does NOT
/// hold message text: it maps a trigger to an approved template name plus the ordered values
/// that fill the template's {{1}}, {{2}}, … variables. Each body value may embed the same
/// ${...} placeholders the email templates use (resolved from form_data + campaign at send time).
/// </summary>
[Table("whatsapp_templates")]
public class WhatsAppTemplate
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    /// <summary>
    /// One of: registration_confirmed | payment_received | payment_otp | registration_reminder.
    /// Unique per (campaign_id, trigger) — enforced by index in DbContext.
    /// </summary>
    [Column("trigger")]
    [MaxLength(64)]
    public string Trigger { get; set; } = string.Empty;

    /// <summary>
    /// When false this trigger's WhatsApp message is never sent. Opt-in by default (false),
    /// since WhatsApp messages are billed and need an approved template configured first.
    /// </summary>
    [Column("is_active")]
    public bool IsActive { get; set; } = false;

    /// <summary>The approved Interakt/Meta template name (e.g. "registration_confirmed"). Empty = not configured → never sends.</summary>
    [Column("template_name")]
    [MaxLength(255)]
    public string TemplateName { get; set; } = string.Empty;

    /// <summary>WhatsApp template language code (Interakt "languageCode"). Defaults to "en".</summary>
    [Column("language_code")]
    [MaxLength(10)]
    public string LanguageCode { get; set; } = "en";

    /// <summary>Dialing country code (digits, no +) used to build the full phone number. Defaults to "91" (India).</summary>
    [Column("country_code")]
    [MaxLength(10)]
    public string CountryCode { get; set; } = "91";

    /// <summary>
    /// JSON-encoded ordered list of body-variable value expressions, mapping to the approved
    /// template's {{1}}, {{2}}, … in order. Each entry may contain ${...} placeholders.
    /// </summary>
    [Column("body_values", TypeName = "json")]
    public string? BodyValues { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
}
