using System.Text.Json;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using Google.Apis.Sheets.v4.Data;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Shared.Helpers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Google Sheets integration via the official Google API client.
/// Uses a service account (configured in appsettings.json → Google.ServiceAccountJson).
/// Row format per CLAUDE.md Section 8:
///   Registration ID, Date, Name, Email, Phone, Payment Status, Amount, Payment ID, Campaign
/// </summary>
public class GoogleSheetsService : IGoogleSheetsService
{
    private readonly ISheetsConfigRepository _sheetsConfigs;
    private readonly IRegistrationRepository _registrations;
    private readonly ILogger<GoogleSheetsService> _logger;

    private readonly SheetsService? _sheetsService;
    private readonly DriveService?  _driveService;
    private readonly bool _configured;
    private readonly string? _parentFolderId;
    private readonly string _publicBaseUrl;

    private static readonly string[] HeaderRow =
    {
        "Registration ID", "Date", "Name", "Email", "Phone",
        "Payment Status", "Amount", "Payment ID", "Campaign"
    };

    public GoogleSheetsService(
        ISheetsConfigRepository sheetsConfigs,
        IRegistrationRepository registrations,
        IConfiguration config,
        ILogger<GoogleSheetsService> logger)
    {
        _sheetsConfigs  = sheetsConfigs;
        _registrations  = registrations;
        _logger         = logger;
        _parentFolderId = config["Google:DriveParentFolderId"];
        // Sheets only auto-links absolute http(s) URLs. Relative upload paths
        // (/api/uploads/...) get prefixed with the public site base — the API is
        // mounted at /api on the same host as the frontend.
        _publicBaseUrl  = (config["App:PublicBaseUrl"] ?? config["App:FrontendUrl"] ?? "").TrimEnd('/');

        // Two ways to configure: either inline JSON in appsettings, OR a path to a JSON file
        var serviceAccountJson = config["Google:ServiceAccountJson"];
        var serviceAccountPath = config["Google:ServiceAccountJsonPath"];

        if (string.IsNullOrWhiteSpace(serviceAccountJson) && !string.IsNullOrWhiteSpace(serviceAccountPath))
        {
            try
            {
                if (File.Exists(serviceAccountPath))
                    serviceAccountJson = File.ReadAllText(serviceAccountPath);
                else
                    _logger.LogWarning("Google:ServiceAccountJsonPath file not found: {Path}", serviceAccountPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to read Google service account JSON from {Path}", serviceAccountPath);
            }
        }

        if (string.IsNullOrWhiteSpace(serviceAccountJson))
        {
            _configured = false;
            _logger.LogWarning("Google service account not configured — Sheets integration disabled");
            return;
        }

        try
        {
            // GoogleCredential.FromJson(string) was deprecated for security reasons.
            // The recommended replacement is to wrap the JSON in a stream and use
            // FromStream — same semantics, but goes through the supported path.
            using var jsonStream = new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes(serviceAccountJson));
            var credential = GoogleCredential
                .FromStream(jsonStream)
                .CreateScoped(SheetsService.Scope.Spreadsheets, DriveService.Scope.Drive);

            _sheetsService = new SheetsService(new BaseClientService.Initializer
            {
                HttpClientInitializer = credential,
                ApplicationName       = "Kaizen Events"
            });

            _driveService = new DriveService(new BaseClientService.Initializer
            {
                HttpClientInitializer = credential,
                ApplicationName       = "Kaizen Events"
            });

            _configured = true;
        }
        catch (Exception ex)
        {
            _configured = false;
            _logger.LogError(ex, "Failed to initialize Google Sheets service — credentials invalid");
        }
    }

    // ── Create a new spreadsheet for a campaign ────────────────────────────────
    // Uses Drive API to create the spreadsheet INSIDE Google.DriveParentFolderId
    // (a folder owned by a real Google user and shared with the service account as Editor).
    // This bypasses the "service account has no Drive storage" 403 error that occurs
    // when creating files at the service account's own root.
    public async Task<GoogleSheetsCreateResult> CreateCampaignSheetAsync(
        string sheetName, string ownerEmail, string campaignName)
    {
        if (!_configured || _sheetsService == null || _driveService == null)
            return new GoogleSheetsCreateResult(false, Error: "Google Sheets not configured on the server.");

        try
        {
            string spreadsheetId;

            if (!string.IsNullOrWhiteSpace(_parentFolderId))
            {
                // 1a. Create the spreadsheet via Drive API directly inside the parent folder.
                // This uses the folder owner's Drive storage (not the service account's).
                var fileMetadata = new Google.Apis.Drive.v3.Data.File
                {
                    Name     = sheetName,
                    MimeType = "application/vnd.google-apps.spreadsheet",
                    Parents  = new List<string> { _parentFolderId! }
                };

                var createReq = _driveService.Files.Create(fileMetadata);
                createReq.Fields           = "id";
                createReq.SupportsAllDrives = true;
                var createdFile = await createReq.ExecuteAsync();
                spreadsheetId = createdFile.Id;

                // 1b. Add header row + bold/grey formatting via Sheets API
                var headerValues = new ValueRange
                {
                    Values = new List<IList<object>> { HeaderRow.Cast<object>().ToList() }
                };
                var appendReq = _sheetsService.Spreadsheets.Values.Append(
                    headerValues, spreadsheetId, "A1:I1");
                appendReq.ValueInputOption = SpreadsheetsResource.ValuesResource.AppendRequest.ValueInputOptionEnum.USERENTERED;
                await appendReq.ExecuteAsync();

                // Optional: rename the first sheet tab to "Registrations" + bold the header row
                var batchUpdate = new BatchUpdateSpreadsheetRequest
                {
                    Requests = new List<Request>
                    {
                        new()
                        {
                            UpdateSheetProperties = new UpdateSheetPropertiesRequest
                            {
                                Properties = new SheetProperties { SheetId = 0, Title = "Registrations" },
                                Fields     = "title"
                            }
                        },
                        new()
                        {
                            RepeatCell = new RepeatCellRequest
                            {
                                Range = new GridRange { SheetId = 0, StartRowIndex = 0, EndRowIndex = 1 },
                                Cell  = new CellData
                                {
                                    UserEnteredFormat = new CellFormat
                                    {
                                        TextFormat      = new TextFormat { Bold = true },
                                        BackgroundColor = new Color { Red = 0.95f, Green = 0.95f, Blue = 0.95f }
                                    }
                                },
                                Fields = "userEnteredFormat(textFormat,backgroundColor)"
                            }
                        }
                    }
                };
                await _sheetsService.Spreadsheets.BatchUpdate(batchUpdate, spreadsheetId).ExecuteAsync();
            }
            else
            {
                // Fallback: legacy path — create via Sheets API directly. Works only if the
                // service account has its own Drive storage (rare; usually fails with 403).
                var spreadsheet = new Spreadsheet
                {
                    Properties = new SpreadsheetProperties { Title = sheetName },
                    Sheets = new List<Sheet>
                    {
                        new()
                        {
                            Properties = new SheetProperties { Title = "Registrations" },
                            Data = new List<GridData>
                            {
                                new()
                                {
                                    StartRow    = 0,
                                    StartColumn = 0,
                                    RowData = new List<RowData>
                                    {
                                        new()
                                        {
                                            Values = HeaderRow.Select(h => new CellData
                                            {
                                                UserEnteredValue  = new ExtendedValue { StringValue = h },
                                                UserEnteredFormat = new CellFormat
                                                {
                                                    TextFormat      = new TextFormat { Bold = true },
                                                    BackgroundColor = new Color { Red = 0.95f, Green = 0.95f, Blue = 0.95f }
                                                }
                                            }).ToList()
                                        }
                                    }
                                }
                            }
                        }
                    }
                };
                var created = await _sheetsService.Spreadsheets.Create(spreadsheet).ExecuteAsync();
                spreadsheetId = created.SpreadsheetId;
            }

            var spreadsheetUrl = $"https://docs.google.com/spreadsheets/d/{spreadsheetId}";

            // 2. Share with the organizer's email as writer (so they can view/edit too)
            if (!string.IsNullOrWhiteSpace(ownerEmail))
            {
                try
                {
                    var permission = new Google.Apis.Drive.v3.Data.Permission
                    {
                        Type         = "user",
                        Role         = "writer",
                        EmailAddress = ownerEmail
                    };

                    var permRequest = _driveService.Permissions.Create(permission, spreadsheetId);
                    permRequest.SendNotificationEmail = true;
                    permRequest.EmailMessage = $"You've been granted access to the registrations sheet for {campaignName}.";
                    await permRequest.ExecuteAsync();
                }
                catch (Exception ex)
                {
                    // Don't fail sheet creation if sharing fails — log and continue
                    _logger.LogWarning(ex, "Sheet {Id} created but failed to share with {Email}", spreadsheetId, ownerEmail);
                }
            }

            _logger.LogInformation("Created Google Sheet {Id} for campaign {Campaign} (in folder {Folder})",
                spreadsheetId, campaignName, _parentFolderId ?? "(root)");

            return new GoogleSheetsCreateResult(true, spreadsheetId, spreadsheetUrl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create Google Sheet for {Campaign}", campaignName);
            return new GoogleSheetsCreateResult(false, Error: ex.Message);
        }
    }

    // ── Fetch the spreadsheet's live display name (from Drive) ────────────────
    public async Task<string?> GetSpreadsheetTitleAsync(string spreadsheetId)
    {
        if (!_configured || _driveService == null || string.IsNullOrWhiteSpace(spreadsheetId))
            return null;
        try
        {
            var req = _driveService.Files.Get(spreadsheetId);
            req.Fields            = "name";
            req.SupportsAllDrives = true;
            var file = await req.ExecuteAsync();
            return file?.Name;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Drive Files.Get failed for spreadsheet {Id}", spreadsheetId);
            return null;
        }
    }

    // ── Upsert a registration row to the configured sheet ─────────────────────
    // Looks up column A (Registration ID) for an existing row matching this registration
    // and updates it in place; otherwise appends. Makes "Sync All" idempotent.
    public async Task SyncRegistrationAsync(Registration registration, Campaign campaign)
    {
        if (!_configured || _sheetsService == null)
            return;

        // Only sync entries that have successfully paid. Pending / failed / refunded / no_show
        // never appear in the sheet (or get retroactively cleaned up if previously appended).
        if (registration.PaymentStatus != PaymentStatus.Completed)
        {
            try { await RemoveRegistrationRowIfPresentAsync(registration, campaign); } catch { }
            return;
        }

        // Admin deleted this row directly in the sheet earlier — never re-add it.
        // The registration data itself stays in the database (still shown in reports).
        if (registration.ExcludeFromSheet)
            return;

        try
        {
            var sheetsConfig = await _sheetsConfigs.GetByCampaignIdAsync(campaign.Id);
            if (sheetsConfig == null || !sheetsConfig.AutoSync || string.IsNullOrEmpty(sheetsConfig.SpreadsheetId))
                return;

            var spreadsheetId  = sheetsConfig.SpreadsheetId;
            var expectedHeader = BuildHeaderRow(campaign);
            var colCount       = expectedHeader.Count;
            var lastColLetter  = ColumnLetter(colCount - 1);

            // Schema-drift check: if row 1 doesn't match the current form, we can't safely
            // upsert a row — the column positions are unknown. Reconcile with a full rebuild
            // right here rather than bailing: the form-save hook only queues a rebuild when it
            // sees the columns change, so a sheet left stale by an earlier failure (or by a
            // save made while sync was off) would otherwise never recover on its own.
            if (await HeaderDriftDetectedAsync(spreadsheetId, expectedHeader, lastColLetter))
            {
                _logger.LogInformation(
                    "Sheet {SheetId} header is out of date with campaign {CampaignId}'s form — rebuilding to reconcile.",
                    spreadsheetId, campaign.Id);
                var allRegs = await _registrations.GetByCampaignIdAsync(campaign.Id);
                await RebuildSheetAsync(campaign, allRegs);
                return;
            }

            var row                 = BuildRow(registration, campaign, _publicBaseUrl);
            var registrationIdShort = registration.Id[..8].ToUpperInvariant();
            var existingRowIndex    = await FindRowByRegistrationIdAsync(spreadsheetId, registrationIdShort);

            if (existingRowIndex.HasValue)
            {
                var range = $"Registrations!A{existingRowIndex.Value}:{lastColLetter}{existingRowIndex.Value}";
                var updateReq = _sheetsService.Spreadsheets.Values.Update(
                    new ValueRange { Values = new List<IList<object>> { row } },
                    spreadsheetId, range);
                updateReq.ValueInputOption = SpreadsheetsResource.ValuesResource.UpdateRequest.ValueInputOptionEnum.USERENTERED;
                await updateReq.ExecuteAsync();
                _logger.LogInformation("Updated registration {Id} at row {Row} in sheet {SheetId}",
                    registration.Id, existingRowIndex.Value, spreadsheetId);
                await MarkSyncedAsync(registration);
                await SaveSheetWatermarksAsync(sheetsConfig, null, colCount);
            }
            else
            {
                // Row is not in the sheet. If it was synced before, the admin deleted it
                // manually — respect that and stop re-adding it (data stays in the DB).
                if (registration.SyncedAt != null)
                {
                    await MarkExcludedAsync(registration);
                    _logger.LogInformation(
                        "Registration {Id} was previously synced but is no longer in sheet {SheetId} — treating as admin-deleted and excluding from future syncs.",
                        registration.Id, spreadsheetId);
                    return;
                }

                var appendReq = _sheetsService.Spreadsheets.Values.Append(
                    new ValueRange { Values = new List<IList<object>> { row } },
                    spreadsheetId, $"Registrations!A:{lastColLetter}");
                appendReq.ValueInputOption = SpreadsheetsResource.ValuesResource.AppendRequest.ValueInputOptionEnum.USERENTERED;
                appendReq.InsertDataOption = SpreadsheetsResource.ValuesResource.AppendRequest.InsertDataOptionEnum.INSERTROWS;
                await appendReq.ExecuteAsync();
                _logger.LogInformation("Appended registration {Id} to sheet {SheetId}",
                    registration.Id, spreadsheetId);
                await MarkSyncedAsync(registration);
                await SaveSheetWatermarksAsync(sheetsConfig, null, colCount);
            }
        }
        catch (Exception ex)
        {
            // Non-critical — log and continue
            _logger.LogWarning(ex, "Google Sheets sync failed for registration {Id}", registration.Id);
        }
    }

    // ── Full rebuild: rewrites the generated columns from the database ────────────
    // The rebuild owns columns A..(generated width) only. Anything the admin added to the
    // RIGHT of those is their working area: it is read first, then written back against the
    // same registration, so notes follow their row even as rows are reordered or removed.
    public async Task<int> RebuildSheetAsync(Campaign campaign, IReadOnlyCollection<Registration> registrations, bool forceFull = false)
    {
        if (!_configured || _sheetsService == null) return 0;

        var sheetsConfig = await _sheetsConfigs.GetByCampaignIdAsync(campaign.Id);
        if (sheetsConfig == null || string.IsNullOrEmpty(sheetsConfig.SpreadsheetId))
            return 0;

        var spreadsheetId = sheetsConfig.SpreadsheetId;
        var header        = BuildHeaderRow(campaign);
        var colCount      = header.Count;

        // Completed registrations, oldest-first so the sheet reads chronologically.
        var completed = registrations
            .Where(r => r.PaymentStatus == PaymentStatus.Completed)
            .OrderBy(r => r.CreatedAt)
            .ToList();

        // One read of the whole tab, serving both jobs below (deletion detection and
        // preserving the admin's columns). null = the read failed, in which case we
        // neither exclude anything nor claim to know what the admin had there.
        var sheet = await ReadSheetAsync(spreadsheetId);

        // The admin's columns start where the generated ones ended LAST time we wrote —
        // not where they end now. Using the current width would misread a column left
        // behind by a deleted form field as something the admin had added. Sheets last
        // synced before this watermark existed have no record of that, so they fall back
        // to the current width and self-correct on this rebuild.
        var extraStart = sheetsConfig.LastSyncedColCount > 0 ? sheetsConfig.LastSyncedColCount : colCount;
        var (extraHeaders, extraByRegId) = ExtractAdminColumns(sheet, extraStart);

        if (forceFull)
        {
            // Recovery path: clear all exclusions and re-push everything.
            foreach (var r in completed.Where(r => r.ExcludeFromSheet))
            {
                r.ExcludeFromSheet = false;
                await PersistSyncStateAsync(r);
            }
        }
        else if (sheet != null && sheet.HasHeaderRow)
        {
            // Detect rows the admin deleted directly in the sheet: a reg that was synced
            // before (SyncedAt != null) but is no longer present in column A → exclude it,
            // so this rebuild (and future ones) won't resurrect it.
            //
            // A sheet with zero data rows is ambiguous on its own: it is either "the admin
            // deleted the last row" or "this sheet has never been filled in". The row
            // watermark settles it — we only read an empty sheet as deleted-by-admin when
            // we know rows were previously written there. The header must still be present
            // either way; a wholly blank tab is treated as "populate me".
            var presentIds        = RegistrationIdsIn(sheet);
            var adminEmptiedSheet = presentIds.Count == 0 && sheetsConfig.LastSyncedRowCount > 0;

            if (presentIds.Count > 0 || adminEmptiedSheet)
            {
                foreach (var r in completed)
                {
                    if (r.ExcludeFromSheet) continue;
                    if (r.SyncedAt != null && !presentIds.Contains(r.Id[..8].ToUpperInvariant()))
                    {
                        r.ExcludeFromSheet = true;
                        await PersistSyncStateAsync(r);
                        _logger.LogInformation(
                            "Registration {Id} missing from sheet {SheetId} on rebuild — excluding (admin-deleted).",
                            r.Id, spreadsheetId);
                    }
                }
            }
        }

        // Only write completed rows that haven't been excluded.
        var toWrite       = completed.Where(r => !r.ExcludeFromSheet).ToList();
        var extraWidth    = extraHeaders.Count;
        var totalCols     = colCount + extraWidth;
        var lastColLetter = ColumnLetter(totalCols - 1);

        // Generated cells, then this registration's preserved admin cells, padded so every
        // row is the same width as the range we write.
        IList<object> Compose(IList<object> generated, IList<object>? extras)
        {
            var row = new List<object>(totalCols);
            row.AddRange(generated);
            while (row.Count < colCount) row.Add("");
            for (int i = 0; i < extraWidth; i++)
                row.Add(extras != null && i < extras.Count ? extras[i] : "");
            return row;
        }

        var values = new List<IList<object>> { Compose(header, extraHeaders) };
        foreach (var r in toWrite)
        {
            extraByRegId.TryGetValue(r.Id[..8].ToUpperInvariant(), out var extras);
            values.Add(Compose(BuildRow(r, campaign, _publicBaseUrl), extras));
        }

        try
        {
            // 1. Clear everything below the header range — wipes stale rows + obsolete columns.
            var clearReq = _sheetsService.Spreadsheets.Values.Clear(
                new ClearValuesRequest(), spreadsheetId, $"Registrations!A1:ZZ");
            await clearReq.ExecuteAsync();

            // 2. Single batched Update writing header + all data rows.
            var updateReq = _sheetsService.Spreadsheets.Values.Update(
                new ValueRange { Values = values },
                spreadsheetId, $"Registrations!A1:{lastColLetter}{values.Count}");
            updateReq.ValueInputOption = SpreadsheetsResource.ValuesResource.UpdateRequest.ValueInputOptionEnum.USERENTERED;
            await updateReq.ExecuteAsync();

            // Stamp SyncedAt on rows that were written for the first time.
            foreach (var r in toWrite.Where(r => r.SyncedAt == null))
            {
                r.SyncedAt = DateTime.UtcNow;
                await PersistSyncStateAsync(r);
            }

            await SaveSheetWatermarksAsync(sheetsConfig, toWrite.Count, colCount);

            _logger.LogInformation(
                "Rebuilt sheet {SheetId} for campaign {CampaignId}: {Cols} generated cols (+{Extra} admin cols) × {Rows} rows.",
                spreadsheetId, campaign.Id, colCount, extraWidth, toWrite.Count);
            return toWrite.Count;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google Sheets rebuild failed for campaign {CampaignId}", campaign.Id);
            return 0;
        }
    }

    /// <summary>
    /// True when a form-config change moves the sheet's generated columns. Edits that leave
    /// the columns alone (help text, validation, option labels, ordering of non-column items)
    /// return false, so the sheet is not rewritten out from under an admin who is working in it.
    /// </summary>
    public bool SheetColumnsChanged(string? previousFormConfig, string? newFormConfig)
    {
        var before = BuildHeaderRow(previousFormConfig);
        var after  = BuildHeaderRow(newFormConfig);
        if (before.Count != after.Count) return true;
        for (int i = 0; i < before.Count; i++)
        {
            if (!string.Equals(before[i]?.ToString(), after[i]?.ToString(), StringComparison.Ordinal))
                return true;
        }
        return false;
    }

    // ── Sync-state persistence helpers (SyncedAt / ExcludeFromSheet) ──────────
    private async Task MarkSyncedAsync(Registration registration)
    {
        if (registration.SyncedAt != null) return; // already stamped
        registration.SyncedAt = DateTime.UtcNow;
        await PersistSyncStateAsync(registration);
    }

    private async Task MarkExcludedAsync(Registration registration)
    {
        if (registration.ExcludeFromSheet) return;
        registration.ExcludeFromSheet = true;
        await PersistSyncStateAsync(registration);
    }

    private async Task PersistSyncStateAsync(Registration registration)
    {
        try { await _registrations.UpdateAsync(registration); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist sheet sync-state for registration {Id}", registration.Id);
        }
    }

    /// <summary>The Registrations tab as last left by the admin. Rows[0] is the header row.
    /// Trailing empty cells are omitted by the API, so rows are ragged — index defensively.</summary>
    private sealed record SheetSnapshot(IList<IList<object>> Rows)
    {
        /// <summary>A sheet that still has its header is a live sheet the app set up. A wholly
        /// blank tab is not, and must never be read as "the admin deleted everything".</summary>
        public bool HasHeaderRow =>
            Rows.Count > 0 && Rows[0].Any(c => !string.IsNullOrWhiteSpace(c?.ToString()));
    }

    /// <summary>Reads the whole Registrations tab. Returns null if the read fails, so callers skip
    /// deletion detection rather than wrongly treating every row as deleted.</summary>
    private async Task<SheetSnapshot?> ReadSheetAsync(string spreadsheetId)
    {
        try
        {
            var getReq = _sheetsService!.Spreadsheets.Values.Get(spreadsheetId, "Registrations!A1:ZZ");
            // FORMULA, not the rendered value: an admin's own column may hold formulas, and
            // reading them as computed text would flatten them to constants when written back.
            getReq.ValueRenderOption =
                SpreadsheetsResource.ValuesResource.GetRequest.ValueRenderOptionEnum.FORMULA;
            var resp = await getReq.ExecuteAsync();
            return new SheetSnapshot(resp.Values ?? new List<IList<object>>());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read sheet {SheetId}", spreadsheetId);
            return null;
        }
    }

    /// <summary>Short registration IDs present in column A (header row excluded).</summary>
    private static HashSet<string> RegistrationIdsIn(SheetSnapshot sheet)
    {
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 1; i < sheet.Rows.Count; i++)
        {
            var cell = sheet.Rows[i].FirstOrDefault()?.ToString();
            if (!string.IsNullOrWhiteSpace(cell)) ids.Add(cell.Trim().ToUpperInvariant());
        }
        return ids;
    }

    /// <summary>
    /// Splits off the columns beyond <paramref name="extraStart"/> — the admin's own working area —
    /// returning their header cells and their per-row values keyed by short registration ID. Keying
    /// by ID (rather than row position) is what lets notes stay with their registration when the
    /// rebuild reorders rows or drops deleted ones.
    /// </summary>
    private static (List<object> Headers, Dictionary<string, IList<object>> ByRegistrationId)
        ExtractAdminColumns(SheetSnapshot? sheet, int extraStart)
    {
        var byId = new Dictionary<string, IList<object>>(StringComparer.OrdinalIgnoreCase);
        if (sheet == null) return (new List<object>(), byId);

        // Widest admin area across every row — an admin may add data under a blank header.
        var width = 0;
        foreach (var row in sheet.Rows)
            width = Math.Max(width, row.Count - extraStart);
        if (width <= 0) return (new List<object>(), byId);

        List<object> Slice(IList<object> row) =>
            Enumerable.Range(extraStart, width)
                      .Select(i => i < row.Count ? (row[i] ?? "") : "")
                      .ToList();

        var headers = sheet.Rows.Count > 0
            ? Slice(sheet.Rows[0])
            : Enumerable.Repeat((object)"", width).ToList();

        for (int i = 1; i < sheet.Rows.Count; i++)
        {
            var id = sheet.Rows[i].FirstOrDefault()?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(id)) continue;
            var cells = Slice(sheet.Rows[i]);
            if (cells.Any(c => !string.IsNullOrWhiteSpace(c?.ToString())))
                byId[id.ToUpperInvariant()] = cells;
        }

        return (headers, byId);
    }

    /// <summary>
    /// Records what the app last wrote to this sheet. <paramref name="rowCount"/> is the exact
    /// count after a rebuild; single-row syncs pass null and only raise it to 1, since their job
    /// is just to prove the sheet was populated (see the empty-sheet case in RebuildSheetAsync).
    /// </summary>
    private async Task SaveSheetWatermarksAsync(SheetsConfig cfg, int? rowCount, int colCount)
    {
        var newRowCount = rowCount ?? Math.Max(cfg.LastSyncedRowCount, 1);
        if (cfg.LastSyncedRowCount == newRowCount && cfg.LastSyncedColCount == colCount) return;

        cfg.LastSyncedRowCount = newRowCount;
        cfg.LastSyncedColCount = colCount;
        cfg.UpdatedAt          = DateTime.UtcNow;
        try { await _sheetsConfigs.UpsertAsync(cfg); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist sheet watermarks for campaign {CampaignId}", cfg.CampaignId);
        }
    }

    /// <summary>Compares row 1 of the sheet to the expected header. Returns true when they don't match.</summary>
    private async Task<bool> HeaderDriftDetectedAsync(string spreadsheetId, IList<object> expectedHeader, string lastColLetter)
    {
        try
        {
            var getReq = _sheetsService!.Spreadsheets.Values.Get(spreadsheetId, $"Registrations!A1:{lastColLetter}1");
            var resp   = await getReq.ExecuteAsync();
            var actual = resp.Values?.FirstOrDefault() ?? new List<object>();
            if (actual.Count != expectedHeader.Count) return true;
            for (int i = 0; i < expectedHeader.Count; i++)
            {
                if (!string.Equals(actual[i]?.ToString(), expectedHeader[i]?.ToString(), StringComparison.Ordinal))
                    return true;
            }
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Header read failed for sheet {SheetId} — assuming drift to force rebuild on next sync", spreadsheetId);
            return true;
        }
    }

    /// <summary>0-based column index → Google Sheets letter (A, B, ..., Z, AA, AB, ...).</summary>
    private static string ColumnLetter(int idx)
    {
        if (idx < 0) return "A";
        var s = "";
        while (idx >= 0)
        {
            s = (char)('A' + idx % 26) + s;
            idx = idx / 26 - 1;
        }
        return s;
    }

    /// <summary>
    /// Removes a registration's row from the sheet if it was previously appended. Called when a
    /// registration's payment_status moves away from Completed (e.g. refund, manual revert) so the
    /// sheet only shows successfully-paid entries.
    /// </summary>
    private async Task RemoveRegistrationRowIfPresentAsync(Registration registration, Campaign campaign)
    {
        if (!_configured || _sheetsService == null) return;
        var sheetsConfig = await _sheetsConfigs.GetByCampaignIdAsync(campaign.Id);
        if (sheetsConfig == null || string.IsNullOrEmpty(sheetsConfig.SpreadsheetId)) return;

        var spreadsheetId       = sheetsConfig.SpreadsheetId;
        var registrationIdShort = registration.Id[..8].ToUpperInvariant();
        var existingRowIndex    = await FindRowByRegistrationIdAsync(spreadsheetId, registrationIdShort);
        if (!existingRowIndex.HasValue) return;

        // BatchUpdate to delete the row from the "Registrations" tab (sheetId = first sheet's id)
        var meta = await _sheetsService.Spreadsheets.Get(spreadsheetId).ExecuteAsync();
        var sheetId = meta.Sheets.FirstOrDefault()?.Properties?.SheetId ?? 0;
        var delReq = new BatchUpdateSpreadsheetRequest
        {
            Requests = new List<Request>
            {
                new()
                {
                    DeleteDimension = new DeleteDimensionRequest
                    {
                        Range = new DimensionRange
                        {
                            SheetId    = sheetId,
                            Dimension  = "ROWS",
                            StartIndex = existingRowIndex.Value - 1, // 0-based, inclusive
                            EndIndex   = existingRowIndex.Value      // 0-based, exclusive
                        }
                    }
                }
            }
        };
        await _sheetsService.Spreadsheets.BatchUpdate(delReq, spreadsheetId).ExecuteAsync();
        _logger.LogInformation("Removed non-completed registration {Id} from sheet {SheetId}",
            registration.Id, spreadsheetId);
    }

    /// <summary>Returns 1-based row index where column A contains the given registration ID, or null if not found.</summary>
    private async Task<int?> FindRowByRegistrationIdAsync(string spreadsheetId, string registrationIdShort)
    {
        try
        {
            var getReq = _sheetsService!.Spreadsheets.Values.Get(spreadsheetId, "Registrations!A:A");
            var resp = await getReq.ExecuteAsync();

            if (resp.Values == null) return null;

            // Row 1 is the header; data starts row 2
            for (int i = 0; i < resp.Values.Count; i++)
            {
                var cell = resp.Values[i].FirstOrDefault()?.ToString();
                if (string.Equals(cell, registrationIdShort, StringComparison.OrdinalIgnoreCase))
                    return i + 1;  // Sheets API uses 1-based row numbers
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to scan column A for existing registration {Id}", registrationIdShort);
        }
        return null;
    }

    // ── Dynamic schema (header + per-row cells from form_config) ──────────────
    // Columns:
    //   [fixed]  Registration ID, Date
    //   [form]   one column per renderable field in form-builder order
    //   [fixed]  Payment Status, Amount, Payment ID
    //
    // section_header fields are skipped (display-only). Field labels become column
    // titles; field id is fallback when label is blank.

    private static readonly string[] FixedHeaderPrefix = { "Registration ID", "Date" };
    private static readonly string[] FixedHeaderSuffix = { "Payment Status", "Amount", "Payment ID" };

    /// <summary>One column per renderable form field, in form_config.fields order.</summary>
    public static IList<object> BuildHeaderRow(Campaign campaign) => BuildHeaderRow(campaign.FormConfig);

    /// <inheritdoc cref="BuildHeaderRow(Campaign)"/>
    public static IList<object> BuildHeaderRow(string? formConfigJson)
    {
        var headers = new List<object>(FixedHeaderPrefix);
        foreach (var f in EnumerateFormFields(formConfigJson))
        {
            var label = f.TryGetProperty("label", out var l) && l.ValueKind == JsonValueKind.String
                ? l.GetString() : null;
            var id    = f.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
                ? idEl.GetString() : null;
            headers.Add(string.IsNullOrWhiteSpace(label) ? (id ?? "") : label!);
        }
        headers.AddRange(FixedHeaderSuffix);
        return headers;
    }

    public static IList<object> BuildRow(Registration registration, Campaign campaign, string publicBaseUrl = "")
    {
        var cells = new List<object>
        {
            // Leading apostrophe pins this cell to text. Writes go out as USER_ENTERED, which
            // parses values the way a typed entry would — and an id is 8 hex characters, so a
            // fair number of them read as numbers: "427692E5" becomes 42769200000 (scientific
            // notation) and "019309057" loses its leading zero. That matters beyond looks,
            // because the next sync looks this column up to decide whether a row is already
            // present; an id that no longer matches itself reads as a row the admin deleted,
            // and the registration is dropped from the sheet for good. Sheets treats the
            // apostrophe as a formatting marker: it is not displayed and not read back.
            "'" + registration.Id[..8].ToUpperInvariant(),
            // Stored as UTC; show IST so the sheet matches the payment gateway's clock
            IstTime.FromUtc(registration.CreatedAt).ToString("yyyy-MM-dd HH:mm:ss")
        };

        // Per-field cells (in form order). Always emit a cell — empty when the
        // registration has no value for that field.
        JsonDocument? formDoc = null;
        try { if (!string.IsNullOrEmpty(registration.FormData)) formDoc = JsonDocument.Parse(registration.FormData); }
        catch { /* malformed → treat as no data; all cells empty */ }

        // Questions the registrant never saw get an empty cell, not the answer left behind when
        // they switched away from them. Submissions are stripped of these on the way in now
        // (FieldVisibility.StripHiddenAnswers); this keeps rows written before that from
        // reporting, say, both a COG name and a Rotarian name for one person. The column itself
        // stays — the header layout is fixed and the next sync matches rows by position.
        var hiddenFieldIds = FieldVisibility.AllHiddenFieldIds(campaign.FormConfig, registration.FormData);

        foreach (var f in EnumerateFormFields(campaign.FormConfig))
        {
            var fieldId = f.TryGetProperty("id", out var fidEl) ? fidEl.GetString() : null;
            cells.Add(fieldId != null && hiddenFieldIds.Contains(fieldId)
                ? ""
                : ExtractFieldValue(formDoc?.RootElement, f, publicBaseUrl));
        }

        formDoc?.Dispose();

        cells.Add(registration.PaymentStatus.ToString().ToLowerInvariant());
        cells.Add(registration.TotalAmount.ToString("F2"));
        cells.Add(registration.GatewayPaymentId ?? "");
        return cells;
    }

    /// <summary>Enumerates form_config.fields skipping presentational (section_header) entries.</summary>
    private static IEnumerable<JsonElement> EnumerateFormFields(string? formConfigJson)
    {
        if (string.IsNullOrEmpty(formConfigJson)) yield break;
        JsonDocument? doc = null;
        try { doc = JsonDocument.Parse(formConfigJson); } catch { yield break; }
        try
        {
            if (!doc.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array) yield break;
            foreach (var f in fieldsEl.EnumerateArray())
            {
                var type = f.TryGetProperty("type", out var tEl) ? tEl.GetString() : null;
                if (type == "section_header" || type == "price") continue; // display-only
                yield return f.Clone();
            }
        }
        finally { doc?.Dispose(); }
    }

    /// <summary>Extracts a single cell value for a given field, respecting its type.</summary>
    private static string ExtractFieldValue(JsonElement? formData, JsonElement field, string publicBaseUrl)
    {
        if (formData is null || formData.Value.ValueKind != JsonValueKind.Object) return "";

        var id = field.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        if (string.IsNullOrEmpty(id)) return "";

        var type = field.TryGetProperty("type", out var tEl) ? tEl.GetString() : null;

        // "name" splits into _first / _middle / _last
        if (type == "name")
        {
            string Part(string suffix) =>
                formData.Value.TryGetProperty($"{id}_{suffix}", out var p) && p.ValueKind == JsonValueKind.String
                    ? (p.GetString() ?? "") : "";
            return string.Join(" ", new[] { Part("first"), Part("middle"), Part("last") }
                .Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
        }

        if (!formData.Value.TryGetProperty(id, out var v)) return "";

        switch (type)
        {
            case "file_upload":
                // Stored as { url, name, size }. Emit a single clickable cell via a
                // HYPERLINK formula (Sheets only auto-links a cell whose ENTIRE content
                // is a bare http(s) URL — anything else, e.g. "filename — url", renders as
                // dead text). Relative paths are made absolute with the public base first.
                if (v.ValueKind == JsonValueKind.Object &&
                    v.TryGetProperty("url", out var urlEl) && urlEl.ValueKind == JsonValueKind.String)
                {
                    var url = urlEl.GetString() ?? "";
                    if (string.IsNullOrWhiteSpace(url)) return "";
                    if (url.StartsWith('/') && !string.IsNullOrEmpty(publicBaseUrl))
                        url = publicBaseUrl + url;

                    // Display text = original filename when present, else the URL itself.
                    var fileName = v.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String
                        ? (nameEl.GetString() ?? "").Trim()
                        : "";

                    // Escape the double-quotes that delimit HYPERLINK's string args (" -> "").
                    static string Esc(string s) => s.Replace("\"", "\"\"");
                    return string.IsNullOrWhiteSpace(fileName)
                        ? url
                        : $"=HYPERLINK(\"{Esc(url)}\", \"{Esc(fileName)}\")";
                }
                return "";

            case "checkbox":
                // Multi-select: array of values; single-bool: true/false.
                if (v.ValueKind == JsonValueKind.Array)
                    return string.Join(", ", v.EnumerateArray()
                        .Select(e => ResolveOptionLabel(field, e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString()))
                        .Where(s => !string.IsNullOrWhiteSpace(s)));
                if (v.ValueKind == JsonValueKind.True)  return "Yes";
                if (v.ValueKind == JsonValueKind.False) return "";
                return v.ValueKind == JsonValueKind.String ? ResolveOptionLabel(field, v.GetString()) : v.ToString();

            case "terms_checkbox":
                if (v.ValueKind == JsonValueKind.True)  return "Accepted";
                if (v.ValueKind == JsonValueKind.False) return "";
                return v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : v.ToString();

            default:
                return v.ValueKind switch
                {
                    JsonValueKind.String     => ResolveOptionLabel(field, v.GetString()),
                    JsonValueKind.Null
                        or JsonValueKind.Undefined => "",
                    JsonValueKind.True       => "Yes",
                    JsonValueKind.False      => "",
                    JsonValueKind.Array      => string.Join(", ", v.EnumerateArray()
                        .Select(e => ResolveOptionLabel(field, e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString()))
                        .Where(s => !string.IsNullOrWhiteSpace(s))),
                    _                        => v.ToString()
                };
        }
    }

    /// <summary>For choice fields, maps a stored option value to its display label using the
    /// field's `options` array. Returns the raw value unchanged for non-choice fields or when
    /// no matching option is found.</summary>
    /// <inheritdoc cref="FormContact.ResolveOptionLabel"/>
    private static string ResolveOptionLabel(JsonElement field, string? rawValue) =>
        FormContact.ResolveOptionLabel(field, rawValue);

}
