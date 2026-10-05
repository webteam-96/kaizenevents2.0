using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IRegistrationRepository
{
    Task<Registration?> GetByIdAsync(string id);
    Task<Registration?> GetByInvoiceNumberAsync(string invoiceNumber);
    Task<List<Registration>> GetByCampaignIdAsync(string campaignId);
    Task<int> CountByCampaignIdAsync(string campaignId);
    Task<bool> MemberAlreadyRegisteredAsync(string campaignId, string memberId);
    Task<Registration> CreateAsync(Registration registration);
    Task<Registration> UpdateAsync(Registration registration);
}
