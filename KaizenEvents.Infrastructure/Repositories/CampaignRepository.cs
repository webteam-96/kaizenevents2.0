using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class CampaignRepository : ICampaignRepository
{
    private readonly AppDbContext _db;

    public CampaignRepository(AppDbContext db) => _db = db;

    public Task<Campaign?> GetByIdAsync(string id)
        => _db.Campaigns.FirstOrDefaultAsync(c => c.Id == id);

    public Task<Campaign?> GetBySlugAsync(string slug)
        => _db.Campaigns.FirstOrDefaultAsync(c => c.Slug == slug);

    public Task<List<Campaign>> GetAllAsync()
        => _db.Campaigns.OrderByDescending(c => c.CreatedAt).ToListAsync();

    public async Task<List<Campaign>> GetByAccessAsync(string userId)
    {
        var campaignIds = await _db.UserCampaignAccess
            .Where(x => x.UserId == userId)
            .Select(x => x.CampaignId)
            .ToListAsync();

        return await _db.Campaigns
            .Where(c => campaignIds.Contains(c.Id))
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();
    }

    public Task<List<Campaign>> GetPublicActiveAsync()
        => _db.Campaigns
            .Where(c => (c.Status == CampaignStatus.Active || c.Status == CampaignStatus.Draft)
                        && c.ShowOnHomepage
                        && c.HasLandingPage)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();

    public Task<bool> SlugExistsAsync(string slug, string? excludeId = null)
        => _db.Campaigns.AnyAsync(c => c.Slug == slug && c.Id != excludeId);

    public async Task<Campaign> CreateAsync(Campaign campaign)
    {
        _db.Campaigns.Add(campaign);
        await _db.SaveChangesAsync();
        return campaign;
    }

    public async Task<Campaign> UpdateAsync(Campaign campaign)
    {
        _db.Campaigns.Update(campaign);
        await _db.SaveChangesAsync();
        return campaign;
    }

    public async Task DeleteAsync(Campaign campaign)
    {
        _db.Campaigns.Remove(campaign);
        await _db.SaveChangesAsync();
    }
}
