using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class AuditLogRepository : IAuditLogRepository
{
    private readonly AppDbContext _db;

    public AuditLogRepository(AppDbContext db) => _db = db;

    public Task<string?> GetLatestIntegrityHashAsync()
        => _db.AuditLogs
            .OrderByDescending(a => a.Id)
            .Select(a => (string?)a.IntegrityHash)
            .FirstOrDefaultAsync();

    public async Task<AuditLog> CreateAsync(AuditLog log)
    {
        _db.AuditLogs.Add(log);
        await _db.SaveChangesAsync();
        return log;
    }

    public Task<List<AuditLog>> GetAllAsync(int skip, int limit)
        => _db.AuditLogs
            .OrderByDescending(a => a.Timestamp)
            .Skip(skip).Take(limit)
            .ToListAsync();

    public Task<List<AuditLog>> GetByUserIdAsync(string userId, int skip, int limit)
        => _db.AuditLogs
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.Timestamp)
            .Skip(skip).Take(limit)
            .ToListAsync();

    public Task<List<AuditLog>> GetByResourceAsync(string resourceType, string resourceId)
        => _db.AuditLogs
            .Where(a => a.ResourceType == resourceType && a.ResourceId == resourceId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();

    public async Task<int> DeleteOlderThanAsync(DateTime cutoff)
    {
        var old = await _db.AuditLogs.Where(a => a.Timestamp < cutoff).ToListAsync();
        _db.AuditLogs.RemoveRange(old);
        await _db.SaveChangesAsync();
        return old.Count;
    }
}
