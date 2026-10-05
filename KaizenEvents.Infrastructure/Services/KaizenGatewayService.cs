using System.Security.Cryptography;
using System.Text;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;

namespace KaizenEvents.Infrastructure.Services;

public class KaizenGatewayService : IKaizenGatewayService
{
    private readonly string _projectKey;
    private readonly string _projectSecret;

    public KaizenGatewayService(IConfiguration config)
    {
        _projectKey      = config["KaizenGateway:ProjectKey"]      ?? "";
        _projectSecret   = config["KaizenGateway:ProjectSecret"]   ?? "";
        GatewayPayUrl    = config["KaizenGateway:GatewayPayUrl"]    ?? "";
        GatewayVerifyUrl = config["KaizenGateway:GatewayVerifyUrl"] ?? "";
    }

    public bool   IsConfigured     => !string.IsNullOrWhiteSpace(_projectKey)
                                   && !string.IsNullOrWhiteSpace(_projectSecret);
    public string ProjectKey       => _projectKey;
    public string GatewayPayUrl    { get; }
    public string GatewayVerifyUrl { get; }

    public string GenerateRequestSignature(string orderId, string sessionId, string amount, string returnUrl)
        => HmacSha256Hex(orderId + sessionId + amount + returnUrl, _projectSecret);

    public bool VerifyReturnSignature(string orderId, string status, string receivedSignature)
    {
        var expected = HmacSha256Hex(orderId + status, _projectSecret);
        // Constant-time compare to avoid timing attacks
        var a = Encoding.ASCII.GetBytes(expected);
        var b = Encoding.ASCII.GetBytes(receivedSignature ?? "");
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    public string GenerateVerifyEndpointSignature(string orderId)
        => HmacSha256Hex(orderId, _projectSecret);

    private static string HmacSha256Hex(string data, string secret)
    {
        if (string.IsNullOrEmpty(secret))
            throw new InvalidOperationException("Kaizen gateway project_secret is not configured.");

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
