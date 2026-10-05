namespace KaizenEvents.Core.Interfaces.Services;

public interface ITokenBlacklistService
{
    /// <summary>Blacklists a specific token (e.g. on logout).</summary>
    void BlacklistToken(string token, DateTime expiry);

    /// <summary>
    /// Revokes all tokens for a user issued before now (e.g. on logout-all or password change).
    /// </summary>
    void RevokeUserTokens(string userId);

    /// <summary>
    /// Returns true if the token is blacklisted or if the user's tokens were revoked
    /// after this token was issued.
    /// </summary>
    bool IsBlacklisted(string token, string userId, DateTime tokenIssuedAt);

    /// <summary>Removes expired entries from in-memory state.</summary>
    void Cleanup();
}
