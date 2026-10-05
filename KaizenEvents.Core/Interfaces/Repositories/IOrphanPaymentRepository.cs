using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IOrphanPaymentRepository
{
    Task<OrphanPayment?> GetByIdAsync(string id);
    Task<OrphanPayment?> GetByGatewayPaymentIdAsync(string gatewayPaymentId);
    Task<List<OrphanPayment>> GetAllAsync();
    Task<OrphanPayment> CreateAsync(OrphanPayment payment);
    Task<OrphanPayment> UpdateAsync(OrphanPayment payment);
}
