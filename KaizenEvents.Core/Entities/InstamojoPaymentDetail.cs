using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Outgoing customer payments logged by Kaizen finance against an Instamojo purpose.
/// Faithful copy of Rotary's <c>instamojo_payment_details</c> table (one row per
/// manual payout entry — used to track "Paid" totals on the per-purpose dashboard
/// and the Pending Customer Payout reports).
/// </summary>
[Table("instamojo_payment_details")]
public class InstamojoPaymentDetail
{
    [Column("pk_payment_id")]                     public int       Id           { get; set; }
    [Column("fk_title_id")]                       public string?   FkTitleId    { get; set; }   // VARCHAR in DB (preserved)
    [Column("amount")]                            public decimal?  Amount       { get; set; }
    [Column("createddate")]                       public DateTime? CreatedDate  { get; set; }
    [Column("modifieddate")]                      public DateTime? ModifiedDate { get; set; }
    [Column("remark")]                            public string?   Remark       { get; set; }
    [Column("isdeleted")]                         public int?      IsDeleted    { get; set; }
    [Column("fk_purposetitle_bank_details_id")]   public int?      FkBankDetailsId { get; set; }
}
