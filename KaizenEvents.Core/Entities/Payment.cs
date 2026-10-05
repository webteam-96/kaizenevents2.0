using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("payments")]
public class Payment
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
    public string RegistrationId { get; set; } = string.Empty;

    [Column("amount", TypeName = "decimal(12,2)")]
    public decimal Amount { get; set; }

    [Column("currency")]
    [MaxLength(3)]
    public string Currency { get; set; } = "INR";

    [Column("gateway")]
    [MaxLength(20)]
    public string Gateway { get; set; } = string.Empty;

    [Column("payment_account_id")]
    [MaxLength(36)]
    public string? PaymentAccountId { get; set; }

    [Column("buyer_name")]
    [MaxLength(255)]
    public string BuyerName { get; set; } = string.Empty;

    [Column("buyer_email")]
    [MaxLength(254)]
    public string BuyerEmail { get; set; } = string.Empty;

    [Column("buyer_phone")]
    [MaxLength(20)]
    public string BuyerPhone { get; set; } = string.Empty;

    [Column("purpose")]
    [MaxLength(500)]
    public string? Purpose { get; set; }

    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = "pending";

    [Column("gateway_order_id")]
    [MaxLength(255)]
    public string? GatewayOrderId { get; set; }

    [Column("gateway_payment_id")]
    [MaxLength(255)]
    public string? GatewayPaymentId { get; set; }

    [Column("gateway_payment_request_id")]
    [MaxLength(255)]
    public string? GatewayPaymentRequestId { get; set; }

    /// <summary>
    /// JSON snapshot of the vendor split sent to Cashfree at order creation.
    /// Format: [{"vendor_id":"X","amount":12.34}, ...]. Null for non-split payments.
    /// </summary>
    [Column("vendor_splits_json", TypeName = "json")]
    public string? VendorSplitsJson { get; set; }

    [Column("source")]
    [MaxLength(50)]
    public string? Source { get; set; }

    // Settlement fields
    [Column("gateway_fee", TypeName = "decimal(12,4)")]
    public decimal? GatewayFee { get; set; }

    [Column("gateway_tax", TypeName = "decimal(12,4)")]
    public decimal? GatewayTax { get; set; }

    [Column("settlement_amount", TypeName = "decimal(12,2)")]
    public decimal? SettlementAmount { get; set; }

    [Column("settlement_status")]
    [MaxLength(20)]
    public string? SettlementStatus { get; set; }

    [Column("settlement_synced_at")]
    public DateTime? SettlementSyncedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [Column("paid_at")]
    public DateTime? PaidAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
    public Registration Registration { get; set; } = null!;
    public PaymentAccount? PaymentAccount { get; set; }
}
