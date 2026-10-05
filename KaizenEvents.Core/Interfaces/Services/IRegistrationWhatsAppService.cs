using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Sends registration-flow WhatsApp messages (confirmation / payment / OTP / reminder) via
/// Interakt, mirroring <see cref="IRegistrationEmailService"/>. Invoked alongside the email
/// send so both channels fire from the same trigger points. Never throws — a WhatsApp failure
/// must not break the registration or the email.
/// </summary>
public interface IRegistrationWhatsAppService
{
    /// <summary>Render + send the template for a trigger against a registration. Returns true when Interakt accepted the message.</summary>
    Task<bool> SendForTriggerAsync(string trigger, Registration reg, Campaign campaign, RenderContext? extra = null);

    /// <summary>Send the registration_reminder template to a campaign member (no registration yet).</summary>
    Task<bool> SendReminderAsync(Campaign campaign, string memberName, string memberPhone);
}
