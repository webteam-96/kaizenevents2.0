using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly AppDbContext _db;

    public UserRepository(AppDbContext db) => _db = db;

    public Task<User?> GetByIdAsync(string id)
        => _db.Users.FirstOrDefaultAsync(u => u.Id == id);

    public Task<User?> GetByEmailAsync(string email)
        => _db.Users.FirstOrDefaultAsync(u => u.Email == email);

    public Task<List<User>> GetAllAsync()
        => _db.Users.OrderBy(u => u.Name).ToListAsync();

    public Task<bool> ExistsAnyAsync()
        => _db.Users.AnyAsync();

    public async Task<User> CreateAsync(User user)
    {
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    public async Task<User> UpdateAsync(User user)
    {
        _db.Users.Update(user);
        await _db.SaveChangesAsync();
        return user;
    }

    public async Task<List<string>> GetCampaignIdsAsync(string userId)
        => await _db.UserCampaignAccess
            .Where(x => x.UserId == userId)
            .Select(x => x.CampaignId)
            .ToListAsync();

    public async Task SetCampaignAccessAsync(string userId, List<string> campaignIds)
    {
        var existing = await _db.UserCampaignAccess
            .Where(x => x.UserId == userId)
            .ToListAsync();

        _db.UserCampaignAccess.RemoveRange(existing);

        var newAccess = campaignIds.Select(cid => new UserCampaignAccess
        {
            UserId = userId,
            CampaignId = cid
        });
        _db.UserCampaignAccess.AddRange(newAccess);

        await _db.SaveChangesAsync();
    }

    public async Task DeleteAsync(User user)
    {
        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
    }
}
