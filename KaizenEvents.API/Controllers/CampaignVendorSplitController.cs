using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Per-campaign vendor split management (Cashfree + Razorpay route).
///
/// New model (April 2026):
///   - Each row has a <c>split_type</c>: "percentage" | "fixed" | "residual".
///   - Exactly one row per (campaign, gateway) must be the residual; it absorbs
///     whatever remains after the Kaizen default vendor and the other rows.
///   - The Kaizen default vendor (cashfree_kyc.is_default_kaizen_vendor) is auto-
///     applied at its global percentage on every Cashfree order; it MUST NOT
///     appear in this table.
///   - No more hardcoded commission/settlement percentages.
/// </summary>
[ApiController]
[Route("api/campaigns/{campaign_id}/vendor-splits")]
[Authorize]
public class CampaignVendorSplitController : ApiControllerBase
{
    private readonly ICampaignVendorSplitRepository _splits;
    private readonly ICampaignRepository _campaigns;
    private readonly ICashfreeKycRepository _kyc;
    private readonly IRazorpayRouteAccountRepository _razorpayRoute;
    private readonly IUserRepository _users;
    private readonly ILogger<CampaignVendorSplitController> _logger;

    public CampaignVendorSplitController(
        ICampaignVendorSplitRepository splits,
        ICampaignRepository campaigns,
        ICashfreeKycRepository kyc,
        IRazorpayRouteAccountRepository razorpayRoute,
        IUserRepository users,
        ILogger<CampaignVendorSplitController> logger)
    {
        _splits        = splits;
        _campaigns     = campaigns;
        _kyc           = kyc;
        _razorpayRoute = razorpayRoute;
        _users         = users;
        _logger        = logger;
    }

    // ── GET /api/campaigns/{campaign_id}/vendor-splits ───────────────────────
    [HttpGet]
    public async Task<IActionResult> List(string campaign_id, [FromQuery] string? gateway = "cashfree")
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var rows = string.IsNullOrEmpty(gateway)
            ? await _splits.GetByCampaignIdAsync(campaign_id)
            : await _splits.GetByCampaignAndGatewayAsync(campaign_id, gateway!.ToLowerInvariant());

        var kycById      = (await _kyc.GetAllAsync()).ToDictionary(v => v.Id);
        var razorpayById = (await _razorpayRoute.GetAllAsync()).ToDictionary(a => a.Id);

        return Ok(rows.Select(r =>
        {
            string? vendorName = null;
            string  vendorLabel = r.VendorId;
            string? vendorStatus = null;
            bool?   vendorActive = null;

            if (r.Gateway == "cashfree" && kycById.TryGetValue(r.VendorId, out var cv))
            {
                vendorName   = cv.Name;
                vendorLabel  = $"{cv.Name} ({cv.VendorId})";
                vendorStatus = cv.Status;
                vendorActive = cv.IsActive;
            }
            else if (r.Gateway == "razorpay" && razorpayById.TryGetValue(r.VendorId, out var rv))
            {
                vendorName   = rv.Name;
                vendorLabel  = $"{rv.Name} ({rv.AccountId})";
                vendorStatus = rv.Status;
                vendorActive = rv.IsActive;
            }

            return new
            {
                id               = r.Id,
                campaign_id      = r.CampaignId,
                gateway          = r.Gateway,
                vendor_id        = r.VendorId,
                vendor_name      = vendorName,
                vendor_label     = vendorLabel,
                vendor_status    = vendorStatus,
                vendor_is_active = vendorActive,
                split_type       = r.SplitType,
                value            = r.Value,
                sort_order       = r.SortOrder,
                updated_at       = r.UpdatedAt
            };
        }));
    }

    // ── GET /api/campaigns/{campaign_id}/vendor-splits/available-vendors ─────
    /// <summary>
    /// Lists vendors the admin can pick from when editing this campaign's splits.
    /// For Cashfree: excludes the Kaizen default vendor (auto-applied at order time).
    /// </summary>
    [HttpGet("available-vendors")]
    public async Task<IActionResult> AvailableVendors(
        string campaign_id,
        [FromQuery] string gateway = "cashfree",
        [FromQuery] string? role   = null)
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();

        if (gateway == "cashfree")
        {
            var allKyc = await _kyc.GetAllAsync();
            var filtered = allKyc.Where(v =>
                v.IsActive
                && v.Status == "ACTIVE"
                && !v.IsDefaultKaizenVendor);          // exclude Kaizen default
            if (!string.IsNullOrEmpty(role)) filtered = filtered.Where(v => v.Role == role);
            return Ok(filtered.OrderBy(v => v.Name).Select(v => new
            {
                id             = v.Id,
                vendor_id      = v.VendorId,
                name           = v.Name,
                role           = v.Role,
                label          = $"{v.Name} ({v.VendorId})",
                pan            = v.Pan,
                ifsc           = v.Ifsc,
                masked_account = v.AccountNumberMasked
            }));
        }
        else if (gateway == "razorpay")
        {
            var allRzp = await _razorpayRoute.GetAllAsync();
            var filtered = allRzp.Where(v =>
                v.IsActive
                && (v.Status == "ACTIVE" || v.Status == "activated" || v.Status == "active")
                && !v.IsDefaultKaizenVendor);          // exclude Kaizen default
            if (!string.IsNullOrEmpty(role)) filtered = filtered.Where(v => v.Role == role);
            return Ok(filtered.OrderBy(v => v.Role).ThenBy(v => v.Name).Select(v => new
            {
                id             = v.Id,
                vendor_id      = v.AccountId,
                name           = v.Name,
                role           = v.Role,
                label          = $"{v.Name} ({v.AccountId})",
                pan            = v.Pan,
                ifsc           = v.Ifsc,
                masked_account = v.AccountNumberMasked
            }));
        }

        return Ok(Array.Empty<object>());
    }

    // ── GET /api/campaigns/{campaign_id}/vendor-splits/kaizen-default ────────
    /// <summary>
    /// Returns the globally-configured Kaizen default vendor + its percentage so
    /// the splits UI can show it as a locked row at the top.
    /// </summary>
    [HttpGet("kaizen-default")]
    public async Task<IActionResult> KaizenDefault(string campaign_id, [FromQuery] string gateway = "cashfree")
    {
        if (!await HasAccessAsync(campaign_id)) return Forbidden();

        if (gateway == "cashfree")
        {
            var def = await _kyc.GetDefaultKaizenVendorAsync();
            if (def == null)
                return Ok(new { configured = false });

            return Ok(new
            {
                configured         = true,
                id                 = def.Id,
                vendor_id          = def.VendorId,
                name               = def.Name,
                label              = $"{def.Name} ({def.VendorId})",
                default_percentage = def.DefaultPercentage,
                status             = def.Status,
                is_active          = def.IsActive
            });
        }
        else if (gateway == "razorpay")
        {
            var def = await _razorpayRoute.GetDefaultKaizenVendorAsync();
            if (def == null)
                return Ok(new { configured = false });

            return Ok(new
            {
                configured         = true,
                id                 = def.Id,
                vendor_id          = def.AccountId,
                name               = def.Name,
                label              = $"{def.Name} ({def.AccountId})",
                default_percentage = def.DefaultPercentage,
                status             = def.Status,
                is_active          = def.IsActive
            });
        }

        return Ok(new { configured = false });
    }

    // ── PUT /api/campaigns/{campaign_id}/vendor-splits ───────────────────────
    /// <summary>
    /// Atomically replaces all split rows for (campaign, gateway). Validates:
    ///  - exactly one row has split_type = "residual"
    ///  - percentage rows have 0 &lt; value &lt; 100
    ///  - fixed rows have value &gt; 0
    ///  - Kaizen default vendor isn't included
    ///  - sum of percentages + Kaizen default percentage ≤ 100
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> Replace(string campaign_id, [FromBody] ReplaceVendorSplitsRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (string.IsNullOrWhiteSpace(req.Gateway))
            return BadRequest(new { detail = "gateway is required." });
        var gateway = req.Gateway.ToLowerInvariant();
        if (gateway != "cashfree" && gateway != "razorpay")
            return BadRequest(new { detail = $"Unsupported gateway '{req.Gateway}'." });
        if (req.Splits == null || req.Splits.Count == 0)
            return BadRequest(new { detail = "Splits cannot be empty." });

        // Normalize split types
        var splits = req.Splits.Select(s => s with { SplitType = (s.SplitType ?? "").Trim().ToLowerInvariant() }).ToList();

        var residual = splits.Where(s => s.SplitType == "residual").ToList();
        if (residual.Count != 1)
            return BadRequest(new { detail = "Exactly one split row must be marked 'residual'." });

        decimal kaizenDefaultPct = 0m;
        if (gateway == "cashfree")
        {
            var def = await _kyc.GetDefaultKaizenVendorAsync();
            if (def == null)
                return BadRequest(new { detail = "Kaizen default vendor not configured. Set one on the Cashfree KYC page first." });
            kaizenDefaultPct = def.DefaultPercentage ?? 0m;
            if (splits.Any(s => s.VendorId == def.Id))
                return BadRequest(new { detail = "Kaizen default vendor cannot be added as a per-event split (it auto-applies to every event)." });
        }
        else if (gateway == "razorpay")
        {
            var def = await _razorpayRoute.GetDefaultKaizenVendorAsync();
            if (def == null)
                return BadRequest(new { detail = "Kaizen default vendor not configured. Set one on the Razorpay Route page first." });
            kaizenDefaultPct = def.DefaultPercentage ?? 0m;
            if (splits.Any(s => s.VendorId == def.Id))
                return BadRequest(new { detail = "Kaizen default vendor cannot be added as a per-event split (it auto-applies to every event)." });
        }

        // Validate each row
        var kycById = (await _kyc.GetAllAsync()).ToDictionary(v => v.Id);
        var rzpById = (await _razorpayRoute.GetAllAsync()).ToDictionary(a => a.Id);
        var seenVendors = new HashSet<string>(StringComparer.Ordinal);
        decimal percentSum = 0m;

        foreach (var s in splits)
        {
            if (string.IsNullOrWhiteSpace(s.VendorId))
                return BadRequest(new { detail = "Each row must select a vendor." });
            if (!seenVendors.Add(s.VendorId))
                return BadRequest(new { detail = "The same vendor cannot appear twice in the splits." });

            string vendorName, vendorStatus;
            bool   vendorActive;
            if (gateway == "cashfree")
            {
                if (!kycById.TryGetValue(s.VendorId, out var v))
                    return BadRequest(new { detail = $"Cashfree vendor {s.VendorId} not found." });
                vendorName = v.Name; vendorStatus = v.Status; vendorActive = v.IsActive;
            }
            else
            {
                if (!rzpById.TryGetValue(s.VendorId, out var v))
                    return BadRequest(new { detail = $"Razorpay account {s.VendorId} not found." });
                vendorName = v.Name; vendorStatus = v.Status; vendorActive = v.IsActive;
            }
            var statusLower = (vendorStatus ?? "").ToLowerInvariant();
            var statusOk = gateway == "razorpay"
                ? (statusLower == "activated" || statusLower == "active")
                : (vendorStatus == "ACTIVE");
            if (!vendorActive || !statusOk)
                return BadRequest(new { detail = $"Vendor '{vendorName}' is not ACTIVE / in use." });

            switch (s.SplitType)
            {
                case "percentage":
                    if (s.Value is not > 0 || s.Value >= 100)
                        return BadRequest(new { detail = $"Percentage for vendor '{vendorName}' must be between 0 and 100 (exclusive)." });
                    percentSum += s.Value.Value;
                    break;
                case "fixed":
                    if (s.Value is not > 0)
                        return BadRequest(new { detail = $"Fixed amount for vendor '{vendorName}' must be greater than zero." });
                    break;
                case "residual":
                    if (s.Value.HasValue)
                        return BadRequest(new { detail = $"Residual row for vendor '{vendorName}' must not have a value (computed automatically)." });
                    break;
                default:
                    return BadRequest(new { detail = $"Unknown split type '{s.SplitType}' (use percentage | fixed | residual)." });
            }
        }

        if ((gateway == "cashfree" || gateway == "razorpay") && Math.Round(percentSum + kaizenDefaultPct, 2) >= 100m)
            return BadRequest(new { detail = $"Sum of percentage splits ({percentSum:0.00}%) plus Kaizen default ({kaizenDefaultPct:0.00}%) must be less than 100% — the residual needs at least 0% room." });

        // Build new rows
        var now = DateTime.UtcNow;
        var newRows = splits.Select((s, i) => new CampaignVendorSplit
        {
            Id          = Guid.NewGuid().ToString(),
            CampaignId  = campaign_id,
            Gateway     = gateway,
            VendorId    = s.VendorId,
            SplitType   = s.SplitType,
            Value       = s.SplitType == "residual" ? null : s.Value,
            SortOrder   = i,
            CreatedAt   = now,
            UpdatedAt   = now
        }).ToList();

        await _splits.ReplaceForCampaignAsync(campaign_id, gateway, newRows);
        return Ok(new { success = true, count = newRows.Count });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    private async Task<bool> HasAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }
}

public record ReplaceVendorSplitsRequest(string Gateway, List<VendorSplitItem> Splits);
public record VendorSplitItem(string VendorId, string SplitType, decimal? Value);
