namespace KaizenEvents.Core.DTOs.PaymentAccount;

public record CreatePaymentAccountRequest(
    string Name,
    string GatewayType,
    string? Description,
    bool IsActive,
    string? InstamojoApiKey,
    string? InstamojoAuthToken,
    string? InstamojoSalt,
    string? InstamojoMode,
    string? RazorpayKeyId,
    string? RazorpayKeySecret,
    string? RazorpayMode,
    string? RazorpaySettlementMode,
    string? CashfreeAppId,
    string? CashfreeSecretKey,
    string? CashfreeMode);

public record UpdatePaymentAccountRequest(
    string? Name,
    string? Description,
    bool? IsActive,
    string? InstamojoApiKey,
    string? InstamojoAuthToken,
    string? InstamojoSalt,
    string? InstamojoMode,
    string? RazorpayKeyId,
    string? RazorpayKeySecret,
    string? RazorpayMode,
    string? RazorpaySettlementMode,
    string? CashfreeAppId,
    string? CashfreeSecretKey,
    string? CashfreeMode);
