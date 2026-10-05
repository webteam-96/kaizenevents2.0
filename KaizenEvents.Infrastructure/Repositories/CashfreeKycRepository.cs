using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class CashfreeKycRepository : ICashfreeKycRepository
{
    private readonly AppDbContext _db;

    public CashfreeKycRepository(AppDbContext db) => _db = db;

    public Task<List<CashfreeKyc>> GetAllAsync()
        => _db.CashfreeKycs.OrderByDescending(k => k.CreatedAt).ToListAsync();

    public Task<CashfreeKyc?> GetByIdAsync(string id)
        => _db.CashfreeKycs.FirstOrDefaultAsync(k => k.Id == id);

    public Task<CashfreeKyc?> GetByVendorIdAsync(string vendorId)
        => _db.CashfreeKycs.FirstOrDefaultAsync(k => k.VendorId == vendorId);

    public Task<CashfreeKyc?> GetByOnboardingTokenAsync(string token)
        => _db.CashfreeKycs.FirstOrDefaultAsync(k => k.OnboardingToken == token);

    public Task<List<CashfreeKyc>> GetByCampaignIdAsync(string campaignId)
        => _db.CashfreeKycs
            .Where(k => k.CampaignId == campaignId)
            .OrderBy(k => k.Role)
            .ToListAsync();

    public Task<CashfreeKyc?> GetByCampaignAndRoleAsync(string campaignId, string role)
        => _db.CashfreeKycs.FirstOrDefaultAsync(k => k.CampaignId == campaignId && k.Role == role);

    public async Task CreateAsync(CashfreeKyc entity)
    {
        _db.CashfreeKycs.Add(entity);
        await _db.SaveChangesAsync();
    }

    public async Task UpdateAsync(CashfreeKyc entity)
    {
        _db.CashfreeKycs.Update(entity);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteAsync(CashfreeKyc entity)
    {
        _db.CashfreeKycs.Remove(entity);
        await _db.SaveChangesAsync();
    }

    public Task<bool> VendorIdExistsAsync(string vendorId)
        => _db.CashfreeKycs.AnyAsync(k => k.VendorId == vendorId);

    public Task<CashfreeKyc?> GetDefaultKaizenVendorAsync()
        => _db.CashfreeKycs.FirstOrDefaultAsync(k => k.IsDefaultKaizenVendor);

    public async Task SetDefaultKaizenVendorAsync(string vendorId, decimal percentage)
    {
        var target = await _db.CashfreeKycs.FirstOrDefaultAsync(k => k.Id == vendorId)
            ?? throw new InvalidOperationException($"Vendor {vendorId} not found.");

        var now = DateTime.UtcNow;
        var others = await _db.CashfreeKycs
            .Where(k => k.IsDefaultKaizenVendor && k.Id != vendorId)
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
        var defaults = await _db.CashfreeKycs
            .Where(k => k.IsDefaultKaizenVendor)
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
