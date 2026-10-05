using System.Text.Json;

namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// Determines which form fields are hidden by conditional rules given the submitted data.
/// This is the single source of truth shared by anything that must agree on visibility
/// (server-side validation, price recalculation, the filled-form PDF). The semantics MUST
/// match the client (usePublicForm.getFieldState / PublicRegistration.getFieldState):
///   • "show" is OR across all rules — a field targeted by any show-action is hidden by
///     default and becomes visible if AT LEAST ONE show-rule's conditions are met;
///   • a matched "hide" action always wins;
///   • checkbox (array) condition values are matched by membership, not scalar equality.
/// </summary>
public static class FieldVisibility
{
    /// <summary>
    /// Returns the set of field IDs hidden by the form's conditional rules for the given
    /// submitted data. Empty when there are no rules or the config can't be parsed.
    /// </summary>
    public static HashSet<string> HiddenFieldIds(string? formConfigJson, string? formDataJson)
    {
        var hidden = new HashSet<string>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(formConfigJson)) return hidden;

        JsonDocument cfg;
        try { cfg = JsonDocument.Parse(formConfigJson); }
        catch { return hidden; }

        using (cfg)
        {
            var root = cfg.RootElement;
            if (!root.TryGetProperty("fields", out var fieldsEl) || fieldsEl.ValueKind != JsonValueKind.Array)
                return hidden;
            if (!root.TryGetProperty("field_rules", out var rulesEl) || rulesEl.ValueKind != JsonValueKind.Array)
                return hidden; // no rules → nothing is rule-hidden

            JsonDocument? dataDoc = null;
            try { dataDoc = string.IsNullOrEmpty(formDataJson) ? null : JsonDocument.Parse(formDataJson); }
            catch { /* malformed data → treat as empty */ }

            var fieldTypes = new Dictionary<string, string?>(StringComparer.Ordinal);
            var fieldIds   = new List<string>();
            foreach (var f in fieldsEl.EnumerateArray())
            {
                var id = f.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrEmpty(id)) continue;
                fieldTypes[id] = f.TryGetProperty("type", out var tEl) ? tEl.GetString() : null;
                fieldIds.Add(id);
            }

            JsonElement? data = dataDoc?.RootElement;
            foreach (var id in fieldIds)
            {
                if (IsHidden(id, rulesEl, data, fieldTypes))
                    hidden.Add(id);
            }

            dataDoc?.Dispose();
        }

        return hidden;
    }

    private static bool IsHidden(string fieldId, JsonElement rules, JsonElement? data, Dictionary<string, string?> fieldTypes)
    {
        bool hasShowRule = false, shownByMatch = false, hiddenByMatch = false;

        foreach (var rule in rules.EnumerateArray())
        {
            if (!rule.TryGetProperty("actions", out var actionsEl) || actionsEl.ValueKind != JsonValueKind.Array)
                continue;

            var affects = actionsEl.EnumerateArray().Any(a =>
                a.TryGetProperty("target_field_id", out var t) && t.GetString() == fieldId);
            if (!affects) continue;

            var matchType = rule.TryGetProperty("match_type", out var mt) ? mt.GetString() : "all";
            var conds = rule.TryGetProperty("conditions", out var cEl) && cEl.ValueKind == JsonValueKind.Array
                ? cEl.EnumerateArray().ToList()
                : new List<JsonElement>();

            bool met = matchType == "any"
                ? conds.Any(c => EvaluateCondition(c, data, fieldTypes))
                : conds.All(c => EvaluateCondition(c, data, fieldTypes));

            foreach (var action in actionsEl.EnumerateArray())
            {
                if (!action.TryGetProperty("target_field_id", out var tEl) || tEl.GetString() != fieldId) continue;
                var actName = action.TryGetProperty("action", out var aEl) ? aEl.GetString() : null;
                if (actName == "show")
                {
                    hasShowRule = true;
                    if (met) shownByMatch = true;
                }
                else if (actName == "hide" && met)
                {
                    hiddenByMatch = true;
                }
            }
        }

        bool visible = true;
        if (hasShowRule) visible = shownByMatch;
        if (hiddenByMatch) visible = false;
        return !visible;
    }

    private static bool EvaluateCondition(JsonElement condition, JsonElement? data, Dictionary<string, string?> fieldTypes)
    {
        var condFieldId = condition.TryGetProperty("field_id", out var f) ? f.GetString() : null;
        if (string.IsNullOrEmpty(condFieldId)) return false;
        var op = condition.TryGetProperty("operator", out var o) ? o.GetString() : null;
        var compareValue = condition.TryGetProperty("value", out var v)
            ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString())
            : null;

        // Checkbox (multi-select) fields store an array → membership test.
        if (data is { ValueKind: JsonValueKind.Object } &&
            data.Value.TryGetProperty(condFieldId, out var rawEl) && rawEl.ValueKind == JsonValueKind.Array)
        {
            var selected = rawEl.EnumerateArray()
                .Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString())
                .Where(s => s != null).Select(s => s!).ToList();
            bool Has(string? target) => selected.Any(s => string.Equals(s, target, StringComparison.Ordinal));
            return op switch
            {
                "equals" or "contains" => Has(compareValue),
                "not_equals"           => !Has(compareValue),
                "is_empty"             => selected.Count == 0,
                "is_not_empty"         => selected.Count > 0,
                _                      => false
            };
        }

        var fieldValue = GetConditionFieldValue(condFieldId, data, fieldTypes);
        return op switch
        {
            "equals"       => string.Equals(fieldValue, compareValue, StringComparison.Ordinal),
            "not_equals"   => !string.Equals(fieldValue, compareValue, StringComparison.Ordinal),
            "contains"     => (fieldValue ?? "").ToLowerInvariant().Contains((compareValue ?? "").ToLowerInvariant()),
            "greater_than" => double.TryParse(fieldValue, out var a1) && double.TryParse(compareValue, out var b1) && a1 > b1,
            "less_than"    => double.TryParse(fieldValue, out var a2) && double.TryParse(compareValue, out var b2) && a2 < b2,
            "is_empty"     => string.IsNullOrEmpty(fieldValue),
            "is_not_empty" => !string.IsNullOrEmpty(fieldValue),
            _              => false
        };
    }

    private static string? GetConditionFieldValue(string fieldId, JsonElement? data, Dictionary<string, string?> fieldTypes)
    {
        if (data is not { ValueKind: JsonValueKind.Object }) return null;

        // 'name' fields split into _first / _middle / _last
        if (fieldTypes.TryGetValue(fieldId, out var t) && t == "name")
        {
            string Part(string suffix) =>
                data.Value.TryGetProperty($"{fieldId}{suffix}", out var p) && p.ValueKind == JsonValueKind.String
                    ? p.GetString() ?? "" : "";
            return $"{Part("_first")}{Part("_middle")}{Part("_last")}".Trim();
        }

        if (!data.Value.TryGetProperty(fieldId, out var el)) return null;
        return el.ValueKind switch
        {
            JsonValueKind.String                       => el.GetString(),
            JsonValueKind.Number or JsonValueKind.True
                or JsonValueKind.False                 => el.ToString(),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _                                          => el.ToString()
        };
    }

    /// <summary>
    /// Suffixes under which composite widgets store their parts. A hidden field's answer
    /// isn't one key — a "name" field spreads over three — so every strip has to sweep these too.
    /// </summary>
    public static readonly string[] CompositeSuffixes = { "_first", "_middle", "_last", "_country" };

    /// <summary>
    /// Field IDs the form author hid outright via the field's Visibility setting
    /// (<c>visibility: "hide"</c>). These never render, so they are hidden regardless of data.
    /// </summary>
    public static HashSet<string> StaticallyHiddenFieldIds(string? formConfigJson)
    {
        var hidden = new HashSet<string>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(formConfigJson)) return hidden;

        try
        {
            using var cfg = JsonDocument.Parse(formConfigJson);
            if (!cfg.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array)
                return hidden;

            foreach (var f in fieldsEl.EnumerateArray())
            {
                var id = f.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrEmpty(id)) continue;
                var vis = f.TryGetProperty("visibility", out var vEl) ? vEl.GetString() : null;
                if (string.Equals(vis, "hide", StringComparison.OrdinalIgnoreCase))
                    hidden.Add(id);
            }
        }
        catch { /* malformed config → nothing statically hidden */ }

        return hidden;
    }

    /// <summary>
    /// Every field the registrant did not see. A question goes unasked in three ways: a
    /// conditional rule hides it for this submission, its Visibility setting hides it outright,
    /// or it sits on a page of a multi-page form the submission routes around
    /// (<see cref="PageFlow"/>).
    /// </summary>
    public static HashSet<string> AllHiddenFieldIds(string? formConfigJson, string? formDataJson)
    {
        var hidden = HiddenFieldIds(formConfigJson, formDataJson);
        hidden.UnionWith(StaticallyHiddenFieldIds(formConfigJson));
        hidden.UnionWith(PageFlow.SkippedPageFieldIds(formConfigJson, formDataJson));
        return hidden;
    }

    /// <summary>
    /// Removes answers to questions the registrant never saw, in place, and returns the keys
    /// dropped.
    ///
    /// The client only ever adds to its form state — switching a "Member type" from COG to
    /// Rotarian hides the COG name dropdown but leaves the name already picked sitting in the
    /// payload. Stored unchecked, that registration carries two names, and everything
    /// downstream (the pay page, the confirmation email, the Sheets report) then has to guess
    /// which one is the registrant. So the answer is dropped at the door instead.
    ///
    /// A question goes unasked in three ways — a conditional rule hides the field, its Visibility
    /// setting hides it outright, or it sits on a page of a multi-page form this submission routes
    /// around. All three are covered.
    ///
    /// Visibility is decided HERE, from the config and the submitted data — deliberately not
    /// from the client's hidden_field_ids, even though that list is trusted elsewhere to relax
    /// required-field validation. Relaxing a check is permissive and a wrong list costs
    /// nothing; deleting an answer is destructive, and a client that wrongly called a field
    /// hidden would silently discard something the registrant really did type. Nothing is lost
    /// by being strict: the browser strips its own hidden answers before sending (see
    /// omitHiddenFieldValues), so for a genuine client the two agree anyway, and for a stale
    /// bundle or a hand-rolled POST this is the check that actually holds.
    /// </summary>
    /// <remarks>
    /// Generic in the value type only so the two submission DTOs — one holding
    /// <see cref="JsonElement"/>, the other <see cref="object"/> — can share it. Both round-trip
    /// through <see cref="JsonSerializer"/> identically.
    /// </remarks>
    public static HashSet<string> StripHiddenAnswers<TValue>(
        string? formConfigJson,
        Dictionary<string, TValue> formData)
    {
        var removed = new HashSet<string>(StringComparer.Ordinal);
        if (formData.Count == 0) return removed;

        var statically = StaticallyHiddenFieldIds(formConfigJson);

        // Dropping one answer can leave a rule that depended on it unmet, which hides a
        // further field in turn. Re-evaluate until nothing more falls out; the pass cap
        // stops a config whose rules chain (or cycle) from spinning here.
        for (var pass = 0; pass < 5; pass++)
        {
            var json   = JsonSerializer.Serialize(formData);
            var hidden = HiddenFieldIds(formConfigJson, json);
            hidden.UnionWith(statically);
            hidden.UnionWith(PageFlow.SkippedPageFieldIds(formConfigJson, json));

            var dropped = false;
            foreach (var id in hidden)
            {
                if (formData.Remove(id)) { removed.Add(id); dropped = true; }
                foreach (var suffix in CompositeSuffixes)
                {
                    var key = id + suffix;
                    if (formData.Remove(key)) { removed.Add(key); dropped = true; }
                }
            }

            if (!dropped) break;
        }

        return removed;
    }
}
