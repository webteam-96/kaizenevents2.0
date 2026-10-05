using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("contact_inquiries")]
public class ContactInquiry
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("contact_name")]
    [MaxLength(255)]
    public string ContactName { get; set; } = string.Empty;

    [Column("mobile_number")]
    [MaxLength(20)]
    public string MobileNumber { get; set; } = string.Empty;

    [Column("email")]
    [MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Column("club_name")]
    [MaxLength(255)]
    public string ClubName { get; set; } = string.Empty;

    [Column("district")]
    [MaxLength(255)]
    public string District { get; set; } = string.Empty;

    [Column("designation")]
    [MaxLength(255)]
    public string Designation { get; set; } = string.Empty;

    [Column("purpose", TypeName = "text")]
    public string Purpose { get; set; } = string.Empty;

    [Column("estimated_registrants")]
    [MaxLength(50)]
    public string EstimatedRegistrants { get; set; } = string.Empty;

    [Column("event_date")]
    [MaxLength(50)]
    public string EventDate { get; set; } = string.Empty;

    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = "new";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
