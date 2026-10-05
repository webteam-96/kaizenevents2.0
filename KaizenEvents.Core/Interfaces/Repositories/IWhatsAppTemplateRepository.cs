using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IWhatsAppTemplateRepository
{
    /// <summary>Returns all templates for a campaign in trigger order. Empty list if none seeded yet.</summary>
    Task<List<WhatsAppTemplate>> GetByCampaignIdAsync(string campaignId);

    /// <summary>Every template row across every campaign, in one query — for the cross-campaign
    /// management screen. Not filtered or paginated; matches this repo's other list reads.</summary>
    Task<List<WhatsAppTemplate>> GetAllAsync();

    /// <summary>Returns the single template for (campaignId, trigger), or null if not seeded.</summary>
    Task<WhatsAppTemplate?> GetByCampaignAndTriggerAsync(string campaignId, string trigger);

    Task<WhatsAppTemplate?> GetByIdAsync(string id);

    Task<WhatsAppTemplate> UpdateAsync(WhatsAppTemplate template);

    /// <summary>Bulk insert — used by the auto-seed when a campaign is created.</summary>
    Task CreateManyAsync(IEnumerable<WhatsAppTemplate> templates);
}
