using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IKioskVolunteerRepository
{
    Task<KioskVolunteer?> GetByIdAsync(string id);
    Task<KioskVolunteer?> GetByUserIdAsync(string userId);
    Task<List<KioskVolunteer>> GetAllAsync();
    Task<KioskVolunteer> CreateAsync(KioskVolunteer volunteer);
    Task<KioskVolunteer> UpdateAsync(KioskVolunteer volunteer);
    Task DeleteAsync(KioskVolunteer volunteer);
}
