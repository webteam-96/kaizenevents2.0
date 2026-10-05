using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class WhatsAppTemplateRepository : IWhatsAppTemplateRepository
{
    private readonly AppDbContext _db;

    public WhatsAppTemplateRepository(AppDbContext db) => _db = db;

    public Task<List<WhatsAppTemplate>> GetByCampaignIdAsync(string campaignId)
        => _db.WhatsAppTemplates
            .Where(t => t.CampaignId == campaignId)
            .OrderBy(t => t.Trigger)
            .ToListAsync();

    public Task<List<WhatsAppTemplate>> GetAllAsync()
        => _db.WhatsAppTemplates.ToListAsync();

    public Task<WhatsAppTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger)
        => _db.WhatsAppTemplates.FirstOrDefaultAsync(t =>
            t.CampaignId == campaignId && t.Trigger == trigger);

    public Task<WhatsAppTemplate?> GetByIdAsync(string id)
        => _db.WhatsAppTemplates.FirstOrDefaultAsync(t => t.Id == id);

    public async Task<WhatsAppTemplate> UpdateAsync(WhatsAppTemplate template)
    {
        _db.WhatsAppTemplates.Update(template);
        await _db.SaveChangesAsync();
        return template;
    }

    public async Task CreateManyAsync(IEnumerable<WhatsAppTemplate> templates)
    {
        _db.WhatsAppTemplates.AddRange(templates);
        await _db.SaveChangesAsync();
    }
}
