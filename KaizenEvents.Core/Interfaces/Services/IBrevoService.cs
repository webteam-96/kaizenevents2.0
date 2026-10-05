namespace KaizenEvents.Core.Interfaces.Services;

public interface IBrevoService
{
    /// <summary>
    /// Send a transactional email via Brevo v3 API. Returns true on success.
    /// <paramref name="fromEmail"/>/<paramref name="fromName"/> override the global
    /// Brevo sender when supplied (e.g. a campaign's verified DKIM sender); when null
    /// the global Brevo:SenderEmail / Brevo:SenderName config value is used.
    /// </summary>
    Task<bool> SendEmailAsync(
        string toEmail, string toName, string subject, string htmlBody,
        string? fromEmail = null, string? fromName = null,
        IReadOnlyCollection<string>? cc = null, IReadOnlyCollection<string>? bcc = null);

    /// <summary>Send an email with an attachment (bytes + filename). Returns true on success.</summary>
    Task<bool> SendEmailWithAttachmentAsync(
        string toEmail, string toName, string subject, string htmlBody,
        byte[] attachmentBytes, string attachmentFilename,
        string? fromEmail = null, string? fromName = null,
        IReadOnlyCollection<string>? cc = null, IReadOnlyCollection<string>? bcc = null);

    /// <summary>Send an email with multiple attachments ((filename, bytes) pairs). Returns true on success.</summary>
    Task<bool> SendEmailWithAttachmentsAsync(
        string toEmail, string toName, string subject, string htmlBody,
        IReadOnlyCollection<(string Filename, byte[] Bytes)> attachments,
        string? fromEmail = null, string? fromName = null,
        IReadOnlyCollection<string>? cc = null, IReadOnlyCollection<string>? bcc = null);

    /// <summary>
    /// Verifies the configured Brevo API key and outbound connectivity by calling the
    /// Brevo account endpoint. Returns (true, account-email) when reachable and authorized,
    /// or (false, reason) otherwise (missing key, 401, network failure). Used by the startup
    /// health-check so a misconfigured deployment surfaces loudly instead of silently dropping
    /// every email.
    /// </summary>
    Task<(bool Ok, string Detail)> VerifyConnectivityAsync();
}
