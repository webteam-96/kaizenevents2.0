using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface ICampaignMemberRepository
{
    Task<CampaignMember?> GetByIdAsync(string id);
    Task<CampaignMember?> GetByMobileAsync(string campaignId, string mobile);
    Task<List<CampaignMember>> GetByCampaignIdAsync(string campaignId);
    Task<int> CountByCampaignIdAsync(string campaignId);
    Task<CampaignMember> CreateAsync(CampaignMember member);
    Task CreateManyAsync(IEnumerable<CampaignMember> members);
    Task<CampaignMember> UpdateAsync(CampaignMember member);
    Task DeleteAsync(CampaignMember member);
    Task DeleteAllByCampaignIdAsync(string campaignId);
}
