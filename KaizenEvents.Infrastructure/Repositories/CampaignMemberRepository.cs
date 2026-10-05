using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class CampaignMemberRepository : ICampaignMemberRepository
{
    private readonly AppDbContext _db;

    public CampaignMemberRepository(AppDbContext db) => _db = db;

    public Task<CampaignMember?> GetByIdAsync(string id)
        => _db.CampaignMembers.FirstOrDefaultAsync(m => m.Id == id);

    public Task<CampaignMember?> GetByMobileAsync(string campaignId, string mobile)
        => _db.CampaignMembers.FirstOrDefaultAsync(m => m.CampaignId == campaignId && m.Mobile == mobile);

    public Task<List<CampaignMember>> GetByCampaignIdAsync(string campaignId)
        => _db.CampaignMembers.Where(m => m.CampaignId == campaignId).OrderBy(m => m.Name).ToListAsync();

    public Task<int> CountByCampaignIdAsync(string campaignId)
        => _db.CampaignMembers.CountAsync(m => m.CampaignId == campaignId);

    public async Task<CampaignMember> CreateAsync(CampaignMember member)
    {
        _db.CampaignMembers.Add(member);
        await _db.SaveChangesAsync();
        return member;
    }

    public async Task CreateManyAsync(IEnumerable<CampaignMember> members)
    {
        _db.CampaignMembers.AddRange(members);
        await _db.SaveChangesAsync();
    }

    public async Task<CampaignMember> UpdateAsync(CampaignMember member)
    {
        _db.CampaignMembers.Update(member);
        await _db.SaveChangesAsync();
        return member;
    }

    public async Task DeleteAsync(CampaignMember member)
    {
        _db.CampaignMembers.Remove(member);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteAllByCampaignIdAsync(string campaignId)
    {
        var members = await _db.CampaignMembers.Where(m => m.CampaignId == campaignId).ToListAsync();
        _db.CampaignMembers.RemoveRange(members);
        await _db.SaveChangesAsync();
    }
}
