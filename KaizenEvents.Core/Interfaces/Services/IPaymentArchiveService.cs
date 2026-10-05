using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Writes per-payment audit rows to the gateway-specific archive tables
/// (instamojo_datadetails / razorpay_datadetails / cashfree_datadetails).
/// Called from each payment-success handler so finance team has a continuous record.
/// All methods are best-effort — failure to archive doesn't block payment activation.
/// </summary>
public interface IPaymentArchiveService
{
    /// <summary>Writes a row to the gateway-appropriate *_datadetails table.</summary>
    Task ArchivePaymentAsync(
        Payment payment,
        Campaign campaign,
        Registration? registration);

    /// <summary>
    /// Updates payout info (Payout_ID / Payout_date / payout_status / payout_flag)
    /// on the matching *_datadetails row. Idempotent — safe to call repeatedly.
    /// </summary>
    Task<bool> UpdatePayoutInfoAsync(
        string gateway,
        string gatewayPaymentId,
        string? payoutId,
        DateTime? payoutDate,
        string? payoutStatus);
}
