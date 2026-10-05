using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface ICampaignRepository
{
    Task<Campaign?> GetByIdAsync(string id);
    Task<Campaign?> GetBySlugAsync(string slug);
    Task<List<Campaign>> GetAllAsync();
    Task<List<Campaign>> GetByAccessAsync(string userId);
    Task<List<Campaign>> GetPublicActiveAsync();
    Task<bool> SlugExistsAsync(string slug, string? excludeId = null);
    Task<Campaign> CreateAsync(Campaign campaign);
    Task<Campaign> UpdateAsync(Campaign campaign);
    Task DeleteAsync(Campaign campaign);
}
