using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Per-transaction archive row for Instamojo payments. Faithful copy of the old
/// Kaizen Infotech project's `instamojo_datadetails` table — column names + types
/// preserved so finance team's existing reports work unchanged.
///
/// `LinkedPaymentUuid` (bridge column) maps this archive row to the operational
/// `payments.id` in our new system.
/// </summary>
[Table("instamojo_datadetails")]
public class InstamojoDataDetail
{
    [Column("pk_instamojodetail_id")]
    public int Id { get; set; }

    [Column("Payment_ID")]
    public string? PaymentId { get; set; }

    [Column("Transaction_Date")]
    public DateTime? TransactionDate { get; set; }

    [Column("Transaction_Type")]
    public string? TransactionType { get; set; }

    [Column("Payout_ID")]
    public string? PayoutId { get; set; }

    [Column("Payout_date")]
    public DateTime? PayoutDate { get; set; }

    [Column("Title")]
    public string? Title { get; set; }

    [Column("Buyer_Name")]
    public string? BuyerName { get; set; }

    [Column("Buyer_Email_Address")]
    public string? BuyerEmailAddress { get; set; }

    [Column("Buyer_Phone_Number")]
    public string? BuyerPhoneNumber { get; set; }

    [Column("Quantity_Sold")]
    public int? QuantitySold { get; set; }

    [Column("Sale_currency")]
    public string? SaleCurrency { get; set; }

    [Column("Sale_Amount")]
    public int? SaleAmount { get; set; }

    [Column("Affiliate_Fees")]
    public int? AffiliateFees { get; set; }

    [Column("Instamojo_Fees")]
    public float? InstamojoFees { get; set; }

    [Column("Total_Tax")]
    public float? TotalTax { get; set; }

    [Column("Related_case")]
    public string? RelatedCase { get; set; }

    [Column("CreatedDate")]
    public DateTime? CreatedDate { get; set; }

    [Column("ModifiedDate")]
    public DateTime? ModifiedDate { get; set; }

    [Column("payment_instrument")]
    public string? PaymentInstrument { get; set; }

    [Column("payment_type")]
    public string? PaymentType { get; set; }

    [Column("payout_status")]
    public string? PayoutStatus { get; set; }

    [Column("payout_flag")]
    public int PayoutFlag { get; set; }

    [Column("fk_title_id")]
    public uint FkTitleId { get; set; }    // unsigned zerofill in DB

    [Column("isdeleted")]
    public int? IsDeleted { get; set; }

    [Column("refund_status")]
    public uint? RefundStatus { get; set; }    // unsigned zerofill in DB

    [Column("billing_instrument")]
    public string? BillingInstrument { get; set; }

    /// <summary>FK bridge to operational `payments.id` (UUID).</summary>
    [Column("linked_payment_uuid")]
    public string? LinkedPaymentUuid { get; set; }
}
