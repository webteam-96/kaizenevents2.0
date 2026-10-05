using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class RefundRepository : IRefundRepository
{
    private readonly AppDbContext _db;

    public RefundRepository(AppDbContext db) => _db = db;

    public Task<List<Refund>> GetByRegistrationIdAsync(string registrationId)
        => _db.Refunds.Where(r => r.RegistrationId == registrationId).ToListAsync();

    public async Task<Refund> CreateAsync(Refund refund)
    {
        _db.Refunds.Add(refund);
        await _db.SaveChangesAsync();
        return refund;
    }
}
