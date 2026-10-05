using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("user_campaign_access")]
public class UserCampaignAccess
{
    [Column("user_id")]
    [MaxLength(36)]
    public string UserId { get; set; } = string.Empty;

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    // Navigation
    public User User { get; set; } = null!;
    public Campaign Campaign { get; set; } = null!;
}
