using KaizenEvents.Shared.Helpers;

namespace KaizenEvents.Core.Entities;

/// <summary>
/// Bridges the EF entity to <see cref="CouponTerms"/>, the dependency-free shape
/// <see cref="CouponCalculator"/> works on. Kept as the one mapping in the codebase so
/// no caller can accidentally leave a field (a cap, a floor) out of the calculation.
/// </summary>
public static class CouponCodeTermsExtensions
{
    public static CouponTerms ToTerms(this CouponCode c) => new(
        DiscountType      : c.DiscountType,
        DiscountValue     : c.DiscountValue,
        Formula           : c.Formula,
        MinDiscountAmount : c.MinDiscountAmount,
        MaxDiscountAmount : c.MaxDiscountAmount,
        ValidFrom         : c.ValidFrom,
        ValidUntil        : c.ValidUntil,
        UsageLimit        : c.UsageLimit,
        CurrentUsage      : c.CurrentUsage,
        IsActive          : c.IsActive);
}
