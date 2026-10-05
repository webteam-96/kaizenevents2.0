using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IUrlShortcutRepository
{
    Task<UrlShortcut?> GetByIdAsync(string id);
    Task<UrlShortcut?> GetByShortCodeAsync(string shortCode);
    Task<List<UrlShortcut>> GetByCampaignIdAsync(string campaignId);
    Task<UrlShortcut> CreateAsync(UrlShortcut shortcut);
    Task<UrlShortcut> UpdateAsync(UrlShortcut shortcut);
    Task DeleteAsync(UrlShortcut shortcut);
}
