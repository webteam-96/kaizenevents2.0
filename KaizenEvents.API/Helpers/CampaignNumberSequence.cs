using System.Security.Cryptography;
using KaizenEvents.Core.Entities;
using KaizenEvents.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.API.Helpers;

/// <summary>
/// Claims sequential per-campaign numbers for custom registration/invoice IDs.
/// The increment is a single UPDATE statement (never read-modify-write through a
/// tracked entity), so concurrent claims cannot lose an increment. Two concurrent
/// requests can still read back the same post-increment value; that rare race is
/// caught by the unique indexes on registrations, and creation sites retry once
/// with a freshly claimed number on DbUpdateException.
/// </summary>
public static class CampaignNumberSequence
{
    /// <summary>Prefix + claimed counter (e.g. "RID3170"); null when the campaign has no prefix configured.</summary>
    public static async Task<string?> NextRegistrationNumberAsync(AppDbContext db, Campaign campaign)
    {
        if (string.IsNullOrWhiteSpace(campaign.RegistrationIdPrefix)) return null;

        await db.Campaigns.Where(c => c.Id == campaign.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(
                c => c.RegistrationNextNumber, c => c.RegistrationNextNumber + 1));
        var after = await db.Campaigns.AsNoTracking()
            .Where(c => c.Id == campaign.Id)
            .Select(c => c.RegistrationNextNumber)
            .FirstAsync();

        // Keep the (possibly tracked) in-memory entity in sync — a later full-entity
        // save in the same request must not write the stale pre-increment counter back.
        campaign.RegistrationNextNumber = after;
        return $"{campaign.RegistrationIdPrefix}{after - 1}";
    }

    /// <summary>Prefix + claimed counter when an invoice prefix is set; otherwise the
    /// system default "INV-yyyyMMdd-XXXXXXXX" (4 random bytes, uppercase hex).</summary>
    public static async Task<string> NextInvoiceNumberAsync(AppDbContext db, Campaign campaign, DateTime now)
    {
        if (string.IsNullOrWhiteSpace(campaign.InvoicePrefix))
        {
            var rand = new byte[4];
            RandomNumberGenerator.Fill(rand);
            return $"INV-{now:yyyyMMdd}-{Convert.ToHexString(rand)}"; // ToHexString is uppercase
        }

        await db.Campaigns.Where(c => c.Id == campaign.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(
                c => c.InvoiceNextNumber, c => c.InvoiceNextNumber + 1));
        var after = await db.Campaigns.AsNoTracking()
            .Where(c => c.Id == campaign.Id)
            .Select(c => c.InvoiceNextNumber)
            .FirstAsync();

        campaign.InvoiceNextNumber = after;
        return $"{campaign.InvoicePrefix}{after - 1}";
    }
}
