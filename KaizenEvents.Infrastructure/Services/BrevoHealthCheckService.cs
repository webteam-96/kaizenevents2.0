using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Periodically verifies that the configured Brevo API key + outbound network to Brevo work.
/// If not, it logs a CRITICAL line every cycle — turning what was previously a silent, multi-day
/// email outage (bad/empty key or blocked egress after a deploy) into an immediately visible alarm.
/// It never sends email itself and never throws.
/// </summary>
public class BrevoHealthCheckService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<BrevoHealthCheckService> _logger;

    private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan Interval     = TimeSpan.FromMinutes(15);

    public BrevoHealthCheckService(
        IServiceScopeFactory scopeFactory,
        ILogger<BrevoHealthCheckService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(StartupDelay, stoppingToken); } catch { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var brevo = scope.ServiceProvider.GetRequiredService<IBrevoService>();
                var (ok, detail) = await brevo.VerifyConnectivityAsync();
                if (ok)
                    _logger.LogInformation("Brevo connectivity OK (account: {Account}). Transactional email is deliverable.", detail);
                else
                    _logger.LogCritical(
                        "BREVO EMAIL IS DOWN — registration confirmation emails will NOT be delivered. Reason: {Detail}",
                        detail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "BrevoHealthCheckService iteration failed");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch { return; }
        }
    }
}
