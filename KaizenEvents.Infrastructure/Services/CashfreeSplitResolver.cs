using System.Text.Json;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

public class CashfreeSplitResolver : ICashfreeSplitResolver
{
    private readonly ICampaignVendorSplitRepository _splits;
    private readonly ICashfreeKycRepository _kyc;
    private readonly ILogger<CashfreeSplitResolver> _logger;

    public CashfreeSplitResolver(
        ICampaignVendorSplitRepository splits,
        ICashfreeKycRepository kyc,
        ILogger<CashfreeSplitResolver> logger)
    {
        _splits = splits;
        _kyc    = kyc;
        _logger = logger;
    }

    public async Task<CashfreeSplitsResult> ResolveAsync(string campaignId, decimal orderAmount)
    {
        // 1. Kaizen default vendor (always applies)
        var kaizenDefault = await _kyc.GetDefaultKaizenVendorAsync();
        if (kaizenDefault == null)
            return new(null, null, "Kaizen default vendor not configured. Set one on the Cashfree KYC page.");
        if (kaizenDefault.Status != "ACTIVE" || !kaizenDefault.IsActive)
            return new(null, null, "Kaizen default vendor is not ACTIVE. Refresh status or pick another vendor.");
        if (kaizenDefault.DefaultPercentage is not > 0)
            return new(null, null, "Kaizen default vendor percentage is not set.");

        var kaizenAmount = Math.Round(orderAmount * kaizenDefault.DefaultPercentage.Value / 100m, 2, MidpointRounding.AwayFromZero);

        // 2. Per-event splits
        var rows = await _splits.GetByCampaignAndGatewayAsync(campaignId, "cashfree");
        if (rows.Count == 0)
            return new(null, null, "No vendor splits configured for this event.");

        var residualRows = rows.Where(r => r.SplitType == "residual").ToList();
        if (residualRows.Count != 1)
            return new(null, null, "Exactly one residual vendor row is required.");

        var residualRow = residualRows[0];

        // 3. Look up per-event vendor records for vendor_id (Cashfree's vendor_id, not our PK)
        var allKyc = (await _kyc.GetAllAsync()).ToDictionary(v => v.Id);

        // Defensive: the default vendor must not also be a per-event row
        if (rows.Any(r => r.VendorId == kaizenDefault.Id))
            return new(null, null, "Kaizen default vendor cannot also be a per-event split row.");

        var resolved = new List<CashfreeVendorSplit>();
        resolved.Add(new CashfreeVendorSplit(kaizenDefault.VendorId, kaizenAmount));

        decimal nonResidualAllocated = 0m;

        // Process non-residual rows first
        foreach (var r in rows.Where(r => r.SplitType != "residual"))
        {
            if (!allKyc.TryGetValue(r.VendorId, out var v))
                return new(null, null, $"Vendor {r.VendorId} not found.");
            if (v.Status != "ACTIVE" || !v.IsActive)
                return new(null, null, $"Vendor '{v.Name}' is not ACTIVE / in use.");

            decimal amount;
            if (r.SplitType == "percentage")
            {
                if (r.Value is not > 0 || r.Value >= 100)
                    return new(null, null, $"Percentage for vendor '{v.Name}' must be between 0 and 100.");
                amount = Math.Round(orderAmount * r.Value.Value / 100m, 2, MidpointRounding.AwayFromZero);
            }
            else if (r.SplitType == "fixed")
            {
                if (r.Value is not > 0)
                    return new(null, null, $"Fixed amount for vendor '{v.Name}' must be greater than zero.");
                amount = Math.Round(r.Value.Value, 2, MidpointRounding.AwayFromZero);
            }
            else
            {
                return new(null, null, $"Unknown split type '{r.SplitType}' for vendor '{v.Name}'.");
            }

            nonResidualAllocated += amount;
            resolved.Add(new CashfreeVendorSplit(v.VendorId, amount));
        }

        // 4. Residual = order - kaizen - sum(other splits)
        if (!allKyc.TryGetValue(residualRow.VendorId, out var residualVendor))
            return new(null, null, $"Residual vendor {residualRow.VendorId} not found.");
        if (residualVendor.Status != "ACTIVE" || !residualVendor.IsActive)
            return new(null, null, $"Residual vendor '{residualVendor.Name}' is not ACTIVE / in use.");

        var residualAmount = Math.Round(orderAmount - kaizenAmount - nonResidualAllocated, 2, MidpointRounding.AwayFromZero);
        if (residualAmount < 0)
            return new(null, null, $"Splits exceed event total (₹{orderAmount:0.00}). Reduce splits or raise amount.");
        if (residualAmount == 0)
            _logger.LogWarning("Cashfree residual vendor amount is zero for campaign {CampaignId}, order ₹{Amount}", campaignId, orderAmount);

        resolved.Add(new CashfreeVendorSplit(residualVendor.VendorId, residualAmount));

        var json = JsonSerializer.Serialize(resolved.Select(s => new { vendor_id = s.VendorId, amount = s.Amount }));
        return new(resolved, json, null);
    }
}
