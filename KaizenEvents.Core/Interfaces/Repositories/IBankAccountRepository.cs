using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IBankAccountRepository
{
    Task<BankAccount?> GetByIdAsync(string id);
    Task<BankAccount?> GetByCampaignIdAsync(string campaignId);
    Task<BankAccount> CreateAsync(BankAccount account);
    Task<BankAccount> UpdateAsync(BankAccount account);
}
