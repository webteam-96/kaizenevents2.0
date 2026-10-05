using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Entities;

[Table("change_requests")]
public class ChangeRequest
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("request_number")]
    [MaxLength(50)]
    public string RequestNumber { get; set; } = string.Empty;

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("campaign_name")]
    [MaxLength(255)]
    public string CampaignName { get; set; } = string.Empty;

    [Column("organization_name")]
    [MaxLength(255)]
    public string OrganizationName { get; set; } = string.Empty;

    [Column("request_type")]
    public ChangeRequestType RequestType { get; set; }

    [Column("current_value", TypeName = "json")]
    public string? CurrentValue { get; set; }

    [Column("new_value", TypeName = "json")]
    public string NewValue { get; set; } = "{}";

    [Column("reason", TypeName = "text")]
    public string Reason { get; set; } = string.Empty;

    [Column("status")]
    public ChangeRequestStatus Status { get; set; } = ChangeRequestStatus.Pending;

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("approved_by")]
    [MaxLength(36)]
    public string? ApprovedBy { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [Column("approval_notes", TypeName = "text")]
    public string? ApprovalNotes { get; set; }

    [Column("rejected_by")]
    [MaxLength(36)]
    public string? RejectedBy { get; set; }

    [Column("rejected_at")]
    public DateTime? RejectedAt { get; set; }

    [Column("rejection_reason", TypeName = "text")]
    public string? RejectionReason { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
    public User Creator { get; set; } = null!;
}
