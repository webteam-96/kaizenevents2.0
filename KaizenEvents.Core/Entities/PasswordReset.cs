using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("password_resets")]
public class PasswordReset
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("email")]
    [MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Column("reset_code")]
    [MaxLength(255)]
    public string ResetCode { get; set; } = string.Empty;

    [Column("used")]
    public bool Used { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
