using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Repositories;

public interface IContactInquiryRepository
{
    Task<ContactInquiry> CreateAsync(ContactInquiry inquiry);
    Task<List<ContactInquiry>> GetAllAsync();
}
