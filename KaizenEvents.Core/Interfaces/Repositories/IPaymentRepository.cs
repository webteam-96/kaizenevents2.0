using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IPaymentRepository
{
    Task<Payment?> GetByIdAsync(string id);
    Task<Payment?> GetByRegistrationIdAsync(string registrationId);
    Task<Payment?> GetByGatewayOrderIdAsync(string orderId);
    Task<Payment?> GetByGatewayPaymentIdAsync(string gatewayPaymentId);
    Task<Payment?> GetByGatewayPaymentRequestIdAsync(string requestId);
    Task<Payment> CreateAsync(Payment payment);
    Task<Payment> UpdateAsync(Payment payment);

    /// <summary>
    /// Sum of (gateway_fee + gateway_tax) for completed payments in a campaign.
    /// Used by the Fund Transfers dashboard to display real gateway charges.
    /// </summary>
    Task<decimal> GetTotalGatewayChargesByCampaignAsync(string campaignId);

    /// <summary>
    /// Returns completed payments for a campaign that don't yet have settlement data populated
    /// (gateway_fee / gateway_tax are NULL). Used by the SyncSettlements backfill endpoint.
    /// </summary>
    Task<List<Payment>> GetCompletedUnsyncedByCampaignAsync(string campaignId);

    /// <summary>
    /// All completed payments for a campaign, regardless of settlement sync state.
    /// Used by the archive backfill (so already-fee-synced payments still get archive rows created).
    /// </summary>
    Task<List<Payment>> GetCompletedByCampaignAsync(string campaignId);
}
