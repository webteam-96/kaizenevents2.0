using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("integration_settings")]
public class IntegrationSetting
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Unique integration type key, e.g. 'google_sheets'.</summary>
    [Column("type")]
    [MaxLength(50)]
    public string Type { get; set; } = string.Empty;

    [Column("credentials_json", TypeName = "text")]
    public string? CredentialsJson { get; set; }

    [Column("config", TypeName = "json")]
    public string? Config { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
