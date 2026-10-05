using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Entities;

[Table("payment_accounts")]
public class PaymentAccount
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("name")]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Column("gateway_type")]
    public PaymentGatewayType GatewayType { get; set; }

    [Column("description", TypeName = "text")]
    public string? Description { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    // Instamojo credentials (encrypted)
    [Column("instamojo_api_key", TypeName = "text")]
    public string? InstamojoApiKey { get; set; }

    [Column("instamojo_auth_token", TypeName = "text")]
    public string? InstamojoAuthToken { get; set; }

    [Column("instamojo_salt")]
    [MaxLength(255)]
    public string? InstamojoSalt { get; set; }

    [Column("instamojo_mode")]
    [MaxLength(20)]
    public string InstamojoMode { get; set; } = "sandbox";

    // Razorpay credentials (encrypted)
    [Column("razorpay_key_id")]
    [MaxLength(255)]
    public string? RazorpayKeyId { get; set; }

    [Column("razorpay_key_secret", TypeName = "text")]
    public string? RazorpayKeySecret { get; set; }

    [Column("razorpay_mode")]
    [MaxLength(20)]
    public string RazorpayMode { get; set; } = "test";

    // "route" (default — split across linked vendor accounts, today's only behavior) or
    // "single_account" (plain order, no transfers; money collects wholesale and is paid
    // out later via the existing Fund Transfer flow). Razorpay-only; ignored for other gateways.
    [Column("razorpay_settlement_mode")]
    [MaxLength(20)]
    public string RazorpaySettlementMode { get; set; } = "route";

    // Cashfree credentials (encrypted)
    [Column("cashfree_app_id", TypeName = "text")]
    public string? CashfreeAppId { get; set; }

    [Column("cashfree_secret_key", TypeName = "text")]
    public string? CashfreeSecretKey { get; set; }

    [Column("cashfree_mode")]
    [MaxLength(20)]
    public string CashfreeMode { get; set; } = "sandbox";

    // Stats
    [Column("total_transactions")]
    public int TotalTransactions { get; set; } = 0;

    [Column("total_amount_collected", TypeName = "decimal(12,2)")]
    public decimal TotalAmountCollected { get; set; } = 0.00m;

    [Column("last_transaction_at")]
    public DateTime? LastTransactionAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    // Navigation
    public User Creator { get; set; } = null!;
    public ICollection<Campaign> Campaigns { get; set; } = new List<Campaign>();
}
