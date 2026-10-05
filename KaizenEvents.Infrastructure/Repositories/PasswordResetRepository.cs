using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.Infrastructure.Repositories;

public class PasswordResetRepository : IPasswordResetRepository
{
    private readonly AppDbContext _db;

    public PasswordResetRepository(AppDbContext db) => _db = db;

    public Task<PasswordReset?> GetUnusedByEmailAndCodeAsync(string email, string code)
        => _db.PasswordResets.FirstOrDefaultAsync(pr =>
            pr.Email == email && pr.ResetCode == code && !pr.Used);

    public async Task<PasswordReset> CreateAsync(PasswordReset reset)
    {
        _db.PasswordResets.Add(reset);
        await _db.SaveChangesAsync();
        return reset;
    }

    public async Task MarkUsedAsync(long id)
    {
        var reset = await _db.PasswordResets.FindAsync(id);
        if (reset != null)
        {
            reset.Used = true;
            await _db.SaveChangesAsync();
        }
    }

    public async Task DeleteExpiredAsync(TimeSpan maxAge)
    {
        var cutoff = DateTime.UtcNow - maxAge;
        var expired = await _db.PasswordResets.Where(pr => pr.CreatedAt < cutoff).ToListAsync();
        _db.PasswordResets.RemoveRange(expired);
        await _db.SaveChangesAsync();
    }
}
