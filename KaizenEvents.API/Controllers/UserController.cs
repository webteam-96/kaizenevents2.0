using KaizenEvents.Core.DTOs.User;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UserController : ApiControllerBase
{
    private readonly IUserRepository _users;
    private readonly IPasswordHasherService _hasher;

    public UserController(IUserRepository users, IPasswordHasherService hasher)
    {
        _users  = users;
        _hasher = hasher;
    }

    // ── GET /api/users ────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!IsSuperAdmin) return Forbidden();
        var all = await _users.GetAllAsync();
        var responses = new List<UserResponse>();
        foreach (var u in all)
        {
            var ids = await _users.GetCampaignIdsAsync(u.Id);
            responses.Add(ToResponse(u, ids));
        }
        return Ok(responses);
    }

    // ── POST /api/users ───────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        // Role validation (kiosk_volunteer created via KioskVolunteerController)
        if (!new[] { "super_admin", "org_admin" }.Contains(req.Role))
            return BadRequest(new { detail = "Role must be 'super_admin' or 'org_admin'." });

        if (!Enum.TryParse<UserRole>(ToPascal(req.Role), out var role))
            return BadRequest(new { detail = "Invalid role." });

        // Email uniqueness
        if (await _users.GetByEmailAsync(req.Email) != null)
            return BadRequest(new { detail = "Email already registered." });

        // Password strength
        var (ok, err) = PasswordValidator.Validate(req.Password);
        if (!ok) return BadRequest(new { detail = err });

        // Org admin must have campaigns assigned
        if (role == UserRole.OrgAdmin && req.CampaignAccess.Count == 0)
            return BadRequest(new { detail = "org_admin must have at least one campaign assigned." });

        var user = new User
        {
            Id                 = Guid.NewGuid().ToString(),
            Email              = req.Email.Trim().ToLowerInvariant(),
            Name               = req.Name.Trim(),
            Role               = role,
            HashedPassword     = _hasher.Hash(req.Password),
            CanApproveTransfers= req.CanApproveTransfers,
            IsActive           = true,
            CreatedAt          = DateTime.UtcNow,
            UpdatedAt          = DateTime.UtcNow
        };
        await _users.CreateAsync(user);

        if (req.CampaignAccess.Count > 0)
            await _users.SetCampaignAccessAsync(user.Id, req.CampaignAccess);

        return StatusCode(201, ToResponse(user, req.CampaignAccess));
    }

    // ── GET /api/users/{user_id} ──────────────────────────────────────────────
    [HttpGet("{user_id}")]
    public async Task<IActionResult> GetById(string user_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(user_id);
        if (user == null) return NotFound(new { detail = "User not found." });
        var ids = await _users.GetCampaignIdsAsync(user.Id);
        return Ok(ToResponse(user, ids));
    }

    // ── PUT /api/users/{user_id} ──────────────────────────────────────────────
    [HttpPut("{user_id}")]
    public async Task<IActionResult> Update(string user_id, [FromBody] UpdateUserRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(user_id);
        if (user == null) return NotFound(new { detail = "User not found." });

        if (req.Name != null)        user.Name = req.Name.Trim();
        if (req.Role != null)
        {
            if (!Enum.TryParse<UserRole>(ToPascal(req.Role), out var role))
                return BadRequest(new { detail = "Invalid role." });
            user.Role = role;
        }
        if (req.Password != null)
        {
            var (ok, err) = PasswordValidator.Validate(req.Password);
            if (!ok) return BadRequest(new { detail = err });
            user.HashedPassword = _hasher.Hash(req.Password);
        }
        if (req.CanApproveTransfers.HasValue)
            user.CanApproveTransfers = req.CanApproveTransfers.Value;

        user.UpdatedAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);

        if (req.CampaignAccess != null)
            await _users.SetCampaignAccessAsync(user.Id, req.CampaignAccess);

        var ids = req.CampaignAccess ?? await _users.GetCampaignIdsAsync(user.Id);
        return Ok(ToResponse(user, ids));
    }

    // ── DELETE /api/users/{user_id} ───────────────────────────────────────────
    [HttpDelete("{user_id}")]
    public async Task<IActionResult> Delete(string user_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(user_id);
        if (user == null) return NotFound(new { detail = "User not found." });
        if (user.Role == UserRole.SuperAdmin)
            return BadRequest(new { detail = "Cannot delete a super_admin user." });

        await _users.DeleteAsync(user);
        return Ok(new { message = "User deleted successfully." });
    }

    // ── PUT /api/users/{user_id}/access ───────────────────────────────────────
    [HttpPut("{user_id}/access")]
    public async Task<IActionResult> UpdateAccess(string user_id, [FromBody] UpdateUserAccessRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(user_id);
        if (user == null) return NotFound(new { detail = "User not found." });
        await _users.SetCampaignAccessAsync(user.Id, req.CampaignIds);
        return Ok(new { message = "Campaign access updated." });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static UserResponse ToResponse(User u, IEnumerable<string> campaignIds) => new(
        Id                 : u.Id,
        Email              : u.Email,
        Name               : u.Name,
        Role               : u.Role.ToString().ToLowerInvariant()
                               .Replace("superadmin", "super_admin")
                               .Replace("orgadmin", "org_admin")
                               .Replace("kioskvolunteer", "kiosk_volunteer"),
        CampaignAccess     : campaignIds.ToList(),
        CanApproveTransfers: u.CanApproveTransfers,
        IsActive           : u.IsActive,
        CreatedAt          : u.CreatedAt);

    // "org_admin" → "OrgAdmin" for Enum.Parse
    private static string ToPascal(string snake) =>
        string.Join("", snake.Split('_').Select(p =>
            p.Length == 0 ? "" : char.ToUpperInvariant(p[0]) + p[1..]));
}
