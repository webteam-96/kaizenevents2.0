using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// DKIM domain registration via Brevo (formerly Sendinblue).
/// Brevo endpoints:
///   POST   /v3/senders/domains              — create domain
///   GET    /v3/senders/domains/{name}       — fetch status + DNS records
///   PUT    /v3/senders/domains/{name}/authenticate — trigger verification
///   DELETE /v3/senders/domains/{name}       — delete
/// Auth: header `api-key: {BrevoApiKey}` — uses the global config value.
/// </summary>
[ApiController]
[Route("api/dkim")]
[Authorize]
public class DkimController : ApiControllerBase
{
    private readonly IDkimDomainRepository _domains;
    private readonly IEmailSenderRepository _senders;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<DkimController> _logger;

    private const string BrevoBase = "https://api.brevo.com/v3/senders/domains";

    public DkimController(
        IDkimDomainRepository domains,
        IEmailSenderRepository senders,
        IHttpClientFactory http,
        IConfiguration config,
        ILogger<DkimController> logger)
    {
        _domains = domains;
        _senders = senders;
        _http    = http;
        _config  = config;
        _logger  = logger;
    }

    private string? BrevoApiKey => _config["Brevo:ApiKey"];

    // ── POST /api/dkim/domains ────────────────────────────────────────────────
    [HttpPost("domains")]
    public async Task<IActionResult> CreateDomain([FromBody] CreateDkimDomainRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (string.IsNullOrWhiteSpace(BrevoApiKey))
            return BadRequest(new { detail = "Brevo API key not configured on the server." });

        var normalized = req.Domain.Trim().ToLowerInvariant();
        if (await _domains.GetByDomainAsync(normalized) != null)
            return BadRequest(new { detail = "Domain already registered." });

        var resp = await CallBrevoAsync(HttpMethod.Post, BrevoBase, new { name = normalized });
        if (resp == null)
            return StatusCode(500, new { detail = "Failed to register domain with Brevo." });

        var root = resp.RootElement;

        long? brevoId = root.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number
            ? idEl.GetInt64() : null;

        var records = ParseBrevoDnsRecords(root);
        var dkimRecordsJson = JsonSerializer.Serialize(new { records });

        var now = DateTime.UtcNow;
        var domain = new DkimDomain
        {
            Id            = Guid.NewGuid().ToString(),
            Domain        = normalized,
            Status        = "pending",
            DkimRecords   = dkimRecordsJson,
            BrevoDomainId = brevoId,
            CreatedBy     = CurrentUserId ?? "",
            CreatedAt     = now,
            UpdatedAt     = now
        };
        await _domains.CreateAsync(domain);

        return Ok(new
        {
            id         = domain.Id,
            domain     = domain.Domain,
            status     = domain.Status,
            records,
            created_at = domain.CreatedAt
        });
    }

    // ── GET /api/dkim/domains ─────────────────────────────────────────────────
    [HttpGet("domains")]
    public async Task<IActionResult> ListDomains()
    {
        if (!IsSuperAdmin) return Forbidden();
        var all = await _domains.GetAllAsync();
        return Ok(all.Select(ToResponse));
    }

    // ── GET /api/dkim/domains/{domain_id} ────────────────────────────────────
    [HttpGet("domains/{domain_id}")]
    public async Task<IActionResult> GetDomain(string domain_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var d = await _domains.GetByIdAsync(domain_id);
        if (d == null) return NotFound(new { detail = "Domain not found." });

        // Pull the live DNS records + auth status from Brevo and persist them. This
        // self-heals domains whose records were never captured at creation (e.g. the
        // domain already existed in the Brevo account, so the create response carried
        // no dns_records), and keeps the verified/pending status in sync.
        await RefreshDomainFromBrevoAsync(d);
        return Ok(ToResponse(d));
    }

    // ── POST /api/dkim/domains/{domain_id}/verify ─────────────────────────────
    [HttpPost("domains/{domain_id}/verify")]
    public async Task<IActionResult> VerifyDomain(string domain_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        if (string.IsNullOrWhiteSpace(BrevoApiKey))
            return BadRequest(new { detail = "Brevo API key not configured on the server." });

        var d = await _domains.GetByIdAsync(domain_id);
        if (d == null) return NotFound(new { detail = "Domain not found." });

        // Trigger Brevo authentication check, then pull fresh status + DNS records.
        await CallBrevoAsync(HttpMethod.Put,
            $"{BrevoBase}/{Uri.EscapeDataString(d.Domain)}/authenticate", null);

        await RefreshDomainFromBrevoAsync(d);

        return Ok(new
        {
            status  = d.Status,
            message = $"Domain verification status: {d.Status}",
            records = GetRecords(d.DkimRecords)
        });
    }

    // ── DELETE /api/dkim/domains/{domain_id} ──────────────────────────────────
    [HttpDelete("domains/{domain_id}")]
    public async Task<IActionResult> DeleteDomain(string domain_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var d = await _domains.GetByIdAsync(domain_id);
        if (d == null) return NotFound(new { detail = "Domain not found." });

        var allSenders = await _senders.GetAllAsync();
        var count      = allSenders.Count(s => s.DomainId == domain_id);
        if (count > 0)
            return BadRequest(new { detail = $"Cannot delete domain. {count} email sender(s) are using it." });

        // Best-effort delete on Brevo side — proceed even if it fails
        if (!string.IsNullOrWhiteSpace(BrevoApiKey))
        {
            try
            {
                await CallBrevoAsync(HttpMethod.Delete,
                    $"{BrevoBase}/{Uri.EscapeDataString(d.Domain)}", null);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Brevo domain delete failed for {Domain}", d.Domain); }
        }

        await _domains.DeleteAsync(d);
        return Ok(new { message = "Domain deleted successfully." });
    }

    // ── POST /api/dkim/senders ────────────────────────────────────────────────
    [HttpPost("senders")]
    public async Task<IActionResult> CreateSender([FromBody] CreateEmailSenderRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var domain = await _domains.GetByIdAsync(req.DkimDomainId);
        if (domain == null)
            return NotFound(new { detail = "DKIM domain not found." });

        var emailDomain = req.Email.Split('@').Last().ToLowerInvariant();
        if (emailDomain != domain.Domain)
            return BadRequest(new { detail = $"Email domain must match DKIM domain ({domain.Domain})." });

        var all        = await _senders.GetAllAsync();
        var lowerEmail = req.Email.Trim().ToLowerInvariant();
        if (all.Any(s => s.Email == lowerEmail))
            return BadRequest(new { detail = "Email sender already exists." });

        if (req.IsDefault)
        {
            foreach (var s in all.Where(s => s.IsDefault))
            {
                s.IsDefault = false;
                s.UpdatedAt = DateTime.UtcNow;
                await _senders.UpdateAsync(s);
            }
        }

        var now    = DateTime.UtcNow;
        var sender = new EmailSender
        {
            Id        = Guid.NewGuid().ToString(),
            Name      = req.Name.Trim(),
            Email     = lowerEmail,
            DomainId  = domain.Id,
            IsDefault = req.IsDefault,
            IsActive  = true,
            CreatedAt = now,
            UpdatedAt = now
        };
        await _senders.CreateAsync(sender);

        return Ok(new
        {
            id             = sender.Id,
            name           = sender.Name,
            email          = sender.Email,
            domain         = domain.Domain,
            dkim_domain_id = domain.Id,
            is_default     = sender.IsDefault,
            is_verified    = domain.Status == "verified",
            created_at     = sender.CreatedAt
        });
    }

    // ── GET /api/dkim/senders ─────────────────────────────────────────────────
    [HttpGet("senders")]
    public async Task<IActionResult> ListSenders()
    {
        if (!IsSuperAdmin) return Forbidden();
        var senders = await _senders.GetAllAsync();
        var result  = new List<object>();
        foreach (var s in senders)
        {
            var d = s.DomainId != null ? await _domains.GetByIdAsync(s.DomainId) : null;
            result.Add(new
            {
                id             = s.Id,
                name           = s.Name,
                email          = s.Email,
                domain         = d?.Domain ?? "",
                dkim_domain_id = s.DomainId ?? "",
                is_default     = s.IsDefault,
                is_verified    = d?.Status == "verified",
                created_at     = s.CreatedAt
            });
        }
        return Ok(result);
    }

    // ── PUT /api/dkim/senders/{sender_id} ─────────────────────────────────────
    [HttpPut("senders/{sender_id}")]
    public async Task<IActionResult> UpdateSender(string sender_id, [FromBody] UpdateEmailSenderRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var sender = await _senders.GetByIdAsync(sender_id);
        if (sender == null) return NotFound(new { detail = "Sender not found." });

        if (req.IsDefault)
        {
            var all = await _senders.GetAllAsync();
            foreach (var s in all.Where(s => s.Id != sender_id && s.IsDefault))
            {
                s.IsDefault = false;
                s.UpdatedAt = DateTime.UtcNow;
                await _senders.UpdateAsync(s);
            }
        }

        if (req.Name != null) sender.Name = req.Name.Trim();
        sender.IsDefault = req.IsDefault;
        sender.UpdatedAt = DateTime.UtcNow;
        await _senders.UpdateAsync(sender);

        return Ok(new { message = "Sender updated successfully." });
    }

    // ── DELETE /api/dkim/senders/{sender_id} ──────────────────────────────────
    [HttpDelete("senders/{sender_id}")]
    public async Task<IActionResult> DeleteSender(string sender_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var sender = await _senders.GetByIdAsync(sender_id);
        if (sender == null) return NotFound(new { detail = "Sender not found." });
        await _senders.DeleteAsync(sender);
        return Ok(new { message = "Sender deleted successfully." });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private object ToResponse(DkimDomain d) => new
    {
        id         = d.Id,
        domain     = d.Domain,
        status     = d.Status,
        records    = GetRecords(d.DkimRecords),
        created_at = d.CreatedAt
    };

    private static object[] GetRecords(string? json)
    {
        if (string.IsNullOrEmpty(json)) return Array.Empty<object>();
        try
        {
            var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("records", out var recEl) &&
                recEl.ValueKind == JsonValueKind.Array)
                return recEl.Deserialize<object[]>() ?? Array.Empty<object>();
        }
        catch { }
        return Array.Empty<object>();
    }

    // Fetches the domain's live DNS records + authentication status from Brevo
    // (GET /v3/senders/domains/{name}) and persists them. Returns the parsed records.
    // No-op fallback to whatever is already stored if Brevo is unreachable.
    private async Task<List<object>> RefreshDomainFromBrevoAsync(DkimDomain d)
    {
        if (string.IsNullOrWhiteSpace(BrevoApiKey))
            return GetRecords(d.DkimRecords).ToList();

        var resp = await CallBrevoAsync(HttpMethod.Get,
            $"{BrevoBase}/{Uri.EscapeDataString(d.Domain)}", null);
        if (resp == null)
            return GetRecords(d.DkimRecords).ToList();

        var root          = resp.RootElement;
        var records       = ParseBrevoDnsRecords(root);
        var authenticated = root.TryGetProperty("authenticated", out var aEl) && aEl.ValueKind == JsonValueKind.True;
        var verified      = root.TryGetProperty("verified",      out var vEl) && vEl.ValueKind == JsonValueKind.True;
        var newStatus     = (authenticated && verified) ? "verified" : "pending";

        var changed = false;
        if (records.Count > 0)
        {
            d.DkimRecords = JsonSerializer.Serialize(new { records });
            changed = true;
        }
        if (d.Status != newStatus)
        {
            d.Status = newStatus;
            changed = true;
        }
        if (changed)
        {
            d.UpdatedAt = DateTime.UtcNow;
            await _domains.UpdateAsync(d);
        }

        return records.Count > 0 ? records : GetRecords(d.DkimRecords).ToList();
    }

    // Brevo returns dns_records as an object with named keys (dkim_record, brevo_code, dmarc_record).
    // Flatten them into an array of { type, name, value } records for the frontend.
    private static List<object> ParseBrevoDnsRecords(JsonElement root)
    {
        var records = new List<object>();
        if (!root.TryGetProperty("dns_records", out var dnsEl) || dnsEl.ValueKind != JsonValueKind.Object)
            return records;

        foreach (var prop in dnsEl.EnumerateObject())
        {
            var v = prop.Value;
            if (v.ValueKind != JsonValueKind.Object) continue;

            var type = v.TryGetProperty("type",      out var tEl) ? tEl.GetString() : "TXT";
            var host = v.TryGetProperty("host_name", out var hEl) ? hEl.GetString()
                     : v.TryGetProperty("hostname",  out var h2) ? h2.GetString() : "";
            var val  = v.TryGetProperty("value",     out var vEl) ? vEl.GetString() : "";

            records.Add(new
            {
                type,
                name  = host ?? "",
                value = val  ?? "",
                label = prop.Name // e.g. "dkim_record", "brevo_code", "dmarc_record"
            });
        }
        return records;
    }

    private async Task<JsonDocument?> CallBrevoAsync(HttpMethod method, string url, object? body)
    {
        try
        {
            var client = _http.CreateClient();
            client.DefaultRequestHeaders.Add("api-key", BrevoApiKey);
            client.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json"));

            var request = new HttpRequestMessage(method, url);
            if (body != null)
            {
                var json = JsonSerializer.Serialize(body);
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Brevo {Method} {Url} returned {Status}: {Body}",
                    method.Method, url, response.StatusCode, responseBody);
            }

            return string.IsNullOrWhiteSpace(responseBody) ? null : JsonDocument.Parse(responseBody);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Brevo API call failed: {Method} {Url}", method.Method, url);
            return null;
        }
    }
}

public record CreateDkimDomainRequest(string Domain);
public record CreateEmailSenderRequest(string Name, string Email, string DkimDomainId, bool IsDefault = false);
public record UpdateEmailSenderRequest(string? Name, bool IsDefault = false);
