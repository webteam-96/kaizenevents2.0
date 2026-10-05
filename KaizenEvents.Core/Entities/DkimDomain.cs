using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("dkim_domains")]
public class DkimDomain
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("domain")]
    [MaxLength(255)]
    public string Domain { get; set; } = string.Empty;

    [Column("brevo_domain_id")]
    public long? BrevoDomainId { get; set; }

    /// <summary>'pending', 'verified', or 'failed'</summary>
    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = "pending";

    [Column("dkim_records", TypeName = "json")]
    public string? DkimRecords { get; set; }

    [Column("resend_api_key", TypeName = "text")]
    public string? ResendApiKey { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [Column("created_by")]
    [MaxLength(36)]
    public string CreatedBy { get; set; } = string.Empty;

    // Navigation
    public User Creator { get; set; } = null!;
    public ICollection<EmailSender> EmailSenders { get; set; } = new List<EmailSender>();
}
