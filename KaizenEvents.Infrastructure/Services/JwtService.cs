using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace KaizenEvents.Infrastructure.Services;

public class JwtService : IJwtService
{
    private readonly string _accessSecret;
    private readonly string _refreshSecret;
    private readonly int _accessMinutes;
    private readonly int _refreshDays;

    public JwtService(IConfiguration config)
    {
        _accessSecret  = config["Jwt:SecretKey"]  ?? throw new InvalidOperationException("Jwt:SecretKey missing");
        _refreshSecret = config["Jwt:RefreshSecret"] ?? throw new InvalidOperationException("Jwt:RefreshSecret missing");
        _accessMinutes = config.GetValue<int>("Jwt:AccessTokenMinutes", 30);
        _refreshDays   = config.GetValue<int>("Jwt:RefreshTokenDays", 7);
    }

    public string CreateAccessToken(User user)
        => BuildToken(user, "access", TimeSpan.FromMinutes(_accessMinutes), _accessSecret);

    public string CreateRefreshToken(User user)
        => BuildToken(user, "refresh", TimeSpan.FromDays(_refreshDays), _refreshSecret);

    public ClaimsPrincipal? ValidateToken(string token, string expectedType)
    {
        var secret = expectedType == "refresh" ? _refreshSecret : _accessSecret;
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));

        var handler = new JwtSecurityTokenHandler();
        try
        {
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = key,
                ValidateIssuer = false,
                ValidateAudience = false,
                ClockSkew = TimeSpan.Zero
            }, out _);

            if (principal.Claims.FirstOrDefault(c => c.Type == "type")?.Value != expectedType)
                return null;

            return principal;
        }
        catch
        {
            return null;
        }
    }

    public (string UserId, string Jti, DateTime IssuedAt, DateTime Expiry)? ReadClaims(string token)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var jwt = handler.ReadJwtToken(token);
            var userId = jwt.Subject;
            var jti = jwt.Id;
            var iat = jwt.IssuedAt;
            var exp = jwt.ValidTo;
            if (userId == null || jti == null) return null;
            return (userId, jti, iat, exp);
        }
        catch
        {
            return null;
        }
    }

    private static string BuildToken(User user, string tokenType, TimeSpan lifetime, string secret)
    {
        var now = DateTime.UtcNow;
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Iat, new DateTimeOffset(now).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
            new("type", tokenType),
            new("role", user.Role.ToString()),
            new("email", user.Email)
        };

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            NotBefore = now,
            IssuedAt = now,
            Expires = now.Add(lifetime),
            SigningCredentials = creds
        };

        var handler = new JwtSecurityTokenHandler();
        return handler.WriteToken(handler.CreateToken(descriptor));
    }
}
