using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IPaymentAccountRepository
{
    Task<PaymentAccount?> GetByIdAsync(string id);
    Task<List<PaymentAccount>> GetAllAsync();
    Task<List<PaymentAccount>> GetActiveAsync();
    Task<bool> NameExistsAsync(string name, string? excludeId = null);
    Task<PaymentAccount> CreateAsync(PaymentAccount account);
    Task<PaymentAccount> UpdateAsync(PaymentAccount account);
    Task DeleteAsync(PaymentAccount account);
}
