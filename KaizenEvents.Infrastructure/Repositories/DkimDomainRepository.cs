using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class DkimDomainRepository : IDkimDomainRepository
{
    private readonly AppDbContext _db;

    public DkimDomainRepository(AppDbContext db) => _db = db;

    public Task<DkimDomain?> GetByIdAsync(string id)
        => _db.DkimDomains.FirstOrDefaultAsync(d => d.Id == id);

    public Task<DkimDomain?> GetByDomainAsync(string domain)
        => _db.DkimDomains.FirstOrDefaultAsync(d => d.Domain == domain);

    public Task<List<DkimDomain>> GetAllAsync()
        => _db.DkimDomains.OrderBy(d => d.Domain).ToListAsync();

    public async Task<DkimDomain> CreateAsync(DkimDomain domain)
    {
        _db.DkimDomains.Add(domain);
        await _db.SaveChangesAsync();
        return domain;
    }

    public async Task<DkimDomain> UpdateAsync(DkimDomain domain)
    {
        _db.DkimDomains.Update(domain);
        await _db.SaveChangesAsync();
        return domain;
    }

    public async Task DeleteAsync(DkimDomain domain)
    {
        _db.DkimDomains.Remove(domain);
        await _db.SaveChangesAsync();
    }
}
