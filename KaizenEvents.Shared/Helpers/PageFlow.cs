using System.Text.Json;

namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// Works out which pages of a multi-page form a submission actually goes through, and therefore
/// which fields the registrant never saw.
///
/// Page skipping is a second way a question can go unasked, alongside the show/hide field rules
/// in <see cref="FieldVisibility"/>, and it strands answers the same way: fill page 2, go back to
/// page 1, change the answer that drives the rule so page 2 is now skipped, and page 2's answers
/// are still in the browser's form state at submit.
///
/// The path is recomputed here from the FINAL answers rather than taken from the browser's
/// navigation history, and that is the point: "given what you ended up answering, which pages
/// apply?" is the question worth asking. A page the registrant walked through and then routed
/// around by changing their mind is exactly the case being fixed.
///
/// The semantics MUST match the client (PublicRegistration.js — evaluatePageRules / goNext):
///   • pages are split by `page_breaks`, each break's `position` being the number of fields
///     before it;
///   • from a page, its `page_rules` are tried in order and the FIRST match decides;
///   • `skip_to` goes to the page AFTER the target, `jump_to` goes to the target itself, both
///     clamped to the last page;
///   • with no match, the next page is simply the one after;
///   • the walk ends once it runs past the last page.
/// </summary>
public static class PageFlow
{
    // A jump_to rule can point backwards, so a form can be authored whose rules cycle. The
    // registrant would just keep clicking; this walk has to stop on its own.
    private const int MaxSteps = 200;

    /// <summary>
    /// Field IDs that sit on pages this submission never reaches. Empty for a single-page form,
    /// a form with no page breaks, or a config that can't be parsed — in every one of those cases
    /// no field can be page-skipped, so claiming otherwise could only delete real answers.
    /// </summary>
    public static HashSet<string> SkippedPageFieldIds(string? formConfigJson, string? formDataJson)
    {
        var skipped = new HashSet<string>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(formConfigJson)) return skipped;

        JsonDocument cfg;
        try { cfg = JsonDocument.Parse(formConfigJson); }
        catch { return skipped; }

        using (cfg)
        {
            var root = cfg.RootElement;
            if (!root.TryGetProperty("fields", out var fieldsEl) || fieldsEl.ValueKind != JsonValueKind.Array)
                return skipped;

            var pages = SplitIntoPages(fieldsEl, root);
            if (pages.Count <= 1) return skipped;   // nothing to skip past

            var rules = root.TryGetProperty("page_rules", out var rEl) && rEl.ValueKind == JsonValueKind.Array
                ? rEl.EnumerateArray().ToList()
                : new List<JsonElement>();

            JsonDocument? dataDoc = null;
            try { dataDoc = string.IsNullOrEmpty(formDataJson) ? null : JsonDocument.Parse(formDataJson); }
            catch { /* malformed data → every rule simply goes unmet */ }

            try
            {
                JsonElement? data = dataDoc?.RootElement;
                var visited = WalkPages(pages.Count, rules, data);

                for (var i = 0; i < pages.Count; i++)
                {
                    if (visited.Contains(i + 1)) continue;   // pages are 1-indexed in the config
                    foreach (var id in pages[i]) skipped.Add(id);
                }
            }
            finally { dataDoc?.Dispose(); }
        }

        return skipped;
    }

    /// <summary>
    /// Splits the form's field IDs into pages at the page breaks. Mirrors the client's split:
    /// each break's `position` counts the fields before it, and everything after the last break
    /// forms the final page.
    /// </summary>
    private static List<List<string>> SplitIntoPages(JsonElement fieldsEl, JsonElement root)
    {
        var ids = new List<string>();
        foreach (var f in fieldsEl.EnumerateArray())
        {
            var id = f.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            // Keep unnamed fields in the list so break positions still line up with the client's
            // indexing — they just contribute nothing to strip.
            ids.Add(id ?? "");
        }

        var breaks = new List<int>();
        if (root.TryGetProperty("page_breaks", out var bEl) && bEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var b in bEl.EnumerateArray())
            {
                var pos = b.TryGetProperty("position", out var pEl) && pEl.TryGetInt32(out var p)
                    ? p : ids.Count;
                breaks.Add(pos);
            }
            breaks.Sort();
        }

        var pages   = new List<List<string>>();
        var lastPos = 0;
        foreach (var b in breaks)
        {
            var pos = Math.Max(lastPos, Math.Min(b, ids.Count));
            pages.Add(ids.GetRange(lastPos, pos - lastPos).Where(s => s.Length > 0).ToList());
            lastPos = pos;
        }
        pages.Add(ids.GetRange(lastPos, ids.Count - lastPos).Where(s => s.Length > 0).ToList());

        return pages;
    }

    /// <summary>Pages (1-indexed) the submission passes through, starting at the first.</summary>
    private static HashSet<int> WalkPages(int totalPages, List<JsonElement> rules, JsonElement? data)
    {
        var visited = new HashSet<int> { 1 };
        var current = 1;

        for (var step = 0; step < MaxSteps; step++)
        {
            var target = NextPageFromRules(current, totalPages, rules, data);
            var next   = target ?? current + 1;

            if (next > totalPages) break;          // walked off the end — the form is done
            if (!visited.Add(next)) break;         // already been here; a cycle, stop
            current = next;
        }

        return visited;
    }

    /// <summary>The page the first matching rule on <paramref name="current"/> sends us to.</summary>
    private static int? NextPageFromRules(int current, int totalPages, List<JsonElement> rules, JsonElement? data)
    {
        foreach (var rule in rules)
        {
            var source = rule.TryGetProperty("source_page", out var sEl) && sEl.TryGetInt32(out var sp) ? sp : 1;
            if (source != current) continue;

            var conds = rule.TryGetProperty("conditions", out var cEl) && cEl.ValueKind == JsonValueKind.Array
                ? cEl.EnumerateArray().ToList()
                : new List<JsonElement>();
            if (conds.Count == 0) continue;        // the client skips condition-less rules too

            var matchType = rule.TryGetProperty("match_type", out var mEl) ? mEl.GetString() : "all";
            var matched = matchType == "any"
                ? conds.Any(c => EvaluateCondition(c, data))
                : conds.All(c => EvaluateCondition(c, data));
            if (!matched) continue;

            var target = rule.TryGetProperty("target_page", out var tEl) && tEl.TryGetInt32(out var tp) && tp != 0
                ? tp : current + 1;
            var action = rule.TryGetProperty("action", out var aEl) ? aEl.GetString() : null;

            // skip_to lands PAST the named page; jump_to lands ON it.
            if (action == "skip_to") return Math.Min(totalPages, target + 1);
            if (action == "jump_to") return Math.Min(totalPages, Math.Max(1, target));
            // Any other action isn't navigation — keep looking, exactly as the client does.
        }

        return null;
    }

    /// <summary>
    /// One page-rule condition. Page rules accept a wider set of operators than field rules do
    /// (<see cref="FieldVisibility"/>), and every one has to be understood here: an operator this
    /// didn't recognise would read as "unmet", change the computed path, and strip a page the
    /// registrant really did fill in.
    /// </summary>
    private static bool EvaluateCondition(JsonElement condition, JsonElement? data)
    {
        var fieldId = condition.TryGetProperty("field_id", out var f) ? f.GetString() : null;
        if (string.IsNullOrEmpty(fieldId)) return false;

        var op       = condition.TryGetProperty("operator", out var o) ? o.GetString() : null;
        var expected = condition.TryGetProperty("value", out var v)
            ? (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.ToString())
            : "";

        JsonElement raw = default;
        var present = data is { ValueKind: JsonValueKind.Object } &&
                      data.Value.TryGetProperty(fieldId, out raw);

        // Multi-select checkboxes store an array — membership, not scalar equality.
        if (present && raw.ValueKind == JsonValueKind.Array)
        {
            var selected = raw.EnumerateArray()
                .Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.ToString())
                .ToList();
            return op switch
            {
                "equals" or "contains"          => selected.Contains(expected, StringComparer.Ordinal),
                "not_equals" or "not_contains"  => !selected.Contains(expected, StringComparer.Ordinal),
                "is_empty"                      => selected.Count == 0,
                "is_not_empty"                  => selected.Count > 0,
                _                               => false   // numeric/string ops are meaningless here
            };
        }

        var actual = !present ? "" : raw.ValueKind switch
        {
            JsonValueKind.String                         => raw.GetString() ?? "",
            JsonValueKind.Null or JsonValueKind.Undefined => "",
            _                                            => raw.ToString()
        };

        // The client coerces a non-numeric operand to 0 rather than failing the comparison.
        static double Num(string s) => double.TryParse(s, out var n) ? n : 0;

        return op switch
        {
            "equals"        => actual == expected,
            "not_equals"    => actual != expected,
            "contains"      => actual.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "not_contains"  => !actual.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "greater_than"  => Num(actual) >  Num(expected),
            "less_than"     => Num(actual) <  Num(expected),
            "greater_equal" => Num(actual) >= Num(expected),
            "less_equal"    => Num(actual) <= Num(expected),
            "is_empty"      => actual.Length == 0,
            "is_not_empty"  => actual.Length > 0,
            "starts_with"   => actual.StartsWith(expected, StringComparison.OrdinalIgnoreCase),
            "ends_with"     => actual.EndsWith(expected, StringComparison.OrdinalIgnoreCase),
            _               => false
        };
    }
}
