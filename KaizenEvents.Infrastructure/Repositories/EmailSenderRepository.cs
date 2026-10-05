using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class EmailSenderRepository : IEmailSenderRepository
{
    private readonly AppDbContext _db;

    public EmailSenderRepository(AppDbContext db) => _db = db;

    public Task<EmailSender?> GetByIdAsync(string id)
        => _db.EmailSenders.FirstOrDefaultAsync(es => es.Id == id);

    public Task<EmailSender?> GetDefaultAsync()
        => _db.EmailSenders.FirstOrDefaultAsync(es => es.IsDefault && es.IsActive);

    public Task<List<EmailSender>> GetAllAsync()
        => _db.EmailSenders.OrderBy(es => es.Name).ToListAsync();

    public async Task<EmailSender> CreateAsync(EmailSender sender)
    {
        _db.EmailSenders.Add(sender);
        await _db.SaveChangesAsync();
        return sender;
    }

    public async Task<EmailSender> UpdateAsync(EmailSender sender)
    {
        _db.EmailSenders.Update(sender);
        await _db.SaveChangesAsync();
        return sender;
    }

    public async Task DeleteAsync(EmailSender sender)
    {
        _db.EmailSenders.Remove(sender);
        await _db.SaveChangesAsync();
    }
}
