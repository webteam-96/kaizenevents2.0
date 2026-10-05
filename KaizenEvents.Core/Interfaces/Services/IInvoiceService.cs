using KaizenEvents.Core.Entities;

namespace KaizenEvents.Core.Interfaces.Services;

public interface IInvoiceService
{
    byte[] GenerateInvoicePdf(Registration registration, Campaign campaign);

    /// <summary>
    /// Renders the registrant's submitted answers (every filled form field, in form order,
    /// with option values mapped back to their labels) as a PDF, for the optional
    /// "Attach Filled Form as PDF" email attachment.
    /// </summary>
    byte[] GenerateFilledFormPdf(Registration registration, Campaign campaign);
}
