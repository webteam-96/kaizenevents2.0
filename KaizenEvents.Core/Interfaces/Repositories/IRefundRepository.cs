using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IRefundRepository
{
    Task<List<Refund>> GetByRegistrationIdAsync(string registrationId);
    Task<Refund> CreateAsync(Refund refund);
}
