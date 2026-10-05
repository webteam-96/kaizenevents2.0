using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IAuditLogRepository
{
    Task<string?> GetLatestIntegrityHashAsync();
    Task<AuditLog> CreateAsync(AuditLog log);
    Task<List<AuditLog>> GetAllAsync(int skip, int limit);
    Task<List<AuditLog>> GetByUserIdAsync(string userId, int skip, int limit);
    Task<List<AuditLog>> GetByResourceAsync(string resourceType, string resourceId);
    Task<int> DeleteOlderThanAsync(DateTime cutoff);
}
