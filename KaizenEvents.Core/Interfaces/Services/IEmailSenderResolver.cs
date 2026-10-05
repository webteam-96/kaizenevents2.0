namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Resolves the From address that a campaign's transactional emails should be sent from.
///
/// A campaign can select one of its registered DKIM senders (notification_settings.email_sender_id).
/// That sender is only honoured when its underlying domain is DKIM-verified — which is also the
/// condition under which Brevo will accept the address as a From (the domain is authenticated in
/// the same Brevo account). When no verified sender is configured, the resolver returns nulls and
/// the caller falls back to the global Brevo:SenderEmail / Brevo:SenderName.
/// </summary>
public interface IEmailSenderResolver
{
    /// <summary>
    /// Returns (Email, Name) of the campaign's verified custom sender, or (null, null) to mean
    /// "use the global default sender". Never throws — resolution failures fall back to global.
    /// </summary>
    Task<(string? Email, string? Name)> ResolveAsync(string campaignId);

    /// <summary>
    /// Resolves a specific email-sender id (e.g. a per-template selection) to its verified
    /// address. Returns (null, null) when the id is blank, missing, inactive, or its domain
    /// isn't DKIM-verified — so the caller can fall back to the campaign / global sender.
    /// </summary>
    Task<(string? Email, string? Name)> ResolveBySenderIdAsync(string? emailSenderId);
}
