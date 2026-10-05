using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Entities;

[Table("registrations")]
public class Registration
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("form_data", TypeName = "json")]
    public string FormData { get; set; } = "{}";

    [Column("total_amount", TypeName = "decimal(12,2)")]
    public decimal TotalAmount { get; set; } = 0.00m;

    [Column("payment_status")]
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Pending;

    [Column("registration_status")]
    public RegistrationStatus RegistrationStatus { get; set; } = RegistrationStatus.Submitted;

    [Column("payment_id")]
    [MaxLength(36)]
    public string? PaymentId { get; set; }

    [Column("gateway_payment_id")]
    [MaxLength(255)]
    public string? GatewayPaymentId { get; set; }

    [Column("invoice_number")]
    [MaxLength(50)]
    public string? InvoiceNumber { get; set; }

    /// <summary>Human-facing sequential registration number (campaign prefix + counter, e.g. "RID3170").
    /// Null when the campaign has no registration_id_prefix — displays fall back to Id[..8].</summary>
    [Column("registration_number")]
    [MaxLength(50)]
    public string? RegistrationNumber { get; set; }

    [Column("coupon_code")]
    [MaxLength(100)]
    public string? CouponCode { get; set; }

    /// <summary>
    /// Rupees taken off by <see cref="CouponCode"/>, as computed by the server at submit.
    /// Recorded per registration rather than as a running total on the coupon so the
    /// admin's usage figures are derived from what was actually charged and cannot drift.
    /// </summary>
    [Column("coupon_discount", TypeName = "decimal(12,2)")]
    public decimal CouponDiscount { get; set; } = 0.00m;

    [Column("member_id")]
    [MaxLength(36)]
    public string? MemberId { get; set; }

    [Column("source")]
    [MaxLength(50)]
    public string? Source { get; set; }

    [Column("payment_gateway")]
    [MaxLength(50)]
    public string? PaymentGateway { get; set; }

    // Additional payment adjustment fields
    [Column("additional_payment_required")]
    public bool AdditionalPaymentRequired { get; set; } = false;

    [Column("additional_payment_amount", TypeName = "decimal(12,2)")]
    public decimal? AdditionalPaymentAmount { get; set; }

    [Column("additional_payment_link", TypeName = "text")]
    public string? AdditionalPaymentLink { get; set; }

    [Column("additional_payment_gateway")]
    [MaxLength(50)]
    public string? AdditionalPaymentGateway { get; set; }

    [Column("additional_payment_request_id")]
    [MaxLength(255)]
    public string? AdditionalPaymentRequestId { get; set; }

    [Column("additional_payment_link_id")]
    [MaxLength(255)]
    public string? AdditionalPaymentLinkId { get; set; }

    [Column("refund_pending")]
    public bool RefundPending { get; set; } = false;

    [Column("refund_amount", TypeName = "decimal(12,2)")]
    public decimal? RefundAmount { get; set; }

    [Column("refund_confirmed")]
    public bool RefundConfirmed { get; set; } = false;

    [Column("refund_confirmed_at")]
    public DateTime? RefundConfirmedAt { get; set; }

    [Column("refund_confirmed_by")]
    [MaxLength(36)]
    public string? RefundConfirmedBy { get; set; }

    // Offline payment fields
    [Column("otp_code")]
    [MaxLength(10)]
    public string? OtpCode { get; set; }

    [Column("otp_expires_at")]
    public DateTime? OtpExpiresAt { get; set; }

    [Column("otp_verified")]
    public bool OtpVerified { get; set; } = false;

    [Column("cash_collected")]
    public bool CashCollected { get; set; } = false;

    [Column("cash_collected_by")]
    [MaxLength(36)]
    public string? CashCollectedBy { get; set; }

    [Column("cash_collected_at")]
    public DateTime? CashCollectedAt { get; set; }

    [Column("receipt_number")]
    [MaxLength(50)]
    public string? ReceiptNumber { get; set; }

    [Column("check_in_at")]
    public DateTime? CheckInAt { get; set; }

    [Column("checked_in_by")]
    [MaxLength(36)]
    public string? CheckedInBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Pending-payment resume flow
    /// <summary>Random token used to secure the resume-payment URL sent in reminder emails.</summary>
    [Column("payment_token")]
    [MaxLength(64)]
    public string? PaymentToken { get; set; }

    /// <summary>Timestamp when the pending-payment reminder email was sent (null = not sent).</summary>
    [Column("reminder_sent_at")]
    public DateTime? ReminderSentAt { get; set; }

    // ── Google Sheets sync state ─────────────────────────────────────────────
    /// <summary>When this registration's row was last written to the Google Sheet (null = never synced).</summary>
    [Column("synced_at")]
    public DateTime? SyncedAt { get; set; }

    /// <summary>True when an admin deleted this row directly in the Google Sheet — sync must not
    /// re-add it. The registration data itself stays in the database (still visible in reports).</summary>
    [Column("exclude_from_sheet")]
    public bool ExcludeFromSheet { get; set; } = false;

    // Navigation
    public Campaign Campaign { get; set; } = null!;
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<Refund> Refunds { get; set; } = new List<Refund>();
}
