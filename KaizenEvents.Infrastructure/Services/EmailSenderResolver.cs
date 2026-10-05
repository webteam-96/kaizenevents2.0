using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <inheritdoc />
public class EmailSenderResolver : IEmailSenderResolver
{
    private readonly INotificationSettingRepository _settings;
    private readonly IEmailSenderRepository _senders;
    private readonly IDkimDomainRepository _domains;
    private readonly ILogger<EmailSenderResolver> _logger;

    public EmailSenderResolver(
        INotificationSettingRepository settings,
        IEmailSenderRepository senders,
        IDkimDomainRepository domains,
        ILogger<EmailSenderResolver> logger)
    {
        _settings = settings;
        _senders  = senders;
        _domains  = domains;
        _logger   = logger;
    }

    public async Task<(string? Email, string? Name)> ResolveAsync(string campaignId)
    {
        if (string.IsNullOrWhiteSpace(campaignId))
            return (null, null);
        try
        {
            var setting = await _settings.GetByCampaignIdAsync(campaignId);
            return await ResolveBySenderIdAsync(setting?.EmailSenderId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve custom sender for campaign {CampaignId}; using the global sender.", campaignId);
            return (null, null);
        }
    }

    public async Task<(string? Email, string? Name)> ResolveBySenderIdAsync(string? emailSenderId)
    {
        if (string.IsNullOrWhiteSpace(emailSenderId))
            return (null, null); // no sender configured → use campaign/global default

        try
        {
            var sender = await _senders.GetByIdAsync(emailSenderId);
            if (sender == null || !sender.IsActive)
            {
                _logger.LogWarning(
                    "Email sender {SenderId} is missing or inactive; using the default sender.", emailSenderId);
                return (null, null);
            }

            // Brevo only accepts a From address whose domain is authenticated in the account.
            // A DKIM domain in 'verified' state is exactly that, so this check is both the
            // business rule (use the client's verified sender) and the safety guard (don't
            // hand Brevo an address it will reject and fail the whole send).
            var domain = sender.DomainId != null ? await _domains.GetByIdAsync(sender.DomainId) : null;
            if (domain == null || !string.Equals(domain.Status, "verified", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "Selected sender {Email} but its domain is not verified ({Status}); using the default sender.",
                    sender.Email, domain?.Status ?? "missing");
                return (null, null);
            }

            var name = string.IsNullOrWhiteSpace(sender.Name) ? sender.Email : sender.Name;
            return (sender.Email, name);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve email sender {SenderId}; using the default sender.", emailSenderId);
            return (null, null);
        }
    }
}
