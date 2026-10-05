using KaizenEvents.Core.Interfaces.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Switches off coupons whose end date has passed, hourly.
///
/// This is bookkeeping, not enforcement. A lapsed coupon is already refused at
/// redemption by <c>CouponCalculator.CheckRedeemable</c>, which reads valid_until
/// directly — so a registrant can never use one regardless of whether this has run.
/// What this fixes is the admin's view: without it a coupon would sit there marked
/// Active forever with an end date in the past.
///
/// Runs once shortly after startup as well as on the interval, so a server that is
/// restarted more often than the interval still converges.
/// </summary>
public class CouponExpiryService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CouponExpiryService> _logger;

    private static readonly TimeSpan Interval    = TimeSpan.FromHours(1);
    private static readonly TimeSpan StartupWait = TimeSpan.FromMinutes(2);

    public CouponExpiryService(IServiceScopeFactory scopeFactory, ILogger<CouponExpiryService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let migrations and the rest of startup finish before touching the database.
        try { await Task.Delay(StartupWait, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var repo    = scope.ServiceProvider.GetRequiredService<ICouponCodeRepository>();
                var expired = await repo.DeactivateExpiredAsync(DateTime.UtcNow);
                if (expired > 0)
                    _logger.LogInformation("Coupon expiry: deactivated {Count} coupon(s) past their end date.", expired);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while deactivating expired coupons.");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
