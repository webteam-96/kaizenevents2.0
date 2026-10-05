using System.Text.Json;
using System.Text.Json.Nodes;
using KaizenEvents.Core.Constants;
using KaizenEvents.Core.DTOs.Form;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
public class FormController : ApiControllerBase
{
    private readonly ICampaignRepository _campaigns;
    private readonly ICouponCodeRepository _coupons;
    private readonly IUserRepository _users;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FormController> _logger;

    public FormController(
        ICampaignRepository campaigns,
        ICouponCodeRepository coupons,
        IUserRepository users,
        IServiceScopeFactory scopeFactory,
        ILogger<FormController> logger)
    {
        _campaigns    = campaigns;
        _coupons      = coupons;
        _users        = users;
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    // ── POST /api/formula/validate ────────────────────────────────────────────
    [HttpPost("api/formula/validate")]
    [Authorize]
    public IActionResult ValidateFormula([FromBody] ValidateFormulaRequest req)
    {
        var (valid, error) = FormulaEngine.Validate(req.Formula);
        return Ok(new ValidateFormulaResponse(valid, error));
    }

    // ── GET /api/campaigns/{campaign_id}/form ─────────────────────────────────
    // Public: registrants need this to render the registration form.
    // Returns the form config object directly (not wrapped).
    [HttpGet("api/campaigns/{campaign_id}/form")]
    [AllowAnonymous]
    public async Task<IActionResult> GetForm(string campaign_id)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        if (string.IsNullOrEmpty(campaign.FormConfig))
            return Ok((object?)null);

        using var doc = JsonDocument.Parse(campaign.FormConfig);
        return Ok(doc.RootElement.Clone());
    }

    // ── PUT /api/campaigns/{campaign_id}/form ─────────────────────────────────
    // Frontend sends the form config object directly as the body (not wrapped).
    [HttpPut("api/campaigns/{campaign_id}/form")]
    [Authorize]
    public async Task<IActionResult> UpdateForm(string campaign_id, [FromBody] JsonNode? req)
    {
        if (!IsSuperAdmin)
            return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        // Paid campaigns need a phone field — payment gateways (Instamojo, Cashfree)
        // require buyer_phone at order-creation time. Catch this at save time so the
        // organizer fixes it now rather than registrants hitting a 400 at checkout.
        var phoneCheckError = ValidatePhoneFieldForPaidCampaign(req, campaign);
        if (phoneCheckError != null)
            return BadRequest(new { detail = phoneCheckError });

        // Same reasoning for a custom_amount (donation) field's configured Range —
        // catch a min/max that the assigned gateway would reject at save time,
        // not the first time a registrant hits it at checkout.
        var amountRangeError = ValidateCustomAmountRangesForGateway(req, campaign);
        if (amountRangeError != null)
            return BadRequest(new { detail = amountRangeError });

        var previousFormConfig = campaign.FormConfig;

        campaign.FormConfig = JsonSerializer.Serialize(req);
        campaign.UpdatedAt  = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        // Background: if this campaign has an attached Google Sheet with auto_sync on,
        // rebuild it to match the new form schema. Fire-and-forget so the admin's save
        // call returns immediately; sheet work happens in a fresh DI scope.
        QueueSheetRebuild(campaign_id, previousFormConfig, campaign.FormConfig);

        return Ok(req);
    }

    /// <summary>
    /// Fire-and-forget Sheets rebuild on form-config change. Runs in a fresh DI scope
    /// (the controller's scope is gone by the time this fires). Failures are logged
    /// but never propagate back to the user — sheet sync is best-effort.
    /// Skipped entirely when the edit doesn't move any sheet column: a rebuild rewrites the
    /// tab, and an admin part-way through working in it shouldn't have that happen because
    /// someone tweaked a field's help text.
    /// </summary>
    private void QueueSheetRebuild(string campaignId, string? previousFormConfig, string? newFormConfig)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope        = _scopeFactory.CreateScope();
                var sheetsConfigs      = scope.ServiceProvider.GetRequiredService<ISheetsConfigRepository>();
                var campaignsRepo      = scope.ServiceProvider.GetRequiredService<ICampaignRepository>();
                var registrationsRepo  = scope.ServiceProvider.GetRequiredService<IRegistrationRepository>();
                var sheets             = scope.ServiceProvider.GetRequiredService<IGoogleSheetsService>();

                var cfg = await sheetsConfigs.GetByCampaignIdAsync(campaignId);
                if (cfg == null || !cfg.AutoSync || string.IsNullOrEmpty(cfg.SpreadsheetId)) return;

                if (!sheets.SheetColumnsChanged(previousFormConfig, newFormConfig))
                {
                    _logger.LogInformation(
                        "Form saved for campaign {CampaignId} but sheet columns are unchanged — leaving the sheet alone.",
                        campaignId);
                    return;
                }

                var campaign = await campaignsRepo.GetByIdAsync(campaignId);
                if (campaign == null) return;

                var regs = await registrationsRepo.GetByCampaignIdAsync(campaignId);
                await sheets.RebuildSheetAsync(campaign, regs);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Background sheet rebuild failed for campaign {CampaignId}", campaignId);
            }
        });
    }

    // Returns an error message if the form is for a paid campaign and missing a phone field.
    // Returns null when the check passes (or doesn't apply).
    private static string? ValidatePhoneFieldForPaidCampaign(JsonNode? formConfig, Campaign campaign)
    {
        if (formConfig == null) return null;

        decimal basePrice = 0m;
        var basePriceRaw = formConfig["base_price"]?.ToString();
        if (!string.IsNullOrWhiteSpace(basePriceRaw))
            decimal.TryParse(basePriceRaw, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out basePrice);

        bool collectsMoney =
            basePrice > 0m
            || (formConfig["pricing_rules"] is JsonArray rules && rules.Count > 0)
            || !string.IsNullOrEmpty(campaign.PaymentAccountId);
        if (!collectsMoney) return null;

        if (formConfig["fields"] is not JsonArray fields) return null;

        var phoneFields = fields
            .Where(f => f?["type"]?.GetValue<string>() is "phone" or "tel")
            .ToList();

        if (phoneFields.Count == 0)
            return "This campaign collects payment, but the form has no phone field. " +
                   "Add a Phone field — payment gateways (Instamojo, Cashfree) require a buyer phone, " +
                   "and you'll also need it for SMS/WhatsApp receipts and reminders.";

        // Phone field must also be marked required so the registrant can't skip it.
        var hasRequiredPhone = phoneFields.Any(f => f?["required"]?.GetValue<bool?>() == true);
        if (!hasRequiredPhone)
            return "The Phone field must be marked as Required. " +
                   "Payment gateways reject orders with a blank phone, so an optional phone " +
                   "field will cause checkout to fail. Open the Phone field's settings and turn on Required.";

        return null;
    }

    // Returns an error message if any custom_amount field's configured Range (min_value/
    // max_value) falls outside the assigned gateway's real per-transaction bounds, or has
    // min_value > max_value. Doesn't apply to a free campaign — no gateway is ever involved,
    // so there's nothing to violate. A field with no min/max set at all is left alone:
    // ValidateFormFields/RecalculatePriceAsync (RegistrationController) already fall back to
    // the full gateway range at submit time when nothing is configured (PaymentGatewayLimits)
    // — this only rejects a value that WAS explicitly set but doesn't fit.
    private static string? ValidateCustomAmountRangesForGateway(JsonNode? formConfig, Campaign campaign)
    {
        if (formConfig == null || !campaign.PaymentEnabled) return null;
        if (formConfig["fields"] is not JsonArray fields) return null;

        var (gatewayMin, gatewayMax) = PaymentGatewayLimits.For(campaign.PaymentGateway);

        foreach (var field in fields)
        {
            if (field?["type"]?.GetValue<string>() != "custom_amount") continue;

            var label = field["label"]?.GetValue<string>() ?? "Custom Amount";
            var min = ReadDecimalOrNull(field["min_value"]);
            var max = ReadDecimalOrNull(field["max_value"]);

            if (min.HasValue && (min.Value < gatewayMin || min.Value > gatewayMax))
                return $"\"{label}\"'s minimum (₹{min.Value}) must be between ₹{gatewayMin} and ₹{gatewayMax} " +
                       "— the range the assigned payment gateway actually accepts.";

            if (max.HasValue && (max.Value < gatewayMin || max.Value > gatewayMax))
                return $"\"{label}\"'s maximum (₹{max.Value}) must be between ₹{gatewayMin} and ₹{gatewayMax} " +
                       "— the range the assigned payment gateway actually accepts.";

            if (min.HasValue && max.HasValue && min.Value > max.Value)
                return $"\"{label}\"'s minimum (₹{min.Value}) can't be greater than its maximum (₹{max.Value}).";
        }

        return null;
    }

    private static decimal? ReadDecimalOrNull(JsonNode? node)
    {
        if (node is not JsonValue value) return null;
        if (value.TryGetValue<decimal>(out var d)) return d;
        if (value.TryGetValue<string>(out var s) &&
            decimal.TryParse(s, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed))
            return parsed;
        return null;
    }

    // ── DELETE /api/campaigns/{campaign_id}/form ──────────────────────────────
    [HttpDelete("api/campaigns/{campaign_id}/form")]
    [Authorize]
    public async Task<IActionResult> DeleteForm(string campaign_id)
    {
        if (!IsSuperAdmin)
            return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        campaign.FormConfig = null;
        campaign.UpdatedAt  = DateTime.UtcNow;
        await _campaigns.UpdateAsync(campaign);

        return Ok(new { detail = "Form configuration deleted." });
    }

    // ── GET /api/campaigns/{campaign_id}/coupons ──────────────────────────────
    /// <summary>
    /// Coupons the caller is allowed to see: their own, plus everything for a super
    /// admin. The code itself is a secret an admin hands out selectively, so a
    /// colleague with campaign access does not get to read it off this list.
    /// </summary>
    [HttpGet("api/campaigns/{campaign_id}/coupons")]
    [Authorize]
    public async Task<IActionResult> ListCoupons(string campaign_id)
    {
        if (!await HasAccessAsync(campaign_id))
            return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var list  = await _coupons.GetByCampaignIdAsync(campaign_id);
        var mine  = list.Where(CanSee).ToList();
        var stats = await _coupons.GetUsageStatsAsync(campaign_id);

        // Creator names, resolved once per distinct creator rather than per row.
        var creatorNames = new Dictionary<string, string>();
        foreach (var id in mine.Select(c => c.CreatedBy).Where(id => !string.IsNullOrEmpty(id)).Distinct())
        {
            var user = await _users.GetByIdAsync(id!);
            if (user != null) creatorNames[id!] = user.Name;
        }

        return Ok(mine.Select(c => ToCouponResponse(c, stats, creatorNames)));
    }

    // ── POST /api/campaigns/{campaign_id}/coupons ─────────────────────────────
    [HttpPost("api/campaigns/{campaign_id}/coupons")]
    [Authorize]
    public async Task<IActionResult> CreateCoupon(string campaign_id, [FromBody] CreateCouponRequest req)
    {
        // Any admin who can manage the campaign may run their own promotions; the list
        // filter above is what keeps each admin's codes to themselves.
        if (!await HasAccessAsync(campaign_id))
            return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var code = NormalizeCode(req.Code);
        if (string.IsNullOrEmpty(code))
            return BadRequest(new { detail = "Coupon code is required." });
        if (code.Length > 100)
            return BadRequest(new { detail = "Coupon code cannot be longer than 100 characters." });

        var termsError = CouponCalculator.ValidateTerms(
            req.DiscountType, req.DiscountValue, req.Formula,
            req.MinDiscountAmount, req.MaxDiscountAmount,
            req.ValidFrom, req.ValidUntil, req.UsageLimit);
        if (termsError != null)
            return BadRequest(new { detail = termsError });

        // Uniqueness is per campaign and checked against ALL coupons, not just the
        // caller's — another admin's hidden code still occupies the namespace.
        var existing = await _coupons.GetByCodeAsync(campaign_id, code);
        if (existing != null)
            return Conflict(new { detail = "Coupon code already exists for this campaign." });

        var coupon = new CouponCode
        {
            CampaignId        = campaign_id,
            Code              = code,
            DiscountType      = req.DiscountType.Trim().ToLowerInvariant(),
            DiscountValue     = req.DiscountValue,
            MaxDiscountAmount = req.MaxDiscountAmount,
            MinDiscountAmount = req.MinDiscountAmount,
            Formula           = req.Formula,
            Description       = req.Description?.Trim(),
            ValidFrom         = req.ValidFrom,
            ValidUntil        = req.ValidUntil,
            UsageLimit        = req.UsageLimit,
            CurrentUsage      = 0,
            IsActive          = req.IsActive,
            CreatedBy         = CurrentUserId,
            CreatedAt         = DateTime.UtcNow
        };

        var created = await _coupons.CreateAsync(coupon);
        return StatusCode(201, ToCouponResponse(created));
    }

    // ── PUT /api/campaigns/{campaign_id}/coupons/{coupon_id} ──────────────────
    /// <summary>
    /// Edits a coupon. Only fields present in the body change; the explicit
    /// <c>clear_*</c> flags are how a bound or a date gets removed altogether.
    /// </summary>
    [HttpPut("api/campaigns/{campaign_id}/coupons/{coupon_id:int}")]
    [Authorize]
    public async Task<IActionResult> UpdateCoupon(
        string campaign_id, int coupon_id, [FromBody] UpdateCouponRequest req)
    {
        var (coupon, failure) = await LoadOwnCouponAsync(campaign_id, coupon_id);
        if (failure != null) return failure;

        // Resolve the post-edit values first so the terms can be validated as a whole —
        // e.g. a new floor against the existing cap.
        var discountType  = req.DiscountType?.Trim().ToLowerInvariant() ?? coupon!.DiscountType;
        var discountValue = req.DiscountValue ?? coupon!.DiscountValue;
        var formula       = req.Formula ?? coupon!.Formula;
        var maxDiscount   = req.ClearMaxDiscount ? null : req.MaxDiscountAmount ?? coupon!.MaxDiscountAmount;
        var minDiscount   = req.ClearMinDiscount ? null : req.MinDiscountAmount ?? coupon!.MinDiscountAmount;
        var validFrom     = req.ClearValidFrom   ? null : req.ValidFrom  ?? coupon!.ValidFrom;
        var validUntil    = req.ClearValidUntil  ? null : req.ValidUntil ?? coupon!.ValidUntil;
        var usageLimit    = req.ClearUsageLimit  ? null : req.UsageLimit ?? coupon!.UsageLimit;

        var termsError = CouponCalculator.ValidateTerms(
            discountType, discountValue, formula, minDiscount, maxDiscount,
            validFrom, validUntil, usageLimit);
        if (termsError != null)
            return BadRequest(new { detail = termsError });

        // Lowering the limit below what has already been redeemed would silently
        // exhaust the coupon and make the counter look wrong; say so instead.
        if (usageLimit is { } limit && limit < coupon!.CurrentUsage)
            return BadRequest(new { detail = $"Usage limit cannot be lower than the {coupon.CurrentUsage} use(s) already redeemed." });

        if (req.Code != null)
        {
            var newCode = NormalizeCode(req.Code);
            if (string.IsNullOrEmpty(newCode))
                return BadRequest(new { detail = "Coupon code is required." });
            if (newCode.Length > 100)
                return BadRequest(new { detail = "Coupon code cannot be longer than 100 characters." });

            if (newCode != coupon!.Code)
            {
                var clash = await _coupons.GetByCodeAsync(campaign_id, newCode);
                if (clash != null)
                    return Conflict(new { detail = "Coupon code already exists for this campaign." });
                coupon.Code = newCode;
            }
        }

        coupon!.DiscountType      = discountType;
        coupon.DiscountValue      = discountValue;
        coupon.Formula            = formula;
        coupon.MaxDiscountAmount  = maxDiscount;
        coupon.MinDiscountAmount  = minDiscount;
        coupon.ValidFrom          = validFrom;
        coupon.ValidUntil         = validUntil;
        coupon.UsageLimit         = usageLimit;
        if (req.Description != null) coupon.Description = req.Description.Trim();
        if (req.IsActive.HasValue)   coupon.IsActive    = req.IsActive.Value;
        coupon.UpdatedAt          = DateTime.UtcNow;

        var saved = await _coupons.UpdateAsync(coupon);
        return Ok(ToCouponResponse(saved));
    }

    // ── PATCH /api/campaigns/{campaign_id}/coupons/{coupon_id}/status ─────────
    /// <summary>Turns a coupon on or off without touching its terms.</summary>
    [HttpPatch("api/campaigns/{campaign_id}/coupons/{coupon_id:int}/status")]
    [Authorize]
    public async Task<IActionResult> SetCouponActive(
        string campaign_id, int coupon_id, [FromBody] SetCouponActiveRequest req)
    {
        var (coupon, failure) = await LoadOwnCouponAsync(campaign_id, coupon_id);
        if (failure != null) return failure;

        // Re-activating something already past its end date would be a no-op that looks
        // like it worked — the redemption path rejects it on the date regardless.
        if (req.IsActive && coupon!.ValidUntil is { } until && DateTime.UtcNow > until)
            return BadRequest(new { detail = "This coupon's end date has passed. Extend the end date to activate it again." });

        coupon!.IsActive  = req.IsActive;
        coupon.UpdatedAt  = DateTime.UtcNow;

        var saved = await _coupons.UpdateAsync(coupon);
        return Ok(ToCouponResponse(saved));
    }

    // ── DELETE /api/campaigns/{campaign_id}/coupons/{coupon_id} ───────────────
    [HttpDelete("api/campaigns/{campaign_id}/coupons/{coupon_id:int}")]
    [Authorize]
    public async Task<IActionResult> DeleteCouponById(string campaign_id, int coupon_id)
    {
        var (coupon, failure) = await LoadOwnCouponAsync(campaign_id, coupon_id);
        if (failure != null) return failure;

        await _coupons.DeleteAsync(coupon!);
        return Ok(new { detail = "Coupon deleted." });
    }

    // ── DELETE /api/campaigns/{campaign_id}/coupons/{code} ────────────────────
    /// <summary>
    /// Delete by code. Kept for the original API contract; the admin screen uses the
    /// id-based route above, and the <c>:int</c> constraint is what keeps the two apart.
    /// Consequence: an all-digits coupon code (e.g. "2026") matches the id route first
    /// and returns 404 here. Harmless in practice — the screen deletes by id — but it is
    /// why this route should not be relied on for new work.
    /// </summary>
    [HttpDelete("api/campaigns/{campaign_id}/coupons/{code}")]
    [Authorize]
    public async Task<IActionResult> DeleteCoupon(string campaign_id, string code)
    {
        if (!await HasAccessAsync(campaign_id))
            return Forbidden();

        var coupon = await _coupons.GetByCodeAsync(campaign_id, NormalizeCode(code));
        if (coupon == null)
            return NotFound(new { detail = "Coupon not found." });
        if (!CanSee(coupon))
            return Forbidden();

        await _coupons.DeleteAsync(coupon);
        return Ok(new { detail = "Coupon deleted." });
    }

    // ── Coupon helpers ────────────────────────────────────────────────────────

    private static string NormalizeCode(string? code) => (code ?? "").Trim().ToUpperInvariant();

    /// <summary>
    /// Coupons are visible to their creator and to super admins. A null creator means
    /// the row predates ownership tracking; those are shown to super admins only rather
    /// than to everyone, since the code is meant to be a secret.
    /// </summary>
    private bool CanSee(CouponCode coupon)
        => IsSuperAdmin || (coupon.CreatedBy != null && coupon.CreatedBy == CurrentUserId);

    /// <summary>
    /// Loads a coupon for editing, enforcing campaign access, campaign ownership of the
    /// row, and creator visibility. Returns the failure result to return, or null.
    /// </summary>
    private async Task<(CouponCode? Coupon, IActionResult? Failure)> LoadOwnCouponAsync(
        string campaignId, int couponId)
    {
        if (!await HasAccessAsync(campaignId))
            return (null, Forbidden());

        var coupon = await _coupons.GetByIdAsync(couponId);
        // Same 404 whether the coupon doesn't exist, belongs to another campaign, or
        // belongs to another admin — nothing leaks about codes the caller can't see.
        if (coupon == null || coupon.CampaignId != campaignId || !CanSee(coupon))
            return (null, NotFound(new { detail = "Coupon not found." }));

        return (coupon, null);
    }

    // ── POST /api/campaigns/{campaign_id}/calculate-price ────────────────────
    [HttpPost("api/campaigns/{campaign_id}/calculate-price")]
    [AllowAnonymous]
    public async Task<IActionResult> CalculatePrice(
        string campaign_id,
        [FromBody] CalculatePriceRequest req)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        // Live overrides win over stored config (form-builder preview path).
        // Field name aliases: form_data == field_values.
        var formData = req.FormData ?? req.FieldValues ?? new Dictionary<string, JsonElement>();

        // Parse stored form_config if present, otherwise treat as empty.
        JsonDocument? formDoc = !string.IsNullOrEmpty(campaign.FormConfig)
            ? JsonDocument.Parse(campaign.FormConfig)
            : null;
        var root = formDoc?.RootElement ?? JsonDocument.Parse("{}").RootElement;

        // Extract base_price (override → stored → 0)
        decimal basePrice;
        if (req.BasePrice.HasValue)
        {
            basePrice = req.BasePrice.Value;
        }
        else if (root.TryGetProperty("base_price", out var bp))
        {
            basePrice = bp.ValueKind == JsonValueKind.Number ? bp.GetDecimal() : 0;
        }
        else
        {
            basePrice = 0;
        }

        // Build numeric variables from FormData
        var vars = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            ["base_price"] = (double)basePrice
        };

        // Build a lookup: fieldId → (optionValue → priceModifier) from form_config,
        // so choice fields (dropdown/radio/checkbox) contribute their option's price_modifier
        // to the formula variable for that field — matching frontend calculateTotal behavior.
        var choiceFieldModifiers = new Dictionary<string, Dictionary<string, double>>(StringComparer.OrdinalIgnoreCase);
        // custom_amount fields: registrant-entered amount joins the total as typed. This is a
        // preview endpoint (no submission happens here), so nothing has validated the amount
        // yet — but it must still mirror RegistrationController.RecalculatePriceAsync exactly
        // (see the identical comment there) so the preview total and the amount actually
        // charged can never disagree. Do NOT clamp to min/max here: that used to silently
        // round e.g. an optional field's deliberate 0 up to the gateway floor.
        var customAmountFieldIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("fields", out var fieldsEl) && fieldsEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var field in fieldsEl.EnumerateArray())
            {
                var fieldId   = field.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                var fieldType = field.TryGetProperty("type", out var tEl) ? tEl.GetString() : null;
                if (string.IsNullOrEmpty(fieldId)) continue;
                if (fieldType == "custom_amount")
                {
                    customAmountFieldIds.Add(fieldId);
                    continue;
                }
                if (fieldType != "dropdown" && fieldType != "radio" && fieldType != "checkbox") continue;
                if (!field.TryGetProperty("options", out var optsEl) || optsEl.ValueKind != JsonValueKind.Array) continue;

                var optMap = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                foreach (var opt in optsEl.EnumerateArray())
                {
                    var optValue = opt.TryGetProperty("value", out var vEl) ? vEl.GetString() : null;
                    double modifier = 0;
                    if (opt.TryGetProperty("price_modifier", out var pmEl))
                    {
                        if (pmEl.ValueKind == JsonValueKind.Number) modifier = pmEl.GetDouble();
                        else if (pmEl.ValueKind == JsonValueKind.String &&
                                 double.TryParse(pmEl.GetString(), System.Globalization.NumberStyles.Float,
                                     System.Globalization.CultureInfo.InvariantCulture, out var pd))
                            modifier = pd;
                    }
                    if (!string.IsNullOrEmpty(optValue)) optMap[optValue] = modifier;
                }
                choiceFieldModifiers[fieldId] = optMap;
            }
        }

        // Fields the registrant never saw must not affect the price — a stale value lingers in
        // form_data after they switch away, whether the field was hidden by a rule, hidden by its
        // Visibility setting, or left behind on a page the form routes past. Submit strips these
        // outright before pricing, so this quote has to exclude exactly the same set or the two
        // disagree and every submission is rejected with "Amount mismatch".
        var hiddenFieldIds = FieldVisibility.AllHiddenFieldIds(
            campaign.FormConfig, JsonSerializer.Serialize(formData));

        foreach (var (key, val) in formData)
        {
            // Hidden field → contributes 0 (don't let a stale value leak into a formula var).
            if (hiddenFieldIds.Contains(key)) { vars[key] = 0; continue; }

            // Choice field: resolve the selected option(s) → sum price_modifiers
            if (choiceFieldModifiers.TryGetValue(key, out var optMap))
            {
                double sum = 0;
                if (val.ValueKind == JsonValueKind.String)
                {
                    if (optMap.TryGetValue(val.GetString() ?? "", out var m)) sum = m;
                }
                else if (val.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in val.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.String &&
                            optMap.TryGetValue(item.GetString() ?? "", out var m)) sum += m;
                    }
                }
                vars[key] = sum;
                continue;
            }

            // Non-choice field: parse raw number from form_data
            if (val.ValueKind == JsonValueKind.Number)
                vars[key] = val.GetDouble();
            else if (val.ValueKind == JsonValueKind.String &&
                     double.TryParse(val.GetString(), System.Globalization.NumberStyles.Float,
                         System.Globalization.CultureInfo.InvariantCulture, out var d))
                vars[key] = d;
        }

        decimal subtotal = basePrice;

        // Apply pricing rules — override wins over stored config (form-builder preview)
        JsonElement rulesEl = default;
        bool hasRules = false;
        if (req.PricingRules.HasValue && req.PricingRules.Value.ValueKind == JsonValueKind.Array)
        {
            rulesEl = req.PricingRules.Value;
            hasRules = true;
        }
        else if (root.TryGetProperty("pricing_rules", out var rulesElStored) &&
                 rulesElStored.ValueKind == JsonValueKind.Array)
        {
            rulesEl = rulesElStored;
            hasRules = true;
        }

        if (hasRules)
        {
            var rules = rulesEl.EnumerateArray()
                .Select(r => r.Clone())
                .OrderByDescending(r => r.TryGetProperty("priority", out var p) ? p.GetInt32() : 0)
                .ToList();

            foreach (var rule in rules)
            {
                // Evaluate conditions (AND logic)
                bool conditionsMet = true;
                if (rule.TryGetProperty("conditions", out var condsEl) &&
                    condsEl.ValueKind == JsonValueKind.Array)
                {
                    var conditions = condsEl.EnumerateArray()
                        .Select(c => new FieldCondition(
                            c.TryGetProperty("field_id", out var f) ? f.GetString() ?? "" : "",
                            c.TryGetProperty("operator", out var op) ? op.GetString() ?? "" : "",
                            c.TryGetProperty("value", out var v)
                                ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString())
                                : null))
                        .ToList();

                    // Raw JsonElement form data so checkbox arrays get membership semantics
                    conditionsMet = FieldRulesEvaluator.EvaluateConditions(conditions, formData);
                }

                if (!conditionsMet) continue;

                // Evaluate rule formula
                if (rule.TryGetProperty("formula", out var fEl) &&
                    fEl.ValueKind == JsonValueKind.String)
                {
                    var formula = fEl.GetString()!;
                    vars["current_total"] = (double)subtotal;
                    try
                    {
                        var addition = (decimal)FormulaEngine.Evaluate(formula, vars);
                        subtotal += addition;
                    }
                    catch { /* skip invalid formula */ }
                }
            }
        }

        // Apply master pricing_formula (override → stored). If no formula set,
        // auto-sum option price_modifiers from choice fields (dropdown/radio/checkbox).
        string? masterFormula = req.PricingFormula;
        if (string.IsNullOrWhiteSpace(masterFormula)
            && root.TryGetProperty("pricing_formula", out var pf)
            && pf.ValueKind == JsonValueKind.String)
        {
            masterFormula = pf.GetString();
        }
        var hasFormula = !string.IsNullOrWhiteSpace(masterFormula);

        if (hasFormula)
        {
            vars["current_total"] = (double)subtotal;
            try
            {
                subtotal = (decimal)FormulaEngine.Evaluate(masterFormula!, vars);
            }
            catch { /* keep current subtotal */ }
        }
        else
        {
            // Auto-sum selected option price_modifiers across choice fields
            foreach (var (fieldId, optMap) in choiceFieldModifiers)
            {
                if (!formData.TryGetValue(fieldId, out var val)) continue;
                if (hiddenFieldIds.Contains(fieldId)) continue;
                if (val.ValueKind == JsonValueKind.String)
                {
                    if (optMap.TryGetValue(val.GetString() ?? "", out var m))
                        subtotal += (decimal)m;
                }
                else if (val.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in val.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.String &&
                            optMap.TryGetValue(item.GetString() ?? "", out var m))
                            subtotal += (decimal)m;
                    }
                }
            }

            // custom_amount: registrant-entered amount joins the total as typed, skipping
            // hidden fields. With a master formula the organizer references the field
            // variable explicitly instead.
            foreach (var fieldId in customAmountFieldIds)
            {
                if (!formData.TryGetValue(fieldId, out var val)) continue;
                if (hiddenFieldIds.Contains(fieldId)) continue;
                subtotal += (decimal)SafeCustomAmount(val);
            }
        }

        // Apply coupon — every rule and the arithmetic live in CouponCalculator, shared
        // with the authoritative recalculation in RegistrationController, so this preview
        // and the amount the registrant is finally charged cannot disagree.
        decimal couponDiscount = 0;
        bool couponApplied = false;
        string? couponError = null;

        if (!string.IsNullOrWhiteSpace(req.CouponCode))
        {
            var coupon = await _coupons.GetByCodeAsync(campaign_id, NormalizeCode(req.CouponCode));

            if (coupon == null)
            {
                couponError = CouponCalculator.ErrorNotFound;
            }
            else
            {
                (couponDiscount, couponError) =
                    CouponCalculator.Apply(coupon.ToTerms(), subtotal, DateTime.UtcNow, vars);
                couponApplied = couponError == null;
            }
        }

        // Final total
        decimal total = Math.Max(0, subtotal - couponDiscount);
        total         = Math.Round(total, 2, MidpointRounding.AwayFromZero);

        return Ok(new CalculatePriceResponse(
            BasePrice      : basePrice,
            Subtotal       : subtotal,
            Discount       : couponDiscount,
            Total          : total,
            CouponApplied  : couponApplied,
            CouponDiscount : couponDiscount,
            CouponError    : couponError));
    }

    // ── POST /api/evaluate-field-rules ────────────────────────────────────────
    [HttpPost("api/evaluate-field-rules")]
    [AllowAnonymous]
    public IActionResult EvaluateFieldRules([FromBody] EvaluateFieldRulesRequest req)
    {
        var visible = new List<string>();
        var hidden  = new List<string>();

        foreach (var fieldEl in req.Fields)
        {
            if (!fieldEl.TryGetProperty("id", out var idEl))
                continue;

            var fieldId = idEl.GetString() ?? "";

            // If no rules defined, field is visible by default
            if (!fieldEl.TryGetProperty("visibility_rules", out var rulesEl) ||
                rulesEl.ValueKind != JsonValueKind.Array ||
                rulesEl.GetArrayLength() == 0)
            {
                visible.Add(fieldId);
                continue;
            }

            bool isVisible = false;
            foreach (var rule in rulesEl.EnumerateArray())
            {
                if (!rule.TryGetProperty("conditions", out var condsEl) ||
                    condsEl.ValueKind != JsonValueKind.Array)
                    continue;

                var conditions = condsEl.EnumerateArray()
                    .Select(c => new FieldCondition(
                        c.TryGetProperty("field_id", out var f) ? f.GetString() ?? "" : "",
                        c.TryGetProperty("operator", out var op) ? op.GetString() ?? "" : "",
                        c.TryGetProperty("value", out var v)
                            ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString())
                            : null))
                    .ToList();

                if (FieldRulesEvaluator.EvaluateConditions(conditions, req.FormData))
                {
                    isVisible = true;
                    break; // OR logic between rules
                }
            }

            (isVisible ? visible : hidden).Add(fieldId);
        }

        return Ok(new EvaluateFieldRulesResponse(visible, hidden));
    }

    // ── POST /api/campaigns/{campaign_id}/validate-coupon ────────────────────
    [HttpPost("api/campaigns/{campaign_id}/validate-coupon")]
    [AllowAnonymous]
    public async Task<IActionResult> ValidateCoupon(
        string campaign_id,
        [FromBody] ValidateCouponRequest req)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var coupon = await _coupons.GetByCodeAsync(campaign_id, NormalizeCode(req.Code));

        if (coupon == null)
            return Ok(new ValidateCouponResponse(false, null, null, CouponCalculator.ErrorNotFound));

        var blocked = CouponCalculator.CheckRedeemable(coupon.ToTerms(), DateTime.UtcNow);
        if (blocked != null)
            return Ok(new ValidateCouponResponse(false, null, null, blocked));

        // The bounds go back with the terms so the form's live preview applies the same
        // floor and cap the server will. Without them the client would show an
        // uncapped discount and every submission would fail the amount-mismatch check.
        return Ok(new ValidateCouponResponse(
            Valid             : true,
            DiscountType      : coupon.DiscountType,
            DiscountValue     : coupon.DiscountValue,
            Message           : "Coupon is valid.",
            MaxDiscountAmount : coupon.MaxDiscountAmount,
            MinDiscountAmount : coupon.MinDiscountAmount));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<bool> HasAccessAsync(string campaignId)
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var ids = await _users.GetCampaignIdsAsync(CurrentUserId);
        return ids.Contains(campaignId);
    }

    // custom_amount contribution: missing/non-numeric → 0, otherwise the typed value as-is
    // (numeric-safety only — NOT clamped to min/max; see the identical function/comment in
    // RegistrationController for why).
    private static double SafeCustomAmount(JsonElement val)
    {
        double amount;
        if (val.ValueKind == JsonValueKind.Number) amount = val.GetDouble();
        else if (val.ValueKind == JsonValueKind.String &&
                 double.TryParse(val.GetString(), System.Globalization.NumberStyles.Float,
                     System.Globalization.CultureInfo.InvariantCulture, out var d))
            amount = d;
        else return 0;

        // Reject NaN/±Infinity (parseable from "NaN"/"Infinity" strings) so the later
        // (decimal) cast can't throw OverflowException → 500.
        if (!double.IsFinite(amount)) return 0;

        // Guard the decimal cast against absurd magnitudes (e.g. "1e300") that overflow decimal.
        const double DecimalSafeBound = 7.9e28;
        if (amount > DecimalSafeBound) amount = DecimalSafeBound;
        if (amount < -DecimalSafeBound) amount = -DecimalSafeBound;
        return amount;
    }

    private static CouponResponse ToCouponResponse(
        CouponCode c,
        Dictionary<string, CouponUsageStats>? stats = null,
        Dictionary<string, string>? creatorNames = null)
    {
        var usage = stats != null && stats.TryGetValue(c.Code.ToUpperInvariant(), out var u) ? u : null;

        return new CouponResponse(
            Id                : c.Id,
            CampaignId        : c.CampaignId,
            Code              : c.Code,
            DiscountType      : c.DiscountType,
            DiscountValue     : c.DiscountValue,
            Formula           : c.Formula,
            ValidFrom         : c.ValidFrom,
            ValidUntil        : c.ValidUntil,
            UsageLimit        : c.UsageLimit,
            CurrentUsage      : c.CurrentUsage,
            IsActive          : c.IsActive,
            CreatedAt         : c.CreatedAt,
            MaxDiscountAmount : c.MaxDiscountAmount,
            MinDiscountAmount : c.MinDiscountAmount,
            Description       : c.Description,
            CreatedBy         : c.CreatedBy,
            CreatedByName     : c.CreatedBy != null && creatorNames != null &&
                                creatorNames.TryGetValue(c.CreatedBy, out var name) ? name : null,
            UpdatedAt         : c.UpdatedAt,
            Status            : CouponCalculator.DeriveStatus(c.ToTerms(), DateTime.UtcNow),
            TimesUsed         : usage?.TimesUsed          ?? 0,
            TotalDiscountGiven: usage?.TotalDiscountGiven ?? 0m,
            AverageDiscount   : usage?.AverageDiscount    ?? 0m,
            LowestDiscount    : usage?.LowestDiscount,
            HighestDiscount   : usage?.HighestDiscount);
    }
}
