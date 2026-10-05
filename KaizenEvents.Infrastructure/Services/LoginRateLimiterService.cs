using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using KaizenEvents.Core.Interfaces.Services;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// In-memory progressive login lockout — matches Python LoginRateLimiter in security.py.
///
/// Per email+IP: block after 3 failures within 30 min.
///   Progressive durations: [60, 300, 900, 3600, 86400] seconds.
/// Per email (any IP): lock for 1 hour after 10 failures within 30 min.
/// On success: clear all attempts for that email+IP.
/// </summary>
public class LoginRateLimiterService : ILoginRateLimiterService
{
    private static readonly int[] ProgressiveDurations = [60, 300, 900, 3600, 86400];
    private const int MaxPerCombo   = 3;
    private const int MaxPerEmail   = 10;
    private const int WindowSeconds = 30 * 60; // 30 minutes

    // key = SHA-256("email:ip") or SHA-256("email:") → list of attempt timestamps
    private readonly ConcurrentDictionary<string, List<DateTime>> _attempts = new();
    // key → block-until time
    private readonly ConcurrentDictionary<string, DateTime> _blocked = new();

    public (bool IsBlocked, int RetryAfter, int RemainingAttempts) CheckBlocked(string email, string ip)
    {
        var comboKey  = Hash(email, ip);
        var emailKey  = Hash(email, "");
        var now       = DateTime.UtcNow;

        // Check existing blocks
        if (_blocked.TryGetValue(comboKey, out var until) && until > now)
            return (true, (int)(until - now).TotalSeconds, 0);
        if (_blocked.TryGetValue(emailKey, out var emailUntil) && emailUntil > now)
            return (true, (int)(emailUntil - now).TotalSeconds, 0);

        var comboCount = RecentCount(comboKey, now);
        var remaining  = Math.Max(0, MaxPerCombo - comboCount);
        return (false, 0, remaining);
    }

    public void RecordFailure(string email, string ip)
    {
        var comboKey = Hash(email, ip);
        var emailKey = Hash(email, "");
        var now      = DateTime.UtcNow;

        AddAttempt(comboKey, now);
        AddAttempt(emailKey, now);

        var comboCount  = RecentCount(comboKey, now);
        var emailCount  = RecentCount(emailKey, now);

        // Per email+IP progressive block
        if (comboCount >= MaxPerCombo)
        {
            var blockIndex  = Math.Min(comboCount - MaxPerCombo, ProgressiveDurations.Length - 1);
            var duration    = ProgressiveDurations[blockIndex];
            _blocked[comboKey] = now.AddSeconds(duration);
        }

        // Per email (any IP) — 1 hour after 10 failures
        if (emailCount >= MaxPerEmail)
            _blocked[emailKey] = now.AddSeconds(3600);
    }

    public void RecordSuccess(string email, string ip)
    {
        var comboKey = Hash(email, ip);
        var emailKey = Hash(email, "");
        _attempts.TryRemove(comboKey, out _);
        _attempts.TryRemove(emailKey, out _);
        _blocked.TryRemove(comboKey, out _);
        _blocked.TryRemove(emailKey, out _);
    }

    private void AddAttempt(string key, DateTime now)
    {
        var list = _attempts.GetOrAdd(key, _ => []);
        lock (list)
        {
            list.Add(now);
            // Prune old entries
            list.RemoveAll(t => (now - t).TotalSeconds > WindowSeconds);
        }
    }

    private int RecentCount(string key, DateTime now)
    {
        if (!_attempts.TryGetValue(key, out var list)) return 0;
        lock (list)
            return list.Count(t => (now - t).TotalSeconds <= WindowSeconds);
    }

    private static string Hash(string email, string ip)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{email.ToLowerInvariant()}:{ip}"));
        return Convert.ToHexString(bytes);
    }
}
