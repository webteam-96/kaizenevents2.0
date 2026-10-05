using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

public class InteraktService : IInteraktService
{
    private readonly IHttpClientFactory _http;
    private readonly string? _secretKey;
    private readonly ILogger<InteraktService> _logger;

    private const string BaseUrl = "https://api.interakt.ai/v1/public";

    public InteraktService(IHttpClientFactory http, IConfiguration config, ILogger<InteraktService> logger)
    {
        _http    = http;
        _secretKey = config["Interakt:SecretKey"];
        _logger  = logger;
    }

    public bool IsConfigured() => !string.IsNullOrEmpty(_secretKey);

    public async Task<InteraktResult> SendTemplateMessageAsync(
        string phoneNumber, string countryCode,
        string templateName, IEnumerable<string> bodyValues, string languageCode = "en")
    {
        if (!IsConfigured())
            return new InteraktResult(false, "Interakt not configured");

        // Normalize phone: strip leading country code / non-digits
        var digits = new string(phoneNumber.Where(char.IsDigit).ToArray());
        if (digits.StartsWith(countryCode) && digits.Length > countryCode.Length)
            digits = digits[countryCode.Length..];

        var payload = new
        {
            fullPhoneNumber = $"{countryCode}{digits}",
            callbackData    = "kiosk-invite",
            type            = "Template",
            template        = new
            {
                name     = templateName,
                languageCode = string.IsNullOrWhiteSpace(languageCode) ? "en" : languageCode,
                bodyValues = bodyValues.ToArray()
            }
        };

        var client  = _http.CreateClient();
        // Interakt's dashboard "Secret Key" is ALREADY the base64 credential — it is used
        // verbatim as `Authorization: Basic <secret key>`. Do NOT base64-encode it again,
        // or Interakt rejects it with 401 "Invalid token provided".
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", _secretKey!);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8, "application/json");

        try
        {
            var response = await client.PostAsync($"{BaseUrl}/message/", content);
            var body     = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
                return new InteraktResult(true);

            _logger.LogWarning("Interakt API error {StatusCode}: {Body}", response.StatusCode, body);
            return new InteraktResult(false, $"HTTP {(int)response.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send Interakt message");
            return new InteraktResult(false, ex.Message);
        }
    }
}
