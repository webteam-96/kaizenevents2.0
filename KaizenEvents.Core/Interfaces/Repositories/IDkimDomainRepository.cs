using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IDkimDomainRepository
{
    Task<DkimDomain?> GetByIdAsync(string id);
    Task<DkimDomain?> GetByDomainAsync(string domain);
    Task<List<DkimDomain>> GetAllAsync();
    Task<DkimDomain> CreateAsync(DkimDomain domain);
    Task<DkimDomain> UpdateAsync(DkimDomain domain);
    Task DeleteAsync(DkimDomain domain);
}
