using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class FundTransferRepository : IFundTransferRepository
{
    private readonly AppDbContext _db;

    public FundTransferRepository(AppDbContext db) => _db = db;

    public Task<FundTransfer?> GetByIdAsync(string id)
        => _db.FundTransfers.FirstOrDefaultAsync(ft => ft.Id == id);

    public Task<List<FundTransfer>> GetAllAsync()
        => _db.FundTransfers.OrderByDescending(ft => ft.CreatedAt).ToListAsync();

    public Task<List<FundTransfer>> GetByCampaignIdAsync(string campaignId)
        => _db.FundTransfers
            .Where(ft => ft.CampaignId == campaignId)
            .OrderByDescending(ft => ft.CreatedAt)
            .ToListAsync();

    public async Task<string> GetNextRequestNumberAsync()
    {
        var count = await _db.FundTransfers.CountAsync();
        return $"FT-{DateTime.UtcNow:yyyyMMdd}-{count + 1:D4}";
    }

    public async Task<FundTransfer> CreateAsync(FundTransfer transfer)
    {
        _db.FundTransfers.Add(transfer);
        await _db.SaveChangesAsync();
        return transfer;
    }

    public async Task<FundTransfer> UpdateAsync(FundTransfer transfer)
    {
        _db.FundTransfers.Update(transfer);
        await _db.SaveChangesAsync();
        return transfer;
    }
}
