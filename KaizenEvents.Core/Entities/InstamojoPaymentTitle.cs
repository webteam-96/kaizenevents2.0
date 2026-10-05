using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Master "Title" lookup for Instamojo archive. One row per campaign that has
/// at least one Instamojo payment. Title = campaign name (denormalized, matches old project).
/// </summary>
[Table("instamojo_paymenttitle")]
public class InstamojoPaymentTitle
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
