using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Vendor KYC record for Cashfree Easy Split (vendor splits).
/// Each KaizenManaged event has up to 2 vendors:
///   - role = "commission"  → 2.95% lands in Kaizen's commission a/c
///   - role = "settlement"  → 97.05% lands in Kaizen's settlement a/c (or organizer's, depending)
///
/// Vendor ID format: {event_slug}_{role}, e.g. "marathon-2026_commission".
/// One row per (campaign_id, role) pair when filled per-event. Or campaign_id NULL
/// for "global" reusable vendors (e.g. a single Kaizen Commission a/c reused across events).
/// </summary>
[Table("cashfree_kyc")]
public class CashfreeKyc
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Cashfree's vendor identifier (e.g. "marathon-2026_commission").</summary>
    [Required]
    [Column("vendor_id")]
    [MaxLength(100)]
    public string VendorId { get; set; } = string.Empty;

    /// <summary>Linked campaign (event). NULL for global vendors reused across events.</summary>
    [Column("campaign_id")]
    [MaxLength(36)]
    public string? CampaignId { get; set; }

    /// <summary>"commission" or "settlement".</summary>
    [Required]
    [Column("role")]
    [MaxLength(20)]
    public string Role { get; set; } = string.Empty;

    /// <summary>Friendly name for the vendor (e.g. "Kaizen Commission Account").</summary>
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

    [Required]
    [Column("account_holder")]
    [MaxLength(255)]
    public string AccountHolder { get; set; } = string.Empty;

    /// <summary>AES-encrypted bank account number.</summary>
    [Required]
    [Column("account_number", TypeName = "text")]
    public string AccountNumber { get; set; } = string.Empty;

    /// <summary>Last 4 digits, plaintext, for display in admin UI.</summary>
    [Column("account_number_masked")]
    [MaxLength(20)]
    public string AccountNumberMasked { get; set; } = string.Empty;

    [Required]
    [Column("ifsc")]
    [MaxLength(20)]
    public string Ifsc { get; set; } = string.Empty;

    /// <summary>Permanent Account Number (10 chars, e.g. ABCDE1234F). Plaintext.</summary>
    [Required]
    [Column("pan")]
    [MaxLength(10)]
    public string Pan { get; set; } = string.Empty;

    /// <summary>GSTIN — optional, depends on Cashfree's current requirements.</summary>
    [Column("gst")]
    [MaxLength(20)]
    public string? Gst { get; set; }

    /// <summary>
    /// Cashfree-reported KYC status. Values include:
    ///   PENDING                — vendor created, KYC in progress
    ///   ACTIVE                 — verified and ready
    ///   BANK_VALIDATION_FAILED — penny-drop failed, vendor must re-fill
    ///   REJECTED               — KYC rejected
    /// </summary>
    [Required]
    [Column("status")]
    [MaxLength(40)]
    public string Status { get; set; } = "PENDING";

    /// <summary>Our internal active flag — admin can disable a vendor without deleting.</summary>
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>Raw Cashfree API response (latest), for debugging KYC failures.</summary>
    [Column("cashfree_json", TypeName = "json")]
    public string? CashfreeJson { get; set; }

    /// <summary>
    /// One-time onboarding token. Vendor-onboarding URL: /vendor-onboarding/{token}.
    /// Set when admin generates the share link; cleared after vendor submits.
    /// </summary>
    [Column("onboarding_token")]
    [MaxLength(64)]
    public string? OnboardingToken { get; set; }

    [Column("submitted_at")]
    public DateTime? SubmittedAt { get; set; }

    [Column("verified_at")]
    public DateTime? VerifiedAt { get; set; }

    /// <summary>
    /// True for the single vendor that represents Kaizen's house share. Auto-applied
    /// to every Cashfree event at <see cref="DefaultPercentage"/>; cannot be picked
    /// in per-event split rows. Only one row in the table may have this set to TRUE.
    /// </summary>
    [Column("is_default_kaizen_vendor")]
    public bool IsDefaultKaizenVendor { get; set; } = false;

    /// <summary>
    /// Global percentage of order amount routed to the Kaizen default vendor on every
    /// Cashfree event. Only meaningful when <see cref="IsDefaultKaizenVendor"/> is true.
    /// </summary>
    [Column("default_percentage", TypeName = "decimal(5,2)")]
    public decimal? DefaultPercentage { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
