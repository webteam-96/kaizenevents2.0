using System.Security.Cryptography;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Caching.Memory;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// In-memory OTP store with 10-minute sliding expiry.
/// Singleton — the same instance must serve generate + verify within the request flow.
/// </summary>
public class OtpService : IOtpService
{
    private readonly IMemoryCache _cache;
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    /// <summary>Brute-force guard — after this many wrong attempts, the OTP is invalidated
    /// and the user must request a new one. With 6 digits = 1,000,000 possibilities,
    /// 3 attempts per OTP keeps the realistic guess space at ~3×10⁻⁶ per fresh OTP.</summary>
    private const int MaxAttempts = 3;

    public OtpService(IMemoryCache cache) => _cache = cache;

    public string Generate(string contextKey)
    {
        // 6-digit OTP, 0-padded
        var n = RandomNumberGenerator.GetInt32(0, 1_000_000);
        var otp = n.ToString("D6");
        _cache.Set(KeyOf(contextKey),  otp, Lifetime);
        _cache.Set(AttemptsOf(contextKey), 0, Lifetime);   // reset attempt counter
        return otp;
    }

    public bool VerifyAndConsume(string contextKey, string otp)
    {
        if (string.IsNullOrWhiteSpace(otp)) return false;
        if (!_cache.TryGetValue<string>(KeyOf(contextKey), out var stored) || stored is null) return false;

        // Constant-time compare
        var storedBytes = System.Text.Encoding.ASCII.GetBytes(stored);
        var inputBytes  = System.Text.Encoding.ASCII.GetBytes(otp.Trim());
        var sameLength  = storedBytes.Length == inputBytes.Length;
        var matched     = sameLength && CryptographicOperations.FixedTimeEquals(storedBytes, inputBytes);

        if (matched)
        {
            // One-shot — remove after successful verify
            _cache.Remove(KeyOf(contextKey));
            _cache.Remove(AttemptsOf(contextKey));
            return true;
        }

        // Wrong attempt — increment counter, invalidate OTP after MaxAttempts
        var attempts = _cache.TryGetValue<int>(AttemptsOf(contextKey), out var a) ? a + 1 : 1;
        if (attempts >= MaxAttempts)
        {
            _cache.Remove(KeyOf(contextKey));
            _cache.Remove(AttemptsOf(contextKey));
        }
        else
        {
            _cache.Set(AttemptsOf(contextKey), attempts, Lifetime);
        }
        return false;
    }

    private static string KeyOf(string contextKey)       => $"otp::{contextKey}";
    private static string AttemptsOf(string contextKey)  => $"otpattempts::{contextKey}";
}
