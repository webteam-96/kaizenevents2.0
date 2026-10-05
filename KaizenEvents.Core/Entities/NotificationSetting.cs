using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("notification_settings")]
public class NotificationSetting
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("email_enabled")]
    public bool EmailEnabled { get; set; } = true;

    [Column("whatsapp_enabled")]
    public bool WhatsappEnabled { get; set; } = false;

    [Column("email_subject")]
    [MaxLength(500)]
    public string? EmailSubject { get; set; }

    [Column("whatsapp_template_name")]
    [MaxLength(255)]
    public string? WhatsappTemplateName { get; set; }

    [Column("sender_email")]
    [MaxLength(254)]
    public string? SenderEmail { get; set; }

    [Column("sender_name")]
    [MaxLength(255)]
    public string? SenderName { get; set; }

    /// <summary>
    /// The per-campaign DKIM <see cref="EmailSender"/> selected as the From address.
    /// Resolved at send time and used only when its linked domain is verified
    /// (see EmailSenderResolver); null falls back to the global Brevo sender.
    /// </summary>
    [Column("email_sender_id")]
    [MaxLength(36)]
    public string? EmailSenderId { get; set; }

    [Column("resend_api_key", TypeName = "text")]
    public string? ResendApiKey { get; set; }

    [Column("cc_emails", TypeName = "json")]
    public string? CcEmails { get; set; }

    [Column("bcc_emails", TypeName = "json")]
    public string? BccEmails { get; set; }

    [Column("email_template", TypeName = "json")]
    public string? EmailTemplate { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
}
