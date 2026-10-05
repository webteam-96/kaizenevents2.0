using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Brevo (formerly Sendinblue) transactional email via REST API v3.
/// Endpoint: POST https://api.brevo.com/v3/smtp/email
/// Auth: api-key header (no bearer).
/// </summary>
public class BrevoService : IBrevoService
{
    private readonly HttpClient _http;
    private readonly string _apiKey;
    private readonly string _senderEmail;
    private readonly string _senderName;
    private readonly ILogger<BrevoService> _logger;

    private const string Endpoint       = "https://api.brevo.com/v3/smtp/email";
    private const string AccountEndpoint = "https://api.brevo.com/v3/account";

    public BrevoService(IHttpClientFactory httpFactory, IConfiguration config, ILogger<BrevoService> logger)
    {
        _http        = httpFactory.CreateClient();
        _apiKey      = config["Brevo:ApiKey"] ?? "";
        _senderEmail = config["Brevo:SenderEmail"] ?? "events@kaizeninfotech.com";
        _senderName  = config["Brevo:SenderName"] ?? "Kaizen Events";
        _logger      = logger;
    }

    public Task<bool> SendEmailAsync(
        string toEmail, string toName, string subject, string htmlBody,
        string? fromEmail = null, string? fromName = null,
        IReadOnlyCollection<string>? cc = null, IReadOnlyCollection<string>? bcc = null)
        => SendInternalAsync(toEmail, toName, subject, htmlBody, null, fromEmail, fromName, cc, bcc);

    public Task<bool> SendEmailWithAttachmentAsync(
        string toEmail, string toName, string subject, string htmlBody,
        byte[] attachmentBytes, string attachmentFilename,
        string? fromEmail = null, string? fromName = null,
        IReadOnlyCollection<string>? cc = null, IReadOnlyCollection<string>? bcc = null)
        => SendInternalAsync(toEmail, toName, subject, htmlBody,
            new[] { (attachmentFilename, attachmentBytes) }, fromEmail, fromName, cc, bcc);

    public Task<bool> SendEmailWithAttachmentsAsync(
        string toEmail, string toName, string subject, string htmlBody,
        IReadOnlyCollection<(string Filename, byte[] Bytes)> attachments,
        string? fromEmail = null, string? fromName = null,
        IReadOnlyCollection<string>? cc = null, IReadOnlyCollection<string>? bcc = null)
        => SendInternalAsync(toEmail, toName, subject, htmlBody, attachments, fromEmail, fromName, cc, bcc);

    private async Task<bool> SendInternalAsync(
        string toEmail, string toName, string subject, string htmlBody,
        IReadOnlyCollection<(string Filename, byte[] Bytes)>? attachments,
        string? fromEmail, string? fromName,
        IReadOnlyCollection<string>? cc, IReadOnlyCollection<string>? bcc)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _logger.LogWarning("Brevo API key not configured — skipping email to {To}", toEmail);
            return false;
        }

        if (string.IsNullOrWhiteSpace(toEmail))
        {
            _logger.LogWarning("Brevo: skipping email with empty recipient");
            return false;
        }

        try
        {
            // Per-call override (e.g. a campaign's verified DKIM sender) wins; otherwise
            // fall back to the global Brevo:SenderEmail / Brevo:SenderName config.
            var senderEmail = string.IsNullOrWhiteSpace(fromEmail) ? _senderEmail : fromEmail;
            var senderName  = string.IsNullOrWhiteSpace(fromName)  ? _senderName  : fromName;

            var payload = new Dictionary<string, object>
            {
                ["sender"]      = new { name = senderName, email = senderEmail },
                ["to"]          = new[] { new { email = toEmail, name = string.IsNullOrEmpty(toName) ? toEmail : toName } },
                ["subject"]     = subject,
                ["htmlContent"] = htmlBody
            };

            // CC / BCC — Brevo expects arrays of { email }. Only include valid, de-duplicated
            // addresses, and never CC/BCC the primary recipient back to itself.
            static object[]? BuildRecipients(IReadOnlyCollection<string>? addrs, string excludeTo) =>
                addrs == null ? null : addrs
                    .Where(a => !string.IsNullOrWhiteSpace(a) && a.Contains('@'))
                    .Select(a => a.Trim())
                    .Where(a => !string.Equals(a, excludeTo, StringComparison.OrdinalIgnoreCase))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Select(a => (object)new { email = a })
                    .ToArray();

            var ccArr  = BuildRecipients(cc, toEmail);
            var bccArr = BuildRecipients(bcc, toEmail);
            if (ccArr is { Length: > 0 })  payload["cc"]  = ccArr;
            if (bccArr is { Length: > 0 }) payload["bcc"] = bccArr;

            var attachmentArr = attachments?
                .Where(a => a.Bytes is { Length: > 0 } && !string.IsNullOrWhiteSpace(a.Filename))
                .Select(a => new { name = a.Filename, content = Convert.ToBase64String(a.Bytes) })
                .ToArray();
            if (attachmentArr is { Length: > 0 })
                payload["attachment"] = attachmentArr;

            var json = JsonSerializer.Serialize(payload);
            var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            request.Headers.Add("api-key", _apiKey);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var response = await _http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Brevo send failed ({Status}) for {To}: {Body}", response.StatusCode, toEmail, body);
                return false;
            }

            _logger.LogInformation("Brevo email sent to {To}: {Subject}", toEmail, subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Brevo exception sending to {To}", toEmail);
            return false;
        }
    }

    public async Task<(bool Ok, string Detail)> VerifyConnectivityAsync()
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
            return (false, "Brevo:ApiKey is not configured (empty) — no email can be sent.");

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, AccountEndpoint);
            request.Headers.Add("api-key", _apiKey);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            var response = await _http.SendAsync(request, cts.Token);
            var body = await response.Content.ReadAsStringAsync(cts.Token);

            if (response.IsSuccessStatusCode)
            {
                string account = "unknown";
                try { account = JsonDocument.Parse(body).RootElement.GetProperty("email").GetString() ?? "unknown"; }
                catch { /* body shape may vary; connectivity is what matters */ }
                return (true, account);
            }

            return (false, $"Brevo returned {(int)response.StatusCode} {response.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            return (false, $"Could not reach {AccountEndpoint}: {ex.Message}");
        }
    }
}
