using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Per-transaction archive row for Cashfree payments. Same shape as
/// `instamojo_datadetails` but fee column renamed to `Cashfree_Fees`.
/// </summary>
[Table("cashfree_datadetails")]
public class CashfreeDataDetail
{
    [Column("pk_cashfreedetail_id")]
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

    [Column("Cashfree_Fees")]
    public float? CashfreeFees { get; set; }

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
    public int FkTitleId { get; set; }

    [Column("isdeleted")]
    public int? IsDeleted { get; set; }

    [Column("refund_status")]
    public int? RefundStatus { get; set; }

    [Column("billing_instrument")]
    public string? BillingInstrument { get; set; }

    /// <summary>FK bridge to operational `payments.id` (UUID).</summary>
    [Column("linked_payment_uuid")]
    public string? LinkedPaymentUuid { get; set; }
}
