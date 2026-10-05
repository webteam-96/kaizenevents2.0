namespace KaizenEvents.Core.DTOs.Form;

public record CalculatePriceResponse(
    decimal BasePrice,
    decimal Subtotal,
    decimal Discount,
    decimal Total,
    bool CouponApplied,
    decimal CouponDiscount,
    string? CouponError);

public record ValidateCouponResponse(
    bool Valid,
    string? DiscountType,
    decimal? DiscountValue,
    string Message,
    // The bounds go back to the client so the form's live preview can apply the same
    // floor/cap the server will, and the two totals agree at submit.
    decimal? MaxDiscountAmount = null,
    decimal? MinDiscountAmount = null);

public record EvaluateFieldRulesResponse(
    List<string> VisibleFields,
    List<string> HiddenFields);

public record ValidateFormulaResponse(
    bool Valid,
    string? Error);

public record CouponResponse(
    int Id,
    string CampaignId,
    string Code,
    string DiscountType,
    decimal DiscountValue,
    string? Formula,
    DateTime? ValidFrom,
    DateTime? ValidUntil,
    int? UsageLimit,
    int CurrentUsage,
    bool IsActive,
    DateTime CreatedAt,
    decimal? MaxDiscountAmount = null,
    decimal? MinDiscountAmount = null,
    string? Description = null,
    string? CreatedBy = null,
    string? CreatedByName = null,
    DateTime? UpdatedAt = null,
    // Derived, never stored: active | scheduled | expired | exhausted | inactive.
    string Status = "active",
    // Redemption figures, computed from the registrations that actually paid.
    int TimesUsed = 0,
    decimal TotalDiscountGiven = 0,
    decimal AverageDiscount = 0,
    decimal? LowestDiscount = null,
    decimal? HighestDiscount = null);
