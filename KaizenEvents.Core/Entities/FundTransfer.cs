using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Entities;

[Table("fund_transfers")]
public class FundTransfer
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

    [Column("amount", TypeName = "decimal(12,2)")]
    public decimal Amount { get; set; }

    [Column("status")]
    public TransferStatus Status { get; set; } = TransferStatus.PendingApproval;

    [Column("bank_account_id")]
    [MaxLength(36)]
    public string? BankAccountId { get; set; }

    [Column("bank_account_snapshot", TypeName = "json")]
    public string? BankAccountSnapshot { get; set; }

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("notes", TypeName = "text")]
    public string? Notes { get; set; }

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

    [Column("completed_by")]
    [MaxLength(36)]
    public string? CompletedBy { get; set; }

    [Column("completed_at")]
    public DateTime? CompletedAt { get; set; }

    [Column("transaction_reference")]
    [MaxLength(255)]
    public string? TransactionReference { get; set; }

    [Column("transfer_date")]
    [MaxLength(50)]
    public string? TransferDate { get; set; }

    [Column("notification_sent")]
    public bool NotificationSent { get; set; } = false;

    [Column("notification_sent_at")]
    public DateTime? NotificationSentAt { get; set; }

    [Column("notification_email")]
    [MaxLength(254)]
    public string? NotificationEmail { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
    public User Creator { get; set; } = null!;
}
