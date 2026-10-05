using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Background task that purges expired entries from the token blacklist every 5 minutes.
/// </summary>
public class TokenBlacklistCleanupService : BackgroundService
{
    private readonly ITokenBlacklistService _blacklist;
    private readonly ILogger<TokenBlacklistCleanupService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    public TokenBlacklistCleanupService(
        ITokenBlacklistService blacklist,
        ILogger<TokenBlacklistCleanupService> logger)
    {
        _blacklist = blacklist;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(Interval, stoppingToken);
            try
            {
                _blacklist.Cleanup();
                _logger.LogDebug("Token blacklist cleanup completed.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during token blacklist cleanup.");
            }
        }
    }
}
