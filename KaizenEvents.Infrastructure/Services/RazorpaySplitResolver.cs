using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

public class RazorpaySplitResolver : IRazorpaySplitResolver
{
    private readonly ICampaignVendorSplitRepository _splits;
    private readonly IRazorpayRouteAccountRepository _accounts;
    private readonly IConfiguration _config;
    private readonly ILogger<RazorpaySplitResolver> _logger;

    public RazorpaySplitResolver(
        ICampaignVendorSplitRepository splits,
        IRazorpayRouteAccountRepository accounts,
        IConfiguration config,
        ILogger<RazorpaySplitResolver> logger)
    {
        _splits   = splits;
        _accounts = accounts;
        _config   = config;
        _logger   = logger;
    }

    public async Task<RazorpayOrderDecision> DecideAsync(Campaign campaign, PaymentAccount? account, decimal orderAmount)
    {
        // Per-account override: single_account always takes the plain-order path,
        // regardless of the global kill-switch or vendor-split-row presence. This also
        // sidesteps the "campaign with no split rows hard-fails" case below, but only
        // for accounts explicitly opted into single_account mode.
        if (account?.RazorpaySettlementMode == "single_account")
            return new(UseRoute: false, Splits: null, ErrorDetail: null);

        // "route" (or no account attached — legacy path): still gated by the emergency
        // global kill-switch, exactly as before this change.
        if (!_config.GetValue<bool>("RazorpayRoute:Enabled"))
            return new(UseRoute: false, Splits: null, ErrorDetail: null);

        var resolved = await ResolveAsync(campaign.Id, orderAmount);
        return new(UseRoute: true, Splits: resolved, ErrorDetail: resolved.ErrorDetail);
    }

    public async Task<RazorpaySplitsResult> ResolveAsync(string campaignId, decimal orderAmount)
    {
        // 1. Kaizen default Linked Account
        var kaizenDefault = await _accounts.GetDefaultKaizenVendorAsync();
        if (kaizenDefault == null)
            return new(null, null, "Kaizen default vendor not configured. Set one on the Razorpay Route page.");
        if (!kaizenDefault.IsActive)
            return new(null, null, "Kaizen default Razorpay account is disabled. Re-enable it or pick another.");
        // Razorpay activation statuses: activated | under_review | needs_clarification | etc.
        var defStatus = (kaizenDefault.Status ?? "").ToLowerInvariant();
        if (defStatus != "activated" && defStatus != "active")
            return new(null, null, "Kaizen default Razorpay account is not activated yet.");
        if (kaizenDefault.DefaultPercentage is not > 0)
            return new(null, null, "Kaizen default vendor percentage is not set.");

        var orderTotalPaise = (long)Math.Round(orderAmount * 100m, MidpointRounding.AwayFromZero);
        var kaizenPaise = (long)Math.Round(
            orderAmount * 100m * kaizenDefault.DefaultPercentage.Value / 100m,
            MidpointRounding.AwayFromZero);

        // 2. Per-event splits
        var rows = await _splits.GetByCampaignAndGatewayAsync(campaignId, "razorpay");
        if (rows.Count == 0)
            return new(null, null, "No vendor splits configured for this event.");

        var residualRows = rows.Where(r => r.SplitType == "residual").ToList();
        if (residualRows.Count != 1)
            return new(null, null, "Exactly one residual vendor row is required.");
        var residualRow = residualRows[0];

        var allById = (await _accounts.GetAllAsync()).ToDictionary(v => v.Id);

        // Defensive: the default must not also be a per-event row
        if (rows.Any(r => r.VendorId == kaizenDefault.Id))
            return new(null, null, "Kaizen default vendor cannot also be a per-event split row.");

        var transfers = new List<RazorpayTransfer>
        {
            new(kaizenDefault.AccountId, kaizenPaise)
        };

        long nonResidualAllocatedPaise = 0;

        foreach (var r in rows.Where(r => r.SplitType != "residual"))
        {
            if (!allById.TryGetValue(r.VendorId, out var v))
                return new(null, null, $"Razorpay account {r.VendorId} not found.");
            var rowStatus = (v.Status ?? "").ToLowerInvariant();
            if (!v.IsActive || (rowStatus != "activated" && rowStatus != "active"))
                return new(null, null, $"Razorpay account '{v.Name}' is not activated / in use.");

            long amountPaise;
            if (r.SplitType == "percentage")
            {
                if (r.Value is not > 0 || r.Value >= 100)
                    return new(null, null, $"Percentage for '{v.Name}' must be between 0 and 100.");
                amountPaise = (long)Math.Round(
                    orderAmount * 100m * r.Value.Value / 100m,
                    MidpointRounding.AwayFromZero);
            }
            else if (r.SplitType == "fixed")
            {
                if (r.Value is not > 0)
                    return new(null, null, $"Fixed amount for '{v.Name}' must be greater than zero.");
                amountPaise = (long)Math.Round(r.Value.Value * 100m, MidpointRounding.AwayFromZero);
            }
            else
            {
                return new(null, null, $"Unknown split type '{r.SplitType}' for '{v.Name}'.");
            }

            nonResidualAllocatedPaise += amountPaise;
            transfers.Add(new RazorpayTransfer(v.AccountId, amountPaise));
        }

        // 3. Residual
        if (!allById.TryGetValue(residualRow.VendorId, out var residualVendor))
            return new(null, null, $"Residual Razorpay account {residualRow.VendorId} not found.");
        var residualStatus = (residualVendor.Status ?? "").ToLowerInvariant();
        if (!residualVendor.IsActive || (residualStatus != "activated" && residualStatus != "active"))
            return new(null, null, $"Residual Razorpay account '{residualVendor.Name}' is not activated / in use.");

        var residualPaise = orderTotalPaise - kaizenPaise - nonResidualAllocatedPaise;
        if (residualPaise < 0)
            return new(null, null, $"Splits exceed event total (₹{orderAmount:0.00}). Reduce splits or raise amount.");
        if (residualPaise == 0)
            _logger.LogWarning("Razorpay residual amount is zero for campaign {CampaignId}, order ₹{Amount}", campaignId, orderAmount);

        transfers.Add(new RazorpayTransfer(residualVendor.AccountId, residualPaise));

        var json = JsonSerializer.Serialize(
            transfers.Select(t => new { account_id = t.AccountId, amount_paise = t.AmountPaise }));
        return new(transfers, json, null);
    }
}
