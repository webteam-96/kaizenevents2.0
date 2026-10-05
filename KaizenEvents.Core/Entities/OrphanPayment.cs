using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("orphan_payments")]
public class OrphanPayment
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("type")]
    [MaxLength(50)]
    public string Type { get; set; } = "orphan_external";

    [Column("gateway_payment_id")]
    [MaxLength(255)]
    public string? GatewayPaymentId { get; set; }

    [Column("gateway_payment_request_id")]
    [MaxLength(255)]
    public string? GatewayPaymentRequestId { get; set; }

    [Column("amount", TypeName = "decimal(12,2)")]
    public decimal Amount { get; set; } = 0.00m;

    [Column("buyer_name")]
    [MaxLength(255)]
    public string? BuyerName { get; set; }

    [Column("buyer_email")]
    [MaxLength(254)]
    public string? BuyerEmail { get; set; }

    [Column("buyer_phone")]
    [MaxLength(20)]
    public string? BuyerPhone { get; set; }

    [Column("purpose", TypeName = "text")]
    public string? Purpose { get; set; }

    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = "needs_review";

    [Column("raw_payload", TypeName = "json")]
    public string? RawPayload { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
