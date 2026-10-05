using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("cashfree_paymenttitle")]
public class CashfreePaymentTitle
{
    [Column("pk_title_id")]      public int       Id           { get; set; }
    [Column("Title")]            public string?   Title        { get; set; }
    [Column("createddate")]      public DateTime? CreatedDate  { get; set; }
    [Column("modifieddate")]     public DateTime? ModifiedDate { get; set; }
    [Column("isdeleted")]        public int?      IsDeleted    { get; set; }
    [Column("IsActive")]         public int?      IsActive     { get; set; }
    [Column("payee")]            public string?   Payee        { get; set; }
    [Column("bank_details")]     public string?   BankDetails  { get; set; }
}
