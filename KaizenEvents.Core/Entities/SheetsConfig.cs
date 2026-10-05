using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KaizenEvents.Core.Entities;

[Table("sheets_configs")]
public class SheetsConfig
{
    [Key]
    [Column("id")]
    [MaxLength(36)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("campaign_id")]
    [MaxLength(36)]
    public string CampaignId { get; set; } = string.Empty;

    [Column("spreadsheet_id")]
    [MaxLength(255)]
    public string? SpreadsheetId { get; set; }

    [Column("spreadsheet_url", TypeName = "text")]
    public string? SpreadsheetUrl { get; set; }

    [Column("sheet_name")]
    [MaxLength(255)]
    public string SheetName { get; set; } = "Registrations";

    [Column("auto_sync")]
    public bool AutoSync { get; set; } = false;

    [Column("shared_with")]
    [MaxLength(254)]
    public string? SharedWith { get; set; }

    /// <summary>
    /// Number of data rows this app last wrote to the sheet. Lets a rebuild tell
    /// "the admin deleted every row" (count &gt; 0, sheet now empty) apart from
    /// "this sheet has never been populated" (count == 0) — without it, deleting the
    /// LAST remaining row is silently undone on the next sync.
    /// </summary>
    [Column("last_synced_row_count")]
    public int LastSyncedRowCount { get; set; } = 0;

    /// <summary>
    /// Number of generated columns this app last wrote (Registration ID, Date, one per
    /// form field, Payment Status, Amount, Payment ID). Anything to the RIGHT of this is
    /// the admin's own working area and is carried across rebuilds untouched.
    /// </summary>
    [Column("last_synced_col_count")]
    public int LastSyncedColCount { get; set; } = 0;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public Campaign Campaign { get; set; } = null!;
}
