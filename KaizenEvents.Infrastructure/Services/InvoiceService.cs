using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace KaizenEvents.Infrastructure.Services;

public class InvoiceService : IInvoiceService
{
    // Brand color per CLAUDE.md: #7c3aed
    private static readonly string PurpleHex = "#7c3aed";

    static InvoiceService()
    {
        // Community license — required for QuestPDF 2023+
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] GenerateInvoicePdf(Registration registration, Campaign campaign)
    {
        // Form fields have random IDs — look them up by type via form_config, with fallbacks.
        string buyerName  = FindFieldValue(registration.FormData, campaign.FormConfig, "name")
                            ?? BuildNameFromSubfields(registration.FormData, campaign.FormConfig)
                            ?? ExtractField(registration.FormData, "name")
                            ?? "Guest";
        string buyerEmail = FindFieldValue(registration.FormData, campaign.FormConfig, "email")
                            ?? ScanForEmail(registration.FormData)
                            ?? ExtractField(registration.FormData, "email")
                            ?? "";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);
                page.DefaultTextStyle(t => t.FontFamily("Helvetica"));

                page.Content().Column(col =>
                {
                    // ── Title ────────────────────────────────────────────────
                    col.Item()
                        .AlignCenter()
                        .Text("TAX INVOICE")
                        .FontSize(24)
                        .Bold()
                        .FontColor(PurpleHex);

                    col.Item().Height(20);

                    // ── Details table ─────────────────────────────────────────
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(2);
                            cols.RelativeColumn(3);
                        });

                        AddDetailRow(table, "Invoice Number:", registration.InvoiceNumber ?? "-");
                        AddDetailRow(table, "Invoice Date:",
                            IstTime.FromUtc(registration.CreatedAt).ToString("dd MMMM yyyy"));
                        AddDetailRow(table, "Event:", campaign.Name);
                        AddDetailRow(table, "Organization:", campaign.OrganizationName);
                        if (!string.IsNullOrEmpty(buyerName))
                            AddDetailRow(table, "Registrant:", buyerName);
                        if (!string.IsNullOrEmpty(buyerEmail))
                            AddDetailRow(table, "Email:", buyerEmail);
                    });

                    col.Item().Height(30);

                    // ── Billing Details heading ────────────────────────────────
                    col.Item()
                        .Text("Billing Details")
                        .FontSize(14)
                        .Bold()
                        .FontColor(PurpleHex);

                    col.Item().Height(8);

                    // ── Items table ────────────────────────────────────────────
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(4);
                            cols.RelativeColumn(2);
                        });

                        // Header
                        table.Header(header =>
                        {
                            header.Cell().Background(PurpleHex).Padding(6)
                                .Text("Description").FontColor(Colors.White).Bold();
                            header.Cell().Background(PurpleHex).Padding(6).AlignRight()
                                .Text("Amount").FontColor(Colors.White).Bold();
                        });

                        // Row
                        table.Cell().Background("#f5f5dc").Border(0.5f).Padding(6)
                            .Text("Registration Fee");
                        table.Cell().Background("#f5f5dc").Border(0.5f).Padding(6)
                            .AlignRight()
                            .Text(FormatAmount(registration.TotalAmount));
                    });

                    col.Item().Height(24);

                    // ── Total ──────────────────────────────────────────────────
                    col.Item()
                        .AlignRight()
                        .Text($"Total Amount: {FormatAmount(registration.TotalAmount)}")
                        .FontSize(14)
                        .Bold()
                        .FontColor(PurpleHex);

                    col.Item().Height(40);

                    // ── Footer ─────────────────────────────────────────────────
                    col.Item().AlignCenter()
                        .Text("Thank you for your registration!")
                        .FontSize(9)
                        .FontColor(Colors.Grey.Medium);

                    col.Item().AlignCenter()
                        .Text($"Kaizen Events - {campaign.OrganizationName}")
                        .FontSize(9)
                        .FontColor(Colors.Grey.Medium);
                });
            });
        }).GeneratePdf();
    }

    // ── Filled-form PDF ─────────────────────────────────────────────────────────

    public byte[] GenerateFilledFormPdf(Registration registration, Campaign campaign)
    {
        var rows  = BuildFilledFormRows(registration.FormData, campaign.FormConfig);
        var regId = registration.Id.Length >= 8 ? registration.Id[..8].ToUpperInvariant() : registration.Id.ToUpperInvariant();

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);
                page.DefaultTextStyle(t => t.FontFamily("Helvetica").FontSize(10));

                page.Header().Column(col =>
                {
                    col.Item().AlignCenter().Text("Registration Details").FontSize(20).Bold().FontColor(PurpleHex);
                    col.Item().AlignCenter().Text(campaign.Name).FontSize(12).FontColor(Colors.Grey.Darken1);
                });

                page.Content().PaddingTop(16).Column(col =>
                {
                    // Meta block
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c => { c.RelativeColumn(2); c.RelativeColumn(3); });
                        AddDetailRow(table, "Registration ID:", regId);
                        AddDetailRow(table, "Date:", IstTime.FromUtc(registration.CreatedAt).ToString("dd MMMM yyyy, hh:mm tt"));
                        AddDetailRow(table, "Organization:", campaign.OrganizationName);
                        AddDetailRow(table, "Payment Status:", registration.PaymentStatus.ToString().ToLowerInvariant());
                        AddDetailRow(table, "Amount:", FormatAmount(registration.TotalAmount));
                    });

                    col.Item().Height(12);
                    col.Item().LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten1);
                    col.Item().Height(8);

                    if (rows.Count == 0)
                    {
                        col.Item().Text("No form responses recorded.").FontColor(Colors.Grey.Medium).Italic();
                    }

                    foreach (var row in rows)
                    {
                        if (row.IsSection)
                        {
                            col.Item().PaddingTop(12).PaddingBottom(2)
                                .Text(row.Label).FontSize(13).Bold().FontColor(PurpleHex);
                        }
                        else
                        {
                            col.Item().PaddingVertical(3).Row(r =>
                            {
                                r.RelativeItem(2).Text(row.Label).Bold();
                                r.RelativeItem(3).Text(row.Value);
                            });
                        }
                    }
                });

                page.Footer().AlignCenter()
                    .Text($"Kaizen Events - {campaign.OrganizationName}")
                    .FontSize(8).FontColor(Colors.Grey.Medium);
            });
        }).GeneratePdf();
    }

    /// <summary>
    /// Flattens form_config + form_data into displayable rows in form order. section_header
    /// fields become section rows; price/calculated are skipped; empty answers are omitted.
    /// </summary>
    private static List<(string Label, string Value, bool IsSection)> BuildFilledFormRows(
        string formDataJson, string? formConfigJson)
    {
        var rows = new List<(string, string, bool)>();
        if (string.IsNullOrEmpty(formConfigJson)) return rows;

        // Fields hidden by conditional rules (given the submitted data) are excluded from
        // the PDF — their value may linger in form_data after the registrant switches away.
        var hidden = KaizenEvents.Shared.Helpers.FieldVisibility.HiddenFieldIds(formConfigJson, formDataJson);

        JsonDocument? formDoc = null, cfgDoc = null;
        try { formDoc = string.IsNullOrEmpty(formDataJson) ? null : JsonDocument.Parse(formDataJson); } catch { }
        try { cfgDoc = JsonDocument.Parse(formConfigJson); } catch { return rows; }

        try
        {
            if (!cfgDoc.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array)
                return rows;

            JsonElement? data = formDoc?.RootElement;

            foreach (var f in fieldsEl.EnumerateArray())
            {
                var type  = f.TryGetProperty("type",  out var tEl) ? tEl.GetString() : null;
                var label = f.TryGetProperty("label", out var lEl) ? lEl.GetString() : null;
                var id    = f.TryGetProperty("id",    out var idEl) ? idEl.GetString() : null;

                if (type == "section_header")
                {
                    if (!string.IsNullOrWhiteSpace(label)) rows.Add((label!, "", true));
                    continue;
                }
                if (type is "price" or "calculated") continue;
                if (string.IsNullOrEmpty(id)) continue;
                if (hidden.Contains(id)) continue; // hidden by field rules

                var value = ExtractDisplayValue(data, f, type, id);
                if (string.IsNullOrWhiteSpace(value)) continue; // skip unfilled fields
                rows.Add((string.IsNullOrWhiteSpace(label) ? id : label!, value, false));
            }
        }
        catch { /* ignore */ }
        finally { formDoc?.Dispose(); cfgDoc?.Dispose(); }
        return rows;
    }

    /// <summary>Display value for a field, mapping choice option values back to their labels.</summary>
    private static string ExtractDisplayValue(JsonElement? data, JsonElement field, string? type, string id)
    {
        if (data is null || data.Value.ValueKind != JsonValueKind.Object) return "";

        if (type == "name")
        {
            string Part(string s) => data.Value.TryGetProperty($"{id}_{s}", out var p) && p.ValueKind == JsonValueKind.String
                ? (p.GetString() ?? "") : "";
            return string.Join(" ", new[] { Part("first"), Part("middle"), Part("last") }
                .Where(x => !string.IsNullOrWhiteSpace(x))).Trim();
        }

        if (!data.Value.TryGetProperty(id, out var v)) return "";

        // value -> label map for choice fields
        Dictionary<string, string>? optMap = null;
        if (field.TryGetProperty("options", out var optsEl) && optsEl.ValueKind == JsonValueKind.Array)
        {
            optMap = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var o in optsEl.EnumerateArray())
            {
                var ov = o.TryGetProperty("value", out var ovEl) ? ovEl.GetString() : null;
                var ol = o.TryGetProperty("label", out var olEl) ? olEl.GetString() : null;
                if (!string.IsNullOrEmpty(ov)) optMap[ov] = string.IsNullOrWhiteSpace(ol) ? ov : ol!;
            }
        }
        string MapOpt(string val) => optMap != null && optMap.TryGetValue(val, out var l) ? l : val;

        switch (type)
        {
            case "file_upload":
                if (v.ValueKind == JsonValueKind.Object)
                {
                    if (v.TryGetProperty("name", out var nmEl) && nmEl.ValueKind == JsonValueKind.String)
                        return nmEl.GetString() ?? "";
                    if (v.TryGetProperty("url", out var urlEl) && urlEl.ValueKind == JsonValueKind.String)
                        return urlEl.GetString() ?? "";
                }
                return "";

            case "terms_checkbox":
                if (v.ValueKind == JsonValueKind.True)  return "Accepted";
                if (v.ValueKind == JsonValueKind.False) return "";
                return v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : v.ToString();

            case "checkbox":
                if (v.ValueKind == JsonValueKind.Array)
                    return string.Join(", ", v.EnumerateArray()
                        .Where(e => e.ValueKind == JsonValueKind.String)
                        .Select(e => MapOpt(e.GetString() ?? "")));
                if (v.ValueKind == JsonValueKind.True)  return "Yes";
                if (v.ValueKind == JsonValueKind.False) return "";
                return v.ValueKind == JsonValueKind.String ? MapOpt(v.GetString() ?? "") : v.ToString();

            case "dropdown":
            case "radio":
                return v.ValueKind == JsonValueKind.String ? MapOpt(v.GetString() ?? "") : v.ToString();

            default:
                return v.ValueKind switch
                {
                    JsonValueKind.String => v.GetString() ?? "",
                    JsonValueKind.True   => "Yes",
                    JsonValueKind.False  => "",
                    JsonValueKind.Null or JsonValueKind.Undefined => "",
                    JsonValueKind.Array  => string.Join(", ", v.EnumerateArray()
                        .Where(e => e.ValueKind == JsonValueKind.String)
                        .Select(e => MapOpt(e.GetString() ?? ""))),
                    _ => v.ToString()
                };
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static void AddDetailRow(TableDescriptor table, string label, string value)
    {
        table.Cell().Padding(4).Text(label).Bold();
        table.Cell().Padding(4).Text(value);
    }

    private static string FormatAmount(decimal amount)
        => $"INR {amount:N2}";

    private static string? ExtractField(string formDataJson, string key)
    {
        try
        {
            using var doc = JsonDocument.Parse(formDataJson);
            if (doc.RootElement.TryGetProperty(key, out var el))
                return el.ValueKind == JsonValueKind.String ? el.GetString() : el.ToString();
        }
        catch { /* ignore */ }
        return null;
    }

    /// <summary>Find a field value by its form_config type (e.g., "name", "email").</summary>
    private static string? FindFieldValue(string formDataJson, string? formConfigJson, string fieldType)
    {
        if (string.IsNullOrEmpty(formConfigJson)) return null;
        try
        {
            using var formDoc   = JsonDocument.Parse(formDataJson);
            using var configDoc = JsonDocument.Parse(formConfigJson);
            if (!configDoc.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array) return null;

            foreach (var f in fieldsEl.EnumerateArray())
            {
                var type = f.TryGetProperty("type", out var tEl) ? tEl.GetString() : null;
                if (!string.Equals(type, fieldType, StringComparison.OrdinalIgnoreCase)) continue;
                var id = f.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrEmpty(id)) continue;

                if (formDoc.RootElement.TryGetProperty(id, out var valEl))
                {
                    var val = valEl.ValueKind == JsonValueKind.String ? valEl.GetString() : valEl.ToString();
                    if (!string.IsNullOrWhiteSpace(val)) return val;
                }
            }
        }
        catch { /* ignore */ }
        return null;
    }

    /// <summary>"name"-type fields store parts as {id}_first / {id}_middle / {id}_last.</summary>
    private static string? BuildNameFromSubfields(string formDataJson, string? formConfigJson)
    {
        if (string.IsNullOrEmpty(formConfigJson)) return null;
        try
        {
            using var formDoc   = JsonDocument.Parse(formDataJson);
            using var configDoc = JsonDocument.Parse(formConfigJson);
            if (!configDoc.RootElement.TryGetProperty("fields", out var fieldsEl) ||
                fieldsEl.ValueKind != JsonValueKind.Array) return null;

            foreach (var f in fieldsEl.EnumerateArray())
            {
                if (!f.TryGetProperty("type", out var tEl) || tEl.GetString() != "name") continue;
                var id = f.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrEmpty(id)) continue;

                string Get(string suffix) => formDoc.RootElement.TryGetProperty($"{id}_{suffix}", out var v)
                    && v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : "";

                var full = $"{Get("first")} {Get("middle")} {Get("last")}".Replace("  ", " ").Trim();
                if (!string.IsNullOrWhiteSpace(full)) return full;
            }
        }
        catch { /* ignore */ }
        return null;
    }

    /// <summary>Fallback: scan form_data for any value that looks like an email.</summary>
    private static string? ScanForEmail(string formDataJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(formDataJson);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Value.ValueKind != JsonValueKind.String) continue;
                var v = prop.Value.GetString();
                if (!string.IsNullOrEmpty(v) && v.Contains('@') && v.LastIndexOf('.') > v.IndexOf('@'))
                    return v;
            }
        }
        catch { /* ignore */ }
        return null;
    }
}
