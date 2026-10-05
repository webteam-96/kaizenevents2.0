using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Tamper-evident audit logger per CLAUDE.md Section 9.
/// • Hash chain: integrity_hash = SHA-256(JSON(entry) + previous_hash)
/// • Email masking: john.doe@example.com → j******e@example.com
/// • Field redaction: sensitive keys → [REDACTED]
/// • Dual write: file (logs/audit.log) + database
/// </summary>
public class AuditLoggerService : IAuditLoggerService
{
    private readonly IAuditLogRepository _repo;
    private readonly ILogger<AuditLoggerService> _logger;
    private readonly string _logFilePath;

    private static readonly HashSet<string> SensitiveKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "token", "secret", "key", "credential",
        "card_number", "cvv", "pin", "account_number",
        "api_key", "resend_api_key", "interakt_key", "hashed_password"
    };

    // Matches any key that contains a sensitive word
    private static readonly Regex SensitivePattern = new(
        @"password|token|secret|key|credential|card_number|cvv|pin|account_number",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    // Serialize lock to keep hash chain consistent
    private static readonly SemaphoreSlim _lock = new(1, 1);

    public AuditLoggerService(
        IAuditLogRepository repo,
        IConfiguration config,
        ILogger<AuditLoggerService> logger)
    {
        _repo        = repo;
        _logger      = logger;
        _logFilePath = config["Logging:AuditLogPath"] ?? "logs/audit.log";

        // Ensure log directory exists
        var dir = Path.GetDirectoryName(_logFilePath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
    }

    public async Task LogAsync(
        string eventType,
        string? userId        = null,
        string? userEmail     = null,
        string? resourceType  = null,
        string? resourceId    = null,
        object? actionDetails = null,
        string  status        = "success",
        string? errorMessage  = null,
        string? ipAddress     = null,
        string? userAgent     = null)
    {
        await _lock.WaitAsync();
        try
        {
            var maskedEmail  = userEmail != null ? MaskEmail(userEmail) : null;
            var redactedDetails = actionDetails != null ? RedactSensitiveFields(actionDetails) : null;
            var detailsJson  = redactedDetails != null
                ? JsonSerializer.Serialize(redactedDetails, SerializerOptions)
                : null;

            var now = DateTime.UtcNow;

            // Build the entry for hashing (before integrity_hash is known)
            var entryForHash = new
            {
                timestamp     = now,
                event_type    = eventType,
                user_id       = userId,
                user_email    = maskedEmail,
                ip_address    = ipAddress,
                resource_type = resourceType,
                resource_id   = resourceId,
                action_details= detailsJson,
                status
            };

            var previousHash = await _repo.GetLatestIntegrityHashAsync() ?? "";
            var entryJson    = JsonSerializer.Serialize(entryForHash, SerializerOptions);
            var integrityHash = ComputeHash(entryJson + previousHash);

            var log = new AuditLog
            {
                Timestamp      = now,
                EventType      = eventType,
                UserId         = userId,
                UserEmail      = maskedEmail,
                IpAddress      = ipAddress,
                UserAgent      = userAgent,
                ResourceType   = resourceType,
                ResourceId     = resourceId,
                ActionDetails  = detailsJson,
                Status         = status,
                ErrorMessage   = errorMessage,
                IntegrityHash  = integrityHash
            };

            // Write to database
            await _repo.CreateAsync(log);

            // Write to file (dual write)
            await WriteToFileAsync(log);
        }
        catch (Exception ex)
        {
            // Audit logging must never crash the request
            _logger.LogError(ex, "Audit log write failed for event {EventType}", eventType);
        }
        finally
        {
            _lock.Release();
        }
    }

    // ── Email masking ─────────────────────────────────────────────────────────
    internal static string MaskEmail(string email)
    {
        var atIndex = email.IndexOf('@');
        if (atIndex <= 0) return email;

        var local  = email[..atIndex];
        var domain = email[atIndex..];

        if (local.Length <= 2)
            return $"{local[0]}*{domain}";

        return $"{local[0]}{"*".PadRight(local.Length - 2, '*')}{local[^1]}{domain}";
    }

    // ── Field redaction ───────────────────────────────────────────────────────
    private static object RedactSensitiveFields(object obj)
    {
        // Serialize → parse → walk → redact
        var json = JsonSerializer.Serialize(obj, SerializerOptions);
        using var doc = JsonDocument.Parse(json);
        return RedactElement(doc.RootElement) ?? new { };
    }

    private static object? RedactElement(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                var dict = new Dictionary<string, object?>();
                foreach (var prop in el.EnumerateObject())
                {
                    var val = SensitivePattern.IsMatch(prop.Name)
                        ? "[REDACTED]"
                        : (object?)RedactElement(prop.Value);
                    dict[prop.Name] = val;
                }
                return dict;

            case JsonValueKind.Array:
                return el.EnumerateArray().Select(RedactElement).ToArray();

            case JsonValueKind.String:  return el.GetString();
            case JsonValueKind.Number:  return el.TryGetInt64(out var l) ? l : el.GetDouble();
            case JsonValueKind.True:    return true;
            case JsonValueKind.False:   return false;
            default:                    return null;
        }
    }

    // ── Hash ──────────────────────────────────────────────────────────────────
    private static string ComputeHash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    // ── File write ────────────────────────────────────────────────────────────
    private async Task WriteToFileAsync(AuditLog log)
    {
        try
        {
            var line = JsonSerializer.Serialize(new
            {
                timestamp      = log.Timestamp,
                event_type     = log.EventType,
                user_id        = log.UserId,
                user_email     = log.UserEmail,
                ip_address     = log.IpAddress,
                resource_type  = log.ResourceType,
                resource_id    = log.ResourceId,
                status         = log.Status,
                integrity_hash = log.IntegrityHash
            }, SerializerOptions);

            await File.AppendAllTextAsync(_logFilePath, line + Environment.NewLine);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not write to audit log file");
        }
    }
}
