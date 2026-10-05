using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using KaizenEvents.Core.Interfaces.Services;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// In-memory token blacklist.
/// - Token-level: SHA-256(token) → expiry
/// - User-level:  userId → revocation_time (all tokens issued before this are invalid)
/// Cleaned up every 5 minutes by TokenBlacklistCleanupService.
/// </summary>
public class TokenBlacklistService : ITokenBlacklistService
{
    // token_hash → expiry
    private readonly ConcurrentDictionary<string, DateTime> _tokenBlacklist = new();
    // userId → revocation_time
    private readonly ConcurrentDictionary<string, DateTime> _userRevocations = new();

    public void BlacklistToken(string token, DateTime expiry)
    {
        var hash = HashToken(token);
        _tokenBlacklist[hash] = expiry;
    }

    public void RevokeUserTokens(string userId)
    {
        _userRevocations[userId] = DateTime.UtcNow;
    }

    public bool IsBlacklisted(string token, string userId, DateTime tokenIssuedAt)
    {
        // Check token-level blacklist
        var hash = HashToken(token);
        if (_tokenBlacklist.TryGetValue(hash, out var expiry) && expiry > DateTime.UtcNow)
            return true;

        // Check user-level revocation
        if (_userRevocations.TryGetValue(userId, out var revokedAt) && tokenIssuedAt < revokedAt)
            return true;

        return false;
    }

    public void Cleanup()
    {
        var now = DateTime.UtcNow;

        foreach (var key in _tokenBlacklist.Keys.ToList())
        {
            if (_tokenBlacklist.TryGetValue(key, out var expiry) && expiry <= now)
                _tokenBlacklist.TryRemove(key, out _);
        }
    }

    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
