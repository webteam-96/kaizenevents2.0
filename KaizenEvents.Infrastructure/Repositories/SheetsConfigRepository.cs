using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class SheetsConfigRepository : ISheetsConfigRepository
{
    private readonly AppDbContext _db;

    public SheetsConfigRepository(AppDbContext db) => _db = db;

    public Task<SheetsConfig?> GetByCampaignIdAsync(string campaignId)
        => _db.SheetsConfigs.FirstOrDefaultAsync(sc => sc.CampaignId == campaignId);

    public async Task<SheetsConfig> CreateAsync(SheetsConfig config)
    {
        _db.SheetsConfigs.Add(config);
        await _db.SaveChangesAsync();
        return config;
    }

    public async Task<SheetsConfig> UpdateAsync(SheetsConfig config)
    {
        _db.SheetsConfigs.Update(config);
        await _db.SaveChangesAsync();
        return config;
    }

    public async Task<SheetsConfig> UpsertAsync(SheetsConfig config)
    {
        var existing = await _db.SheetsConfigs.FirstOrDefaultAsync(sc => sc.CampaignId == config.CampaignId);
        if (existing == null)
            return await CreateAsync(config);
        _db.Entry(existing).CurrentValues.SetValues(config);
        await _db.SaveChangesAsync();
        return existing;
    }

    public async Task DeleteByCampaignIdAsync(string campaignId)
    {
        var existing = await _db.SheetsConfigs.FirstOrDefaultAsync(sc => sc.CampaignId == campaignId);
        if (existing != null)
        {
            _db.SheetsConfigs.Remove(existing);
            await _db.SaveChangesAsync();
        }
    }
}
