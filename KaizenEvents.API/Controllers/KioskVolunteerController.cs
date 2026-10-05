using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/kiosk-volunteers")]
[Authorize]
public class KioskVolunteerController : ApiControllerBase
{
    private readonly IKioskVolunteerRepository _volunteers;
    private readonly IUserRepository _users;
    private readonly ICampaignRepository _campaigns;
    private readonly IPasswordHasherService _hasher;

    public KioskVolunteerController(
        IKioskVolunteerRepository volunteers,
        IUserRepository users,
        ICampaignRepository campaigns,
        IPasswordHasherService hasher)
    {
        _volunteers = volunteers;
        _users      = users;
        _campaigns  = campaigns;
        _hasher     = hasher;
    }

    // ── GET /api/kiosk-volunteers ─────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!IsAdminRole) return Forbidden();
        var all = await _volunteers.GetAllAsync();
        var responses = new List<object>();
        foreach (var v in all)
            responses.Add(await ToResponse(v));
        return Ok(responses);
    }

    // ── POST /api/kiosk-volunteers ────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateKioskVolunteerRequest req)
    {
        if (!IsAdminRole) return Forbidden();

        // Check email uniqueness across users
        if (await _users.GetByEmailAsync(req.Email) != null)
            return BadRequest(new { detail = "Email already registered." });

        // Generate temporary password
        var tempPassword = GenerateTempPassword();

        // Create user account with kiosk_volunteer role
        var now = DateTime.UtcNow;
        var user = new User
        {
            Id             = Guid.NewGuid().ToString(),
            Email          = req.Email.Trim().ToLowerInvariant(),
            Name           = req.Name.Trim(),
            Role           = UserRole.KioskVolunteer,
            HashedPassword = _hasher.Hash(tempPassword),
            IsActive       = true,
            CreatedAt      = now,
            UpdatedAt      = now
        };
        await _users.CreateAsync(user);

        var campaignIdsJson = JsonSerializer.Serialize(req.CampaignIds ?? new List<string>());
        var volunteer = new KioskVolunteer
        {
            Id          = Guid.NewGuid().ToString(),
            UserId      = user.Id,
            Name        = req.Name.Trim(),
            Email       = req.Email.Trim().ToLowerInvariant(),
            Phone       = req.Phone,
            IsActive    = true,
            CampaignIds = campaignIdsJson,
            CreatedBy   = CurrentUserId ?? "",
            CreatedAt   = now,
            UpdatedAt   = now
        };
        await _volunteers.CreateAsync(volunteer);

        var campaignNames = await GetCampaignNamesAsync(req.CampaignIds ?? new List<string>());

        return StatusCode(201, new
        {
            id                 = volunteer.Id,
            name               = volunteer.Name,
            email              = volunteer.Email,
            temporary_password = tempPassword,
            campaign_ids       = req.CampaignIds ?? new List<string>(),
            campaign_names     = campaignNames,
            message            = "Kiosk volunteer created. Share the temporary password."
        });
    }

    // ── GET /api/kiosk-volunteers/{volunteer_id} ──────────────────────────────
    [HttpGet("{volunteer_id}")]
    public async Task<IActionResult> GetById(string volunteer_id)
    {
        if (!IsAdminRole) return Forbidden();
        var v = await _volunteers.GetByIdAsync(volunteer_id);
        if (v == null) return NotFound(new { detail = "Kiosk volunteer not found." });
        return Ok(await ToResponse(v));
    }

    // ── PUT /api/kiosk-volunteers/{volunteer_id} ──────────────────────────────
    [HttpPut("{volunteer_id}")]
    public async Task<IActionResult> Update(
        string volunteer_id, [FromBody] UpdateKioskVolunteerRequest req)
    {
        if (!IsAdminRole) return Forbidden();
        var v = await _volunteers.GetByIdAsync(volunteer_id);
        if (v == null) return NotFound(new { detail = "Kiosk volunteer not found." });

        if (req.Name != null)        v.Name       = req.Name.Trim();
        if (req.Phone != null)       v.Phone      = req.Phone;
        if (req.IsActive.HasValue)   v.IsActive   = req.IsActive.Value;
        if (req.CampaignIds != null) v.CampaignIds = JsonSerializer.Serialize(req.CampaignIds);
        v.UpdatedAt = DateTime.UtcNow;
        await _volunteers.UpdateAsync(v);
        return Ok(await ToResponse(v));
    }

    // ── DELETE /api/kiosk-volunteers/{volunteer_id} ───────────────────────────
    [HttpDelete("{volunteer_id}")]
    public async Task<IActionResult> Delete(string volunteer_id)
    {
        if (!IsAdminRole) return Forbidden();
        var v = await _volunteers.GetByIdAsync(volunteer_id);
        if (v == null) return NotFound(new { detail = "Kiosk volunteer not found." });
        await _volunteers.DeleteAsync(v);
        return Ok(new { message = "Kiosk volunteer deleted." });
    }

    // ── POST /api/kiosk-volunteers/{volunteer_id}/assign-campaigns ────────────
    [HttpPost("{volunteer_id}/assign-campaigns")]
    public async Task<IActionResult> AssignCampaigns(
        string volunteer_id, [FromBody] AssignCampaignsRequest req)
    {
        if (!IsAdminRole) return Forbidden();
        var v = await _volunteers.GetByIdAsync(volunteer_id);
        if (v == null) return NotFound(new { detail = "Kiosk volunteer not found." });

        v.CampaignIds = JsonSerializer.Serialize(req.CampaignIds);
        v.UpdatedAt   = DateTime.UtcNow;
        await _volunteers.UpdateAsync(v);

        var names = await GetCampaignNamesAsync(req.CampaignIds);
        return Ok(new { message = "Campaigns assigned.", volunteer_id, campaign_ids = req.CampaignIds, campaign_names = names });
    }

    // ── POST /api/kiosk-volunteers/{volunteer_id}/reset-password ─────────────
    [HttpPost("{volunteer_id}/reset-password")]
    public async Task<IActionResult> ResetPassword(string volunteer_id)
    {
        if (!IsAdminRole) return Forbidden();
        var v = await _volunteers.GetByIdAsync(volunteer_id);
        if (v == null) return NotFound(new { detail = "Kiosk volunteer not found." });

        var user = await _users.GetByIdAsync(v.UserId);
        if (user == null) return NotFound(new { detail = "User not found." });

        var tempPassword   = GenerateTempPassword();
        user.HashedPassword = _hasher.Hash(tempPassword);
        user.UpdatedAt     = DateTime.UtcNow;
        await _users.UpdateAsync(user);

        return Ok(new { message = "Password reset.", volunteer_email = v.Email, temporary_password = tempPassword });
    }

    // ── GET /api/kiosk-volunteers/campaigns/{campaign_id}/volunteers ──────────
    [HttpGet("/api/kiosk-volunteers/campaigns/{campaign_id}/volunteers")]
    public async Task<IActionResult> GetByCampaign(string campaign_id)
    {
        if (!IsAdminRole) return Forbidden();
        var all = await _volunteers.GetAllAsync();
        var result = new List<object>();
        foreach (var v in all)
        {
            var ids = GetCampaignIds(v.CampaignIds);
            if (ids.Contains(campaign_id))
                result.Add(await ToResponse(v));
        }
        return Ok(result);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<object> ToResponse(KioskVolunteer v)
    {
        var ids   = GetCampaignIds(v.CampaignIds);
        var names = await GetCampaignNamesAsync(ids);
        return new
        {
            id             = v.Id,
            user_id        = v.UserId,
            name           = v.Name,
            email          = v.Email,
            phone          = v.Phone,
            is_active      = v.IsActive,
            campaign_ids   = ids,
            campaign_names = names,
            created_at     = v.CreatedAt,
            updated_at     = v.UpdatedAt
        };
    }

    private static List<string> GetCampaignIds(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); } catch { return new(); }
    }

    private async Task<List<string>> GetCampaignNamesAsync(IEnumerable<string> ids)
    {
        var names = new List<string>();
        foreach (var id in ids)
        {
            var c = await _campaigns.GetByIdAsync(id);
            names.Add(c?.Name ?? id);
        }
        return names;
    }

    private static string GenerateTempPassword()
    {
        const string chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
        var buf = new char[12];
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[12];
        rng.GetBytes(bytes);
        for (int i = 0; i < 12; i++)
            buf[i] = chars[bytes[i] % chars.Length];
        return new string(buf);
    }
}

public record CreateKioskVolunteerRequest(string Name, string Email, string? Phone, List<string>? CampaignIds);
public record UpdateKioskVolunteerRequest(string? Name, string? Phone, List<string>? CampaignIds, bool? IsActive);
public record AssignCampaignsRequest(List<string> CampaignIds);
