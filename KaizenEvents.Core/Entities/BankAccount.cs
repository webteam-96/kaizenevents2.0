using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("bank_accounts")]
public class BankAccount
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("account_name")]
    [MaxLength(255)]
    public string AccountName { get; set; } = string.Empty;

    /// <summary>AES-encrypted account number.</summary>
    [Column("account_number", TypeName = "text")]
    public string AccountNumber { get; set; } = string.Empty;

    [Column("account_number_masked")]
    [MaxLength(20)]
    public string AccountNumberMasked { get; set; } = string.Empty;

    [Column("ifsc_code")]
    [MaxLength(20)]
    public string IfscCode { get; set; } = string.Empty;

    [Column("bank_name")]
    [MaxLength(255)]
    public string BankName { get; set; } = string.Empty;

    [Column("notification_email")]
    [MaxLength(254)]
    public string NotificationEmail { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    // Navigation
    public Campaign Campaign { get; set; } = null!;
    public User Creator { get; set; } = null!;
}
