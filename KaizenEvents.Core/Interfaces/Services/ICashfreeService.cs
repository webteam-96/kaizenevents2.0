namespace KaizenEvents.Core.Interfaces.Services;

public record CashfreeOrderResult(string OrderId, string PaymentSessionId, decimal Amount, string Currency);
public record CashfreeOrderStatus(string OrderId, string OrderStatus, string? CfPaymentId, decimal Amount);
public record CashfreeRefundResult(string RefundId, string Status, decimal RefundAmount);
public record CashfreeCredentials(string AppId, string SecretKey, string Mode);

/// <summary>One vendor in an Easy Split. Amount is the rupees+paise to route to that vendor.</summary>
public record CashfreeVendorSplit(string VendorId, decimal Amount);

/// <summary>
/// Settlement entry returned by Cashfree's order settlement API. One row per payment that's been
/// settled to the merchant's bank account.
/// </summary>
public record CashfreeSettlementEntry(
    string OrderId,
    string? CfPaymentId,        // Cashfree's payment ID (used as Payment_ID in archive)
    string? CfSettlementId,     // Cashfree's settlement batch ID (used as Payout_ID)
    string? SettlementUtr,      // Bank UTR (preferred Payout_ID if present)
    DateTime? SettlementDate,
    string? SettlementStatus);  // PENDING | SUCCESS | FAILED

/// <summary>
/// Per-payment fee info from Cashfree. Returned by /pg/orders/{order_id}/payments after capture.
/// </summary>
public record CashfreePaymentDetails(
    string CfPaymentId,
    decimal Amount,
    decimal Fee,                 // service_charge from Cashfree
    decimal Tax,                 // service_tax from Cashfree
    string? PaymentMethod,       // upi / card / netbanking / wallet
    string? PaymentGroup,        // Cashfree's grouping
    string? Status);             // SUCCESS / FAILED / PENDING / etc.

public interface ICashfreeService
{
    Task<CashfreeOrderResult> CreateOrderAsync(
        decimal amount, string orderId, string customerName, string email, string phone, string? returnUrl,
        CashfreeCredentials? credentials = null,
        string? notifyUrl = null,
        IReadOnlyList<CashfreeVendorSplit>? vendorSplits = null);

    Task<CashfreeOrderStatus> GetOrderStatusAsync(string orderId, CashfreeCredentials? credentials = null);

    /// <summary>Refund a Cashfree order. Refund is issued against the original order_id, not payment_id.</summary>
    Task<CashfreeRefundResult> CreateRefundAsync(string orderId, decimal refundAmount, string reason,
        CashfreeCredentials? credentials = null);

    bool VerifyWebhookSignature(string timestamp, string rawBody, string signature);

    /// <summary>
    /// Create a vendor in Cashfree Easy Split (POST /pg/easy-split/vendors).
    /// On success, Cashfree returns a vendor object with status (typically PENDING/IN_VERIFICATION
    /// initially, then ACTIVE after penny-drop or BANK_VALIDATION_FAILED on bank verify failure).
    /// </summary>
    Task<CashfreeVendorResult> CreateVendorAsync(CashfreeVendorRequest req,
        CashfreeCredentials? credentials = null);

    /// <summary>Fetch a vendor's current status from Cashfree.</summary>
    Task<CashfreeVendorResult> GetVendorAsync(string vendorId,
        CashfreeCredentials? credentials = null);

    /// <summary>Update an existing vendor in Cashfree (PATCH /pg/easy-split/vendors/{vendor_id}).</summary>
    Task<CashfreeVendorResult> UpdateVendorAsync(CashfreeVendorRequest req,
        CashfreeCredentials? credentials = null);

    /// <summary>
    /// Pull settlement entries for a single order. Cashfree returns one entry per payment
    /// in that order. Used to fill Payout_ID/Payout_date in archive rows after T+1 settlement.
    /// </summary>
    Task<List<CashfreeSettlementEntry>> GetSettlementsForOrderAsync(string orderId,
        CashfreeCredentials? credentials = null);

    /// <summary>
    /// Pull payment-level details (including service_charge + service_tax) for an order.
    /// Cashfree returns ONE entry per attempted payment under that order. Used in webhook
    /// handler to populate gateway_fee / gateway_tax on the operational payments row.
    /// </summary>
    Task<List<CashfreePaymentDetails>> GetOrderPaymentsAsync(string orderId,
        CashfreeCredentials? credentials = null);
}

public record CashfreeVendorRequest(
    string VendorId,
    string Name,
    string Email,
    string Phone,
    string AccountNumber,
    string AccountHolder,
    string Ifsc,
    string Pan,
    string? Gst = null);

public record CashfreeVendorResult(
    string VendorId,
    string Status,        // ACTIVE | IN_VERIFICATION | BANK_VALIDATION_FAILED | BLOCKED | DELETED | PENDING
    string RawJson);      // Cashfree's raw response — saved to DB cashfree_json column
