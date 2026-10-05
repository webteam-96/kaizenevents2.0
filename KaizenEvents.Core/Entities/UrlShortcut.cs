using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("url_shortcuts")]
public class UrlShortcut
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("short_code")]
    [MaxLength(20)]
    public string ShortCode { get; set; } = string.Empty;

    [Column("original_url", TypeName = "text")]
    public string OriginalUrl { get; set; } = string.Empty;

    [Column("campaign_id")]
    [MaxLength(36)]
    public string? CampaignId { get; set; }

    /// <summary>'registration' or 'kiosk'</summary>
    [Column("url_type")]
    [MaxLength(50)]
    public string? UrlType { get; set; }

    [Column("clicks")]
    public int Clicks { get; set; } = 0;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("last_clicked")]
    public DateTime? LastClicked { get; set; }

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    // Navigation
    public Campaign? Campaign { get; set; }
    public User Creator { get; set; } = null!;
}
