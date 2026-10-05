using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class UrlShortcutRepository : IUrlShortcutRepository
{
    private readonly AppDbContext _db;

    public UrlShortcutRepository(AppDbContext db) => _db = db;

    public Task<UrlShortcut?> GetByIdAsync(string id)
        => _db.UrlShortcuts.FirstOrDefaultAsync(u => u.Id == id);

    public Task<UrlShortcut?> GetByShortCodeAsync(string shortCode)
        => _db.UrlShortcuts.FirstOrDefaultAsync(u => u.ShortCode == shortCode);

    public Task<List<UrlShortcut>> GetByCampaignIdAsync(string campaignId)
        => _db.UrlShortcuts.Where(u => u.CampaignId == campaignId).ToListAsync();

    public async Task<UrlShortcut> CreateAsync(UrlShortcut shortcut)
    {
        _db.UrlShortcuts.Add(shortcut);
        await _db.SaveChangesAsync();
        return shortcut;
    }

    public async Task<UrlShortcut> UpdateAsync(UrlShortcut shortcut)
    {
        _db.UrlShortcuts.Update(shortcut);
        await _db.SaveChangesAsync();
        return shortcut;
    }

    public async Task DeleteAsync(UrlShortcut shortcut)
    {
        _db.UrlShortcuts.Remove(shortcut);
        await _db.SaveChangesAsync();
    }
}
