using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class BankAccountRepository : IBankAccountRepository
{
    private readonly AppDbContext _db;

    public BankAccountRepository(AppDbContext db) => _db = db;

    public Task<BankAccount?> GetByIdAsync(string id)
        => _db.BankAccounts.FirstOrDefaultAsync(ba => ba.Id == id);

    public Task<BankAccount?> GetByCampaignIdAsync(string campaignId)
        => _db.BankAccounts.FirstOrDefaultAsync(ba => ba.CampaignId == campaignId);

    public async Task<BankAccount> CreateAsync(BankAccount account)
    {
        _db.BankAccounts.Add(account);
        await _db.SaveChangesAsync();
        return account;
    }

    public async Task<BankAccount> UpdateAsync(BankAccount account)
    {
        _db.BankAccounts.Update(account);
        await _db.SaveChangesAsync();
        return account;
    }
}
