namespace KaizenEvents.Core.Interfaces.Services;

public interface IInteraktService
{
    bool IsConfigured();
    Task<InteraktResult> SendTemplateMessageAsync(string phoneNumber, string countryCode,
        string templateName, IEnumerable<string> bodyValues, string languageCode = "en");
}

public record InteraktResult(bool Success, string? Error = null);
