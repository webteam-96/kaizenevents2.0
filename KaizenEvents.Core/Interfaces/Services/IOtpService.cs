namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Generic 6-digit OTP service used by KYC vendor onboarding (and reusable elsewhere).
/// Stores OTPs in memory cache with sliding 10-minute expiry, keyed by a "context" string
/// (e.g. "kyc:onboarding-token-xyz" or "kyc:admin:user-id").
/// </summary>
public interface IOtpService
{
    /// <summary>Generate a fresh 6-digit OTP, store under the given context key, and return it.</summary>
    string Generate(string contextKey);

    /// <summary>Verify the user-supplied OTP against the stored one for that context.
    /// Consumes (deletes) the OTP on success.</summary>
    bool VerifyAndConsume(string contextKey, string otp);
}
