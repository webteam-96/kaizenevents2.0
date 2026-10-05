using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface INotificationLogRepository
{
    Task<List<NotificationLog>> GetByCampaignIdAsync(string campaignId, int limit = 50);
    Task<NotificationLog> CreateAsync(NotificationLog log);
}
