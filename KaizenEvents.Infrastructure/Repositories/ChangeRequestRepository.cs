using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class ChangeRequestRepository : IChangeRequestRepository
{
    private readonly AppDbContext _db;

    public ChangeRequestRepository(AppDbContext db) => _db = db;

    public Task<ChangeRequest?> GetByIdAsync(string id)
        => _db.ChangeRequests.FirstOrDefaultAsync(cr => cr.Id == id);

    public Task<List<ChangeRequest>> GetAllAsync()
        => _db.ChangeRequests.OrderByDescending(cr => cr.CreatedAt).ToListAsync();

    public Task<List<ChangeRequest>> GetByCampaignIdAsync(string campaignId)
        => _db.ChangeRequests
            .Where(cr => cr.CampaignId == campaignId)
            .OrderByDescending(cr => cr.CreatedAt)
            .ToListAsync();

    public async Task<string> GetNextRequestNumberAsync()
    {
        var count = await _db.ChangeRequests.CountAsync();
        return $"CR-{DateTime.UtcNow:yyyyMMdd}-{count + 1:D4}";
    }

    public async Task<ChangeRequest> CreateAsync(ChangeRequest request)
    {
        _db.ChangeRequests.Add(request);
        await _db.SaveChangesAsync();
        return request;
    }

    public async Task<ChangeRequest> UpdateAsync(ChangeRequest request)
    {
        _db.ChangeRequests.Update(request);
        await _db.SaveChangesAsync();
        return request;
    }
}
