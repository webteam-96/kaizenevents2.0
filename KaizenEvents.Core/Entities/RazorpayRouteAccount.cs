using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Razorpay Route linked-account record. Mirrors <see cref="CashfreeKyc"/> but stores
/// Razorpay's own `acc_xxxxxxxxxxxxxx` ID and bank details (for admin reference).
///
/// Unlike Cashfree where we call the Vendor API ourselves, the admin creates the linked
/// account in Razorpay's dashboard manually, then pastes the resulting account_id here.
/// The actual money split happens at order-create time via the `transfers` array.
/// </summary>
[Table("razorpay_route_accounts")]
public class RazorpayRouteAccount
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Razorpay's linked-account identifier — format `acc_XXXXXXXXXXXXXX`.</summary>
    [Required]
    [Column("account_id")]
    [MaxLength(50)]
    public string AccountId { get; set; } = string.Empty;

    /// <summary>"commission" | "settlement".</summary>
    [Required]
    [Column("role")]
    [MaxLength(20)]
    public string Role { get; set; } = string.Empty;

    /// <summary>Friendly name for the linked account.</summary>
    [Required]
    [Column("name")]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [Column("email")]
    [MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [Column("phone")]
    [MaxLength(20)]
    public string Phone { get; set; } = string.Empty;

    [Column("account_holder")]
    [MaxLength(255)]
    public string? AccountHolder { get; set; }

    /// <summary>AES-encrypted bank account number (optional — for admin reference only).</summary>
    [Column("account_number", TypeName = "text")]
    public string? AccountNumber { get; set; }

    [Column("account_number_masked")]
    [MaxLength(20)]
    public string? AccountNumberMasked { get; set; }

    [Column("ifsc")]
    [MaxLength(20)]
    public string? Ifsc { get; set; }

    [Column("pan")]
    [MaxLength(10)]
    public string? Pan { get; set; }

    [Column("gst")]
    [MaxLength(20)]
    public string? Gst { get; set; }

    /// <summary>'active' | 'inactive' | 'pending' — admin-set; not pulled from Razorpay.</summary>
    [Required]
    [Column("status")]
    [MaxLength(40)]
    public string Status { get; set; } = "ACTIVE";

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("submitted_at")]
    public DateTime? SubmittedAt { get; set; }

    [Column("verified_at")]
    public DateTime? VerifiedAt { get; set; }

    /// <summary>
    /// True for the single Razorpay Linked Account that represents Kaizen's house share.
    /// Auto-applied at <see cref="DefaultPercentage"/> on every Razorpay event; cannot be
    /// picked as a per-event split row. Only one row in the table may be TRUE.
    /// </summary>
    [Column("is_default_kaizen_vendor")]
    public bool IsDefaultKaizenVendor { get; set; } = false;

    /// <summary>
    /// Global percentage of order amount routed to the Kaizen default Razorpay Linked
    /// Account on every Razorpay event. Only meaningful when
    /// <see cref="IsDefaultKaizenVendor"/> is true.
    /// </summary>
    [Column("default_percentage", TypeName = "decimal(5,2)")]
    public decimal? DefaultPercentage { get; set; }

    /// <summary>Razorpay-returned stakeholder id from POST /v2/accounts/{id}/stakeholders (e.g. "sth_xxx").</summary>
    [Column("stakeholder_id")]
    [MaxLength(50)]
    public string? StakeholderId { get; set; }

    /// <summary>Razorpay-returned product id from POST /v2/accounts/{id}/products (e.g. "acc_prd_xxx").</summary>
    [Column("product_id")]
    [MaxLength(50)]
    public string? ProductId { get; set; }

    /// <summary>Required by Razorpay v2 /accounts API.</summary>
    [Column("legal_business_name")]
    [MaxLength(255)]
    public string? LegalBusinessName { get; set; }

    /// <summary>Razorpay v2 business_type — individual | proprietorship | private_limited | etc.</summary>
    [Column("business_type")]
    [MaxLength(50)]
    public string? BusinessType { get; set; }

    /// <summary>Raw latest Razorpay v2 API response for KYC-failure debugging.</summary>
    [Column("razorpay_json", TypeName = "json")]
    public string? RazorpayJson { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
