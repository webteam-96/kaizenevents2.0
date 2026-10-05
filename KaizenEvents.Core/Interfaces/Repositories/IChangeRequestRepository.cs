using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IChangeRequestRepository
{
    Task<ChangeRequest?> GetByIdAsync(string id);
    Task<List<ChangeRequest>> GetAllAsync();
    Task<List<ChangeRequest>> GetByCampaignIdAsync(string campaignId);
    Task<string> GetNextRequestNumberAsync();
    Task<ChangeRequest> CreateAsync(ChangeRequest request);
    Task<ChangeRequest> UpdateAsync(ChangeRequest request);
}
