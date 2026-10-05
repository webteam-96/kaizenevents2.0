using System.Text.Json;
using System.Text.Json.Nodes;

namespace KaizenEvents.Core.DTOs.Form;

public record UpdateFormRequest(JsonNode FormConfig);

public record ValidateFormulaRequest(string Formula);

public record CalculatePriceRequest(
    Dictionary<string, JsonElement>? FormData,
    string? CouponCode,
    // Form-builder live preview overrides — when provided, these win over
    // whatever is currently stored on the campaign.
    Dictionary<string, JsonElement>? FieldValues = null,
    decimal? BasePrice = null,
    JsonElement? PricingRules = null,
    string? PricingFormula = null);

public record EvaluateFieldRulesRequest(
    JsonElement[] Fields,
    Dictionary<string, string> FormData);

public record ValidateCouponRequest(string Code);

public record CreateCouponRequest(
    string Code,
    string DiscountType,
    decimal DiscountValue,
    string? Formula,
    DateTime? ValidFrom,
    DateTime? ValidUntil,
    int? UsageLimit,
    // Rupee bounds on the discount. Cap stops a percentage giving away too much on a
    // large total; floor guarantees a minimum saving on a small one. Both optional.
    decimal? MaxDiscountAmount = null,
    decimal? MinDiscountAmount = null,
    string? Description = null,
    bool IsActive = true);

/// <summary>
/// Edit an existing coupon. Every field is optional: null means "leave as-is".
/// The code itself is editable but must stay unique within the campaign.
///
/// The nullable bounds need a way to say "clear this", which null cannot express here,
/// so <c>ClearMaxDiscount</c> / <c>ClearMinDiscount</c> / <c>ClearValidFrom</c> /
/// <c>ClearValidUntil</c> / <c>ClearUsageLimit</c> do that explicitly.
/// </summary>
public record UpdateCouponRequest(
    string? Code = null,
    string? DiscountType = null,
    decimal? DiscountValue = null,
    string? Formula = null,
    DateTime? ValidFrom = null,
    DateTime? ValidUntil = null,
    int? UsageLimit = null,
    decimal? MaxDiscountAmount = null,
    decimal? MinDiscountAmount = null,
    string? Description = null,
    bool? IsActive = null,
    bool ClearMaxDiscount = false,
    bool ClearMinDiscount = false,
    bool ClearValidFrom = false,
    bool ClearValidUntil = false,
    bool ClearUsageLimit = false);

public record SetCouponActiveRequest(bool IsActive);
