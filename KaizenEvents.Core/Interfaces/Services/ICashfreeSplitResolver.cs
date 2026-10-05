namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Result of resolving Cashfree vendor splits for a single order:
///   - Splits + SplitsJson populated → ready to send to Cashfree
///   - ErrorDetail populated         → user-facing error (translate to 400)
/// </summary>
public record CashfreeSplitsResult(
    IReadOnlyList<CashfreeVendorSplit>? Splits,
    string? SplitsJson,
    string? ErrorDetail);

/// <summary>
/// Resolves per-event Cashfree vendor splits for a given order amount.
///
/// Includes the global Kaizen default vendor (from cashfree_kyc.is_default_kaizen_vendor)
/// at its configured percentage, plus the per-event rows from campaign_vendor_splits.
/// Each per-event row may be a percentage, a fixed ₹ amount, or the residual (computed
/// last to absorb rounding drift).
/// </summary>
public interface ICashfreeSplitResolver
{
    Task<CashfreeSplitsResult> ResolveAsync(string campaignId, decimal orderAmount);
}
