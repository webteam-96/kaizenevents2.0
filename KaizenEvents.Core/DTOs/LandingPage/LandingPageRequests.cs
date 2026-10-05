using System.Text.Json;
using System.Text.Json.Nodes;

namespace KaizenEvents.Core.DTOs.LandingPage;

public record UpdateLandingPageRequest(JsonNode Config);

public record ContactSalesRequest(
    string ContactName,
    string MobileNumber,
    string Email,
    string ClubName,
    string District,
    string Designation,
    string Purpose,
    string EstimatedRegistrants,
    string EventDate,
    // Optional on the wire so a stale cached bundle gets a clear "captcha failed"
    // message instead of a binding error it can't explain to the visitor.
    string? CaptchaToken = null,
    string? CaptchaAnswer = null);
