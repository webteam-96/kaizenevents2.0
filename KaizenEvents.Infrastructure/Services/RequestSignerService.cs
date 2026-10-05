using System.Security.Cryptography;
using System.Text;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// HMAC-SHA256 request signing.
/// Payload: "{method}:{path}:{body}:{timestamp}"
/// Timestamp must be within 5 minutes of now.
/// </summary>
public class RequestSignerService : IRequestSignerService
{
    private const int MaxAgeSeconds = 300; // 5 minutes
    private readonly byte[] _keyBytes;

    public RequestSignerService(IConfiguration config)
    {
        var key = config["Security:RequestSigningKey"] ?? string.Empty;
        _keyBytes = Encoding.UTF8.GetBytes(key);
    }

    public string Sign(string method, string path, string body, long timestampSeconds)
    {
        var payload = $"{method.ToUpperInvariant()}:{path}:{body}:{timestampSeconds}";
        var payloadBytes = Encoding.UTF8.GetBytes(payload);
        var hash = HMACSHA256.HashData(_keyBytes, payloadBytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public bool Verify(string method, string path, string body, long timestampSeconds, string signature)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (Math.Abs(now - timestampSeconds) > MaxAgeSeconds)
            return false;

        var expected = Sign(method, path, body, timestampSeconds);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(signature));
    }
}
