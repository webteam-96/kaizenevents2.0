using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IEmailTemplateRepository
{
    /// <summary>Returns all 4 templates for a campaign in trigger order. Empty list if none seeded yet.</summary>
    Task<List<EmailTemplate>> GetByCampaignIdAsync(string campaignId);

    /// <summary>Returns the single template for (campaignId, trigger), or null if not seeded.</summary>
    Task<EmailTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger);

    Task<EmailTemplate?> GetByIdAsync(string id);

    Task<EmailTemplate> CreateAsync(EmailTemplate template);
    Task<EmailTemplate> UpdateAsync(EmailTemplate template);

    /// <summary>Bulk insert — used by the auto-seed when a campaign is created.</summary>
    Task CreateManyAsync(IEnumerable<EmailTemplate> templates);
}
