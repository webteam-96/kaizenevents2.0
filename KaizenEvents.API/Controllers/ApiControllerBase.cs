using KaizenEvents.Core.Enums;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Base controller providing common auth helpers for all API controllers.
/// </summary>
[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected string? CurrentUserId
        => User.FindFirst("sub")?.Value;

    protected string? CurrentUserRoleClaim
        => User.FindFirst("role")?.Value;

    protected UserRole? CurrentUserRole
    {
        get
        {
            var claim = CurrentUserRoleClaim;
            return claim != null && Enum.TryParse<UserRole>(claim, ignoreCase: true, out var role)
                ? role
                : null;
        }
    }

    protected bool IsSuperAdmin => CurrentUserRole == UserRole.SuperAdmin;
    protected bool IsOrgAdmin   => CurrentUserRole == UserRole.OrgAdmin;
    protected bool IsAdminRole  => IsSuperAdmin || IsOrgAdmin;

    protected IActionResult Forbidden(string detail = "Access denied.")
        => StatusCode(403, new { detail });

    protected string? GetBearerToken()
    {
        var header = Request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? header["Bearer ".Length..].Trim()
            : null;
    }
}
