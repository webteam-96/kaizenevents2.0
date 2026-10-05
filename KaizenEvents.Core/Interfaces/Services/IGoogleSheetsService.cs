using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

public interface IGoogleSheetsService
{
    Task SyncRegistrationAsync(Registration registration, Campaign campaign);
    Task<GoogleSheetsCreateResult> CreateCampaignSheetAsync(string sheetName, string ownerEmail, string campaignName);

    /// <summary>
    /// Wipes the sheet's data rows and writes a fresh header + every completed registration's
    /// row in the campaign's current form-builder field order. Use this when the form schema
    /// changes, on the admin "Sync All" action, or as a recovery path after partial failures.
    /// One Values.Clear + one Values.Update call regardless of registration count.
    /// Rows an admin deleted directly in the sheet are respected (not re-added) unless
    /// <paramref name="forceFull"/> is true, which clears those exclusions and re-pushes everything.
    /// </summary>
    Task<int> RebuildSheetAsync(Campaign campaign, IReadOnlyCollection<Registration> registrations, bool forceFull = false);

    /// <summary>
    /// True when a form-config change moves the sheet's generated columns, i.e. when a rebuild
    /// is actually needed. Lets a form save skip rewriting the sheet for edits that leave the
    /// columns alone, so an admin working in the sheet isn't interrupted for nothing.
    /// </summary>
    bool SheetColumnsChanged(string? previousFormConfig, string? newFormConfig);

    /// <summary>
    /// Returns the spreadsheet's current display name from Google Drive.
    /// Null if Drive returns 404/403 or the call fails — caller treats it as "name unknown".
    /// </summary>
    Task<string?> GetSpreadsheetTitleAsync(string spreadsheetId);
}

public record GoogleSheetsCreateResult(bool Success, string? SpreadsheetId = null, string? SpreadsheetUrl = null, string? Error = null);
