using System.Text.Json;
using KaizenEvents.Core.Enums;
using KaizenEvents.Shared.Helpers;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Background task that finds registrations left in "pending payment" state for &gt;15 min
/// and sends the user an email with a resume-payment URL. Sends once per registration.
/// </summary>
public class PendingPaymentReminderService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PendingPaymentReminderService> _logger;
    private readonly string _frontendUrl;

    private static readonly TimeSpan Interval             = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan AbandonmentThreshold = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan MaxAge               = TimeSpan.FromHours(72);

    public PendingPaymentReminderService(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<PendingPaymentReminderService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
        _frontendUrl  = config["App:FrontendUrl"] ?? "http://localhost:3000";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial delay so we don't spam on startup
        try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); } catch { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "PendingPaymentReminderService iteration failed");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch { return; }
        }
    }

    private async Task ProcessAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IBrevoService>();

        var now    = DateTime.UtcNow;
        var cutoff = now - AbandonmentThreshold;
        var tooOld = now - MaxAge;

        // Find pending registrations older than threshold, younger than MaxAge, no reminder sent yet
        var candidates = await db.Set<KaizenEvents.Core.Entities.Registration>()
            .Where(r => r.PaymentStatus == PaymentStatus.Pending
                     && r.RegistrationStatus == RegistrationStatus.Submitted
                     && r.CreatedAt <= cutoff
                     && r.CreatedAt >= tooOld
                     && r.ReminderSentAt == null
                     && r.TotalAmount > 0
                     && r.PaymentToken != null)
            .Take(50) // batch
            .ToListAsync(ct);

        if (candidates.Count == 0) return;

        _logger.LogInformation("PendingPaymentReminder: processing {Count} registration(s)", candidates.Count);

        foreach (var reg in candidates)
        {
            if (ct.IsCancellationRequested) return;
            try
            {
                var campaign = await db.Set<KaizenEvents.Core.Entities.Campaign>()
                    .FirstOrDefaultAsync(c => c.Id == reg.CampaignId, ct);
                if (campaign == null) continue;

                var (resolvedName, toEmail, _) = FormContact.Resolve(campaign.FormConfig, reg.FormData);
                var name = string.IsNullOrWhiteSpace(resolvedName) ? "there" : resolvedName;
                if (string.IsNullOrWhiteSpace(toEmail))
                {
                    // No email to send to — mark as sent so we don't keep scanning
                    reg.ReminderSentAt = now;
                    continue;
                }

                var resumeUrl = $"{_frontendUrl.TrimEnd('/')}/pay/{reg.Id}?token={Uri.EscapeDataString(reg.PaymentToken!)}";

                var html = $@"
<h2>Complete Your Registration</h2>
<p>Hello {System.Net.WebUtility.HtmlEncode(name)},</p>
<p>Your registration for <strong>{System.Net.WebUtility.HtmlEncode(campaign.Name)}</strong> is almost done. The payment wasn't completed last time — click below to finish.</p>
<p style='margin:24px 0;'>
  <a href='{resumeUrl}' style='background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;'>Complete Payment — INR {reg.TotalAmount:F2}</a>
</p>
<p style='color:#666;font-size:14px;'>Or copy this link into your browser:<br/><span style='word-break:break-all;color:#7c3aed;'>{resumeUrl}</span></p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— {System.Net.WebUtility.HtmlEncode(campaign.OrganizationName)}</p>";

                var sent = await email.SendEmailAsync(
                    toEmail,
                    resolvedName,
                    $"Complete your registration for {campaign.Name}",
                    html);

                reg.ReminderSentAt = now;
                if (!sent)
                    _logger.LogWarning("Reminder email failed for registration {Id}", reg.Id);
                else
                    _logger.LogInformation("Sent payment reminder for registration {Id} to {Email}", reg.Id, toEmail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed processing reminder for registration {Id}", reg.Id);
            }
        }

        await db.SaveChangesAsync(ct);
    }
}
