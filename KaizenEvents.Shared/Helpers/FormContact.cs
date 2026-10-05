using System.Text.Json;

namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// Works out who a registration belongs to — the registrant's name, email and phone —
/// and turns a stored choice value back into the label the registrant actually saw.
///
/// Shared on purpose: the confirmation email, the WhatsApp message and the Google Sheet
/// each used to carry their own copy of this, which is how they came to disagree about
/// the same registration.
/// </summary>
public static class FormContact
{
    private const int NoMatch = int.MaxValue;

    private enum Slot { Name, Email, Phone }

    /// <summary>
    /// Labels that name someone (or something) other than the registrant. "Club Name" and
    /// "Spouse Name" both contain "name", so on a form that has them the registrant's own
    /// field has to outrank them — picking the first label containing "name" is how a
    /// Rotarian's confirmation ended up addressed to their club.
    /// </summary>
    private static readonly string[] ForeignSubjects =
    {
        "club", "company", "organisation", "organization", "institute", "institution",
        "school", "college", "team", "chapter", "district", "business", "bank", "event",
        "project", "spouse", "partner", "guest", "emergency", "guardian", "father",
        "mother", "parent", "nominee", "referrer", "contact person"
    };

    /// <summary>
    /// Labels that unambiguously mean "the person registering". These beat any other
    /// name-ish label, whatever order the fields appear in.
    /// </summary>
    private static readonly string[] SelfLabels =
    {
        "name", "full name", "fullname", "your name", "participant name", "attendee name",
        "registrant name", "member name", "delegate name", "candidate name",
        "student name", "first name"
    };

    /// <summary>
    /// Resolves the registrant's contact details from a submission. Returns empty strings
    /// for anything the form doesn't capture.
    /// </summary>
    public static (string Name, string Email, string Phone) Resolve(
        string? formConfigJson, string? formDataJson)
    {
        if (string.IsNullOrWhiteSpace(formConfigJson) || string.IsNullOrWhiteSpace(formDataJson))
            return ("", "", "");

        JsonDocument cfgDoc, dataDoc;
        try
        {
            cfgDoc  = JsonDocument.Parse(formConfigJson);
            dataDoc = JsonDocument.Parse(formDataJson);
        }
        catch { return ("", "", ""); }

        using (cfgDoc)
        using (dataDoc)
        {
            if (!cfgDoc.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array)
                return ("", "", "");

            // A question the registrant never saw can still have an answer sitting in
            // form_data — switching "Member type" from COG to Rotarian hides the COG name
            // dropdown but leaves the name already picked behind. Submissions are stripped of
            // these now (FieldVisibility.StripHiddenAnswers), but rows written before that
            // still carry them, so they are filtered out on the way back out too.
            var hidden = FieldVisibility.AllHiddenFieldIds(formConfigJson, formDataJson);

            var best = new Dictionary<Slot, (int Rank, string Value)>();

            foreach (var field in fieldsEl.EnumerateArray())
            {
                var type  = field.TryGetProperty("type",  out var tEl) ? tEl.GetString() : null;
                var id    = field.TryGetProperty("id",    out var iEl) ? iEl.GetString() : null;
                var label = field.TryGetProperty("label", out var lEl) ? lEl.GetString() : null;

                if (string.IsNullOrWhiteSpace(id)) continue;
                if (type is "section_header" or "calculated" or "price") continue;
                if (hidden.Contains(id)) continue;

                var value = ReadFieldValue(dataDoc.RootElement, field, id, type);
                if (string.IsNullOrWhiteSpace(value)) continue;

                foreach (var slot in new[] { Slot.Name, Slot.Email, Slot.Phone })
                {
                    var rank = RankFor(slot, type, label);
                    if (rank == NoMatch) continue;
                    // Ties go to the earlier field, matching how the form reads top-down.
                    if (!best.TryGetValue(slot, out var current) || rank < current.Rank)
                        best[slot] = (rank, value);
                }
            }

            return (Pick(best, Slot.Name), Pick(best, Slot.Email), Pick(best, Slot.Phone));
        }
    }

    /// <summary>
    /// Turns a stored choice value back into the label the registrant picked
    /// ("thana_west" → "Thana West"). Non-choice fields are returned untouched.
    /// </summary>
    public static string ResolveOptionLabel(JsonElement field, string? rawValue)
    {
        if (string.IsNullOrEmpty(rawValue)) return rawValue ?? "";
        if (field.ValueKind != JsonValueKind.Object) return rawValue;
        if (!field.TryGetProperty("options", out var opts) || opts.ValueKind != JsonValueKind.Array)
            return rawValue;

        foreach (var o in opts.EnumerateArray())
        {
            if (o.ValueKind != JsonValueKind.Object) continue;
            var ov = o.TryGetProperty("value", out var vv) && vv.ValueKind == JsonValueKind.String
                ? vv.GetString() : null;
            if (string.Equals(ov, rawValue, StringComparison.Ordinal))
                return (o.TryGetProperty("label", out var lv) && lv.ValueKind == JsonValueKind.String
                    ? lv.GetString() : null) ?? rawValue;
        }

        // Choice field but no matching option — it was edited or removed after this
        // registration came in. Show something readable rather than the raw slug.
        return SlugHelper.Humanize(rawValue);
    }

    /// <summary>
    /// Reads one field's answer as display text, resolving choice values to their labels
    /// and stitching a canonical Name field's parts back together.
    /// </summary>
    public static string ReadFieldValue(JsonElement formData, JsonElement field, string id, string? type)
    {
        if (formData.ValueKind != JsonValueKind.Object) return "";

        if (type == "name")
        {
            string Part(string suffix) =>
                formData.TryGetProperty($"{id}_{suffix}", out var p) && p.ValueKind == JsonValueKind.String
                    ? (p.GetString() ?? "") : "";

            var combined = string.Join(" ", new[] { Part("first"), Part("middle"), Part("last") }
                .Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
            if (!string.IsNullOrWhiteSpace(combined)) return combined;
        }

        if (!formData.TryGetProperty(id, out var v)) return "";

        return v.ValueKind switch
        {
            JsonValueKind.String                   => ResolveOptionLabel(field, v.GetString()),
            JsonValueKind.Null or JsonValueKind.Undefined => "",
            JsonValueKind.True                     => "Yes",
            JsonValueKind.False                    => "",
            JsonValueKind.Array                    => string.Join(", ", v.EnumerateArray()
                .Select(e => ResolveOptionLabel(field, e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString()))
                .Where(s => !string.IsNullOrWhiteSpace(s))),
            _                                      => v.ToString()
        };
    }

    private static string Pick(Dictionary<Slot, (int Rank, string Value)> best, Slot slot) =>
        best.TryGetValue(slot, out var hit) ? hit.Value : "";

    /// <summary>
    /// Scores how well a field answers for a slot — lower wins, <see cref="NoMatch"/> means
    /// it doesn't apply. The field's declared type is the strongest signal; an explicit
    /// self-label comes next; a bare mention of the word is weakest; and anything naming a
    /// third party sits below all of them so it only wins when nothing else is answered.
    /// </summary>
    private static int RankFor(Slot slot, string? type, string? label)
    {
        var lbl     = (label ?? "").Trim().ToLowerInvariant();
        var foreign = ForeignSubjects.Any(w => lbl.Contains(w, StringComparison.Ordinal));

        switch (slot)
        {
            case Slot.Name:
                if (type == "name")                    return foreign ? 6 : 0;
                if (!lbl.Contains("name"))             return NoMatch;
                if (SelfLabels.Contains(lbl))          return foreign ? 6 : 1;
                return foreign ? 6 : 2;

            case Slot.Email:
                if (type == "email")                   return foreign ? 6 : 0;
                if (!lbl.Contains("email") && !lbl.Contains("e-mail")) return NoMatch;
                return foreign ? 6 : 2;

            case Slot.Phone:
                if (type is "phone" or "tel")          return foreign ? 6 : 0;
                if (lbl.Contains("phone") || lbl.Contains("mobile") || lbl.Contains("whatsapp"))
                    return foreign ? 6 : 2;
                // "Contact" on its own is a weaker hint — "Emergency Contact Number" is a
                // phone number, just not the registrant's.
                if (lbl.Contains("contact"))           return foreign ? 6 : 3;
                return NoMatch;

            default:
                return NoMatch;
        }
    }

    // ── Bulk name resolution ────────────────────────────────────────────────────
    // <see cref="Resolve"/> re-parses form_config on every call, which is right for one
    // lookup and ruinous for a few thousand — the dashboard summary spent most of its time
    // doing exactly that. These two hoist the config parsing out of the loop while keeping
    // the ranking identical, so a list and a detail view never disagree about a name.

    /// <summary>One field that could hold the registrant's name, with its choice labels.</summary>
    /// <param name="OptionLabels">value → label, for choice fields; null for everything else.</param>
    public sealed record NameCandidate(
        string Id, string? Type, IReadOnlyDictionary<string, string>? OptionLabels);

    /// <summary>A campaign's name-bearing fields, best first.</summary>
    public sealed record NamePlan(IReadOnlyList<NameCandidate> Candidates)
    {
        public static readonly NamePlan Empty = new(Array.Empty<NameCandidate>());
    }

    /// <summary>
    /// Precomputes the name-field lookup order for one campaign's form_config, ranked exactly
    /// as <see cref="Resolve"/> ranks the Name slot.
    ///
    /// Unlike <see cref="Resolve"/> this does NOT drop rule-hidden fields: that depends on each
    /// row's data, so it would put the per-row config parse straight back. It costs nothing
    /// here — a stale hidden answer only ever sat in a lower-ranked field than the registrant's
    /// real name field, so the ranking alone settles it.
    /// </summary>
    public static NamePlan BuildNamePlan(string? formConfigJson)
    {
        if (string.IsNullOrEmpty(formConfigJson)) return NamePlan.Empty;

        try
        {
            using var cfg = JsonDocument.Parse(formConfigJson);
            if (!cfg.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array)
                return NamePlan.Empty;

            var ranked = new List<(int Rank, int Order, NameCandidate Candidate)>();
            var order  = 0;

            foreach (var field in fieldsEl.EnumerateArray())
            {
                var type  = field.TryGetProperty("type",  out var tEl) ? tEl.GetString() : null;
                var id    = field.TryGetProperty("id",    out var iEl) ? iEl.GetString() : null;
                var label = field.TryGetProperty("label", out var lEl) ? lEl.GetString() : null;
                order++;

                if (string.IsNullOrWhiteSpace(id)) continue;
                if (type is "section_header" or "calculated" or "price") continue;

                var rank = RankFor(Slot.Name, type, label);
                if (rank == NoMatch) continue;

                Dictionary<string, string>? optionLabels = null;
                if (field.TryGetProperty("options", out var opts) && opts.ValueKind == JsonValueKind.Array)
                {
                    optionLabels = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (var o in opts.EnumerateArray())
                    {
                        if (o.ValueKind != JsonValueKind.Object) continue;
                        var ov = o.TryGetProperty("value", out var vv) && vv.ValueKind == JsonValueKind.String
                            ? vv.GetString() : null;
                        var ol = o.TryGetProperty("label", out var lv) && lv.ValueKind == JsonValueKind.String
                            ? lv.GetString() : null;
                        if (!string.IsNullOrEmpty(ov) && ol != null) optionLabels[ov] = ol;
                    }
                }

                ranked.Add((rank, order, new NameCandidate(id, type, optionLabels)));
            }

            // Ties go to the earlier field, matching how the form reads top-down.
            return new NamePlan(ranked
                .OrderBy(r => r.Rank).ThenBy(r => r.Order)
                .Select(r => r.Candidate)
                .ToList());
        }
        catch { return NamePlan.Empty; }
    }

    /// <summary>
    /// Applies a <see cref="NamePlan"/> to one registration's form_data. Which candidate wins is
    /// data-dependent — a higher-ranked field left blank is skipped — so this half genuinely
    /// runs per row; only the parsing is hoisted.
    /// </summary>
    public static string ResolveNameWithPlan(string? formDataJson, NamePlan plan, string fallback = "")
    {
        if (string.IsNullOrEmpty(formDataJson) || plan.Candidates.Count == 0) return fallback;

        try
        {
            using var doc = JsonDocument.Parse(formDataJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return fallback;

            foreach (var c in plan.Candidates)
            {
                if (c.Type == "name")
                {
                    string Part(string suffix) =>
                        root.TryGetProperty($"{c.Id}_{suffix}", out var p) && p.ValueKind == JsonValueKind.String
                            ? (p.GetString() ?? "") : "";

                    var combined = string.Join(" ", new[] { Part("first"), Part("middle"), Part("last") }
                        .Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
                    if (!string.IsNullOrWhiteSpace(combined)) return combined;
                }

                if (!root.TryGetProperty(c.Id, out var v) || v.ValueKind != JsonValueKind.String) continue;
                var raw = v.GetString();
                if (string.IsNullOrWhiteSpace(raw)) continue;

                if (c.OptionLabels == null) return raw;
                return c.OptionLabels.TryGetValue(raw, out var lbl) ? lbl : SlugHelper.Humanize(raw);
            }

            return fallback;
        }
        catch { return fallback; }
    }
}
