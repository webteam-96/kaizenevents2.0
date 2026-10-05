using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class RegistrationRepository : IRegistrationRepository
{
    private readonly AppDbContext _db;

    public RegistrationRepository(AppDbContext db) => _db = db;

    public Task<Registration?> GetByIdAsync(string id)
        => _db.Registrations.FirstOrDefaultAsync(r => r.Id == id);

    public Task<Registration?> GetByInvoiceNumberAsync(string invoiceNumber)
        => _db.Registrations.FirstOrDefaultAsync(r => r.InvoiceNumber == invoiceNumber);

    public Task<List<Registration>> GetByCampaignIdAsync(string campaignId)
        => _db.Registrations
            .Where(r => r.CampaignId == campaignId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

    public Task<int> CountByCampaignIdAsync(string campaignId)
        => _db.Registrations.CountAsync(r => r.CampaignId == campaignId);

    public Task<bool> MemberAlreadyRegisteredAsync(string campaignId, string memberId)
        => _db.Registrations.AnyAsync(r =>
            r.CampaignId == campaignId &&
            r.MemberId == memberId &&
            r.RegistrationStatus != Core.Enums.RegistrationStatus.Cancelled);

    public async Task<Registration> CreateAsync(Registration registration)
    {
        _db.Registrations.Add(registration);
        await _db.SaveChangesAsync();
        return registration;
    }

    public async Task<Registration> UpdateAsync(Registration registration)
    {
        _db.Registrations.Update(registration);
        await _db.SaveChangesAsync();
        return registration;
    }
}
