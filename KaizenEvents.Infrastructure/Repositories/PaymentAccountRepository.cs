using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class PaymentAccountRepository : IPaymentAccountRepository
{
    private readonly AppDbContext _db;

    public PaymentAccountRepository(AppDbContext db) => _db = db;

    public Task<PaymentAccount?> GetByIdAsync(string id)
        => _db.PaymentAccounts.FirstOrDefaultAsync(pa => pa.Id == id);

    public Task<List<PaymentAccount>> GetAllAsync()
        => _db.PaymentAccounts.OrderBy(pa => pa.Name).ToListAsync();

    public Task<List<PaymentAccount>> GetActiveAsync()
        => _db.PaymentAccounts.Where(pa => pa.IsActive).OrderBy(pa => pa.Name).ToListAsync();

    public Task<bool> NameExistsAsync(string name, string? excludeId = null)
        => _db.PaymentAccounts.AnyAsync(pa => pa.Name == name && pa.Id != excludeId);

    public async Task<PaymentAccount> CreateAsync(PaymentAccount account)
    {
        _db.PaymentAccounts.Add(account);
        await _db.SaveChangesAsync();
        return account;
    }

    public async Task<PaymentAccount> UpdateAsync(PaymentAccount account)
    {
        _db.PaymentAccounts.Update(account);
        await _db.SaveChangesAsync();
        return account;
    }

    public async Task DeleteAsync(PaymentAccount account)
    {
        _db.PaymentAccounts.Remove(account);
        await _db.SaveChangesAsync();
    }
}
