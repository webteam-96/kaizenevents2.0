namespace KaizenEvents.Core.Interfaces.Services;

public record InstamojoPaymentResult(string PaymentRequestId, string PaymentUrl);
public record InstamojoRefundResult(string RefundId, string Status, decimal RefundAmount);

/// <summary>
/// One row returned by Instamojo's /v2/payments/ paged listing. Used by the
/// Month-wise Refresh sync (ports Rotary's CallInstaDetails_update_one_month_Transaction).
/// </summary>
public record InstamojoPaymentItem(
    string    Id,
    DateTime  CreatedAt,
    DateTime? CompletedAt,
    string?   Title,
    string?   Name,
    string?   Email,
    string?   Phone,
    decimal   Amount,
    decimal?  Fees,
    decimal?  TotalTaxes,
    string?   Currency,
    string?   Cases,
    string?   InstrumentType,
    string?   PaymentType,
    string?   BillingInstrument,
    string?   PayoutUrl);

public record InstamojoPaymentPage(int Count, List<InstamojoPaymentItem> Payments);

/// <summary>
/// One settlement (payout) returned by Instamojo's /v2/payouts/ API.
/// PaymentIds is the list of MOJOxxx payment IDs included in this payout.
/// </summary>
public record InstamojoPayoutEntry(
    string PayoutId,
    string Status,
    decimal Amount,
    DateTime? SettledAt,
    List<string> PaymentIds);

/// <summary>
/// Per-payment fee + instrument details returned by /v2/payments/{id}/.
/// Used to populate payments.gateway_fee + gateway_tax + payment_instrument
/// on the operational table, and the corresponding columns in instamojo_datadetails.
/// </summary>
public record InstamojoPaymentDetails(
    string PaymentId,
    decimal Amount,
    decimal Fee,                       // pre-tax gateway fee
    decimal Tax,                       // 18% GST on fee (computed if fees_split missing)
    string? InstrumentType,            // UPI / DEBIT_CARD / CREDIT_CARD / NET_BANKING / WALLET
    string? BillingInstrument,         // detailed (e.g. "PhonePe UPI", "VISA Debit Card")
    string? Status);

public interface IInstamojoService
{
    Task<InstamojoPaymentResult> CreatePaymentRequestAsync(
        decimal amount, string purpose, string buyerName, string email, string? phone);

    /// <summary>Refund a completed Instamojo payment. `paymentId` is the MOJOxxx gateway payment ID.</summary>
    Task<InstamojoRefundResult> CreateRefundAsync(string paymentId, decimal refundAmount, string reason);

    bool VerifyWebhookMac(string mac, string salt, IEnumerable<KeyValuePair<string, string>> sortedValues);

    /// <summary>
    /// Fetch recent payouts from Instamojo (/v2/payouts/) and return them with the list of
    /// payment IDs each payout contains. Used to fill Payout_ID/Payout_date in archive rows.
    /// Returns empty list on failure (logged).
    /// </summary>
    Task<List<InstamojoPayoutEntry>> GetRecentPayoutsAsync(int maxPages = 5);

    /// <summary>
    /// Fetch payment details from Instamojo (/v2/payments/{paymentId}/) — fees, instrument, status.
    /// Returns null on failure. Used in the webhook handler to populate gateway_fee/tax.
    /// </summary>
    Task<InstamojoPaymentDetails?> GetPaymentDetailsAsync(string paymentId);

    /// <summary>
    /// Fetch one page of the /v2/payments/ listing (paginated, 50 per page). Returns
    /// the page's payments plus the API's reported total <c>count</c>. Returns null
    /// on transport / auth failure. Used by the Month-wise Refresh sync.
    /// </summary>
    Task<InstamojoPaymentPage?> FetchPaymentsPageAsync(int page = 1, int limit = 50);
}
