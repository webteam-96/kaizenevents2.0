using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class IntegrationSettingRepository : IIntegrationSettingRepository
{
    private readonly AppDbContext _db;

    public IntegrationSettingRepository(AppDbContext db) => _db = db;

    public Task<IntegrationSetting?> GetByTypeAsync(string type)
        => _db.IntegrationSettings.FirstOrDefaultAsync(i => i.Type == type);

    public async Task<IntegrationSetting> CreateOrUpdateAsync(IntegrationSetting setting)
    {
        var existing = await _db.IntegrationSettings.FirstOrDefaultAsync(i => i.Type == setting.Type);
        if (existing == null)
        {
            _db.IntegrationSettings.Add(setting);
        }
        else
        {
            existing.CredentialsJson = setting.CredentialsJson;
            existing.Config = setting.Config;
            existing.UpdatedAt = setting.UpdatedAt;
        }
        await _db.SaveChangesAsync();
        return existing ?? setting;
    }
}
