using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Per-campaign vendor split row. A row's share of the order amount is determined
/// by <see cref="SplitType"/>:
///   - "percentage" → <see cref="Value"/> percent of the order amount
///   - "fixed"      → flat ₹ amount (<see cref="Value"/>)
///   - "residual"   → whatever remains after Kaizen default + all other rows
///
/// Exactly one row per (campaign, gateway) must have SplitType = "residual". The
/// Kaizen default vendor (cashfree_kyc.is_default_kaizen_vendor = TRUE) is applied
/// automatically on every Cashfree order at its global default_percentage and
/// must NOT appear here.
///
/// The vendor_id can reference either cashfree_kyc.id (gateway = 'cashfree') OR
/// a razorpay_route_accounts.id (gateway = 'razorpay'). Instamojo doesn't use
/// splits.
/// </summary>
[Table("campaign_vendor_splits")]
public class CampaignVendorSplit
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Required]
    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    /// <summary>'cashfree' | 'razorpay' — determines which vendor table this row references.</summary>
    [Required]
    [Column("gateway")]
    [MaxLength(16)]
    public string Gateway { get; set; } = string.Empty;

    /// <summary>
    /// FK to cashfree_kyc.id (when Gateway = 'cashfree') or razorpay_route_accounts.id (when 'razorpay').
    /// Not a real DB FK because the target table varies; integrity is enforced in the service layer.
    /// </summary>
    [Required]
    [Column("vendor_id")]
    [MaxLength(36)]
    public string VendorId { get; set; } = string.Empty;

    /// <summary>
    /// One of: "percentage", "fixed", "residual".
    /// Exactly one row per (campaign, gateway) must be "residual".
    /// </summary>
    [Required]
    [Column("split_type")]
    [MaxLength(20)]
    public string SplitType { get; set; } = "percentage";

    /// <summary>
    /// Meaning depends on <see cref="SplitType"/>:
    ///   - "percentage" → 0 &lt; value &lt; 100
    ///   - "fixed"      → ₹ amount &gt; 0
    ///   - "residual"   → NULL (computed at payment time)
    /// </summary>
    [Column("value", TypeName = "decimal(10,2)")]
    public decimal? Value { get; set; }

    /// <summary>Display order in the admin UI.</summary>
    [Column("sort_order")]
    public int SortOrder { get; set; } = 0;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
}
