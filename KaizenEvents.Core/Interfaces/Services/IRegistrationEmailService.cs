using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

public interface IRegistrationEmailService
{
    /// <summary>
    /// Sends the standard "Registration Confirmed" email to the registrant. Uses the
    /// campaign's <c>registration_confirmed</c> email template (auto-seeded on campaign
    /// create, admin-customizable). Returns true if the email was sent successfully.
    /// </summary>
    Task<bool> SendConfirmationAsync(Registration registration, Campaign campaign);

    /// <summary>
    /// Sends "Payment Received" email after cash is collected. Uses the campaign's
    /// <c>payment_received</c> template. Receipt number is substituted into ${receipt_number}.
    /// </summary>
    Task<bool> SendCashReceivedAsync(Registration registration, Campaign campaign, string receiptNumber);

    /// <summary>
    /// Sends "Your OTP" email after offline registration submitted. Uses the campaign's
    /// <c>payment_otp</c> template. OTP is substituted into ${otp}.
    /// </summary>
    Task<bool> SendOtpAsync(Registration registration, Campaign campaign, string otp);

    /// <summary>
    /// Sends "Register reminder" to a closed-group member. Uses the campaign's
    /// <c>registration_reminder</c> template. Member contact fields are substituted
    /// into ${name}, ${email}, ${phone}.
    /// </summary>
    Task<bool> SendReminderAsync(string memberName, string memberEmail, string memberPhone, Campaign campaign);
}
