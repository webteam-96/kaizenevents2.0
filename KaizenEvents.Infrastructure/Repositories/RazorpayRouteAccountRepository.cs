using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class RazorpayRouteAccountRepository : IRazorpayRouteAccountRepository
{
    private readonly AppDbContext _db;

    public RazorpayRouteAccountRepository(AppDbContext db) => _db = db;

    public Task<List<RazorpayRouteAccount>> GetAllAsync()
        => _db.RazorpayRouteAccounts.OrderBy(r => r.Role).ThenBy(r => r.Name).ToListAsync();

    public Task<RazorpayRouteAccount?> GetByIdAsync(string id)
        => _db.RazorpayRouteAccounts.FirstOrDefaultAsync(r => r.Id == id);

    public Task<RazorpayRouteAccount?> GetByAccountIdAsync(string accountId)
        => _db.RazorpayRouteAccounts.FirstOrDefaultAsync(r => r.AccountId == accountId);

    public Task<bool> AccountIdExistsAsync(string accountId)
        => _db.RazorpayRouteAccounts.AnyAsync(r => r.AccountId == accountId);

    public async Task<RazorpayRouteAccount> CreateAsync(RazorpayRouteAccount account)
    {
        _db.RazorpayRouteAccounts.Add(account);
        await _db.SaveChangesAsync();
        return account;
    }

    public async Task<RazorpayRouteAccount> UpdateAsync(RazorpayRouteAccount account)
    {
        _db.RazorpayRouteAccounts.Update(account);
        await _db.SaveChangesAsync();
        return account;
    }

    public async Task DeleteAsync(RazorpayRouteAccount account)
    {
        _db.RazorpayRouteAccounts.Remove(account);
        await _db.SaveChangesAsync();
    }

    public Task<RazorpayRouteAccount?> GetDefaultKaizenVendorAsync()
        => _db.RazorpayRouteAccounts.FirstOrDefaultAsync(r => r.IsDefaultKaizenVendor);

    public async Task SetDefaultKaizenVendorAsync(string id, decimal percentage)
    {
        var target = await _db.RazorpayRouteAccounts.FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new InvalidOperationException($"Razorpay route account {id} not found.");

        var now = DateTime.UtcNow;
        var others = await _db.RazorpayRouteAccounts
            .Where(r => r.IsDefaultKaizenVendor && r.Id != id)
            .ToListAsync();
        foreach (var o in others)
        {
            o.IsDefaultKaizenVendor = false;
            o.DefaultPercentage     = null;
            o.UpdatedAt             = now;
        }

        target.IsDefaultKaizenVendor = true;
        target.DefaultPercentage     = percentage;
        target.UpdatedAt             = now;

        await _db.SaveChangesAsync();
    }

    public async Task ClearDefaultKaizenVendorAsync()
    {
        var now = DateTime.UtcNow;
        var defaults = await _db.RazorpayRouteAccounts
            .Where(r => r.IsDefaultKaizenVendor)
            .ToListAsync();
        foreach (var d in defaults)
        {
            d.IsDefaultKaizenVendor = false;
            d.DefaultPercentage     = null;
            d.UpdatedAt             = now;
        }
        if (defaults.Count > 0)
            await _db.SaveChangesAsync();
    }
}
