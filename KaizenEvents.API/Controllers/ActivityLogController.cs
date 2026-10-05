using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/activity-logs")]
[Authorize]
public class ActivityLogController : ApiControllerBase
{
    private readonly IAuditLogRepository _logs;
    private readonly IUserRepository _users;

    public ActivityLogController(IAuditLogRepository logs, IUserRepository users)
    {
        _logs  = logs;
        _users = users;
    }

    // ── GET /api/activity-logs ────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page       = 1,
        [FromQuery] int page_size  = 50,
        [FromQuery] string? event_type    = null,
        [FromQuery] string? resource_type = null,
        [FromQuery] string? user_id       = null,
        [FromQuery] string? start_date    = null,
        [FromQuery] string? end_date      = null)
    {
        if (!await IsDirectorOrAdminAsync()) return Forbidden();

        page_size = Math.Clamp(page_size, 10, 100);

        // Parse date filters (inclusive day range; end_date covers the whole day)
        DateTime? startUtc = null, endUtc = null;
        if (DateTime.TryParse(start_date, out var s)) startUtc = DateTime.SpecifyKind(s.Date, DateTimeKind.Utc);
        if (DateTime.TryParse(end_date,   out var e)) endUtc   = DateTime.SpecifyKind(e.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);

        // When filtering, fetch a larger window and filter in-memory, then page
        var anyFilter = !string.IsNullOrEmpty(event_type) || !string.IsNullOrEmpty(resource_type)
                        || startUtc.HasValue || endUtc.HasValue;

        IEnumerable<AuditLog> logs = string.IsNullOrEmpty(user_id)
            ? await _logs.GetAllAsync(0, anyFilter ? 10000 : page_size * page)
            : await _logs.GetByUserIdAsync(user_id, 0, anyFilter ? 10000 : page_size * page);

        if (!string.IsNullOrEmpty(event_type))
            logs = logs.Where(l => l.EventType.Equals(event_type, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrEmpty(resource_type))
            logs = logs.Where(l => l.ResourceType?.Equals(resource_type, StringComparison.OrdinalIgnoreCase) == true);
        if (startUtc.HasValue)
            logs = logs.Where(l => l.Timestamp >= startUtc.Value);
        if (endUtc.HasValue)
            logs = logs.Where(l => l.Timestamp <= endUtc.Value);

        var filtered = logs.ToList();
        var total    = filtered.Count;
        var paged    = filtered.Skip((page - 1) * page_size).Take(page_size).ToList();

        // Build user lookup for display names
        var userIds = paged.Where(l => l.UserId != null).Select(l => l.UserId!).Distinct().ToList();
        var userMap = new Dictionary<string, (string Name, string Email)>();
        foreach (var uid in userIds)
        {
            var u = await _users.GetByIdAsync(uid);
            if (u != null) userMap[uid] = (u.Name, u.Email);
        }

        return Ok(new
        {
            logs      = paged.Select(l => ToResponse(l, userMap)),
            total,
            page,
            page_size,
            has_more  = (page * page_size) < total
        });
    }

    // ── GET /api/activity-logs/entity/{entity_type}/{entity_id} ──────────────
    [HttpGet("entity/{entity_type}/{entity_id}")]
    public async Task<IActionResult> GetEntityHistory(string entity_type, string entity_id,
        [FromQuery] int limit = 50)
    {
        if (!await IsDirectorOrAdminAsync()) return Forbidden();

        limit = Math.Clamp(limit, 10, 200);
        var logs = await _logs.GetByResourceAsync(entity_type, entity_id);
        var taken = logs.Take(limit).ToList();

        var userIds = taken.Where(l => l.UserId != null).Select(l => l.UserId!).Distinct().ToList();
        var userMap = new Dictionary<string, (string Name, string Email)>();
        foreach (var uid in userIds)
        {
            var u = await _users.GetByIdAsync(uid);
            if (u != null) userMap[uid] = (u.Name, u.Email);
        }

        var paged = taken.Select(l => ToResponse(l, userMap)).ToList();

        return Ok(new
        {
            entity_type,
            entity_id,
            history = paged,
            total   = paged.Count
        });
    }

    // ── GET /api/activity-logs/event-types ────────────────────────────────────
    [HttpGet("event-types")]
    public async Task<IActionResult> GetEventTypes()
    {
        if (!await IsDirectorOrAdminAsync()) return Forbidden();
        var logs = await _logs.GetAllAsync(0, 10000);
        var types = logs.Select(l => l.EventType).Distinct().OrderBy(x => x).ToList();
        return Ok(new { event_types = types });
    }

    // ── GET /api/activity-logs/stats ──────────────────────────────────────────
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats([FromQuery] int days = 7)
    {
        if (!await IsDirectorOrAdminAsync()) return Forbidden();
        days = Math.Clamp(days, 1, 90);

        var cutoff = DateTime.UtcNow.AddDays(-days);
        var all    = await _logs.GetAllAsync(0, 10000);
        var recent = all.Where(l => l.Timestamp >= cutoff).ToList();

        var byType = recent.GroupBy(l => l.EventType)
            .Select(g => new { event_type = g.Key, count = g.Count() })
            .OrderByDescending(x => x.count).ToList();

        var byUser = recent.GroupBy(l => l.UserId)
            .Select(g => new { user_id = g.Key, count = g.Count() })
            .OrderByDescending(x => x.count).Take(20).ToList();

        return Ok(new { period_days = days, total_events = recent.Count, by_event_type = byType, by_user = byUser });
    }

    private async Task<bool> IsDirectorOrAdminAsync()
    {
        if (IsSuperAdmin) return true;
        if (CurrentUserId == null) return false;
        var user = await _users.GetByIdAsync(CurrentUserId);
        return user?.CanApproveTransfers == true;
    }

    private static object ToResponse(AuditLog l, Dictionary<string, (string Name, string Email)> userMap)
    {
        userMap.TryGetValue(l.UserId ?? "", out var user);
        var ip = l.IpAddress;
        if (ip == "::1" || ip == "127.0.0.1") ip = "localhost";

        return new
        {
            id             = l.Id,
            timestamp      = l.Timestamp,
            event_type     = l.EventType,
            user_id        = l.UserId,
            user_name      = user.Name,
            user_email     = user.Email ?? l.UserEmail,
            resource_type  = l.ResourceType,
            resource_id    = l.ResourceId,
            action_details = ParseJson(l.ActionDetails),
            status         = l.Status,
            ip_address     = ip,
            integrity_hash = l.IntegrityHash
        };
    }

    private static object? ParseJson(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return System.Text.Json.JsonDocument.Parse(json).RootElement.Clone(); }
        catch { return json; }
    }
}
