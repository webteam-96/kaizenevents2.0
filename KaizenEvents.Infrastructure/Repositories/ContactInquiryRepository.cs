using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class ContactInquiryRepository : IContactInquiryRepository
{
    private readonly AppDbContext _db;

    public ContactInquiryRepository(AppDbContext db) => _db = db;

    public async Task<ContactInquiry> CreateAsync(ContactInquiry inquiry)
    {
        _db.ContactInquiries.Add(inquiry);
        await _db.SaveChangesAsync();
        return inquiry;
    }

    public Task<List<ContactInquiry>> GetAllAsync()
        => _db.ContactInquiries.OrderByDescending(ci => ci.CreatedAt).ToListAsync();
}
