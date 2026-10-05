using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class KioskVolunteerRepository : IKioskVolunteerRepository
{
    private readonly AppDbContext _db;

    public KioskVolunteerRepository(AppDbContext db) => _db = db;

    public Task<KioskVolunteer?> GetByIdAsync(string id)
        => _db.KioskVolunteers.FirstOrDefaultAsync(kv => kv.Id == id);

    public Task<KioskVolunteer?> GetByUserIdAsync(string userId)
        => _db.KioskVolunteers.FirstOrDefaultAsync(kv => kv.UserId == userId);

    public Task<List<KioskVolunteer>> GetAllAsync()
        => _db.KioskVolunteers.OrderBy(kv => kv.Name).ToListAsync();

    public async Task<KioskVolunteer> CreateAsync(KioskVolunteer volunteer)
    {
        _db.KioskVolunteers.Add(volunteer);
        await _db.SaveChangesAsync();
        return volunteer;
    }

    public async Task<KioskVolunteer> UpdateAsync(KioskVolunteer volunteer)
    {
        _db.KioskVolunteers.Update(volunteer);
        await _db.SaveChangesAsync();
        return volunteer;
    }

    public async Task DeleteAsync(KioskVolunteer volunteer)
    {
        _db.KioskVolunteers.Remove(volunteer);
        await _db.SaveChangesAsync();
    }
}
