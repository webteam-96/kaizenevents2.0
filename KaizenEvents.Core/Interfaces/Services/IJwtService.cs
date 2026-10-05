using System.Security.Claims;
using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

public interface IJwtService
{
    string CreateAccessToken(User user);
    string CreateRefreshToken(User user);

    /// <summary>
    /// Validates a token and returns its claims principal.
    /// Returns null if invalid, expired, or wrong type.
    /// </summary>
    ClaimsPrincipal? ValidateToken(string token, string expectedType);

    /// <summary>Returns (userId, jti, issuedAt, expiry) from a token without full validation.</summary>
    (string UserId, string Jti, DateTime IssuedAt, DateTime Expiry)? ReadClaims(string token);
}
