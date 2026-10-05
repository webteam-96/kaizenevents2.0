using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Per-campaign WhatsApp templates. Renders a trigger into an approved template name + ordered
/// body values (placeholders resolved from form_data + campaign). The placeholder/value-map and
/// contact-resolution logic intentionally mirrors <see cref="EmailTemplateService"/> so ${...}
/// tokens behave identically across email and WhatsApp.
/// </summary>
public class WhatsAppTemplateService : IWhatsAppTemplateService
{
    private readonly IWhatsAppTemplateRepository _repo;
    private readonly IRegistrationRepository _registrations;
    private readonly ICampaignRepository _campaigns;
    private readonly IConfiguration _config;
    private readonly ILogger<WhatsAppTemplateService> _logger;

    // ${name} or ${field:Some Label} — capture the inside.
    private static readonly Regex PlaceholderRegex = new(@"\$\{(?<expr>[^}]+)\}", RegexOptions.Compiled);

    public WhatsAppTemplateService(
        IWhatsAppTemplateRepository repo,
        IRegistrationRepository registrations,
        ICampaignRepository campaigns,
        IConfiguration config,
        ILogger<WhatsAppTemplateService> logger)
    {
        _repo          = repo;
        _registrations = registrations;
        _campaigns     = campaigns;
        _config        = config;
        _logger        = logger;
    }

    // Both standard options share the same shape: one approved template shared by every event,
    // named in server config, with body values fixed by the approved wording rather than
    // admin-editable.
    private static readonly HashSet<string> CommonTriggers = new(StringComparer.OrdinalIgnoreCase)
    {
        WhatsAppTemplateTrigger.CommonConfirmation,
        WhatsAppTemplateTrigger.CommonConfirmationDetailed
    };

    private static bool IsCommon(string trigger) => CommonTriggers.Contains(trigger);

    private static string[] CommonBodyValuesFor(string trigger) =>
        string.Equals(trigger, WhatsAppTemplateTrigger.CommonConfirmationDetailed, StringComparison.OrdinalIgnoreCase)
            ? IWhatsAppTemplateService.CommonBodyValuesDetailed
            : IWhatsAppTemplateService.CommonBodyValues;

    private static string CommonConfigKeyFor(string trigger) =>
        string.Equals(trigger, WhatsAppTemplateTrigger.CommonConfirmationDetailed, StringComparison.OrdinalIgnoreCase)
            ? "Interakt:CommonTemplateNameDetailed"
            : "Interakt:CommonTemplateName";

    public string EffectiveTemplateName(string trigger, string? templateName)
    {
        var name = (templateName ?? "").Trim();
        if (!string.IsNullOrEmpty(name) || !IsCommon(trigger)) return name;
        // Each standard option is one approved template shared by every event, so its name
        // belongs in server config — set it once and every campaign picks it up, including
        // campaigns created before it was configured.
        return (_config[CommonConfigKeyFor(trigger)] ?? "").Trim();
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    public Task<List<WhatsAppTemplate>> GetByCampaignIdAsync(string campaignId)
        => _repo.GetByCampaignIdAsync(campaignId);

    public Task<List<WhatsAppTemplate>> GetAllAsync()
        => _repo.GetAllAsync();

    public Task<WhatsAppTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger)
        => _repo.GetByCampaignAndTriggerAsync(campaignId, trigger);

    // ── Update ────────────────────────────────────────────────────────────────

    public async Task<WhatsAppTemplate> UpdateAsync(string id, UpdateWhatsAppTemplateRequest req)
    {
        var t = await _repo.GetByIdAsync(id)
                ?? throw new InvalidOperationException($"WhatsApp template {id} not found.");
        t.TemplateName = (req.TemplateName ?? "").Trim();
        t.LanguageCode = string.IsNullOrWhiteSpace(req.LanguageCode) ? "en" : req.LanguageCode.Trim();
        t.CountryCode  = string.IsNullOrWhiteSpace(req.CountryCode) ? "91" : new string(req.CountryCode.Where(char.IsDigit).ToArray());
        if (string.IsNullOrEmpty(t.CountryCode)) t.CountryCode = "91";
        // A standard template's variables are dictated by its approved wording, so they are
        // fixed here rather than trusted from the request — a caller cannot misconfigure them.
        t.BodyValues   = IsCommon(t.Trigger)
            ? JsonSerializer.Serialize(CommonBodyValuesFor(t.Trigger))
            : req.BodyValues is { Count: > 0 } ? JsonSerializer.Serialize(req.BodyValues) : null;
        t.IsActive     = req.IsActive;
        t.UpdatedAt    = DateTime.UtcNow;
        var saved = await _repo.UpdateAsync(t);

        // Standard and custom are two ways to send the SAME confirmation. Turning one on turns
        // the other off, so a registrant can never receive both.
        if (saved.IsActive && IWhatsAppTemplateService.ConfirmationTriggers.Contains(saved.Trigger))
            await DeactivateOtherConfirmationAsync(saved);

        return saved;
    }

    private async Task DeactivateOtherConfirmationAsync(WhatsAppTemplate active)
    {
        var otherTriggers = IWhatsAppTemplateService.ConfirmationTriggers
            .Where(x => !string.Equals(x, active.Trigger, StringComparison.OrdinalIgnoreCase));

        foreach (var otherTrigger in otherTriggers)
        {
            var other = await _repo.GetByCampaignAndTriggerAsync(active.CampaignId, otherTrigger);
            if (other == null || !other.IsActive) continue;

            other.IsActive  = false;
            other.UpdatedAt = DateTime.UtcNow;
            await _repo.UpdateAsync(other);
            _logger.LogInformation(
                "Campaign {CampaignId}: switched WhatsApp confirmation to '{On}', so '{Off}' was turned off.",
                active.CampaignId, active.Trigger, otherTrigger);
        }
    }

    // ── Seed defaults ─────────────────────────────────────────────────────────

    public async Task SeedDefaultsAsync(string campaignId)
    {
        var existing = await _repo.GetByCampaignIdAsync(campaignId);
        var have = existing.Select(t => t.Trigger).ToHashSet();
        var now = DateTime.UtcNow;
        var toCreate = new List<WhatsAppTemplate>();
        foreach (var trigger in IWhatsAppTemplateService.Triggers)
        {
            if (have.Contains(trigger)) continue;
            toCreate.Add(new WhatsAppTemplate
            {
                Id           = Guid.NewGuid().ToString(),
                CampaignId   = campaignId,
                Trigger      = trigger,
                IsActive     = false,          // opt-in — needs an approved template configured first
                TemplateName = "",
                LanguageCode = "en",
                CountryCode  = "91",
                BodyValues   = JsonSerializer.Serialize(DefaultBodyValues(trigger)),
                CreatedAt    = now,
                UpdatedAt    = now
            });
        }
        if (toCreate.Count > 0)
            await _repo.CreateManyAsync(toCreate);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    public async Task<RenderedWhatsApp?> RenderAsync(
        string campaignId, string trigger, Registration registration, Campaign campaign, RenderContext? extra = null)
    {
        // The registration-confirmed moment has three possible senders. Callers stay unaware of
        // that: they fire the trigger they always fired, and a standard template answers when
        // the campaign is set to use it. UpdateAsync keeps them mutually exclusive; this
        // precedence just makes the outcome deterministic if a row is ever edited directly.
        var template = string.Equals(trigger, WhatsAppTemplateTrigger.RegistrationConfirmed, StringComparison.OrdinalIgnoreCase)
            ? await ResolveActiveAsync(campaignId, WhatsAppTemplateTrigger.CommonConfirmation)
              ?? await ResolveActiveAsync(campaignId, WhatsAppTemplateTrigger.CommonConfirmationDetailed)
              ?? await ResolveActiveAsync(campaignId, trigger)
            : await ResolveActiveAsync(campaignId, trigger);

        if (template == null) return null;

        var values = BuildValueMap(registration, campaign, extra);
        return RenderTemplate(template, values);
    }

    /// <summary>The template for this trigger, or null when it is disabled or names no approved template.</summary>
    private async Task<WhatsAppTemplate?> ResolveActiveAsync(string campaignId, string trigger)
    {
        var t = await _repo.GetByCampaignAndTriggerAsync(campaignId, trigger);
        if (t == null || !t.IsActive) return null;
        return string.IsNullOrWhiteSpace(EffectiveTemplateName(t.Trigger, t.TemplateName)) ? null : t;
    }

    public async Task<RenderedWhatsApp?> RenderPreviewAsync(string campaignId, string trigger)
    {
        var template = await _repo.GetByCampaignAndTriggerAsync(campaignId, trigger);
        // Preview deliberately ignores IsActive — the admin is checking what WOULD be sent.
        if (template == null || string.IsNullOrWhiteSpace(EffectiveTemplateName(template.Trigger, template.TemplateName)))
            return null;

        var regs = await _registrations.GetByCampaignIdAsync(campaignId);
        var sample = regs.OrderByDescending(r => r.CreatedAt).FirstOrDefault();
        var campaign = await _campaigns.GetByIdAsync(campaignId);

        Dictionary<string, string> values;
        if (sample != null && campaign != null)
        {
            values = BuildValueMap(sample, campaign, new RenderContext("RCPT-PREVIEW-12345678", "123456"));
        }
        else
        {
            values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["name"]             = "John Doe",
                ["email"]            = "john.doe@example.com",
                ["phone"]            = "9876543210",
                ["event_name"]       = "Sample Event",
                ["organization"]     = "Sample Organization",
                ["amount"]           = "Rs. 1,500.00",
                ["invoice_number"]   = "INV-20260518-PREVIEW1",
                ["registration_id"]  = "PREVIEW0",
                ["registration_date"]= FormatIst(DateTime.UtcNow, "dd MMM yyyy, hh:mm tt"),
                ["payment_status"]   = "completed",
                ["receipt_number"]   = "RCPT-PREVIEW-12345678",
                ["otp"]              = "123456",
                ["event_date"]       = DateTime.UtcNow.AddDays(7).ToString("dd MMM yyyy", CultureInfo.InvariantCulture)
            };
        }

        return RenderTemplate(template, values);
    }

    public async Task<RenderedWhatsApp?> RenderReminderAsync(Campaign campaign, string memberName, string memberPhone)
    {
        var template = await _repo.GetByCampaignAndTriggerAsync(campaign.Id, WhatsAppTemplateTrigger.RegistrationReminder);
        if (template == null || !template.IsActive || string.IsNullOrWhiteSpace(template.TemplateName))
            return null;

        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["name"]              = string.IsNullOrWhiteSpace(memberName) ? "Member" : memberName,
            ["phone"]             = memberPhone ?? "",
            ["event_name"]        = campaign.Name ?? "",
            ["organization"]      = campaign.OrganizationName ?? "",
            ["registration_date"] = FormatIst(DateTime.UtcNow, "dd MMM yyyy, hh:mm tt"),
            ["event_date"]        = campaign.StartDate?.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) ?? "",
            ["amount"]            = "",
            ["invoice_number"]    = "",
            ["registration_id"]   = "",
            ["payment_status"]    = "",
            ["receipt_number"]    = "",
            ["otp"]               = "",
            ["email"]             = ""
        };
        // Members have no form_data — use their phone directly as the recipient.
        var rendered = RenderTemplate(template, values);
        return rendered with { Phone = string.IsNullOrWhiteSpace(rendered.Phone) ? (memberPhone ?? "") : rendered.Phone };
    }

    // ── Defaults ────────────────────────────────────────────────────────────
    // Suggested body-variable order; the admin overrides these to match their approved template.

    private static List<string> DefaultBodyValues(string trigger) => trigger switch
    {
        // Fixed, not merely suggested — see UpdateAsync.
        WhatsAppTemplateTrigger.CommonConfirmation         => IWhatsAppTemplateService.CommonBodyValues.ToList(),
        WhatsAppTemplateTrigger.CommonConfirmationDetailed => IWhatsAppTemplateService.CommonBodyValuesDetailed.ToList(),
        WhatsAppTemplateTrigger.RegistrationConfirmed      => new() { "${name}", "${event_name}", "${registration_id}", "${amount}" },
        WhatsAppTemplateTrigger.PaymentReceived            => new() { "${name}", "${event_name}", "${receipt_number}", "${amount}" },
        WhatsAppTemplateTrigger.PaymentOtp                 => new() { "${name}", "${event_name}", "${otp}", "${amount}" },
        WhatsAppTemplateTrigger.RegistrationReminder       => new() { "${name}", "${event_name}", "${organization}" },
        _                                                  => new()
    };

    // ── Render internals ──────────────────────────────────────────────────────

    private RenderedWhatsApp RenderTemplate(WhatsAppTemplate template, Dictionary<string, string> values)
    {
        string Substitute(string? input) =>
            string.IsNullOrEmpty(input) ? "" : PlaceholderRegex.Replace(input, m =>
            {
                var expr = m.Groups["expr"].Value.Trim();
                return values.TryGetValue(expr, out var v) ? v : "";
            });

        var bodyValues = ParseList(template.BodyValues).Select(Substitute).ToList();
        var phone = values.TryGetValue("phone", out var p) ? (p ?? "") : "";
        var toName = values.TryGetValue("name", out var n) ? (n ?? "") : "";

        return new RenderedWhatsApp(
            Phone        : phone,
            CountryCode  : string.IsNullOrWhiteSpace(template.CountryCode) ? "91" : template.CountryCode,
            TemplateName : EffectiveTemplateName(template.Trigger, template.TemplateName),
            LanguageCode : string.IsNullOrWhiteSpace(template.LanguageCode) ? "en" : template.LanguageCode,
            BodyValues   : bodyValues,
            ToName       : toName);
    }

    private static List<string> ParseList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }

    // ── Value map + contact resolution (mirrors EmailTemplateService) ──────────

    private static Dictionary<string, string> BuildValueMap(Registration reg, Campaign campaign, RenderContext? extra)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var (regName, regEmail, regPhone) = ResolveContactFromForm(reg, campaign);

        map["name"]              = regName;
        map["email"]             = regEmail;
        map["phone"]             = regPhone;
        map["event_name"]        = campaign.Name ?? "";
        map["organization"]      = campaign.OrganizationName ?? "";
        map["amount"]            = $"Rs. {reg.TotalAmount:N2}";
        map["invoice_number"]    = reg.InvoiceNumber ?? "";
        map["registration_id"]   = reg.RegistrationNumber ??
                                   (reg.Id.Length >= 8 ? reg.Id[..8].ToUpperInvariant() : reg.Id.ToUpperInvariant());
        map["registration_date"] = FormatIst(reg.CreatedAt, "dd MMM yyyy, hh:mm tt");
        map["payment_status"]    = reg.PaymentStatus.ToString().ToLowerInvariant();
        map["receipt_number"]    = extra?.ReceiptNumber ?? reg.ReceiptNumber ?? "";
        map["otp"]               = extra?.Otp ?? reg.OtpCode ?? "";
        map["event_date"]        = campaign.StartDate.HasValue
            ? campaign.StartDate.Value.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)
            : "";

        if (!string.IsNullOrWhiteSpace(reg.FormData) && !string.IsNullOrWhiteSpace(campaign.FormConfig))
        {
            try
            {
                using var dataDoc = JsonDocument.Parse(reg.FormData);
                using var cfgDoc  = JsonDocument.Parse(campaign.FormConfig);

                // A question the registrant never saw resolves to nothing, even if an answer
                // they switched away from is still sitting in form_data on an older row.
                var hidden = FieldVisibility.AllHiddenFieldIds(campaign.FormConfig, reg.FormData);

                if (cfgDoc.RootElement.TryGetProperty("fields", out var fieldsEl) &&
                    fieldsEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var field in fieldsEl.EnumerateArray())
                    {
                        var label = field.TryGetProperty("label", out var lEl) ? lEl.GetString() : null;
                        var id    = field.TryGetProperty("id",    out var iEl) ? iEl.GetString() : null;
                        var type  = field.TryGetProperty("type",  out var tEl) ? tEl.GetString() : null;
                        if (string.IsNullOrWhiteSpace(label) || string.IsNullOrWhiteSpace(id)) continue;

                        if (hidden.Contains(id))
                        {
                            map[$"field:{label}"] = "";
                            map[$"field:{id}"]    = "";
                            continue;
                        }

                        // Choice answers are stored as slugs; show the label the
                        // registrant picked, not "thana_west".
                        var val = FormContact.ReadFieldValue(dataDoc.RootElement, field, id, type);
                        map[$"field:{label}"] = val;
                        map[$"field:{id}"]    = val;
                    }
                }
            }
            catch { /* ignore parse errors */ }
        }

        return map;
    }

    private static string FormatIst(DateTime utc, string format)
    {
        var ist = DateTime.SpecifyKind(utc, DateTimeKind.Utc).AddHours(5).AddMinutes(30);
        return ist.ToString(format, CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Who this registration belongs to. Shared with the email path so both address the
    /// same person.
    /// </summary>
    private static (string Name, string Email, string Phone) ResolveContactFromForm(
        Registration reg, Campaign campaign) =>
        FormContact.Resolve(campaign.FormConfig, reg.FormData);
}
