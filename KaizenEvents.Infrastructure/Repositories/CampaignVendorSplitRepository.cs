using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class CampaignVendorSplitRepository : ICampaignVendorSplitRepository
{
    private readonly AppDbContext _db;

    public CampaignVendorSplitRepository(AppDbContext db) => _db = db;

    public Task<List<CampaignVendorSplit>> GetByCampaignIdAsync(string campaignId)
        => _db.CampaignVendorSplits
            .Where(s => s.CampaignId == campaignId)
            .OrderBy(s => s.SortOrder)
            .ToListAsync();

    public Task<List<CampaignVendorSplit>> GetByCampaignAndGatewayAsync(string campaignId, string gateway)
        => _db.CampaignVendorSplits
            .Where(s => s.CampaignId == campaignId && s.Gateway == gateway)
            .OrderBy(s => s.SortOrder)
            .ToListAsync();

    public Task<CampaignVendorSplit?> GetByIdAsync(string id)
        => _db.CampaignVendorSplits.FirstOrDefaultAsync(s => s.Id == id);

    public async Task<CampaignVendorSplit> CreateAsync(CampaignVendorSplit split)
    {
        _db.CampaignVendorSplits.Add(split);
        await _db.SaveChangesAsync();
        return split;
    }

    public async Task<CampaignVendorSplit> UpdateAsync(CampaignVendorSplit split)
    {
        _db.CampaignVendorSplits.Update(split);
        await _db.SaveChangesAsync();
        return split;
    }

    public async Task DeleteAsync(CampaignVendorSplit split)
    {
        _db.CampaignVendorSplits.Remove(split);
        await _db.SaveChangesAsync();
    }

    public async Task ReplaceForCampaignAsync(string campaignId, string gateway, IEnumerable<CampaignVendorSplit> newRows)
    {
        var existing = await _db.CampaignVendorSplits
            .Where(s => s.CampaignId == campaignId && s.Gateway == gateway)
            .ToListAsync();
        _db.CampaignVendorSplits.RemoveRange(existing);
        _db.CampaignVendorSplits.AddRange(newRows);
        await _db.SaveChangesAsync();
    }

    public async Task CreateManyAsync(IEnumerable<CampaignVendorSplit> rows)
    {
        _db.CampaignVendorSplits.AddRange(rows);
        await _db.SaveChangesAsync();
    }
}
