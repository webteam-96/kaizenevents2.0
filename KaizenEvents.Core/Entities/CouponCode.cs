using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("coupon_codes")]
public class CouponCode
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public int Id { get; set; }

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("code")]
    [MaxLength(100)]
    public string Code { get; set; } = string.Empty;

    /// <summary>'percentage', 'fixed', or 'formula'</summary>
    [Column("discount_type")]
    [MaxLength(20)]
    public string DiscountType { get; set; } = string.Empty;

    [Column("discount_value", TypeName = "decimal(12,2)")]
    public decimal DiscountValue { get; set; }

    /// <summary>
    /// Cap: the discount never exceeds this many rupees, however large the total.
    /// Null = no cap. Chiefly for percentage coupons ("10% off, up to ₹500").
    /// </summary>
    [Column("max_discount_amount", TypeName = "decimal(12,2)")]
    public decimal? MaxDiscountAmount { get; set; }

    /// <summary>
    /// Floor: the discount is lifted to at least this many rupees, even when the
    /// percentage works out to less. Null = no floor. Still clamped to the subtotal,
    /// so it can never push the payable amount below zero.
    /// </summary>
    [Column("min_discount_amount", TypeName = "decimal(12,2)")]
    public decimal? MinDiscountAmount { get; set; }

    [Column("formula", TypeName = "text")]
    public string? Formula { get; set; }

    /// <summary>Admin's own note about the offer. Never shown to registrants.</summary>
    [Column("description")]
    [MaxLength(255)]
    public string? Description { get; set; }

    [Column("valid_from")]
    public DateTime? ValidFrom { get; set; }

    [Column("valid_until")]
    public DateTime? ValidUntil { get; set; }

    [Column("usage_limit")]
    public int? UsageLimit { get; set; }

    [Column("current_usage")]
    public int CurrentUsage { get; set; } = 0;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("conditions", TypeName = "json")]
    public string? Conditions { get; set; }

    /// <summary>
    /// The user who created the coupon. Coupons are visible only to their creator
    /// and to super admins, so this drives the list filter — a null value (rows
    /// created before this column existed) is treated as super-admin-only.
    /// </summary>
    [Column("created_by")]
    [MaxLength(36)]
    public string? CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
}
