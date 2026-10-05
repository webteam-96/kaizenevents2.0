namespace KaizenEvents.Core.Interfaces.Services;

public interface ILoginRateLimiterService
{
    /// <summary>
    /// Returns (isBlocked, retryAfterSeconds, remainingAttempts).
    /// </summary>
    (bool IsBlocked, int RetryAfter, int RemainingAttempts) CheckBlocked(string email, string ip);

    void RecordFailure(string email, string ip);

    void RecordSuccess(string email, string ip);
}
