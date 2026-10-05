using System.Globalization;
using System.Text.Json;

namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// Evaluates field visibility/requirement rules using the 14 condition operators
/// defined in CLAUDE.md Section 8 (Formula Engine).
/// </summary>
public static class FieldRulesEvaluator
{
    /// <summary>
    /// Evaluates a single condition against form data values.
    /// </summary>
    /// <param name="fieldValue">The current value of the target field (as string).</param>
    /// <param name="op">One of the 14 condition operators.</param>
    /// <param name="conditionValue">The value to compare against (comma-separated for 'between').</param>
    public static bool EvaluateCondition(string? fieldValue, string op, string? conditionValue)
    {
        var fv = fieldValue ?? "";
        var cv = conditionValue ?? "";

        return op switch
        {
            "equals"        => string.Equals(fv, cv, StringComparison.OrdinalIgnoreCase),
            "not_equals"    => !string.Equals(fv, cv, StringComparison.OrdinalIgnoreCase),
            "contains"      => fv.Contains(cv, StringComparison.OrdinalIgnoreCase),
            "not_contains"  => !fv.Contains(cv, StringComparison.OrdinalIgnoreCase),
            "starts_with"   => fv.StartsWith(cv, StringComparison.OrdinalIgnoreCase),
            "ends_with"     => fv.EndsWith(cv, StringComparison.OrdinalIgnoreCase),
            "is_empty"      => string.IsNullOrWhiteSpace(fv),
            "is_not_empty"  => !string.IsNullOrWhiteSpace(fv),
            "greater_than"  => TryCompareNumeric(fv, cv, out var d) && d > 0,
            "less_than"     => TryCompareNumeric(fv, cv, out var d) && d < 0,
            "greater_equal" => TryCompareNumeric(fv, cv, out var d) && d >= 0,
            "less_equal"    => TryCompareNumeric(fv, cv, out var d) && d <= 0,
            "between"       => EvaluateBetween(fv, cv),
            _ => false
        };
    }

    /// <summary>
    /// Evaluates all conditions in a rule (AND logic — all must be true).
    /// </summary>
    public static bool EvaluateConditions(
        IEnumerable<FieldCondition> conditions,
        Dictionary<string, string> formData)
    {
        foreach (var cond in conditions)
        {
            formData.TryGetValue(cond.FieldId, out var value);
            if (!EvaluateCondition(value, cond.Operator, cond.Value))
                return false;
        }
        return true;
    }

    /// <summary>
    /// Evaluates all conditions in a rule (AND logic) against raw JSON form data.
    /// Checkbox (multi-select) fields store an ARRAY of selected values — those get
    /// membership semantics (mirroring FieldVisibility / the client) instead of comparing
    /// against the array's JSON text, which would never match a scalar condition value.
    /// </summary>
    public static bool EvaluateConditions(
        IEnumerable<FieldCondition> conditions,
        Dictionary<string, JsonElement> formData)
    {
        foreach (var cond in conditions)
        {
            var found = formData.TryGetValue(cond.FieldId, out var el);

            if (found && el.ValueKind == JsonValueKind.Array)
            {
                if (!EvaluateArrayCondition(el, cond.Operator, cond.Value))
                    return false;
                continue;
            }

            var value = !found ? null
                : el.ValueKind == JsonValueKind.String ? el.GetString()
                : el.ToString();

            if (!EvaluateCondition(value, cond.Operator, cond.Value))
                return false;
        }
        return true;
    }

    // Membership semantics for checkbox arrays — mirrors FieldVisibility.EvaluateCondition.
    private static bool EvaluateArrayCondition(JsonElement array, string op, string? conditionValue)
    {
        var selected = array.EnumerateArray()
            .Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString())
            .Where(s => s != null).Select(s => s!).ToList();
        bool Has(string? target) => selected.Any(s => string.Equals(s, target, StringComparison.Ordinal));
        return op switch
        {
            "equals" or "contains"         => Has(conditionValue),
            "not_equals" or "not_contains" => !Has(conditionValue),
            "is_empty"                     => selected.Count == 0,
            "is_not_empty"                 => selected.Count > 0,
            _                              => false // numeric ops / between don't apply to arrays
        };
    }

    private static bool TryCompareNumeric(string fv, string cv, out int direction)
    {
        direction = 0;
        if (!double.TryParse(fv, NumberStyles.Float, CultureInfo.InvariantCulture, out var a)) return false;
        if (!double.TryParse(cv, NumberStyles.Float, CultureInfo.InvariantCulture, out var b)) return false;
        direction = a.CompareTo(b);
        return true;
    }

    private static bool EvaluateBetween(string fv, string cv)
    {
        // cv format: "min,max"
        var parts = cv.Split(',');
        if (parts.Length != 2) return false;
        if (!double.TryParse(fv, NumberStyles.Float, CultureInfo.InvariantCulture, out var val)) return false;
        if (!double.TryParse(parts[0].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var min)) return false;
        if (!double.TryParse(parts[1].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var max)) return false;
        return val >= min && val <= max;
    }
}

public record FieldCondition(string FieldId, string Operator, string? Value);
