using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IRazorpayRouteAccountRepository
{
    Task<List<RazorpayRouteAccount>> GetAllAsync();
    Task<RazorpayRouteAccount?> GetByIdAsync(string id);
    Task<RazorpayRouteAccount?> GetByAccountIdAsync(string accountId);
    Task<bool> AccountIdExistsAsync(string accountId);
    Task<RazorpayRouteAccount> CreateAsync(RazorpayRouteAccount account);
    Task<RazorpayRouteAccount> UpdateAsync(RazorpayRouteAccount account);
    Task DeleteAsync(RazorpayRouteAccount account);

    Task<RazorpayRouteAccount?> GetDefaultKaizenVendorAsync();
    Task SetDefaultKaizenVendorAsync(string id, decimal percentage);
    Task ClearDefaultKaizenVendorAsync();
}
