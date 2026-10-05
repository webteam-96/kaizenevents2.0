using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Per-campaign email templates. Each campaign gets 4 of these (one per trigger),
/// auto-seeded at campaign creation. Admin can customise subject, body, CC, BCC,
/// and the attach-PDF flag from the form-builder UI.
/// </summary>
[Table("email_templates")]
public class EmailTemplate
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
    /// When false, this trigger's email is never sent (admin turned it off from the
    /// template card / editor). Defaults to true so existing templates keep sending.
    /// A disabled template is also exempt from the campaign-activation "subject + body
    /// required" gate.
    /// </summary>
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("subject")]
    [MaxLength(500)]
    public string Subject { get; set; } = string.Empty;

    /// <summary>Rich-HTML body produced by the TipTap editor. Placeholders like ${name} embedded as plain text.</summary>
    [Column("body_html", TypeName = "longtext")]
    public string BodyHtml { get; set; } = string.Empty;

    /// <summary>Optional override; when null/empty the registrant's resolved email is used.</summary>
    [Column("to_override")]
    [MaxLength(254)]
    public string? ToOverride { get; set; }

    /// <summary>JSON-encoded list of CC recipients. Each entry may contain placeholders.</summary>
    [Column("cc_emails", TypeName = "json")]
    public string? CcEmails { get; set; }

    /// <summary>JSON-encoded list of BCC recipients. Each entry may contain placeholders.</summary>
    [Column("bcc_emails", TypeName = "json")]
    public string? BccEmails { get; set; }

    [Column("reply_to")]
    [MaxLength(254)]
    public string? ReplyTo { get; set; }

    /// <summary>
    /// Optional per-template "From" sender — a verified DKIM <see cref="EmailSender"/> id.
    /// When set + verified it overrides the campaign's notification-settings sender for this
    /// template; when null the campaign default (then the global Brevo sender) is used.
    /// </summary>
    [Column("email_sender_id")]
    [MaxLength(36)]
    public string? EmailSenderId { get; set; }

    /// <summary>When true, generate a Filled-Form PDF and attach it to the email.</summary>
    [Column("attach_filled_form_pdf")]
    public bool AttachFilledFormPdf { get; set; } = false;

    /// <summary>
    /// JSON-encoded list of custom attachments uploaded via /api/uploads/email-attachment:
    /// [{name, path, size, content_type}]. Path is relative to the uploads root.
    /// </summary>
    [Column("attachments", TypeName = "json")]
    public string? Attachments { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
}
