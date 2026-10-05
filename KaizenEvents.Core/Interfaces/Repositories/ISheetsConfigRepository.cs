using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface ISheetsConfigRepository
{
    Task<SheetsConfig?> GetByCampaignIdAsync(string campaignId);
    Task<SheetsConfig> CreateAsync(SheetsConfig config);
    Task<SheetsConfig> UpdateAsync(SheetsConfig config);
    Task<SheetsConfig> UpsertAsync(SheetsConfig config);
    Task DeleteByCampaignIdAsync(string campaignId);
}
