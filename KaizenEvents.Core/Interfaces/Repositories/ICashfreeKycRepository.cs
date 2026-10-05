using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface ICashfreeKycRepository
{
    Task<List<CashfreeKyc>> GetAllAsync();
    Task<CashfreeKyc?> GetByIdAsync(string id);
    Task<CashfreeKyc?> GetByVendorIdAsync(string vendorId);
    Task<CashfreeKyc?> GetByOnboardingTokenAsync(string token);
    Task<List<CashfreeKyc>> GetByCampaignIdAsync(string campaignId);
    Task<CashfreeKyc?> GetByCampaignAndRoleAsync(string campaignId, string role);

    Task CreateAsync(CashfreeKyc entity);
    Task UpdateAsync(CashfreeKyc entity);
    Task DeleteAsync(CashfreeKyc entity);

    Task<bool> VendorIdExistsAsync(string vendorId);

    /// <summary>Returns the single vendor flagged as the Kaizen default, or null if none configured.</summary>
    Task<CashfreeKyc?> GetDefaultKaizenVendorAsync();

    /// <summary>
    /// Atomically sets a vendor as the Kaizen default with the supplied percentage,
    /// clearing the flag from any other vendor in the same transaction.
    /// </summary>
    Task SetDefaultKaizenVendorAsync(string vendorId, decimal percentage);

    /// <summary>Clears the Kaizen-default flag from whichever vendor currently holds it.</summary>
    Task ClearDefaultKaizenVendorAsync();
}
