using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Result of resolving Razorpay Route transfers for a single order:
///   - Transfers + TransfersJson populated → ready to send as Razorpay `transfers[]`
///   - ErrorDetail populated               → user-facing error (translate to 400)
///
/// All amounts are in **paise**. The sum of <see cref="Transfers"/> equals
/// <c>orderAmount * 100</c> exactly (the residual row absorbs rounding drift).
/// </summary>
public record RazorpaySplitsResult(
    IReadOnlyList<RazorpayTransfer>? Transfers,
    string? TransfersJson,
    string? ErrorDetail);

/// <summary>
/// Whether an order should go through Route (with a resolved split) or as a plain,
/// single-account order. See <see cref="IRazorpaySplitResolver.DecideAsync"/>.
/// </summary>
public record RazorpayOrderDecision(
    bool UseRoute,
    RazorpaySplitsResult? Splits,
    string? ErrorDetail);

/// <summary>
/// Resolves per-event Razorpay Route splits for a given order amount.
///
/// Mirrors <see cref="ICashfreeSplitResolver"/>:
///   - Includes the global Kaizen default Linked Account (razorpay_route_accounts.is_default_kaizen_vendor)
///     at its configured percentage.
///   - Per-event rows from campaign_vendor_splits (gateway='razorpay') may be
///     percentage / fixed / residual. The residual absorbs whatever's left after
///     the Kaizen default + non-residual rows.
/// </summary>
public interface IRazorpaySplitResolver
{
    Task<RazorpaySplitsResult> ResolveAsync(string campaignId, decimal orderAmount);

    /// <summary>
    /// Single entry point for "should this order use Route?" — replaces the
    /// RazorpayRoute:Enabled-flag check that used to be duplicated in
    /// PaymentController and RegistrationController.
    ///   - account.RazorpaySettlementMode == "single_account" → always plain (UseRoute=false),
    ///     regardless of the global flag or whether split rows exist for the campaign.
    ///   - otherwise → today's behavior: gated by RazorpayRoute:Enabled, then ResolveAsync.
    /// </summary>
    Task<RazorpayOrderDecision> DecideAsync(Campaign campaign, PaymentAccount? account, decimal orderAmount);
}
