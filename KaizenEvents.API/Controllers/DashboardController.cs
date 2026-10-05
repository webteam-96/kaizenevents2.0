using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ApiControllerBase
{
    private readonly ICampaignRepository _campaigns;
    private readonly IRegistrationRepository _registrations;
    private readonly IUserRepository _users;
    private readonly AppDbContext _db;

    public DashboardController(
        ICampaignRepository campaigns,
        IRegistrationRepository registrations,
        IUserRepository users,
        AppDbContext db)
    {
        _campaigns     = campaigns;
        _registrations = registrations;
        _users         = users;
        _db            = db;
    }

    // ── GET /api/dashboard/stats ──────────────────────────────────────────────
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (IsSuperAdmin)
        {
            var all = await _campaigns.GetAllAsync();
            var totalRevenue         = all.Sum(c => c.TotalRevenue);
            var totalRegistrations   = all.Sum(c => c.CurrentRegistrations);
            var activeCampaigns      = all.Count(c => c.Status == CampaignStatus.Active);

            return Ok(new
            {
                total_campaigns      = all.Count,
                active_campaigns     = activeCampaigns,
                total_revenue        = totalRevenue,
                total_registrations  = totalRegistrations
            });
        }
        else
        {
            // Org admin: only their assigned campaigns
            if (CurrentUserId == null) return Unauthorized();
            var ids      = await _users.GetCampaignIdsAsync(CurrentUserId);
            var campaigns = new List<KaizenEvents.Core.Entities.Campaign>();
            foreach (var id in ids)
            {
                var c = await _campaigns.GetByIdAsync(id);
                if (c != null) campaigns.Add(c);
            }

            return Ok(new
            {
                total_campaigns      = campaigns.Count,
                active_campaigns     = campaigns.Count(c => c.Status == CampaignStatus.Active),
                total_revenue        = campaigns.Sum(c => c.TotalRevenue),
                total_registrations  = campaigns.Sum(c => c.CurrentRegistrations)
            });
        }
    }

    // ── GET /api/dashboard/registrations-summary ──────────────────────────────
    /// <summary>
    /// Every registration the caller can see, reduced to the handful of fields the dashboard
    /// actually charts.
    ///
    /// This exists to replace the dashboard's old fan-out, which issued one
    /// GET /campaigns/{id}/registrations per campaign, sequentially, and pulled the complete
    /// record — form_data included — only to sum four columns. At 50 campaigns that was 50
    /// round-trips and megabytes on the wire; from a browser in India it cost ~22 seconds, almost
    /// all of it latency rather than work. One request removes the round-trips, and projecting
    /// away form_data removes the bulk.
    ///
    /// The name is resolved here rather than shipped as form_data because the client needs it for
    /// the "recent registrations" strip, and sending the whole blob to recover one string would
    /// undo the point of the endpoint.
    /// </summary>
    [HttpGet("registrations-summary")]
    public async Task<IActionResult> GetRegistrationsSummary()
    {
        if (CurrentUserId == null) return Unauthorized();

        // Campaign scoping mirrors GetStats: super admins see everything, everyone else sees
        // only what they have been granted. Filtering in SQL keeps rows the caller may not
        // read out of memory entirely.
        var query = _db.Registrations.AsNoTracking();
        if (!IsSuperAdmin)
        {
            var accessible = await _users.GetCampaignIdsAsync(CurrentUserId);
            if (accessible.Count == 0) return Ok(Array.Empty<object>());
            query = query.Where(r => accessible.Contains(r.CampaignId));
        }

        // form_data is the one wide column, and it is read only to resolve a display name —
        // it never leaves the server.
        var rows = await query
            .Select(r => new
            {
                r.Id,
                r.CampaignId,
                r.PaymentStatus,
                r.TotalAmount,
                r.CreatedAt,
                r.FormData
            })
            .ToListAsync();

        // Name resolution needs each campaign's field definitions to know which answer is the
        // name. Resolving the plan once per campaign rather than once per registration is what
        // keeps this endpoint cheap: a form_config is far larger than a registration, and
        // re-parsing it a few thousand times dominated everything else the request does.
        var nameFieldPlans = (await _db.Campaigns
                .AsNoTracking()
                .Select(c => new { c.Id, c.FormConfig })
                .ToListAsync())
            .ToDictionary(
                c => c.Id,
                c => FormContact.BuildNamePlan(c.FormConfig));

        var result = rows.Select(r => new
        {
            id             = r.Id,
            campaign_id    = r.CampaignId,
            payment_status = r.PaymentStatus.ToString().ToLowerInvariant(),
            total_amount   = r.TotalAmount,
            created_at     = r.CreatedAt,
            name           = FormContact.ResolveNameWithPlan(
                                 r.FormData,
                                 nameFieldPlans.GetValueOrDefault(
                                     r.CampaignId, FormContact.NamePlan.Empty),
                                 fallback: "Guest")
        });

        return Ok(result);
    }
}
