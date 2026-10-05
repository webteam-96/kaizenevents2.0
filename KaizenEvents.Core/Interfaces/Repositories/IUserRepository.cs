using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(string id);
    Task<User?> GetByEmailAsync(string email);
    Task<List<User>> GetAllAsync();
    Task<bool> ExistsAnyAsync();
    Task<User> CreateAsync(User user);
    Task<User> UpdateAsync(User user);
    Task<List<string>> GetCampaignIdsAsync(string userId);
    Task SetCampaignAccessAsync(string userId, List<string> campaignIds);
    Task DeleteAsync(User user);
}
