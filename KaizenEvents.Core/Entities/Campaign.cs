using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Entities;

[Table("campaigns")]
public class Campaign
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("name")]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Column("slug")]
    [MaxLength(255)]
    public string Slug { get; set; } = string.Empty;

    [Column("organization_name")]
    [MaxLength(255)]
    public string OrganizationName { get; set; } = string.Empty;

    [Column("campaign_type")]
    public CampaignType CampaignType { get; set; } = CampaignType.Open;

    [Column("fund_collection_mode")]
    public FundCollectionMode? FundCollectionMode { get; set; }

    [Column("payment_collection_method")]
    [MaxLength(20)]
    public string PaymentCollectionMethod { get; set; } = "online";

    [Column("kiosk_enabled")]
    public bool KioskEnabled { get; set; } = false;

    [Column("show_on_homepage")]
    public bool ShowOnHomepage { get; set; } = true;

    /// <summary>Whether to show the organization name on the public registration form.</summary>
    [Column("show_organization_name")]
    public bool ShowOrganizationName { get; set; } = true;

    /// <summary>Whether to show the event description on the public registration form.</summary>
    [Column("show_description")]
    public bool ShowDescription { get; set; } = true;

    /// <summary>Whether to show the event logo on the public registration form.</summary>
    [Column("show_event_logo")]
    public bool ShowEventLogo { get; set; } = true;

    [Column("event_logo", TypeName = "text")]
    public string? EventLogo { get; set; }

    [Column("logo_url", TypeName = "text")]
    public string? LogoUrl { get; set; }

    [Column("has_landing_page")]
    public bool HasLandingPage { get; set; } = true;

    [Column("registration_enabled")]
    public bool RegistrationEnabled { get; set; } = true;

    [Column("use_external_form")]
    public bool UseExternalForm { get; set; } = false;

    [Column("external_form_url", TypeName = "text")]
    public string? ExternalFormUrl { get; set; }

    [Column("status")]
    public CampaignStatus Status { get; set; } = CampaignStatus.Draft;

    [Column("start_date")]
    public DateTime? StartDate { get; set; }

    [Column("end_date")]
    public DateTime? EndDate { get; set; }

    [Column("registration_start_date")]
    public DateTime? RegistrationStartDate { get; set; }

    [Column("registration_end_date")]
    public DateTime? RegistrationEndDate { get; set; }

    [Column("payment_gateway")]
    public PaymentGateway PaymentGateway { get; set; } = PaymentGateway.Razorpay;

    [Column("payment_account_id")]
    [MaxLength(36)]
    public string? PaymentAccountId { get; set; }

    [Column("payment_purpose")]
    [MaxLength(255)]
    public string? PaymentPurpose { get; set; }

    /// <summary>
    /// When false, the event is free: no payment is ever collected (online or offline),
    /// no payment account / fund-collection mode is required, and every registration is
    /// confirmed at ₹0. Defaults to true so existing paid campaigns are unaffected.
    /// </summary>
    [Column("payment_enabled")]
    public bool PaymentEnabled { get; set; } = true;

    /// <summary>
    /// Master switch for WhatsApp notifications on this campaign. When false, no WhatsApp
    /// message is sent for any trigger, regardless of the per-template settings. Defaults
    /// false (opt-in). Surfaced in — and written by — both the Event Settings → WhatsApp tab
    /// and the Form Builder → Integrations "WhatsApp Messages" toggle, which share this flag.
    /// </summary>
    [Column("whatsapp_enabled")]
    public bool WhatsappEnabled { get; set; } = false;

    [Column("max_registrations")]
    public int? MaxRegistrations { get; set; }

    [Column("current_registrations")]
    public int CurrentRegistrations { get; set; } = 0;

    // ── Custom human-facing ID sequences ─────────────────────────────────────
    /// <summary>When set, new registrations get RegistrationNumber = prefix + counter (e.g. "RID3170").</summary>
    [Column("registration_id_prefix")]
    [MaxLength(20)]
    public string? RegistrationIdPrefix { get; set; }

    [Column("registration_next_number")]
    public int RegistrationNextNumber { get; set; } = 1;

    /// <summary>When set, new registrations get InvoiceNumber = prefix + counter instead of INV-date-random.</summary>
    [Column("invoice_prefix")]
    [MaxLength(20)]
    public string? InvoicePrefix { get; set; }

    [Column("invoice_next_number")]
    public int InvoiceNextNumber { get; set; } = 1;

    [Column("total_revenue", TypeName = "decimal(12,2)")]
    public decimal TotalRevenue { get; set; } = 0.00m;

    [Column("total_transferred", TypeName = "decimal(12,2)")]
    public decimal TotalTransferred { get; set; } = 0.00m;

    [Column("description", TypeName = "text")]
    public string? Description { get; set; }

    [Column("form_config", TypeName = "json")]
    public string? FormConfig { get; set; }

    [Column("landing_page_config", TypeName = "json")]
    public string? LandingPageConfig { get; set; }

    [Column("payment_config", TypeName = "json")]
    public string? PaymentConfig { get; set; }

    [Column("closed_group_config", TypeName = "json")]
    public string? ClosedGroupConfig { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    [Column("archived_at")]
    public DateTime? ArchivedAt { get; set; }

    // Navigation
    public User Creator { get; set; } = null!;
    public PaymentAccount? PaymentAccount { get; set; }
    public ICollection<UserCampaignAccess> UserAccess { get; set; } = new List<UserCampaignAccess>();
}
