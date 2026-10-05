namespace KaizenEvents.Core.DTOs.Payment;

public record CreatePaymentRequest(
    string CampaignId,
    string RegistrationId,
    decimal Amount,
    string BuyerName,
    string BuyerEmail,
    string BuyerPhone,
    string Purpose,
    string? PaymentGateway,
    string? RedirectUrl);

public record VerifyRazorpayPaymentRequest(
    string RazorpayPaymentId,
    string RazorpayOrderId,
    string RazorpaySignature,
    string PaymentId);     // internal UUID

public record AssignOrphanRequest(string CampaignId);
