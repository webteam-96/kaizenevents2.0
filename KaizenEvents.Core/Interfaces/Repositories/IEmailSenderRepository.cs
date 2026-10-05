using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IEmailSenderRepository
{
    Task<EmailSender?> GetByIdAsync(string id);
    Task<EmailSender?> GetDefaultAsync();
    Task<List<EmailSender>> GetAllAsync();
    Task<EmailSender> CreateAsync(EmailSender sender);
    Task<EmailSender> UpdateAsync(EmailSender sender);
    Task DeleteAsync(EmailSender sender);
}
