using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface ICampaignVendorSplitRepository
{
    /// <summary>All splits for a campaign, ordered by sort_order then role.</summary>
    Task<List<CampaignVendorSplit>> GetByCampaignIdAsync(string campaignId);

    /// <summary>Filtered by gateway too — useful for PaymentController which only cares about the active gateway.</summary>
    Task<List<CampaignVendorSplit>> GetByCampaignAndGatewayAsync(string campaignId, string gateway);

    Task<CampaignVendorSplit?> GetByIdAsync(string id);

    Task<CampaignVendorSplit> CreateAsync(CampaignVendorSplit split);
    Task<CampaignVendorSplit> UpdateAsync(CampaignVendorSplit split);
    Task DeleteAsync(CampaignVendorSplit split);

    /// <summary>Bulk replace — used when admin edits the full split set for a campaign.</summary>
    Task ReplaceForCampaignAsync(string campaignId, string gateway, IEnumerable<CampaignVendorSplit> newRows);

    /// <summary>Bulk insert — used by the backfill that runs on first deploy.</summary>
    Task CreateManyAsync(IEnumerable<CampaignVendorSplit> rows);
}
