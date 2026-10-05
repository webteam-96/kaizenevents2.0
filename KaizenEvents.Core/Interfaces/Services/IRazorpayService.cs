namespace KaizenEvents.Core.Interfaces.Services;

public record RazorpayOrderResult(string OrderId, long AmountPaise, string Currency, string Receipt);
public record RazorpayPaymentLinkResult(string PaymentLinkId, string ShortUrl);
public record RazorpayRefundResult(string RefundId, string Status);

/// <summary>
/// Razorpay payment details used for fee tracking. Amounts in rupees (Razorpay returns paise; we convert).
/// </summary>
public record RazorpayPaymentDetails(
    string PaymentId,
    decimal Amount,
    decimal Fee,
    decimal Tax,
    string Method,
    string Status);

/// <summary>
/// One reconciliation entry from Razorpay's settlement recon API — links a captured payment
/// to the settlement (UTR) it was paid out in.
/// </summary>
public record RazorpaySettlementReconItem(
    string PaymentId,
    string SettlementId,
    string? SettlementUtr,
    DateTime? SettledAt,
    string? Status);

/// <summary>One row of the Razorpay Route `transfers[]` array — sub-account + amount.</summary>
public record RazorpayTransfer(string AccountId, long AmountPaise);

// ── Razorpay v2 Route onboarding DTOs ────────────────────────────────────────

public record RazorpayAddress(
    string Street1,
    string Street2,
    string City,
    string State,
    string PostalCode,
    string Country);

/// <summary>Payload for POST /v2/accounts.</summary>
public record LinkedAccountRequest(
    string Email,
    string Phone,
    string LegalBusinessName,
    string BusinessType,
    string CustomerFacingBusinessName,
    string ProfileCategory,
    string ProfileSubcategory,
    RazorpayAddress RegisteredAddress,
    string? Pan,
    string? Gst,
    string? ContactName = null,
    string? ReferenceId = null);

/// <summary>Payload for POST /v2/accounts/{id}/stakeholders.</summary>
public record StakeholderRequest(
    string Name,
    string Email,
    string PrimaryPhone,
    string? Pan,
    RazorpayAddress ResidentialAddress);

/// <summary>Payload for POST /v2/accounts/{id}/products (product=route).</summary>
public record RouteProductRequest(
    string AccountNumber,
    string IfscCode,
    string BeneficiaryName);

public record RazorpayAccountResult(string AccountId, string Status, string? ActivationStatus, string RawJson);
public record RazorpayStakeholderResult(string StakeholderId, string RawJson);
public record RazorpayProductResult(string ProductId, string Status, string RawJson);

public interface IRazorpayService
{
    Task<RazorpayOrderResult> CreateOrderAsync(decimal amountInRupees, string receipt);

    /// <summary>
    /// Create a Razorpay order with Route splits — Razorpay distributes the captured
    /// amount across the provided linked accounts at settlement time. Requires Razorpay
    /// Route to be enabled on the master account.
    /// </summary>
    Task<RazorpayOrderResult> CreateOrderWithTransfersAsync(
        decimal amountInRupees, string receipt, IReadOnlyList<RazorpayTransfer> transfers);
    bool VerifyPaymentSignature(string orderId, string paymentId, string signature);
    Task<RazorpayPaymentLinkResult> CreatePaymentLinkAsync(
        decimal amountInRupees, string description, string customerName, string email, string phone);
    Task<RazorpayRefundResult> CreateRefundAsync(string gatewayPaymentId, decimal amount);

    /// <summary>
    /// Fetch payment details from Razorpay (fee + tax for fund transfer reporting).
    /// Returns null if the payment can't be retrieved.
    /// </summary>
    Task<RazorpayPaymentDetails?> GetPaymentDetailsAsync(string paymentId);

    /// <summary>
    /// Pull settlement reconciliation report for a date range.
    /// Returns one entry per captured payment with its settlement_id + settlement date.
    /// Used to fill Payout_ID and Payout_date in *_datadetails archive rows.
    /// </summary>
    Task<List<RazorpaySettlementReconItem>> GetSettlementReconAsync(DateTime fromUtc, DateTime toUtc);

    /// <summary>
    /// Verify Razorpay webhook signature (HMAC-SHA256 of raw body using the webhook secret,
    /// which is different from the Key Secret).
    /// </summary>
    bool VerifyWebhookSignature(string rawBody, string signature);

    // ── Route v2 onboarding ───────────────────────────────────────────────────
    Task<RazorpayAccountResult>     CreateLinkedAccountAsync(LinkedAccountRequest req);
    Task<RazorpayAccountResult>     UpdateLinkedAccountAsync(string accountId, LinkedAccountRequest req);
    Task<RazorpayAccountResult>     GetLinkedAccountAsync(string accountId);
    Task<RazorpayStakeholderResult> CreateStakeholderAsync(string accountId, StakeholderRequest req);
    Task<RazorpayProductResult>     RequestRouteProductAsync(string accountId, RouteProductRequest req);

    /// <summary>
    /// PATCH /v2/accounts/{accountId}/products/{productId} — adds the settlement bank
    /// account (account_number, ifsc_code, beneficiary_name) so Razorpay can move the
    /// product activation_status from needs_clarification → under_review → activated.
    /// </summary>
    Task<RazorpayProductResult>     UpdateRouteProductAsync(string accountId, string productId, RouteProductRequest req);

    /// <summary>
    /// GET /v2/accounts/{accountId}/products/{productId} — returns the live activation_status
    /// ("needs_clarification" | "under_review" | "activated"). This is what the Razorpay
    /// dashboard surfaces as "Account Status"; the account-level status only flips on suspension.
    /// </summary>
    Task<RazorpayProductResult>     GetRouteProductAsync(string accountId, string productId);
}
