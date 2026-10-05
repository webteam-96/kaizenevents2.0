namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// HMAC-SHA256 signature helpers for the Kaizen Infotech-hosted Cashfree proxy gateway
/// (https://www.kaizeninfotech.com/cashfree-payment-gateway/).
/// All signatures are lowercase hex; secret is the project_secret registered with the proxy.
/// </summary>
public interface IKaizenGatewayService
{
    /// <summary>True if both ProjectKey and ProjectSecret are configured.</summary>
    bool IsConfigured { get; }

    string ProjectKey    { get; }
    string GatewayPayUrl { get; }
    string GatewayVerifyUrl { get; }

    /// <summary>
    /// Signature for the redirect POST to pay.php:
    ///   HMAC-SHA256(order_id + session_id + amount + return_url, project_secret) → hex
    /// </summary>
    string GenerateRequestSignature(string orderId, string sessionId, string amount, string returnUrl);

    /// <summary>
    /// Verify the gateway's signature on the return redirect:
    ///   expected = HMAC-SHA256(order_id + status, project_secret) → hex
    /// </summary>
    bool VerifyReturnSignature(string orderId, string status, string receivedSignature);

    /// <summary>
    /// Signature for the verify.php API call:
    ///   HMAC-SHA256(order_id, project_secret) → hex
    /// </summary>
    string GenerateVerifyEndpointSignature(string orderId);
}
