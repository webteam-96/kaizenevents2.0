using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IFundTransferRepository
{
    Task<FundTransfer?> GetByIdAsync(string id);
    Task<List<FundTransfer>> GetAllAsync();
    Task<List<FundTransfer>> GetByCampaignIdAsync(string campaignId);
    Task<string> GetNextRequestNumberAsync();
    Task<FundTransfer> CreateAsync(FundTransfer transfer);
    Task<FundTransfer> UpdateAsync(FundTransfer transfer);
}
