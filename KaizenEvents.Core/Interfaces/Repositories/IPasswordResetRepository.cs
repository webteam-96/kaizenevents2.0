using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IPasswordResetRepository
{
    Task<PasswordReset?> GetUnusedByEmailAndCodeAsync(string email, string code);
    Task<PasswordReset> CreateAsync(PasswordReset reset);
    Task MarkUsedAsync(long id);
    Task DeleteExpiredAsync(TimeSpan maxAge);
}
