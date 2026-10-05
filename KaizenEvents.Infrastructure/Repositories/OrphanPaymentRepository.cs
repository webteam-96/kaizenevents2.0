using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class OrphanPaymentRepository : IOrphanPaymentRepository
{
    private readonly AppDbContext _db;

    public OrphanPaymentRepository(AppDbContext db) => _db = db;

    public Task<OrphanPayment?> GetByIdAsync(string id)
        => _db.OrphanPayments.FirstOrDefaultAsync(op => op.Id == id);

    public Task<OrphanPayment?> GetByGatewayPaymentIdAsync(string gatewayPaymentId)
        => _db.OrphanPayments.FirstOrDefaultAsync(op => op.GatewayPaymentId == gatewayPaymentId);

    public Task<List<OrphanPayment>> GetAllAsync()
        => _db.OrphanPayments.OrderByDescending(op => op.CreatedAt).ToListAsync();

    public async Task<OrphanPayment> CreateAsync(OrphanPayment payment)
    {
        _db.OrphanPayments.Add(payment);
        await _db.SaveChangesAsync();
        return payment;
    }

    public async Task<OrphanPayment> UpdateAsync(OrphanPayment payment)
    {
        _db.OrphanPayments.Update(payment);
        await _db.SaveChangesAsync();
        return payment;
    }
}
