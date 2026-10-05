using System.Text.Json;

namespace KaizenEvents.Core.DTOs.Registration;

public record RegistrationResponse(
    string Id,
    string CampaignId,
    JsonElement FormData,
    decimal TotalAmount,
    string PaymentStatus,
    string RegistrationStatus,
    string? PaymentId,
    string? GatewayPaymentId,
    string? InvoiceNumber,
    string? RegistrationNumber,
    string? CouponCode,
    string? MemberId,
    string? Source,
    bool AdditionalPaymentRequired,
    decimal? AdditionalPaymentAmount,
    string? AdditionalPaymentLink,
    bool RefundPending,
    decimal? RefundAmount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    // The registration's resume secret. Returned ONLY by the create/amend response, to the
    // browser that just made the registration — it is what lets that browser amend its own
    // attempt instead of starting a second one. Null on every other response.
    string? PaymentToken = null);

public record RazorpayInitiateResponse(
    string OrderId,
    long Amount,
    string Currency,
    string KeyId);

public record InstamojoInitiateResponse(
    string PaymentRequestId,
    string PaymentUrl);

public record CashfreeInitiateResponse(
    string OrderId,
    string PaymentSessionId,
    decimal Amount,
    string Currency);

/// <summary>
/// Returned when an event is configured to use the Kaizen-hosted Cashfree proxy
/// (KaizenManaged fund mode). Frontend builds an HTML form with FormFields and POSTs to FormAction.
/// </summary>
public record CashfreeProxyInitiateResponse(
    string Method,                                  // always "kaizen_proxy_form_post"
    string FormAction,                              // gateway pay.php URL
    Dictionary<string, string> FormFields);          // session_id, order_id, project_key, return_url, amount, signature, customer_*

public record PaymentVerifyResponse(
    string Status,
    string Message);

public record PaymentAdjustmentResponse(
    string RegistrationId,
    string Message,
    string? PaymentLink,
    bool RefundRequired,
    decimal? RefundAmount,
    decimal PreviousAmount,
    decimal NewAmount);

public record RefundResponse(
    string Id,
    string RegistrationId,
    decimal Amount,
    string Status,
    string? RefundId,
    string Reason,
    DateTime CreatedAt);
