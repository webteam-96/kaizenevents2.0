namespace KaizenEvents.Core.DTOs.Payment;

public record PaymentResponse(
    string PaymentId,
    string Gateway,
    string? PaymentUrl,
    string? OrderId,
    string? RazorpayKeyId,
    decimal Amount,
    string Currency,
    string Status,
    // Cashfree-specific fields (direct integration via Cashfree.js SDK)
    string? PaymentSessionId = null,
    string? CashfreeMode     = null,
    // Kaizen-hosted Cashfree proxy fields (KaizenManaged + vendor-splits route)
    string? Method           = null,
    string? FormAction       = null,
    Dictionary<string, string>? FormFields = null);

public record PaymentStatusResponse(
    string PaymentId,
    string Status,
    string Gateway,
    decimal Amount,
    string? GatewayPaymentId,
    DateTime? PaidAt);

public record PaymentVerifyResponse(
    bool Success,
    string Message,
    string Status,
    string PaymentId);

public record RegistrationPaymentResponse(
    PaymentDetail? Payment);

public record PaymentDetail(
    string Id,
    string Status,
    string Gateway,
    decimal Amount,
    string? GatewayPaymentId,
    DateTime? PaidAt);

public record WebhookUrlResponse(
    string CampaignSlug,
    string CampaignName,
    string WebhookUrl,
    List<string> Instructions);

public record OrphanPaymentResponse(
    string Id,
    string Type,
    string? GatewayPaymentId,
    string? GatewayPaymentRequestId,
    decimal Amount,
    string? BuyerName,
    string? BuyerEmail,
    string? BuyerPhone,
    string? Purpose,
    string Status,
    DateTime CreatedAt);

public record AssignOrphanResponse(
    bool Success,
    string Message,
    string RegistrationId);
