using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class PaymentRepository : IPaymentRepository
{
    private readonly AppDbContext _db;

    public PaymentRepository(AppDbContext db) => _db = db;

    public Task<Payment?> GetByIdAsync(string id)
        => _db.Payments.FirstOrDefaultAsync(p => p.Id == id);

    public Task<Payment?> GetByRegistrationIdAsync(string registrationId)
        => _db.Payments
            .Where(p => p.RegistrationId == registrationId)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync();

    public Task<Payment?> GetByGatewayOrderIdAsync(string orderId)
        => _db.Payments.FirstOrDefaultAsync(p => p.GatewayOrderId == orderId);

    public Task<Payment?> GetByGatewayPaymentIdAsync(string gatewayPaymentId)
        => _db.Payments.FirstOrDefaultAsync(p => p.GatewayPaymentId == gatewayPaymentId);

    public Task<Payment?> GetByGatewayPaymentRequestIdAsync(string requestId)
        => _db.Payments.FirstOrDefaultAsync(p => p.GatewayPaymentRequestId == requestId);

    public async Task<Payment> CreateAsync(Payment payment)
    {
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();
        return payment;
    }

    public async Task<Payment> UpdateAsync(Payment payment)
    {
        _db.Payments.Update(payment);
        await _db.SaveChangesAsync();
        return payment;
    }

    public async Task<decimal> GetTotalGatewayChargesByCampaignAsync(string campaignId)
    {
        // Only count completed payments. Treat null fee/tax as 0.
        var rows = await _db.Payments
            .Where(p => p.CampaignId == campaignId && p.Status == "completed")
            .Select(p => new { Fee = p.GatewayFee ?? 0m, Tax = p.GatewayTax ?? 0m })
            .ToListAsync();
        return rows.Sum(r => r.Fee + r.Tax);
    }

    public async Task<List<Payment>> GetCompletedUnsyncedByCampaignAsync(string campaignId)
    {
        return await _db.Payments
            .Where(p => p.CampaignId == campaignId
                     && p.Status == "completed"
                     && (p.GatewayFee == null || p.SettlementSyncedAt == null))
            .ToListAsync();
    }

    public async Task<List<Payment>> GetCompletedByCampaignAsync(string campaignId)
    {
        return await _db.Payments
            .Where(p => p.CampaignId == campaignId && p.Status == "completed")
            .ToListAsync();
    }
}
