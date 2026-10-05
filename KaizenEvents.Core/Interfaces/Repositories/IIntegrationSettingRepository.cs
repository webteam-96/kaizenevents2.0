using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IIntegrationSettingRepository
{
    Task<IntegrationSetting?> GetByTypeAsync(string type);
    Task<IntegrationSetting> CreateOrUpdateAsync(IntegrationSetting setting);
}
