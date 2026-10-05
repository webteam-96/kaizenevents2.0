using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Self-healing safety net for registration confirmation emails.
///
/// Every completed registration should end up with a notification_logs row of
/// type "confirmed"/status "sent". This worker periodically finds completed registrations
/// (within a recent window) that do NOT have a delivered confirmation and re-sends it via the
/// normal <see cref="IRegistrationEmailService"/> path — which records the new outcome.
///
/// Effect:
///  • Drains the existing backlog automatically once a broken key/network is fixed — no manual resend.
///  • Recovers from transient Brevo/network failures without losing the email.
///  • Structurally covers every completion path (free submit, paid verify, gateway callback), so a
///    missing send at any one call site can no longer cause a permanently lost confirmation.
///
/// Safety rails: bounded lookback window, an optional hard floor date, a max-attempts dead-letter,
/// and a per-cycle batch cap. Never throws.
/// </summary>
public class ConfirmationEmailReconciliationService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ConfirmationEmailReconciliationService> _logger;
    private readonly bool _enabled;
    private readonly int _windowDays;
    private readonly DateTime? _sinceFloorUtc;

    private static readonly TimeSpan StartupDelay  = TimeSpan.FromSeconds(90);
    private static readonly TimeSpan Interval      = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan MinAge        = TimeSpan.FromMinutes(3);  // let the inline send finish first
    private const int MaxAttempts   = 8;   // after this many failed tries, stop (dead-letter) — bad address / persistent issue
    private const int BatchPerCycle = 25;  // cap emails sent per run

    private const string ConfirmedType = "confirmed"; // must match RegistrationEmailService.ShortType(RegistrationConfirmed)

    public ConfirmationEmailReconciliationService(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<ConfirmationEmailReconciliationService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
        _enabled      = config.GetValue("ConfirmationEmail:ReconcileEnabled", true);
        _windowDays   = Math.Clamp(config.GetValue("ConfirmationEmail:ReconcileWindowDays", 5), 1, 60);
        _sinceFloorUtc = DateTime.TryParse(config["ConfirmationEmail:ReconcileSinceUtc"],
            null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
            out var floor) ? floor : null;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_enabled)
        {
            _logger.LogInformation("ConfirmationEmailReconciliation disabled via config.");
            return;
        }

        try { await Task.Delay(StartupDelay, stoppingToken); } catch { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await ReconcileAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "ConfirmationEmailReconciliation iteration failed"); }

            try { await Task.Delay(Interval, stoppingToken); } catch { return; }
        }
    }

    private async Task ReconcileAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db       = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var regEmail = scope.ServiceProvider.GetRequiredService<IRegistrationEmailService>();

        var now         = DateTime.UtcNow;
        var youngest    = now - MinAge;
        var windowStart = now - TimeSpan.FromDays(_windowDays);
        if (_sinceFloorUtc.HasValue && _sinceFloorUtc.Value > windowStart)
            windowStart = _sinceFloorUtc.Value;

        // Completed registrations in the window (over-fetch, then filter by their notification_logs).
        var candidates = await db.Set<Registration>()
            .Where(r => r.PaymentStatus == PaymentStatus.Completed
                     && r.CreatedAt >= windowStart
                     && r.CreatedAt <= youngest)
            .OrderBy(r => r.CreatedAt)
            .Take(BatchPerCycle * 6)
            .ToListAsync(ct);

        if (candidates.Count == 0) return;

        var ids = candidates.Select(r => r.Id).ToList();
        var logs = await db.NotificationLogs
            .Where(n => n.Type == ConfirmedType && n.RegistrationId != null && ids.Contains(n.RegistrationId))
            .Select(n => new { n.RegistrationId, n.Status })
            .ToListAsync(ct);

        var byReg = logs.GroupBy(l => l.RegistrationId!)
            .ToDictionary(g => g.Key, g => new
            {
                HasSent    = g.Any(x => x.Status == "sent"),
                HasSkipped = g.Any(x => x.Status == "skipped"),
                Failed     = g.Count(x => x.Status == "failed")
            });

        var toSend = new List<Registration>();
        foreach (var r in candidates)
        {
            if (byReg.TryGetValue(r.Id, out var s))
            {
                if (s.HasSent) continue;               // already delivered
                if (s.HasSkipped) continue;            // template intentionally off — terminal, never retry
                if (s.Failed >= MaxAttempts) continue; // dead-letter — stop retrying
            }
            toSend.Add(r);
            if (toSend.Count >= BatchPerCycle) break;
        }

        if (toSend.Count == 0) return;

        _logger.LogInformation(
            "ConfirmationEmailReconciliation: {Count} completed registration(s) missing a delivered confirmation — resending.",
            toSend.Count);

        var campaignCache = new Dictionary<string, Campaign?>();
        int sentOk = 0;
        foreach (var reg in toSend)
        {
            if (ct.IsCancellationRequested) return;
            try
            {
                if (!campaignCache.TryGetValue(reg.CampaignId, out var campaign))
                {
                    campaign = await db.Set<Campaign>().FirstOrDefaultAsync(c => c.Id == reg.CampaignId, ct);
                    campaignCache[reg.CampaignId] = campaign;
                }
                if (campaign == null) continue;

                // SendConfirmationAsync records the outcome (sent/failed) in notification_logs itself.
                var ok = await regEmail.SendConfirmationAsync(reg, campaign);
                if (ok) sentOk++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Reconciliation resend threw for registration {RegId}", reg.Id);
            }
        }

        _logger.LogInformation("ConfirmationEmailReconciliation: resent {Ok}/{Total} confirmation email(s).",
            sentOk, toSend.Count);
    }
}
