using KaizenEvents.Core.Interfaces.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Background task that deletes audit_logs records older than 2 years, running daily.
/// MySQL has no TTL index, so this replaces the MongoDB TTL behaviour.
/// </summary>
public class AuditLogTtlService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AuditLogTtlService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan MaxAge = TimeSpan.FromDays(365 * 2);

    public AuditLogTtlService(IServiceScopeFactory scopeFactory, ILogger<AuditLogTtlService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(Interval, stoppingToken);
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<IAuditLogRepository>();
                var cutoff = DateTime.UtcNow - MaxAge;
                var deleted = await repo.DeleteOlderThanAsync(cutoff);
                if (deleted > 0)
                    _logger.LogInformation("Audit log TTL: deleted {Count} records older than {Cutoff:O}.", deleted, cutoff);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during audit log TTL purge.");
            }
        }
    }
}
