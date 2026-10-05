using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("refunds")]
public class Refund
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("registration_id")]
    [MaxLength(36)]
    public string RegistrationId { get; set; } = string.Empty;

    [Column("amount", TypeName = "decimal(12,2)")]
    public decimal Amount { get; set; }

    [Column("reason", TypeName = "text")]
    public string Reason { get; set; } = string.Empty;

    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = "processed";

    /// <summary>Gateway refund ID.</summary>
    [Column("refund_id")]
    [MaxLength(255)]
    public string? RefundId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    // Navigation
    public Registration Registration { get; set; } = null!;
}
