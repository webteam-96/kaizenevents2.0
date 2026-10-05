using System.Globalization;
using System.Text.Json;
using ClosedXML.Excel;
using CsvHelper;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/campaigns/{campaign_id}/members")]
public class CampaignMemberController : ApiControllerBase
{
    private readonly ICampaignMemberRepository _members;
    private readonly ICampaignRepository _campaigns;
    private readonly IUserRepository _users;
    private readonly IBrevoService _email;
    private readonly IInteraktService _whatsapp;
    private readonly IRegistrationEmailService _regEmail;
    private readonly IConfiguration _config;
    private readonly ILogger<CampaignMemberController> _logger;

    public CampaignMemberController(
        ICampaignMemberRepository members,
        ICampaignRepository campaigns,
        IUserRepository users,
        IBrevoService email,
        IInteraktService whatsapp,
        IRegistrationEmailService regEmail,
        IConfiguration config,
        ILogger<CampaignMemberController> logger)
    {
        _members   = members;
        _campaigns = campaigns;
        _users     = users;
        _email     = email;
        _whatsapp  = whatsapp;
        _regEmail  = regEmail;
        _config    = config;
        _logger    = logger;
    }

    // ── POST .../upload/preview ───────────────────────────────────────────────
    [HttpPost("upload/preview")]
    [Authorize]
    public async Task<IActionResult> PreviewUpload(string campaign_id, IFormFile file)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });

        var (columns, rows) = await ParseFileAsync(file);
        return Ok(new
        {
            columns,
            sample_rows = rows.Take(5),
            total_rows  = rows.Count
        });
    }

    // ── POST .../upload ───────────────────────────────────────────────────────
    [HttpPost("upload")]
    [Authorize]
    public async Task<IActionResult> UploadMembers(
        string campaign_id,
        IFormFile file,
        [FromQuery] string name_column   = "name",
        [FromQuery] string mobile_column = "mobile",
        [FromQuery] string? email_column = null)
    {
        if (!IsSuperAdmin) return Forbidden();
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });
        if (campaign.CampaignType != CampaignType.ClosedGroup)
            return BadRequest(new { detail = "Member upload is only for closed group campaigns." });

        var (_, rows) = await ParseFileAsync(file);

        int added = 0, skipped = 0, errors = 0;
        var errorDetails = new List<object>();
        var seenMobiles  = new HashSet<string>();
        var existing     = await _members.GetByCampaignIdAsync(campaign_id);
        var existingMobiles = existing.Select(m => NormalizeMobile(m.Mobile)).ToHashSet();

        var toInsert = new List<CampaignMember>();
        foreach (var (row, idx) in rows.Select((r, i) => (r, i + 2)))
        {
            if (!row.TryGetValue(name_column, out var name) || string.IsNullOrWhiteSpace(name))
            {
                errors++; errorDetails.Add(new { row = idx, error = "Missing name." });
                continue;
            }
            if (!row.TryGetValue(mobile_column, out var rawMobile) || string.IsNullOrWhiteSpace(rawMobile))
            {
                errors++; errorDetails.Add(new { row = idx, error = "Missing mobile." });
                continue;
            }

            var mobile = NormalizeMobile(rawMobile);
            if (seenMobiles.Contains(mobile) || existingMobiles.Contains(mobile))
            {
                skipped++; continue;
            }

            seenMobiles.Add(mobile);
            var now = DateTime.UtcNow;
            toInsert.Add(new CampaignMember
            {
                Id           = Guid.NewGuid().ToString(),
                CampaignId   = campaign_id,
                Name         = name.Trim(),
                Mobile       = mobile,
                Email        = email_column != null && row.TryGetValue(email_column, out var em) ? em : null,
                CustomFields = "{}",
                Status       = MemberStatus.Unregistered,
                CreatedBy    = CurrentUserId ?? "",
                CreatedAt    = now,
                UpdatedAt    = now
            });
            added++;
        }

        if (toInsert.Count > 0)
            await _members.CreateManyAsync(toInsert);

        return Ok(new
        {
            success      = true,
            total_rows   = rows.Count,
            added,
            skipped,
            errors,
            error_details= errorDetails.Take(100)
        });
    }

    // ── GET ... ───────────────────────────────────────────────────────────────
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> ListMembers(
        string campaign_id,
        [FromQuery] int page       = 1,
        [FromQuery] int page_size  = 50,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        if (!await CampaignExistsAsync(campaign_id)) return NotFound(new { detail = "Campaign not found." });

        page_size = Math.Min(page_size, 200);

        // Pull campaign-wide list once; the stat-card counts are computed from
        // THIS list (unfiltered) so the cards always show campaign totals.
        var allMembers = await _members.GetByCampaignIdAsync(campaign_id);
        var registeredCount   = allMembers.Count(m => m.Status == MemberStatus.Registered);
        var unregisteredCount = allMembers.Count(m => m.Status == MemberStatus.Unregistered);
        var totalCount        = allMembers.Count;

        // Now apply filters for the paginated table view.
        var filtered = allMembers.AsEnumerable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<MemberStatus>(
                char.ToUpperInvariant(status[0]) + status[1..].ToLowerInvariant(), out var ms))
            filtered = filtered.Where(m => m.Status == ms);

        if (!string.IsNullOrEmpty(search))
        {
            var s = search.Trim().ToLowerInvariant();
            filtered = filtered.Where(m =>
                m.Name.Contains(s, StringComparison.OrdinalIgnoreCase) ||
                m.Mobile.Contains(s) ||
                (m.Email != null && m.Email.Contains(s, StringComparison.OrdinalIgnoreCase)));
        }

        var sortedFiltered = filtered.OrderBy(m => m.Name).ToList();
        var filteredTotal  = sortedFiltered.Count;
        var totalPages     = (int)Math.Ceiling(filteredTotal / (double)page_size);
        var paged          = sortedFiltered.Skip((page - 1) * page_size).Take(page_size)
                                           .Select(ToMemberResponse).ToList();

        return Ok(new
        {
            members             = paged,
            total               = totalCount,          // campaign-wide (stat card)
            filtered_total      = filteredTotal,       // size of current filter+search
            page,
            page_size,
            total_pages         = totalPages,
            registered_count    = registeredCount,     // unfiltered
            unregistered_count  = unregisteredCount    // unfiltered
        });
    }

    // ── POST ... (add single member) ──────────────────────────────────────────
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> AddMember(string campaign_id, [FromBody] AddMemberRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });
        if (campaign.CampaignType != CampaignType.ClosedGroup)
            return BadRequest(new { detail = "Member management is only for closed group campaigns." });

        var mobile = NormalizeMobile(req.Mobile);
        if (await _members.GetByMobileAsync(campaign_id, mobile) != null)
            return BadRequest(new { detail = "A member with this mobile number already exists." });

        var now = DateTime.UtcNow;
        var member = new CampaignMember
        {
            Id           = Guid.NewGuid().ToString(),
            CampaignId   = campaign_id,
            Name         = req.Name.Trim(),
            Mobile       = mobile,
            Email        = req.Email,
            CustomFields = JsonSerializer.Serialize(req.CustomFields ?? new Dictionary<string, object?>()),
            Status       = MemberStatus.Unregistered,
            CreatedBy    = CurrentUserId ?? "",
            CreatedAt    = now,
            UpdatedAt    = now
        };
        await _members.CreateAsync(member);
        return Ok(new { success = true, member = ToMemberResponse(member) });
    }

    // ── PUT .../{member_id} ───────────────────────────────────────────────────
    [HttpPut("{member_id}")]
    [Authorize]
    public async Task<IActionResult> UpdateMember(
        string campaign_id, string member_id, [FromBody] UpdateMemberRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var member = await _members.GetByIdAsync(member_id);
        if (member == null || member.CampaignId != campaign_id)
            return NotFound(new { detail = "Member not found." });

        if (member.Status == MemberStatus.Registered)
            return BadRequest(new { detail = "Cannot modify a registered member." });

        if (req.Mobile != null)
        {
            var mobile = NormalizeMobile(req.Mobile);
            var existing = await _members.GetByMobileAsync(campaign_id, mobile);
            if (existing != null && existing.Id != member_id)
                return BadRequest(new { detail = "Mobile number already in use." });
            member.Mobile = mobile;
        }

        if (req.Name != null)         member.Name  = req.Name.Trim();
        if (req.Email != null)        member.Email = req.Email;
        if (req.CustomFields != null) member.CustomFields = JsonSerializer.Serialize(req.CustomFields);
        member.UpdatedAt = DateTime.UtcNow;

        await _members.UpdateAsync(member);
        return Ok(new { success = true, message = "Member updated." });
    }

    // ── DELETE .../{member_id} ────────────────────────────────────────────────
    [HttpDelete("{member_id}")]
    [Authorize]
    public async Task<IActionResult> DeleteMember(string campaign_id, string member_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var member = await _members.GetByIdAsync(member_id);
        if (member == null || member.CampaignId != campaign_id)
            return NotFound(new { detail = "Member not found." });
        if (member.Status == MemberStatus.Registered)
            return BadRequest(new { detail = "Cannot delete a registered member." });

        await _members.DeleteAsync(member);
        return Ok(new { success = true, message = "Member deleted." });
    }

    // ── GET .../public (public — masked) ──────────────────────────────────────
    [HttpGet("public")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicMemberList(
        string campaign_id, [FromQuery] string? search)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });
        if (campaign.CampaignType != CampaignType.ClosedGroup)
            return BadRequest(new { detail = "Not a closed group campaign." });

        var all = await _members.GetByCampaignIdAsync(campaign_id);
        if (!string.IsNullOrEmpty(search))
        {
            var s = search.Trim().ToLowerInvariant();
            all = all.Where(m =>
                m.Name.Contains(s, StringComparison.OrdinalIgnoreCase) ||
                m.Mobile.Contains(s)).ToList();
        }

        var result = all.Select(m => new
        {
            id            = m.Id,
            name          = m.Name,
            mobile_masked = MaskMobile(m.Mobile),
            email_masked  = m.Email != null ? MaskEmail(m.Email) : null,
            status        = m.Status.ToString().ToLowerInvariant()
        }).ToList();

        return Ok(new { members = result, total = result.Count });
    }

    // ── GET .../{member_id}/verify (public) ───────────────────────────────────
    [HttpGet("{member_id}/verify")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyMember(string campaign_id, string member_id)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var member = await _members.GetByIdAsync(member_id);
        if (member == null || member.CampaignId != campaign_id)
            return NotFound(new { detail = "Member not found." });

        if (member.Status == MemberStatus.Registered)
            return BadRequest(new { detail = "Member is already registered.", can_register = false });

        var cf = new Dictionary<string, object?>();
        try { cf = JsonSerializer.Deserialize<Dictionary<string, object?>>(member.CustomFields) ?? cf; } catch { }

        return Ok(new
        {
            can_register  = true,
            prefill_data  = new
            {
                name          = member.Name,
                mobile        = member.Mobile,
                email         = member.Email,
                custom_fields = cf
            }
        });
    }

    // ── POST .../reminders (bulk) ─────────────────────────────────────────────
    [HttpPost("reminders")]
    [Authorize]
    public async Task<IActionResult> SendReminders(string campaign_id, [FromBody] SendRemindersRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var all = await _members.GetByCampaignIdAsync(campaign_id);

        // Filter by selected member IDs if provided; otherwise all unregistered
        var targets = req.MemberIds != null && req.MemberIds.Count > 0
            ? all.Where(m => req.MemberIds.Contains(m.Id)).ToList()
            : all.Where(m => m.Status != MemberStatus.Registered).ToList();

        var wantEmail    = req.Channels?.Contains("email",    StringComparer.OrdinalIgnoreCase) == true;
        var wantWhatsapp = req.Channels?.Contains("whatsapp", StringComparer.OrdinalIgnoreCase) == true;
        var errors       = new List<object>();
        int emailSent    = 0, emailFailed    = 0;
        int whatsappSent = 0, whatsappFailed = 0;

        var baseAmount = TryGetCampaignBaseAmount(campaign);

        foreach (var m in targets)
        {
            if (wantEmail && !string.IsNullOrWhiteSpace(m.Email))
            {
                var ok = await _regEmail.SendReminderAsync(m.Name, m.Email, m.Mobile ?? "", campaign);
                if (ok) emailSent++; else { emailFailed++; errors.Add(new { member_id = m.Id, channel = "email", error = "send_failed" }); }
            }

            if (wantWhatsapp && !string.IsNullOrWhiteSpace(m.Mobile))
            {
                if (!_whatsapp.IsConfigured())
                {
                    whatsappFailed++;
                    errors.Add(new { member_id = m.Id, channel = "whatsapp", error = "interakt_not_configured" });
                    continue;
                }
                try
                {
                    var result = await _whatsapp.SendTemplateMessageAsync(
                        phoneNumber  : m.Mobile,
                        countryCode  : "91",
                        templateName : "payment_reminder",
                        bodyValues   : new[] { m.Name, campaign.Name, $"₹{baseAmount:N0}" });
                    if (result.Success) whatsappSent++;
                    else
                    {
                        whatsappFailed++;
                        errors.Add(new { member_id = m.Id, channel = "whatsapp", error = result.Error ?? "send_failed" });
                        _logger.LogWarning("WhatsApp reminder failed for {Mobile}: {Error}", m.Mobile, result.Error);
                    }
                }
                catch (Exception ex)
                {
                    whatsappFailed++;
                    errors.Add(new { member_id = m.Id, channel = "whatsapp", error = ex.Message });
                    _logger.LogWarning(ex, "WhatsApp reminder exception for {Mobile}", m.Mobile);
                }
            }
        }

        return Ok(new
        {
            total           = targets.Count,
            email_sent      = emailSent,
            email_failed    = emailFailed,
            whatsapp_sent   = whatsappSent,
            whatsapp_failed = whatsappFailed,
            errors
        });
    }

    // ── POST .../{member_id}/reminder (individual) ────────────────────────────
    [HttpPost("{member_id}/reminder")]
    [Authorize]
    public async Task<IActionResult> SendIndividualReminder(
        string campaign_id, string member_id, [FromBody] SendReminderRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var member = await _members.GetByIdAsync(member_id);
        if (member == null || member.CampaignId != campaign_id)
            return NotFound(new { detail = "Member not found." });
        if (member.Status == MemberStatus.Registered)
            return BadRequest(new { detail = "Member is already registered." });

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var wantEmail    = req.Channels?.Contains("email",    StringComparer.OrdinalIgnoreCase) == true;
        var wantWhatsapp = req.Channels?.Contains("whatsapp", StringComparer.OrdinalIgnoreCase) == true;
        bool emailSent = false, whatsappSent = false;
        var errors = new List<object>();

        if (wantEmail)
        {
            if (string.IsNullOrWhiteSpace(member.Email))
                errors.Add(new { channel = "email", error = "no_email_on_file" });
            else
            {
                emailSent = await _regEmail.SendReminderAsync(member.Name, member.Email, member.Mobile ?? "", campaign);
                if (!emailSent) errors.Add(new { channel = "email", error = "send_failed" });
            }
        }

        if (wantWhatsapp)
        {
            if (string.IsNullOrWhiteSpace(member.Mobile))
                errors.Add(new { channel = "whatsapp", error = "no_mobile_on_file" });
            else if (!_whatsapp.IsConfigured())
                errors.Add(new { channel = "whatsapp", error = "interakt_not_configured" });
            else
            {
                try
                {
                    var baseAmount = TryGetCampaignBaseAmount(campaign);
                    var result = await _whatsapp.SendTemplateMessageAsync(
                        phoneNumber  : member.Mobile,
                        countryCode  : "91",
                        templateName : "payment_reminder",
                        bodyValues   : new[] { member.Name, campaign.Name, $"₹{baseAmount:N0}" });
                    whatsappSent = result.Success;
                    if (!result.Success)
                    {
                        errors.Add(new { channel = "whatsapp", error = result.Error ?? "send_failed" });
                        _logger.LogWarning("WhatsApp reminder failed for {Mobile}: {Error}", member.Mobile, result.Error);
                    }
                }
                catch (Exception ex)
                {
                    errors.Add(new { channel = "whatsapp", error = ex.Message });
                    _logger.LogWarning(ex, "WhatsApp reminder exception for {Mobile}", member.Mobile);
                }
            }
        }

        return Ok(new { member_id, email_sent = emailSent, whatsapp_sent = whatsappSent, errors });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<bool> HasAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }

    private async Task<bool> CampaignExistsAsync(string id) =>
        await _campaigns.GetByIdAsync(id) != null;

    private static string NormalizeMobile(string mobile)
    {
        var digits = new string(mobile.Where(char.IsDigit).ToArray());
        return digits.Length >= 10 ? digits[^10..] : digits;
    }

    // Pulls `base_amount` from campaign.payment_config JSON for WhatsApp template substitution.
    private static decimal TryGetCampaignBaseAmount(Campaign campaign)
    {
        if (string.IsNullOrWhiteSpace(campaign.PaymentConfig)) return 0m;
        try
        {
            using var doc = JsonDocument.Parse(campaign.PaymentConfig);
            if (doc.RootElement.TryGetProperty("base_amount", out var v))
            {
                if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) return d;
                if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out var p)) return p;
            }
        }
        catch { /* fall through */ }
        return 0m;
    }

    private static string MaskMobile(string mobile) =>
        mobile.Length >= 4 ? "****" + mobile[^4..] : "****";

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at < 2) return "**@" + (at >= 0 ? email[(at + 1)..] : email);
        return email[..2] + new string('*', at - 2) + email[at..];
    }

    private static object ToMemberResponse(CampaignMember m) => new
    {
        id           = m.Id,
        campaign_id  = m.CampaignId,
        name         = m.Name,
        mobile       = m.Mobile,
        email        = m.Email,
        custom_fields= ParseJsonSafe(m.CustomFields),
        status       = m.Status.ToString().ToLowerInvariant(),
        registration_id = m.RegistrationId,
        registered_at= m.RegisteredAt,
        created_at   = m.CreatedAt,
        updated_at   = m.UpdatedAt
    };

    private static object? ParseJsonSafe(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonDocument.Parse(json).RootElement.Clone(); } catch { return null; }
    }

    private static async Task<(List<string> Columns, List<Dictionary<string, string>> Rows)>
        ParseFileAsync(IFormFile file)
    {
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext == ".xlsx" || ext == ".xls")
            return ParseExcel(file);

        return await ParseCsvAsync(file);
    }

    private static (List<string>, List<Dictionary<string, string>>) ParseExcel(IFormFile file)
    {
        using var stream = file.OpenReadStream();
        using var wb     = new XLWorkbook(stream);
        var ws           = wb.Worksheets.First();
        var headerRow    = ws.Row(1);
        var cols         = headerRow.Cells().Select(c => c.GetString().Trim()).ToList();
        var rows         = new List<Dictionary<string, string>>();

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var dict = new Dictionary<string, string>();
            for (int i = 0; i < cols.Count; i++)
                dict[cols[i]] = row.Cell(i + 1).GetString().Trim();
            rows.Add(dict);
        }
        return (cols, rows);
    }

    private static async Task<(List<string>, List<Dictionary<string, string>>)> ParseCsvAsync(IFormFile file)
    {
        using var stream = file.OpenReadStream();
        using var reader = new StreamReader(stream);
        using var csv    = new CsvReader(reader, CultureInfo.InvariantCulture);

        await csv.ReadAsync();
        csv.ReadHeader();
        var cols = csv.HeaderRecord?.ToList() ?? new List<string>();
        var rows = new List<Dictionary<string, string>>();

        await foreach (var record in csv.GetRecordsAsync<dynamic>())
        {
            var dict = (IDictionary<string, object>)record;
            rows.Add(dict.ToDictionary(kv => kv.Key, kv => kv.Value?.ToString() ?? ""));
        }
        return (cols, rows);
    }
}

public record AddMemberRequest(string Name, string Mobile, string? Email, Dictionary<string, object?>? CustomFields);
public record UpdateMemberRequest(string? Name, string? Mobile, string? Email, Dictionary<string, object?>? CustomFields);
public record SendRemindersRequest(List<string> Channels, List<string>? MemberIds);
public record SendReminderRequest(List<string> Channels);
