using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("audit_logs")]
public class AuditLog
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("timestamp")]
    public DateTime Timestamp { get; set; }

    [Column("event_type")]
    [MaxLength(50)]
    public string EventType { get; set; } = string.Empty;

    [Column("user_id")]
    [MaxLength(36)]
    public string? UserId { get; set; }

    [Column("user_email")]
    [MaxLength(254)]
    public string? UserEmail { get; set; }

    [Column("ip_address")]
    [MaxLength(45)]
    public string? IpAddress { get; set; }

    [Column("user_agent", TypeName = "text")]
    public string? UserAgent { get; set; }

    [Column("resource_type")]
    [MaxLength(50)]
    public string? ResourceType { get; set; }

    [Column("resource_id")]
    [MaxLength(36)]
    public string? ResourceId { get; set; }

    [Column("action_details", TypeName = "json")]
    public string? ActionDetails { get; set; }

    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = "success";

    [Column("error_message", TypeName = "text")]
    public string? ErrorMessage { get; set; }

    [Column("integrity_hash")]
    [MaxLength(64)]
    public string IntegrityHash { get; set; } = string.Empty;
}
