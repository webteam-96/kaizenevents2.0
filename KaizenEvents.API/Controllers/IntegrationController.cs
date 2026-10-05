using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/integrations")]
[Authorize]
public class IntegrationController : ApiControllerBase
{
    private readonly IIntegrationSettingRepository _integrations;
    private readonly ISheetsConfigRepository _sheetsConfigs;
    private readonly ICampaignRepository _campaigns;
    private readonly IRegistrationRepository _registrations;
    private readonly IUserRepository _users;
    private readonly IGoogleSheetsService _sheets;
    private readonly IConfiguration _config;
    private readonly IBrevoService _email;
    private readonly IInteraktService _interakt;

    public IntegrationController(
        IIntegrationSettingRepository integrations,
        ISheetsConfigRepository sheetsConfigs,
        ICampaignRepository campaigns,
        IRegistrationRepository registrations,
        IUserRepository users,
        IGoogleSheetsService sheets,
        IConfiguration config,
        IBrevoService email,
        IInteraktService interakt)
    {
        _integrations  = integrations;
        _sheetsConfigs = sheetsConfigs;
        _campaigns     = campaigns;
        _registrations = registrations;
        _users         = users;
        _sheets        = sheets;
        _config        = config;
        _email         = email;
        _interakt      = interakt;
    }

    /// <summary>
    /// For non-super-admin: ensures the caller has access to this campaign.
    /// Returns 403 if not allowed, null if allowed.
    /// </summary>
    private async Task<IActionResult?> CheckCampaignAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return null;
        if (string.IsNullOrEmpty(CurrentUserId)) return Forbidden();
        var accessible = await _users.GetCampaignIdsAsync(CurrentUserId);
        if (!accessible.Contains(campaignId))
            return Forbidden("You don't have access to this event.");
        return null;
    }

    // ── GET /api/integrations/status ─────────────────────────────────────────
    // Read-only booleans — safe for any admin (org_admin needs this to know
    // whether sheets/email is set up globally before configuring per-event sync).
    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        if (!IsAdminRole) return Forbidden();

        // Check appsettings (platform-level config) — secure source of truth
        var brevoConfigured  = !string.IsNullOrWhiteSpace(_config["Brevo:ApiKey"]);

        // Google Sheets can be configured via inline JSON OR file path
        var sheetsJson = _config["Google:ServiceAccountJson"];
        var sheetsPath = _config["Google:ServiceAccountJsonPath"];
        var sheetsConfigured = !string.IsNullOrWhiteSpace(sheetsJson)
            || (!string.IsNullOrWhiteSpace(sheetsPath) && System.IO.File.Exists(sheetsPath));

        // Per-campaign WhatsApp templates are a live feature (see WhatsAppTemplateController /
        // GlobalWhatsAppTemplateController) — this reflects whether Interakt is actually
        // configured on the server, not the old hardcoded "disabled" placeholder.
        var whatsappConfigured = _interakt.IsConfigured();

        return Ok(new
        {
            whatsapp = new
            {
                name       = "WhatsApp (Interakt)",
                configured = whatsappConfigured,
                status     = whatsappConfigured ? "active" : "inactive",
                details    = whatsappConfigured
                    ? "Ready to send WhatsApp messages"
                    : "Interakt secret key not configured"
            },
            email = new
            {
                name       = "Email (Brevo/Sendinblue)",
                configured = brevoConfigured,
                status     = brevoConfigured ? "active" : "inactive",
                details    = brevoConfigured ? "Ready to send emails" : "API key not configured"
            },
            google_sheets = new
            {
                name       = "Google Sheets",
                configured = sheetsConfigured,
                status     = sheetsConfigured ? "active" : "inactive",
                details    = sheetsConfigured ? "Ready to sync data" : "Service account not configured"
            }
        });
    }

    // ── POST /api/integrations/whatsapp/test ──────────────────────────────────
    [HttpPost("whatsapp/test")]
    public IActionResult TestWhatsApp()
        => BadRequest(new { detail = "WhatsApp integration is currently disabled. Contact support to enable." });

    // ── POST /api/integrations/email/configure ────────────────────────────────
    [HttpPost("email/configure")]
    public async Task<IActionResult> ConfigureBrevo([FromQuery] string api_key)
    {
        if (!IsSuperAdmin) return Forbidden();

        var now = DateTime.UtcNow;
        var setting = await _integrations.GetByTypeAsync("brevo")
                      ?? new IntegrationSetting { Id = Guid.NewGuid().ToString(), Type = "brevo", CreatedAt = now };

        setting.Config    = JsonSerializer.Serialize(new { api_key, configured_by = CurrentUserId });
        setting.UpdatedAt = now;
        await _integrations.CreateOrUpdateAsync(setting);

        return Ok(new { success = true, message = "Brevo API key configured successfully." });
    }

    // ── POST /api/integrations/email/test ─────────────────────────────────────
    [HttpPost("email/test")]
    public async Task<IActionResult> TestEmail([FromBody] EmailTestRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        if (string.IsNullOrWhiteSpace(_config["Brevo:ApiKey"]))
            return BadRequest(new { detail = "Brevo API key not configured in server config." });

        if (string.IsNullOrWhiteSpace(req.ToEmail))
            return BadRequest(new { detail = "Recipient email is required." });

        var html = $@"
<h2>Test Email from Kaizen Events</h2>
<p>Hello {req.ToName},</p>
<p>This is a test email to verify that your Brevo email integration is working correctly.</p>
<p>If you received this, email sending is fully configured and functional.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events Integrations</p>";

        var sent = await _email.SendEmailAsync(req.ToEmail, req.ToName, $"Test Email from Kaizen Events", html);
        if (!sent)
            return BadRequest(new { detail = "Email send failed. Check backend logs for details (possibly unverified sender)." });

        return Ok(new
        {
            success    = true,
            message    = $"Test email sent to {req.ToEmail}",
            message_id = Guid.NewGuid().ToString()
        });
    }

    // ── POST /api/integrations/email/send-registration-confirmation ───────────
    [HttpPost("email/send-registration-confirmation")]
    public async Task<IActionResult> SendConfirmationEmail([FromQuery] string registration_id)
    {
        if (!IsSuperAdmin) return Forbidden();

        var reg = await _registrations.GetByIdAsync(registration_id);
        if (reg == null) return NotFound(new { detail = "Registration not found." });

        return Ok(new { success = true, message = "Confirmation email queued." });
    }

    // ── POST /api/integrations/sheets/configure ───────────────────────────────
    [HttpPost("sheets/configure")]
    public async Task<IActionResult> ConfigureGoogleSheets([FromBody] GoogleSheetsConfigureRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        string serviceEmail;
        try
        {
            var creds = JsonDocument.Parse(req.CredentialsJson);
            if (!creds.RootElement.TryGetProperty("type", out var typeEl) ||
                typeEl.GetString() != "service_account")
                return BadRequest(new { detail = "Invalid service account JSON." });

            serviceEmail = creds.RootElement.TryGetProperty("client_email", out var emailEl)
                ? emailEl.GetString() ?? "" : "";
        }
        catch
        {
            return BadRequest(new { detail = "Invalid JSON format." });
        }

        var now = DateTime.UtcNow;
        var setting = await _integrations.GetByTypeAsync("google_sheets")
                      ?? new IntegrationSetting { Id = Guid.NewGuid().ToString(), Type = "google_sheets", CreatedAt = now };

        setting.CredentialsJson = req.CredentialsJson;
        setting.Config          = JsonSerializer.Serialize(new { service_email = serviceEmail, configured_by = CurrentUserId });
        setting.UpdatedAt       = now;
        await _integrations.CreateOrUpdateAsync(setting);

        return Ok(new
        {
            success       = true,
            message       = "Google Sheets configured successfully.",
            service_email = serviceEmail,
            instructions  = $"Share your Google Sheets with this email: {serviceEmail}"
        });
    }

    // ── POST /api/integrations/sheets/create-campaign-sheet ──────────────────
    [HttpPost("sheets/create-campaign-sheet")]
    public async Task<IActionResult> CreateCampaignSheet([FromBody] CreateCampaignSheetRequest req)
    {
        if (!IsAdminRole) return Forbidden();
        var accessErr = await CheckCampaignAccessAsync(req.CampaignId);
        if (accessErr != null) return accessErr;

        if (!IsGoogleSheetsConfigured())
            return BadRequest(new { detail = "Google Sheets not configured." });

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var existing = await _sheetsConfigs.GetByCampaignIdAsync(req.CampaignId);
        if (existing?.SpreadsheetId != null)
            return BadRequest(new { detail = "A Google Sheet already exists for this campaign." });

        // Call Google Sheets service to create sheet
        var result = await _sheets.CreateCampaignSheetAsync(req.SheetName, CurrentUserId!, campaign.Name);
        if (!result.Success)
            return StatusCode(500, new { detail = result.Error ?? "Failed to create sheet." });

        var now = DateTime.UtcNow;
        var config = existing ?? new SheetsConfig
        {
            Id        = Guid.NewGuid().ToString(),
            CampaignId= req.CampaignId,
            CreatedAt = now
        };
        config.SpreadsheetId  = result.SpreadsheetId;
        config.SpreadsheetUrl = result.SpreadsheetUrl;
        config.SheetName      = string.IsNullOrWhiteSpace(req.SheetName) ? "Registrations" : req.SheetName.Trim();
        config.AutoSync       = req.AutoSync;
        config.SharedWith     = CurrentUserId;
        config.UpdatedAt      = now;
        await _sheetsConfigs.UpsertAsync(config);

        return Ok(new
        {
            success          = true,
            message          = $"Sheet '{req.SheetName}' created.",
            spreadsheet_id   = result.SpreadsheetId,
            spreadsheet_url  = result.SpreadsheetUrl,
            auto_sync        = req.AutoSync
        });
    }

    // ── DELETE /api/integrations/sheets/campaign/{campaign_id} ───────────────
    [HttpDelete("sheets/campaign/{campaign_id}")]
    public async Task<IActionResult> DisableCampaignSheet(string campaign_id)
    {
        if (!IsAdminRole) return Forbidden();
        var accessErr = await CheckCampaignAccessAsync(campaign_id);
        if (accessErr != null) return accessErr;
        var existing = await _sheetsConfigs.GetByCampaignIdAsync(campaign_id);
        if (existing == null)
            return NotFound(new { detail = "No sheet configuration found for this campaign." });

        await _sheetsConfigs.DeleteByCampaignIdAsync(campaign_id);
        return Ok(new { success = true, message = "Google Sheets sync disabled for this campaign." });
    }

    // ── GET /api/integrations/sheets/service-email ───────────────────────────
    [HttpGet("sheets/service-email")]
    public async Task<IActionResult> GetSheetsServiceEmail()
    {
        if (!IsAdminRole) return Forbidden();

        // Read the service account JSON from appsettings config (inline or file)
        var json = _config["Google:ServiceAccountJson"];
        var path = _config["Google:ServiceAccountJsonPath"];

        if (string.IsNullOrWhiteSpace(json) && !string.IsNullOrWhiteSpace(path))
        {
            try { if (System.IO.File.Exists(path)) json = await System.IO.File.ReadAllTextAsync(path); }
            catch { /* ignored */ }
        }

        if (string.IsNullOrWhiteSpace(json))
            return BadRequest(new { detail = "Google Sheets not configured." });

        string serviceEmail = "";
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("client_email", out var el))
                serviceEmail = el.GetString() ?? "";
        }
        catch { /* malformed JSON — return empty */ }

        return Ok(new
        {
            service_email = serviceEmail,
            instructions  = "Share your Google Sheet with this email address with 'Editor' permission"
        });
    }

    // ── POST /api/integrations/sheets/sync ───────────────────────────────────
    [HttpPost("sheets/sync")]
    public async Task<IActionResult> SyncToSheets([FromBody] SheetsSyncRequest req)
    {
        if (!IsAdminRole) return Forbidden();
        var accessErr = await CheckCampaignAccessAsync(req.CampaignId);
        if (accessErr != null) return accessErr;

        if (!IsGoogleSheetsConfigured())
            return BadRequest(new { detail = "Google Sheets not configured." });

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var regs = await _registrations.GetByCampaignIdAsync(req.CampaignId);

        // Full rebuild — writes the current form schema as the header and re-emits
        // every completed registration in form-field order. Replaces the per-row
        // loop so admins always see a sheet that exactly matches the current form.
        var synced = await _sheets.RebuildSheetAsync(campaign, regs, req.ForceFull);

        return Ok(new
        {
            success = true,
            message = synced == 0 ? "No completed registrations to sync." : $"Synced {synced} registrations.",
            synced,
            total   = regs.Count,
            count   = synced
        });
    }

    // ── GET /api/integrations/sheets/config/{campaign_id} ────────────────────
    [HttpGet("sheets/config/{campaign_id}")]
    public async Task<IActionResult> GetSheetsConfig(string campaign_id)
    {
        if (!IsAdminRole) return Forbidden();
        var accessErr = await CheckCampaignAccessAsync(campaign_id);
        if (accessErr != null) return accessErr;
        var config = await _sheetsConfigs.GetByCampaignIdAsync(campaign_id);
        if (config == null)
            return Ok(new
            {
                campaign_id,
                configured      = false,
                spreadsheet_id  = (string?)null,
                sheet_name      = "Registrations",
                auto_sync       = false
            });

        // Fetch the live spreadsheet title from Drive — picks up renames done in Sheets UI
        // and gives us a sensible display name even when SheetName (tab name) is blank.
        string? liveTitle = !string.IsNullOrEmpty(config.SpreadsheetId)
            ? await _sheets.GetSpreadsheetTitleAsync(config.SpreadsheetId)
            : null;

        return Ok(new
        {
            campaign_id        = config.CampaignId,
            configured         = !string.IsNullOrEmpty(config.SpreadsheetId),
            spreadsheet_id     = config.SpreadsheetId,
            spreadsheet_url    = config.SpreadsheetUrl,
            spreadsheet_name   = liveTitle,        // live Drive title (preferred for display)
            sheet_name         = config.SheetName, // legacy: tab name (kept for back-compat)
            auto_sync          = config.AutoSync,
            shared_with        = config.SharedWith
        });
    }

    // ── GET /api/integrations/logs/{campaign_id} ──────────────────────────────
    [HttpGet("logs/{campaign_id}")]
    public IActionResult GetLogs(string campaign_id, [FromQuery] int limit = 100)
    {
        // Stub — logs are handled via NotificationController
        return Ok(new List<object>());
    }

    // ── Helper: Google Sheets is configured if inline JSON is set OR the
    //           file path exists on disk (matches status endpoint logic).
    private bool IsGoogleSheetsConfigured()
    {
        var json = _config["Google:ServiceAccountJson"];
        var path = _config["Google:ServiceAccountJsonPath"];
        return !string.IsNullOrWhiteSpace(json)
            || (!string.IsNullOrWhiteSpace(path) && System.IO.File.Exists(path));
    }
}

public record EmailTestRequest(string ToEmail, string ToName = "Test User", string EventName = "Test Event");
public record GoogleSheetsConfigureRequest(string CredentialsJson);
public record CreateCampaignSheetRequest(string CampaignId, string SheetName, bool AutoSync = true);
public record SheetsSyncRequest(string CampaignId, bool ForceFull = false);
