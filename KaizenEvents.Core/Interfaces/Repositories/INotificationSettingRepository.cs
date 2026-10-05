using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface INotificationSettingRepository
{
    Task<NotificationSetting?> GetByCampaignIdAsync(string campaignId);
    Task<NotificationSetting> CreateAsync(NotificationSetting setting);
    Task<NotificationSetting> UpdateAsync(NotificationSetting setting);
    Task<NotificationSetting> UpsertAsync(NotificationSetting setting);
}
