using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class NotificationSettingRepository : INotificationSettingRepository
{
    private readonly AppDbContext _db;

    public NotificationSettingRepository(AppDbContext db) => _db = db;

    public Task<NotificationSetting?> GetByCampaignIdAsync(string campaignId)
        => _db.NotificationSettings.FirstOrDefaultAsync(ns => ns.CampaignId == campaignId);

    public async Task<NotificationSetting> CreateAsync(NotificationSetting setting)
    {
        _db.NotificationSettings.Add(setting);
        await _db.SaveChangesAsync();
        return setting;
    }

    public async Task<NotificationSetting> UpdateAsync(NotificationSetting setting)
    {
        _db.NotificationSettings.Update(setting);
        await _db.SaveChangesAsync();
        return setting;
    }

    public async Task<NotificationSetting> UpsertAsync(NotificationSetting setting)
    {
        var existing = await _db.NotificationSettings.FirstOrDefaultAsync(ns => ns.CampaignId == setting.CampaignId);
        if (existing == null)
            return await CreateAsync(setting);
        // Update existing in-place
        _db.Entry(existing).CurrentValues.SetValues(setting);
        await _db.SaveChangesAsync();
        return existing;
    }
}
