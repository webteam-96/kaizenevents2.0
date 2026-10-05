using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Entities;

[Table("campaign_members")]
public class CampaignMember
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("name")]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Column("mobile")]
    [MaxLength(20)]
    public string Mobile { get; set; } = string.Empty;

    [Column("email")]
    [MaxLength(254)]
    public string? Email { get; set; }

    [Column("custom_fields", TypeName = "json")]
    public string CustomFields { get; set; } = "{}";

    [Column("status")]
    public MemberStatus Status { get; set; } = MemberStatus.Unregistered;

    [Column("registration_id")]
    [MaxLength(36)]
    public string? RegistrationId { get; set; }

    [Column("registered_at")]
    public DateTime? RegisteredAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    // Navigation
    public Campaign Campaign { get; set; } = null!;
    public Registration? Registration { get; set; }
    public User Creator { get; set; } = null!;
}
