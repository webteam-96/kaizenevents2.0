using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Entities;

[Table("users")]
public class User
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("email")]
    [MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Column("name")]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Column("role")]
    public UserRole Role { get; set; } = UserRole.OrgAdmin;

    [Column("hashed_password")]
    [MaxLength(255)]
    public string HashedPassword { get; set; } = string.Empty;

    [Column("can_approve_transfers")]
    public bool CanApproveTransfers { get; set; } = false;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public ICollection<UserCampaignAccess> CampaignAccess { get; set; } = new List<UserCampaignAccess>();
}
