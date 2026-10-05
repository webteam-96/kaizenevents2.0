using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("notification_logs")]
public class NotificationLog
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("registration_id")]
    [MaxLength(36)]
    public string? RegistrationId { get; set; }

    /// <summary>'email' or 'whatsapp'</summary>
    [Column("type")]
    [MaxLength(20)]
    public string Type { get; set; } = string.Empty;

    [Column("recipient")]
    [MaxLength(254)]
    public string Recipient { get; set; } = string.Empty;

    [Column("subject")]
    [MaxLength(500)]
    public string? Subject { get; set; }

    /// <summary>'sent' or 'failed'</summary>
    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = string.Empty;

    [Column("error", TypeName = "text")]
    public string? Error { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
}
