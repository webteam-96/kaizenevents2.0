using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Bank account(s) attached to an Instamojo payment title (purpose).
/// Faithful copy of Rotary's <c>instamojo_paymenttitle_bank_details</c> table.
/// Multiple rows per <see cref="InstamojoPaymentTitle"/>; soft-deleted via <c>isdeleted</c>.
/// </summary>
[Table("instamojo_paymenttitle_bank_details")]
public class InstamojoPurposeBankDetails
{
    [Column("pk_purposetitle_bank_details_id")] public int       Id            { get; set; }
    [Column("fk_title_id")]                     public int?      FkTitleId     { get; set; }
    [Column("account_name")]                    public string?   AccountName   { get; set; }
    [Column("bank_name")]                       public string?   BankName      { get; set; }
    [Column("account_number")]                  public string?   AccountNumber { get; set; }
    [Column("bank_branch")]                     public string?   BankBranch    { get; set; }
    [Column("ifsc_code")]                       public string?   IfscCode      { get; set; }
    [Column("createdby")]                       public int?      CreatedBy     { get; set; }
    [Column("createddate")]                     public DateTime? CreatedDate   { get; set; }
    [Column("modifiedby")]                      public int?      ModifiedBy    { get; set; }
    [Column("modifieddate")]                    public DateTime? ModifiedDate  { get; set; }
    [Column("deletedby")]                       public int?      DeletedBy     { get; set; }
    [Column("deleteddate")]                     public DateTime? DeletedDate   { get; set; }
    [Column("isdeleted")]                       public int?      IsDeleted     { get; set; }
}
