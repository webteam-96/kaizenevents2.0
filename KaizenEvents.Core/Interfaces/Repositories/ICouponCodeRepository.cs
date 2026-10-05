using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

/// <summary>Aggregate usage figures for one coupon, derived from the registrations that used it.</summary>
public record CouponUsageStats(
    string Code,
    int TimesUsed,
    decimal TotalDiscountGiven,
    decimal AverageDiscount,
    decimal? LowestDiscount,
    decimal? HighestDiscount);

public interface ICouponCodeRepository
{
    Task<CouponCode?> GetByIdAsync(int id);
    Task<CouponCode?> GetByCodeAsync(string campaignId, string code);
    Task<List<CouponCode>> GetByCampaignIdAsync(string campaignId);
    Task<CouponCode> CreateAsync(CouponCode coupon);
    Task DeleteAsync(CouponCode coupon);
    Task<CouponCode> UpdateAsync(CouponCode coupon);

    /// <summary>
    /// Atomically claims one use of the coupon. Returns false when the usage limit is
    /// already reached — the counter is never pushed past the limit and concurrent
    /// claims cannot lose each other's increments.
    /// </summary>
    Task<bool> TryConsumeAsync(int id);

    /// <summary>
    /// Usage figures per coupon code for a campaign, computed from the discount actually
    /// recorded on each confirmed registration. Keyed by coupon code (upper case).
    /// </summary>
    Task<Dictionary<string, CouponUsageStats>> GetUsageStatsAsync(string campaignId);

    /// <summary>
    /// Flips is_active to false for every coupon whose valid_until has passed.
    /// Returns how many rows changed. Redemption already rejects lapsed coupons on its
    /// own, so this exists to keep the stored flag honest for the admin list.
    /// </summary>
    Task<int> DeactivateExpiredAsync(DateTime nowUtc);
}
