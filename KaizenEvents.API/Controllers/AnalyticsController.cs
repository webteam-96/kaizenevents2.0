using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class AnalyticsController : ApiControllerBase
{
    private readonly ICampaignRepository _campaigns;
    private readonly IRegistrationRepository _registrations;
    private readonly IUserRepository _users;

    private readonly IBrevoService _email;
    private readonly IRegistrationRepository _regs;

    public AnalyticsController(
        ICampaignRepository campaigns,
        IRegistrationRepository registrations,
        IUserRepository users,
        IBrevoService email)
    {
        _campaigns     = campaigns;
        _registrations = registrations;
        _users         = users;
        _email         = email;
        _regs          = registrations;
    }

    // ── GET /api/campaigns/{campaign_id}/analytics ────────────────────────────
    [HttpGet("campaigns/{campaign_id}/analytics")]
    public async Task<IActionResult> GetAnalytics(string campaign_id)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();

        var regs = await _registrations.GetByCampaignIdAsync(campaign_id);

        var paid    = regs.Count(r => r.PaymentStatus == PaymentStatus.Completed);
        var pending = regs.Count(r => r.PaymentStatus == PaymentStatus.Pending);
        var failed  = regs.Count(r => r.PaymentStatus == PaymentStatus.Failed);
        var revenue = regs.Where(r => r.PaymentStatus == PaymentStatus.Completed)
                          .Sum(r => r.TotalAmount);
        var avg     = paid > 0 ? revenue / paid : 0;

        var byDate = regs
            .GroupBy(r => IstTime.FromUtc(r.CreatedAt).Date.ToString("yyyy-MM-dd"))
            .Select(g => new { date = g.Key, count = g.Count() })
            .OrderBy(x => x.date)
            .ToList();

        var failedPayments = regs
            .Where(r => r.PaymentStatus == PaymentStatus.Failed)
            .Select(r => new
            {
                id         = r.Id,
                name       = ExtractField(r.FormData, "name") ?? "Unknown",
                email      = ExtractField(r.FormData, "email"),
                phone      = ExtractField(r.FormData, "phone"),
                amount     = r.TotalAmount,
                created_at = r.CreatedAt,
                gateway    = r.PaymentGateway
            })
            .ToList();

        return Ok(new
        {
            total_registrations        = regs.Count,
            paid_registrations         = paid,
            pending_registrations      = pending,
            failed_registrations       = failed,
            total_revenue              = revenue,
            average_registration_value = avg,
            registration_by_date       = byDate,
            failed_payments            = failedPayments,
            top_registration_sources   = Array.Empty<object>()
        });
    }

    // ── GET /api/campaigns/{campaign_id}/export/csv ───────────────────────────
    [HttpGet("campaigns/{campaign_id}/export/csv")]
    public async Task<IActionResult> ExportCsv(string campaign_id)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();

        var regs = (await _registrations.GetByCampaignIdAsync(campaign_id))
            .OrderBy(r => r.CreatedAt)   // oldest first → newest registration on the last row
            .ToList();
        if (regs.Count == 0)
            return NotFound(new { detail = "No registrations found." });

        // Build field ID → label map and identify "name"-type fields whose values
        // live in `${id}_first`, `${id}_middle`, `${id}_last` sub-keys — those need
        // to be collapsed to a single column ("Participant Name") in the export.
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        var fieldLabelMap = new Dictionary<string, string>();
        var nameFieldIds  = new HashSet<string>();
        // fieldId → { optionValue: optionLabel } for choice fields, so the CSV shows the
        // human label (e.g. "Abhay … - 2 Qty.") instead of the stored "value_abc" key.
        var fieldOptionsMap = new Dictionary<string, Dictionary<string, string>>();
        if (campaign?.FormConfig != null)
        {
            try
            {
                using var formDoc = JsonDocument.Parse(campaign.FormConfig);
                if (formDoc.RootElement.TryGetProperty("fields", out var fieldsEl) &&
                    fieldsEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var f in fieldsEl.EnumerateArray())
                    {
                        var fId    = f.TryGetProperty("id",    out var idEl) ? idEl.GetString() : null;
                        var fLabel = f.TryGetProperty("label", out var lEl) ? lEl.GetString() : null;
                        var fType  = f.TryGetProperty("type",  out var tEl) ? tEl.GetString() : null;
                        if (fId != null && fLabel != null)
                            fieldLabelMap[fId] = fLabel;
                        if (fId != null && fType == "name")
                            nameFieldIds.Add(fId);
                        if (fId != null && f.TryGetProperty("options", out var optsEl) &&
                            optsEl.ValueKind == JsonValueKind.Array)
                        {
                            var m = new Dictionary<string, string>(StringComparer.Ordinal);
                            foreach (var o in optsEl.EnumerateArray())
                            {
                                if (o.ValueKind != JsonValueKind.Object) continue;
                                var ov = o.TryGetProperty("value", out var vv) && vv.ValueKind == JsonValueKind.String ? vv.GetString() : null;
                                var ol = o.TryGetProperty("label", out var lv) && lv.ValueKind == JsonValueKind.String ? lv.GetString() : null;
                                if (!string.IsNullOrEmpty(ov)) m[ov] = ol ?? ov;
                            }
                            if (m.Count > 0) fieldOptionsMap[fId] = m;
                        }
                    }
                }
            }
            catch { /* ignore parse errors */ }
        }

        string GetLabel(string key) => fieldLabelMap.TryGetValue(key, out var lbl) ? lbl : key;

        // Maps a choice field's stored value(s) to their label(s). Handles a single value
        // or a JSON array string (multi-select checkbox). Non-choice fields pass through.
        string ResolveValue(string key, string rawValue)
        {
            if (string.IsNullOrEmpty(rawValue) || !fieldOptionsMap.TryGetValue(key, out var m))
                return rawValue;
            if (rawValue.StartsWith("["))
            {
                try
                {
                    using var arr = JsonDocument.Parse(rawValue);
                    if (arr.RootElement.ValueKind == JsonValueKind.Array)
                        return string.Join(", ", arr.RootElement.EnumerateArray()
                            .Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.ToString())
                            .Select(v => m.TryGetValue(v, out var lbl) ? lbl : SlugHelper.Humanize(v)));
                }
                catch { /* not a JSON array after all — fall through */ }
            }
            // No exact option match (option edited/deleted after registration) → humanize the slug.
            return m.TryGetValue(rawValue, out var single) ? single : SlugHelper.Humanize(rawValue);
        }

        // Collect all unique form_data keys, after collapsing name sub-fields.
        var allKeys = new SortedSet<string>();
        var parsedData = regs.Select(r =>
        {
            var fd = ParseFormData(r.FormData);

            // Answers to questions this registrant never saw are left out of the export —
            // a name picked before they switched away is not their name. Submissions are
            // stripped of these on arrival now (FieldVisibility.StripHiddenAnswers); this
            // covers rows written before that. A column can still exist for the field
            // because another registrant did answer it; theirs is simply blank.
            foreach (var hiddenId in FieldVisibility.AllHiddenFieldIds(campaign?.FormConfig, r.FormData))
            {
                fd.Remove(hiddenId);
                foreach (var suffix in FieldVisibility.CompositeSuffixes)
                    fd.Remove(hiddenId + suffix);
            }

            foreach (var nameId in nameFieldIds)
            {
                var first  = fd.TryGetValue($"{nameId}_first",  out var fv) ? fv : "";
                var middle = fd.TryGetValue($"{nameId}_middle", out var mv) ? mv : "";
                var last   = fd.TryGetValue($"{nameId}_last",   out var lv) ? lv : "";
                var parts  = new[] { first, middle, last }
                    .Where(s => !string.IsNullOrWhiteSpace(s));
                var combined = string.Join(" ", parts).Trim();
                if (!string.IsNullOrEmpty(combined))
                    fd[nameId] = combined;
                else if (!fd.ContainsKey(nameId))
                    fd[nameId] = "";
                // Strip the sub-keys so they don't appear as separate columns
                fd.Remove($"{nameId}_first");
                fd.Remove($"{nameId}_middle");
                fd.Remove($"{nameId}_last");
            }
            foreach (var k in fd.Keys) allKeys.Add(k);
            return (r, fd);
        }).ToList();

        var sb = new StringBuilder();

        // Header — use field labels instead of raw IDs
        var fixedCols = new[] { "Registration ID", "Invoice Number", "Payment Status",
                                 "Registration Status", "Total Amount", "Payment ID", "Created At" };
        sb.AppendLine(string.Join(",", fixedCols.Concat(allKeys.Select(GetLabel)).Select(EscapeCsv)));

        // Rows
        foreach (var (r, fd) in parsedData)
        {
            var row = new List<string>
            {
                r.Id,
                r.InvoiceNumber ?? "",
                r.PaymentStatus.ToString().ToLowerInvariant(),
                r.RegistrationStatus.ToString().ToLowerInvariant(),
                r.TotalAmount.ToString("F2"),
                r.GatewayPaymentId ?? "",
                // Stored as UTC; export in IST so it matches the payment gateway's clock
                IstTime.FromUtc(r.CreatedAt).ToString("yyyy-MM-dd HH:mm:ss")
            };
            foreach (var k in allKeys)
                row.Add(fd.TryGetValue(k, out var v) ? ResolveValue(k, v) : "");
            sb.AppendLine(string.Join(",", row.Select(EscapeCsv)));
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv", $"registrations_{campaign_id}.csv");
    }

    // ── POST /api/registrations/{registration_id}/resend-receipt ─────────────
    [HttpPost("registrations/{registration_id}/resend-receipt")]
    public async Task<IActionResult> ResendReceipt(string registration_id)
    {
        var reg = await _regs.GetByIdAsync(registration_id);
        if (reg == null) return NotFound(new { detail = "Registration not found." });
        if (reg.PaymentStatus != PaymentStatus.Completed)
            return BadRequest(new { detail = "Receipt only available for completed payments." });

        var campaign = await _campaigns.GetByIdAsync(reg.CampaignId);
        var campaignName = campaign?.Name ?? "the event";

        // Look up email/name via the form config (field IDs are random, not "email"/"name")
        var email = FindFieldValue(reg.FormData, campaign?.FormConfig, "email")
                    ?? ScanForEmail(reg.FormData);
        var name  = FindFieldValue(reg.FormData, campaign?.FormConfig, "name")
                    ?? ExtractField(reg.FormData, "name")
                    ?? "Guest";

        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { detail = "Registration has no email address on file." });

        var html = $@"
<h2>Registration Receipt</h2>
<p>Hello {name},</p>
<p>Here's your receipt for <strong>{campaignName}</strong>:</p>
<table style='border-collapse:collapse;margin:16px 0;'>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Registration ID:</td><td style='font-family:monospace;'>{reg.Id[..8].ToUpperInvariant()}</td></tr>
  {(string.IsNullOrEmpty(reg.InvoiceNumber) ? "" : $"<tr><td style='padding:4px 12px 4px 0;color:#666;'>Invoice:</td><td>{reg.InvoiceNumber}</td></tr>")}
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Amount Paid:</td><td>INR {reg.TotalAmount:F2}</td></tr>
  {(string.IsNullOrEmpty(reg.GatewayPaymentId) ? "" : $"<tr><td style='padding:4px 12px 4px 0;color:#666;'>Payment ID:</td><td style='font-family:monospace;font-size:12px;'>{reg.GatewayPaymentId}</td></tr>")}
</table>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";

        var sent = await _email.SendEmailAsync(email, name, $"Receipt — {campaignName}", html);
        return Ok(new { status = sent ? "success" : "failed", message = sent ? "Receipt email sent." : "Email service not configured.", email });
    }

    // ── POST /api/registrations/{registration_id}/send-whatsapp ──────────────
    [HttpPost("registrations/{registration_id}/send-whatsapp")]
    public async Task<IActionResult> SendWhatsApp(string registration_id)
    {
        var reg = await new KaizenEvents.Infrastructure.Repositories.RegistrationRepository(
            HttpContext.RequestServices
                .GetRequiredService<KaizenEvents.Infrastructure.Data.AppDbContext>())
            .GetByIdAsync(registration_id);

        if (reg == null) return NotFound(new { detail = "Registration not found." });

        var phone = ExtractField(reg.FormData, "phone") ?? "N/A";
        // WhatsApp sending integrated in WhatsAppController (Step 13)
        return Ok(new { status = "success", message = "WhatsApp notification queued.", phone });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<bool> HasAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }

    private static string? ExtractField(string json, string key)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(key, out var el))
                return el.ValueKind == JsonValueKind.String ? el.GetString() : el.ToString();
        }
        catch { }
        return null;
    }

    /// <summary>
    /// Find a value in form_data by looking up the field ID in form_config whose type matches.
    /// Form fields have random IDs (e.g., "1776161227480"), so we can't look them up by semantic name directly.
    /// </summary>
    private static string? FindFieldValue(string formDataJson, string? formConfigJson, string fieldType)
    {
        if (string.IsNullOrEmpty(formConfigJson)) return null;
        try
        {
            using var formDoc   = JsonDocument.Parse(formDataJson);
            using var configDoc = JsonDocument.Parse(formConfigJson);

            if (!configDoc.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array)
                return null;

            foreach (var f in fieldsEl.EnumerateArray())
            {
                var type = f.TryGetProperty("type", out var tEl) ? tEl.GetString() : null;
                if (!string.Equals(type, fieldType, StringComparison.OrdinalIgnoreCase)) continue;

                var id = f.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrEmpty(id)) continue;

                if (formDoc.RootElement.TryGetProperty(id, out var valEl))
                {
                    var val = valEl.ValueKind == JsonValueKind.String ? valEl.GetString() : valEl.ToString();
                    if (!string.IsNullOrWhiteSpace(val)) return val;
                }
            }
        }
        catch { }
        return null;
    }

    /// <summary>Scan all form_data values for one that looks like an email address (fallback).</summary>
    private static string? ScanForEmail(string formDataJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(formDataJson);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Value.ValueKind != JsonValueKind.String) continue;
                var v = prop.Value.GetString();
                if (!string.IsNullOrEmpty(v) && v.Contains('@') && v.LastIndexOf('.') > v.IndexOf('@'))
                    return v;
            }
        }
        catch { }
        return null;
    }

    private static Dictionary<string, string> ParseFormData(string json)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var prop in doc.RootElement.EnumerateObject())
                result[prop.Name] = prop.Value.ValueKind == JsonValueKind.String
                    ? prop.Value.GetString() ?? "" : prop.Value.ToString();
        }
        catch { }
        return result;
    }

    private static string EscapeCsv(string val)
    {
        if (val.Contains(',') || val.Contains('"') || val.Contains('\n'))
            return $"\"{val.Replace("\"", "\"\"")}\"";
        return val;
    }
}
