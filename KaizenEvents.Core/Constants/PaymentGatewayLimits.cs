using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.Constants;

/// <summary>
/// Per-transaction amount bounds each gateway actually enforces on their own end (checked
/// Sept 2026): Razorpay rejects any order below ₹1 and, by default, above ₹5,00,000 per
/// transaction; Instamojo rejects a payment request below ₹9 or above ₹2,00,000. Kaizen
/// enforces the same bounds itself, before ever calling the gateway, so an amount the
/// gateway would reject never reaches the "payment confirmed" / thank-you-email path.
/// </summary>
public static class PaymentGatewayLimits
{
    public static (decimal Min, decimal Max) For(PaymentGateway gateway) => gateway switch
    {
        PaymentGateway.Razorpay  => (1m, 500_000m),
        PaymentGateway.Instamojo => (9m, 200_000m),
        PaymentGateway.Cashfree  => (1m, 500_000m),
        _                        => (1m, 500_000m)
    };
}
