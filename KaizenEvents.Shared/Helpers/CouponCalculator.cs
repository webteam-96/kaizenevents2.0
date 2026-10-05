namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// The redemption terms of a coupon, decoupled from the EF entity so this helper
/// can live in Shared (which deliberately has no dependency on Core or EF).
/// Map <c>CouponCode</c> onto this with <c>CouponCalculator.TermsOf(coupon)</c>-style
/// construction at the call site.
/// </summary>
public sealed record CouponTerms(
    string DiscountType,
    decimal DiscountValue,
    string? Formula,
    decimal? MinDiscountAmount,
    decimal? MaxDiscountAmount,
    DateTime? ValidFrom,
    DateTime? ValidUntil,
    int? UsageLimit,
    int CurrentUsage,
    bool IsActive);

/// <summary>
/// The single source of truth for whether a coupon may be redeemed and how much it
/// takes off. Every server path that touches a coupon — /validate-coupon,
/// /calculate-price and the authoritative recalculation on registration submit —
/// goes through here, so a rule can never be enforced in one place and missed in
/// another. (The public form mirrors this in <c>src/utils/couponPricing.js</c>;
/// a change here must be made there too or the client's preview will disagree with
/// the server and submissions will be rejected by the amount-mismatch check.)
/// </summary>
public static class CouponCalculator
{
    // Wording is part of the API contract — the public form shows these verbatim.
    public const string ErrorNotFound     = "Coupon not found.";
    public const string ErrorInactive     = "Coupon is inactive.";
    public const string ErrorNotYetValid  = "Coupon is not yet valid.";
    public const string ErrorExpired      = "Coupon has expired.";
    public const string ErrorLimitReached = "Coupon usage limit reached.";
    public const string ErrorBadFormula   = "Invalid coupon formula.";

    public const string TypePercentage = "percentage";
    public const string TypeFixed      = "fixed";
    public const string TypeFormula    = "formula";

    /// <summary>
    /// Can this coupon be redeemed right now? Returns null when it can, otherwise the
    /// reason to show the registrant.
    ///
    /// Expiry is decided here from <c>ValidUntil</c> rather than from <c>IsActive</c>,
    /// so an expired coupon stops working the moment it lapses — it does not depend on
    /// the nightly <c>CouponExpiryService</c> having run. That service only makes the
    /// stored flag agree with reality for the admin list.
    /// </summary>
    public static string? CheckRedeemable(CouponTerms coupon, DateTime nowUtc)
    {
        if (!coupon.IsActive)                                             return ErrorInactive;
        if (coupon.ValidFrom  is { } from  && nowUtc < from)              return ErrorNotYetValid;
        if (coupon.ValidUntil is { } until && nowUtc > until)             return ErrorExpired;
        if (coupon.UsageLimit is { } limit && coupon.CurrentUsage >= limit) return ErrorLimitReached;
        return null;
    }

    /// <summary>
    /// How much this coupon takes off a given subtotal.
    ///
    /// Order of operations — floor, then cap, then clamp — and why:
    ///   1. raw   = percentage of subtotal / flat amount / formula result
    ///   2. floor = min_discount_amount lifts a small raw discount up
    ///   3. cap   = max_discount_amount pulls a large raw discount down
    ///   4. clamp = the discount can never exceed the subtotal, so the payable
    ///              total can never go negative. This matters most with a floor:
    ///              a ₹100 floor against a ₹50 subtotal yields ₹50 off, not ₹100.
    ///
    /// The cap is applied after the floor so that a misconfigured floor above the cap
    /// still cannot pay out more than the cap.
    ///
    /// Does NOT check redeemability — call <see cref="CheckRedeemable"/> first.
    /// </summary>
    /// <param name="formulaVars">
    /// Variables for a <c>formula</c> coupon. <c>current_total</c> is set from the
    /// subtotal by this method, overwriting any caller-supplied value.
    /// </param>
    public static (decimal Discount, string? Error) ComputeDiscount(
        CouponTerms coupon,
        decimal subtotal,
        Dictionary<string, double>? formulaVars = null)
    {
        // Nothing to discount. Guard first so a floor can't manufacture a discount
        // on a zero or negative subtotal.
        if (subtotal <= 0) return (0m, null);

        decimal raw;
        switch (coupon.DiscountType?.Trim().ToLowerInvariant())
        {
            case TypePercentage:
                raw = subtotal * (coupon.DiscountValue / 100m);
                break;

            case TypeFixed:
                raw = coupon.DiscountValue;
                break;

            case TypeFormula:
                if (string.IsNullOrWhiteSpace(coupon.Formula)) return (0m, ErrorBadFormula);
                var vars = formulaVars ?? new Dictionary<string, double>();
                vars["current_total"] = (double)subtotal;
                try
                {
                    var evaluated = FormulaEngine.Evaluate(coupon.Formula!, vars);
                    if (double.IsNaN(evaluated) || double.IsInfinity(evaluated))
                        return (0m, ErrorBadFormula);
                    raw = (decimal)evaluated;
                }
                catch
                {
                    return (0m, ErrorBadFormula);
                }
                break;

            default:
                // Unknown type: give nothing away rather than guessing.
                return (0m, null);
        }

        if (raw < 0m) raw = 0m;

        if (coupon.MinDiscountAmount is { } floor && floor > 0m && raw < floor) raw = floor;
        if (coupon.MaxDiscountAmount is { } cap   && cap   > 0m && raw > cap)   raw = cap;

        if (raw > subtotal) raw = subtotal;

        return (Round2(raw), null);
    }

    /// <summary>
    /// Convenience wrapper: redeemability and amount in one call. Discount is 0
    /// whenever an error is returned.
    /// </summary>
    public static (decimal Discount, string? Error) Apply(
        CouponTerms coupon,
        decimal subtotal,
        DateTime nowUtc,
        Dictionary<string, double>? formulaVars = null)
    {
        var blocked = CheckRedeemable(coupon, nowUtc);
        if (blocked != null) return (0m, blocked);
        return ComputeDiscount(coupon, subtotal, formulaVars);
    }

    /// <summary>
    /// Rounds money the same way the rest of the pricing path does. Kept here so the
    /// discount and the total are never rounded by two different rules.
    /// </summary>
    public static decimal Round2(decimal value)
        => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Validates admin-supplied coupon terms. Returns null when the terms are sane,
    /// otherwise the message to show the admin. Shared by create and update so the
    /// two can't drift.
    /// </summary>
    public static string? ValidateTerms(
        string? discountType,
        decimal discountValue,
        string? formula,
        decimal? minDiscountAmount,
        decimal? maxDiscountAmount,
        DateTime? validFrom,
        DateTime? validUntil,
        int? usageLimit)
    {
        var type = discountType?.Trim().ToLowerInvariant();

        if (type != TypePercentage && type != TypeFixed && type != TypeFormula)
            return "Discount type must be 'percentage', 'fixed' or 'formula'.";

        if (type == TypePercentage)
        {
            if (discountValue <= 0m)   return "Percentage discount must be greater than 0.";
            if (discountValue > 100m)  return "Percentage discount cannot be more than 100%.";
        }

        if (type == TypeFixed && discountValue <= 0m)
            return "Fixed discount must be greater than 0.";

        if (type == TypeFormula)
        {
            if (string.IsNullOrWhiteSpace(formula))
                return "A formula is required for a formula discount.";
            var (formulaOk, formulaError) = FormulaEngine.Validate(formula!);
            if (!formulaOk) return $"Formula is not valid: {formulaError}";
        }

        if (minDiscountAmount is < 0m) return "Minimum deduction cannot be negative.";
        if (maxDiscountAmount is < 0m) return "Maximum deduction cannot be negative.";

        if (minDiscountAmount is { } min && maxDiscountAmount is { } max && min > max)
            return "Minimum deduction cannot be greater than maximum deduction.";

        if (validFrom is { } f && validUntil is { } u && f >= u)
            return "The valid-from date must be before the valid-until date.";

        if (usageLimit is < 1) return "Usage limit must be at least 1.";

        return null;
    }

    /// <summary>
    /// The status an admin sees for a coupon. Derived rather than stored (except for the
    /// manual on/off switch) so the list is never stale between nightly expiry runs.
    /// </summary>
    public static string DeriveStatus(CouponTerms coupon, DateTime nowUtc)
    {
        if (coupon.ValidUntil is { } until && nowUtc > until)               return "expired";
        if (!coupon.IsActive)                                               return "inactive";
        if (coupon.UsageLimit is { } limit && coupon.CurrentUsage >= limit) return "exhausted";
        if (coupon.ValidFrom is { } from && nowUtc < from)                  return "scheduled";
        return "active";
    }
}
