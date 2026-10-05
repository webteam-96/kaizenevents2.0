using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class NotificationLogRepository : INotificationLogRepository
{
    private readonly AppDbContext _db;

    public NotificationLogRepository(AppDbContext db) => _db = db;

    public Task<List<NotificationLog>> GetByCampaignIdAsync(string campaignId, int limit = 50)
        => _db.NotificationLogs
            .Where(n => n.CampaignId == campaignId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(limit)
            .ToListAsync();

    public async Task<NotificationLog> CreateAsync(NotificationLog log)
    {
        _db.NotificationLogs.Add(log);
        await _db.SaveChangesAsync();
        return log;
    }
}
