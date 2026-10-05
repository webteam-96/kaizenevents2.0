using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class CouponCodeRepository : ICouponCodeRepository
{
    private readonly AppDbContext _db;

    public CouponCodeRepository(AppDbContext db) => _db = db;

    public Task<CouponCode?> GetByIdAsync(int id)
        => _db.CouponCodes.FirstOrDefaultAsync(c => c.Id == id);

    public Task<CouponCode?> GetByCodeAsync(string campaignId, string code)
        => _db.CouponCodes.FirstOrDefaultAsync(c => c.CampaignId == campaignId && c.Code == code);

    public Task<List<CouponCode>> GetByCampaignIdAsync(string campaignId)
        => _db.CouponCodes.Where(c => c.CampaignId == campaignId).OrderBy(c => c.Code).ToListAsync();

    public async Task<CouponCode> CreateAsync(CouponCode coupon)
    {
        _db.CouponCodes.Add(coupon);
        await _db.SaveChangesAsync();
        return coupon;
    }

    public async Task<CouponCode> UpdateAsync(CouponCode coupon)
    {
        _db.CouponCodes.Update(coupon);
        await _db.SaveChangesAsync();
        return coupon;
    }

    public async Task DeleteAsync(CouponCode coupon)
    {
        _db.CouponCodes.Remove(coupon);
        await _db.SaveChangesAsync();
    }

    /// <inheritdoc />
    public async Task<bool> TryConsumeAsync(int id)
    {
        // Deliberately a single guarded UPDATE rather than read-modify-write. Two
        // registrations confirming at the same moment would otherwise both read
        // current_usage = 9 against a limit of 10 and both write 10, so the coupon is
        // used 11 times and the counter says 10. The WHERE clause makes the check and
        // the increment one atomic step, so the loser of the race gets 0 rows back.
        var affected = await _db.Database.ExecuteSqlRawAsync(
            @"UPDATE coupon_codes
                 SET current_usage = current_usage + 1
               WHERE id = {0}
                 AND (usage_limit IS NULL OR current_usage < usage_limit)",
            id);

        if (affected > 0)
        {
            // The tracked entity (if any) now holds a stale counter — drop it so a later
            // read in the same request doesn't serve the pre-increment value.
            var tracked = _db.ChangeTracker.Entries<CouponCode>()
                .FirstOrDefault(e => e.Entity.Id == id);
            if (tracked != null) tracked.State = EntityState.Detached;
        }

        return affected > 0;
    }

    /// <inheritdoc />
    public async Task<Dictionary<string, CouponUsageStats>> GetUsageStatsAsync(string campaignId)
    {
        // Only registrations that were actually paid for (or confirmed free) count as
        // a redemption — a pending registration that never paid shouldn't inflate the
        // average the admin sees.
        var rows = await _db.Registrations
            .AsNoTracking()
            .Where(r => r.CampaignId == campaignId
                     && r.CouponCode != null
                     && r.PaymentStatus == PaymentStatus.Completed)
            .GroupBy(r => r.CouponCode!)
            .Select(g => new
            {
                Code    = g.Key,
                Count   = g.Count(),
                Total   = g.Sum(r => r.CouponDiscount),
                Lowest  = g.Min(r => r.CouponDiscount),
                Highest = g.Max(r => r.CouponDiscount)
            })
            .ToListAsync();

        return rows.ToDictionary(
            r => r.Code.ToUpperInvariant(),
            r => new CouponUsageStats(
                Code               : r.Code.ToUpperInvariant(),
                TimesUsed          : r.Count,
                TotalDiscountGiven : Math.Round(r.Total, 2, MidpointRounding.AwayFromZero),
                AverageDiscount    : r.Count == 0
                    ? 0m
                    : Math.Round(r.Total / r.Count, 2, MidpointRounding.AwayFromZero),
                LowestDiscount     : r.Lowest,
                HighestDiscount    : r.Highest));
    }

    /// <inheritdoc />
    public Task<int> DeactivateExpiredAsync(DateTime nowUtc)
        => _db.Database.ExecuteSqlRawAsync(
            @"UPDATE coupon_codes
                 SET is_active = 0
               WHERE is_active = 1
                 AND valid_until IS NOT NULL
                 AND valid_until < {0}",
            nowUtc);
}
