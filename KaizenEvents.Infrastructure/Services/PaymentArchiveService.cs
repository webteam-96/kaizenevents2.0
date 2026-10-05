using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

public class PaymentArchiveService : IPaymentArchiveService
{
    private readonly AppDbContext _db;
    private readonly ILogger<PaymentArchiveService> _logger;

    public PaymentArchiveService(AppDbContext db, ILogger<PaymentArchiveService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task ArchivePaymentAsync(Payment payment, Campaign campaign, Registration? registration)
    {
        try
        {
            // Skip if already archived (idempotent — webhooks can fire twice)
            if (!string.IsNullOrEmpty(payment.GatewayPaymentId))
            {
                if (await IsAlreadyArchivedAsync(payment.Gateway, payment.GatewayPaymentId)) return;
            }

            var (buyerName, buyerEmail, buyerPhone) = ExtractBuyerInfo(registration);
            var now      = DateTime.UtcNow;
            var amount   = payment.Amount;
            var fee      = payment.GatewayFee ?? 0m;
            var tax      = payment.GatewayTax ?? 0m;
            var title    = campaign.Name;
            var paymentId = payment.GatewayPaymentId ?? payment.Id;
            var txDate   = payment.PaidAt ?? payment.CreatedAt;
            var gateway  = payment.Gateway?.ToLowerInvariant();
            var titleId  = await GetOrCreateTitleIdAsync(gateway, title);

            switch (gateway)
            {
                case "instamojo":
                    _db.InstamojoDataDetails.Add(new InstamojoDataDetail
                    {
                        PaymentId         = paymentId,
                        TransactionDate   = txDate,
                        TransactionType   = "Sale",
                        Title             = title,
                        BuyerName         = buyerName,
                        BuyerEmailAddress = buyerEmail,
                        BuyerPhoneNumber  = buyerPhone,
                        QuantitySold      = 1,
                        SaleCurrency      = "INR",
                        SaleAmount        = (int)amount,
                        InstamojoFees     = (float)fee,
                        TotalTax          = (float)tax,
                        CreatedDate       = now,
                        ModifiedDate      = now,
                        PayoutFlag        = 0,
                        FkTitleId         = (uint)titleId,
                        LinkedPaymentUuid = payment.Id
                    });
                    break;

                case "razorpay":
                    _db.RazorpayDataDetails.Add(new RazorpayDataDetail
                    {
                        PaymentId         = paymentId,
                        TransactionDate   = txDate,
                        TransactionType   = "Sale",
                        Title             = title,
                        BuyerName         = buyerName,
                        BuyerEmailAddress = buyerEmail,
                        BuyerPhoneNumber  = buyerPhone,
                        QuantitySold      = 1,
                        SaleCurrency      = "INR",
                        SaleAmount        = (int)amount,
                        RazorpayFees      = (float)fee,
                        TotalTax          = (float)tax,
                        CreatedDate       = now,
                        ModifiedDate      = now,
                        PayoutFlag        = 0,
                        FkTitleId         = titleId,
                        LinkedPaymentUuid = payment.Id
                    });
                    break;

                case "cashfree":
                    _db.CashfreeDataDetails.Add(new CashfreeDataDetail
                    {
                        PaymentId         = paymentId,
                        TransactionDate   = txDate,
                        TransactionType   = "Sale",
                        Title             = title,
                        BuyerName         = buyerName,
                        BuyerEmailAddress = buyerEmail,
                        BuyerPhoneNumber  = buyerPhone,
                        QuantitySold      = 1,
                        SaleCurrency      = "INR",
                        SaleAmount        = (int)amount,
                        CashfreeFees      = (float)fee,
                        TotalTax          = (float)tax,
                        CreatedDate       = now,
                        ModifiedDate      = now,
                        PayoutFlag        = 0,
                        FkTitleId         = titleId,
                        LinkedPaymentUuid = payment.Id
                    });
                    break;

                default:
                    _logger.LogWarning("PaymentArchive: unknown gateway '{Gateway}' for payment {Id}",
                        payment.Gateway, payment.Id);
                    return;
            }

            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Best-effort logging; never block the main payment flow
            _logger.LogError(ex, "PaymentArchive failed for payment {Id} ({Gateway})",
                payment.Id, payment.Gateway);
        }
    }

    /// <summary>
    /// Find an existing paymenttitle row by Title text for the given gateway, or insert a new one.
    /// Returns the int PK so it can be stored as fk_title_id in the datadetails row.
    /// Cached implicitly via EF change tracker — but we save immediately to get the new ID.
    /// </summary>
    private async Task<int> GetOrCreateTitleIdAsync(string? gateway, string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return 0;
        title = title.Trim();

        switch (gateway)
        {
            case "instamojo":
            {
                var existing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                    .FirstOrDefaultAsync(_db.InstamojoPaymentTitles, t => t.Title == title);
                if (existing != null) return existing.Id;
                var row = new InstamojoPaymentTitle
                {
                    Title = title, IsActive = 1, IsDeleted = 0,
                    CreatedDate = DateTime.UtcNow, ModifiedDate = DateTime.UtcNow
                };
                _db.InstamojoPaymentTitles.Add(row);
                await _db.SaveChangesAsync();
                return row.Id;
            }
            case "razorpay":
            {
                var existing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                    .FirstOrDefaultAsync(_db.RazorpayPaymentTitles, t => t.Title == title);
                if (existing != null) return existing.Id;
                var row = new RazorpayPaymentTitle
                {
                    Title = title, IsActive = 1, IsDeleted = 0,
                    CreatedDate = DateTime.UtcNow, ModifiedDate = DateTime.UtcNow
                };
                _db.RazorpayPaymentTitles.Add(row);
                await _db.SaveChangesAsync();
                return row.Id;
            }
            case "cashfree":
            {
                var existing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                    .FirstOrDefaultAsync(_db.CashfreePaymentTitles, t => t.Title == title);
                if (existing != null) return existing.Id;
                var row = new CashfreePaymentTitle
                {
                    Title = title, IsActive = 1, IsDeleted = 0,
                    CreatedDate = DateTime.UtcNow, ModifiedDate = DateTime.UtcNow
                };
                _db.CashfreePaymentTitles.Add(row);
                await _db.SaveChangesAsync();
                return row.Id;
            }
            default:
                return 0;
        }
    }

    public async Task<bool> UpdatePayoutInfoAsync(
        string gateway,
        string gatewayPaymentId,
        string? payoutId,
        DateTime? payoutDate,
        string? payoutStatus)
    {
        if (string.IsNullOrEmpty(gatewayPaymentId)) return false;
        var isPayoutComplete = string.Equals(payoutStatus, "processed", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(payoutStatus, "settled",   StringComparison.OrdinalIgnoreCase)
                            || string.Equals(payoutStatus, "completed", StringComparison.OrdinalIgnoreCase);

        switch (gateway?.ToLowerInvariant())
        {
            case "instamojo":
            {
                var row = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                    .FirstOrDefaultAsync(_db.InstamojoDataDetails, d => d.PaymentId == gatewayPaymentId);
                if (row == null) return false;
                row.PayoutId      = payoutId      ?? row.PayoutId;
                row.PayoutDate    = payoutDate    ?? row.PayoutDate;
                row.PayoutStatus  = payoutStatus  ?? row.PayoutStatus;
                row.PayoutFlag    = isPayoutComplete ? 1 : row.PayoutFlag;
                row.ModifiedDate  = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                return true;
            }
            case "razorpay":
            {
                var row = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                    .FirstOrDefaultAsync(_db.RazorpayDataDetails, d => d.PaymentId == gatewayPaymentId);
                if (row == null) return false;
                row.PayoutId      = payoutId      ?? row.PayoutId;
                row.PayoutDate    = payoutDate    ?? row.PayoutDate;
                row.PayoutStatus  = payoutStatus  ?? row.PayoutStatus;
                row.PayoutFlag    = isPayoutComplete ? 1 : row.PayoutFlag;
                row.ModifiedDate  = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                return true;
            }
            case "cashfree":
            {
                var row = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                    .FirstOrDefaultAsync(_db.CashfreeDataDetails, d => d.PaymentId == gatewayPaymentId);
                if (row == null) return false;
                row.PayoutId      = payoutId      ?? row.PayoutId;
                row.PayoutDate    = payoutDate    ?? row.PayoutDate;
                row.PayoutStatus  = payoutStatus  ?? row.PayoutStatus;
                row.PayoutFlag    = isPayoutComplete ? 1 : row.PayoutFlag;
                row.ModifiedDate  = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                return true;
            }
            default:
                return false;
        }
    }

    private async Task<bool> IsAlreadyArchivedAsync(string gateway, string gatewayPaymentId)
    {
        return gateway?.ToLowerInvariant() switch
        {
            "instamojo" => await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                .AnyAsync(_db.InstamojoDataDetails, d => d.PaymentId == gatewayPaymentId),
            "razorpay"  => await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                .AnyAsync(_db.RazorpayDataDetails,  d => d.PaymentId == gatewayPaymentId),
            "cashfree"  => await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                .AnyAsync(_db.CashfreeDataDetails,  d => d.PaymentId == gatewayPaymentId),
            _ => false
        };
    }

    /// <summary>
    /// Pulls name/email/phone out of registration.form_data. Form fields use random IDs,
    /// so we look up by `type` rather than literal key names.
    /// </summary>
    private static (string? name, string? email, string? phone) ExtractBuyerInfo(Registration? reg)
    {
        if (reg == null) return (null, null, null);

        string? name = null, email = null, phone = null;

        // form_data is JSON; pull common fields by name pattern (form fields use random IDs)
        if (!string.IsNullOrEmpty(reg.FormData))
        {
            try
            {
                using var doc = JsonDocument.Parse(reg.FormData);
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    var keyLower = prop.Name.ToLowerInvariant();
                    if (name  == null && (keyLower.Contains("name"))  && prop.Value.ValueKind == JsonValueKind.String)
                        name  = prop.Value.GetString();
                    if (email == null && (keyLower.Contains("email")) && prop.Value.ValueKind == JsonValueKind.String)
                        email = prop.Value.GetString();
                    if (phone == null && (keyLower.Contains("phone") || keyLower.Contains("mobile")) && prop.Value.ValueKind == JsonValueKind.String)
                        phone = prop.Value.GetString();
                }
            }
            catch { /* ignore malformed JSON */ }
        }

        return (name, email, phone);
    }
}
