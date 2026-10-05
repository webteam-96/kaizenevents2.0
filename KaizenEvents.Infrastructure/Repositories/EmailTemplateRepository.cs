using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class EmailTemplateRepository : IEmailTemplateRepository
{
    private readonly AppDbContext _db;

    public EmailTemplateRepository(AppDbContext db) => _db = db;

    public Task<List<EmailTemplate>> GetByCampaignIdAsync(string campaignId)
        => _db.EmailTemplates
            .Where(t => t.CampaignId == campaignId)
            .OrderBy(t => t.Trigger)
            .ToListAsync();

    public Task<EmailTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger)
        => _db.EmailTemplates.FirstOrDefaultAsync(t =>
            t.CampaignId == campaignId && t.Trigger == trigger);

    public Task<EmailTemplate?> GetByIdAsync(string id)
        => _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == id);

    public async Task<EmailTemplate> CreateAsync(EmailTemplate template)
    {
        _db.EmailTemplates.Add(template);
        await _db.SaveChangesAsync();
        return template;
    }

    public async Task<EmailTemplate> UpdateAsync(EmailTemplate template)
    {
        _db.EmailTemplates.Update(template);
        await _db.SaveChangesAsync();
        return template;
    }

    public async Task CreateManyAsync(IEnumerable<EmailTemplate> templates)
    {
        _db.EmailTemplates.AddRange(templates);
        await _db.SaveChangesAsync();
    }
}
