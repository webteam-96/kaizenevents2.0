using System.Security.Cryptography;
using KaizenEvents.Core.DTOs.Auth;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ApiControllerBase
{
    private readonly IUserRepository _users;
    private readonly IPasswordResetRepository _resets;
    private readonly IJwtService _jwt;
    private readonly IPasswordHasherService _hasher;
    private readonly ITokenBlacklistService _blacklist;
    private readonly ILoginRateLimiterService _loginLimiter;
    private readonly IAuditLoggerService _audit;
    private readonly IBrevoService _email;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IUserRepository users,
        IPasswordResetRepository resets,
        IJwtService jwt,
        IPasswordHasherService hasher,
        ITokenBlacklistService blacklist,
        ILoginRateLimiterService loginLimiter,
        IAuditLoggerService audit,
        IBrevoService email,
        ILogger<AuthController> logger)
    {
        _users        = users;
        _resets       = resets;
        _jwt          = jwt;
        _hasher       = hasher;
        _blacklist    = blacklist;
        _loginLimiter = loginLimiter;
        _audit        = audit;
        _email        = email;
        _logger       = logger;
    }

    // ── POST /api/auth/register ───────────────────────────────────────────────
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();

        if (await _users.GetByEmailAsync(email) != null)
            return Conflict(new { detail = "Email already registered." });

        var (valid, error) = PasswordValidator.Validate(req.Password);
        if (!valid)
            return BadRequest(new { detail = error });

        var user = new User
        {
            Id             = Guid.NewGuid().ToString(),
            Email          = email,
            Name           = req.Name.Trim(),
            Role           = Core.Enums.UserRole.OrgAdmin,
            HashedPassword = _hasher.Hash(req.Password),
            IsActive       = true,
            CreatedAt      = DateTime.UtcNow,
            UpdatedAt      = DateTime.UtcNow
        };

        await _users.CreateAsync(user);

        await _audit.LogAsync(AuditEventType.UserCreated,
            userId: user.Id, userEmail: user.Email,
            resourceType: "user", resourceId: user.Id,
            actionDetails: new { name = user.Name, role = "org_admin" },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return StatusCode(201, await BuildTokenResponseAsync(user));
    }

    // ── POST /api/auth/login ──────────────────────────────────────────────────
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var ip    = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var email = req.Email.Trim().ToLowerInvariant();

        var user = await _users.GetByEmailAsync(email);
        if (user == null || !_hasher.Verify(req.Password, user.HashedPassword))
        {
            await _audit.LogAsync(AuditEventType.LoginFailed,
                userEmail: email, resourceType: "user", ipAddress: ip,
                actionDetails: new { }, status: "failed");

            return Unauthorized(new { detail = "Invalid email or password." });
        }

        if (!user.IsActive)
        {
            await _audit.LogAsync(AuditEventType.LoginFailed,
                userId: user.Id, userEmail: user.Email, resourceType: "user", resourceId: user.Id, ipAddress: ip,
                actionDetails: new { reason = "account_deactivated" }, status: "failed");
            return Unauthorized(new { detail = "Account is deactivated." });
        }

        await _audit.LogAsync(AuditEventType.LoginSuccess,
            userId: user.Id, userEmail: user.Email, resourceType: "user", resourceId: user.Id, ipAddress: ip,
            actionDetails: new { role = user.Role.ToString() });

        return Ok(await BuildTokenResponseAsync(user));
    }

    // ── POST /api/auth/logout ─────────────────────────────────────────────────
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var token = GetBearerToken();
        if (token != null)
        {
            var claims = _jwt.ReadClaims(token);
            var expiry = claims.HasValue
                ? claims.Value.Expiry
                : DateTime.UtcNow.AddMinutes(30);
            _blacklist.BlacklistToken(token, expiry);
        }

        await _audit.LogAsync(AuditEventType.Logout,
            userId: CurrentUserId, resourceType: "user", resourceId: CurrentUserId,
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { detail = "Logged out successfully." });
    }

    // ── POST /api/auth/logout-all ─────────────────────────────────────────────
    [HttpPost("logout-all")]
    [Authorize]
    public async Task<IActionResult> LogoutAll()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            return Unauthorized(new { detail = "Invalid token." });

        _blacklist.RevokeUserTokens(userId);

        await _audit.LogAsync(AuditEventType.Logout,
            userId: userId, resourceType: "user", resourceId: userId,
            actionDetails: new { scope = "all_sessions" },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { detail = "All sessions revoked." });
    }

    // ── GET /api/auth/me ──────────────────────────────────────────────────────
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            return Unauthorized(new { detail = "Invalid token." });

        var user = await _users.GetByIdAsync(userId);
        if (user == null)
            return NotFound(new { detail = "User not found." });

        var campaignIds = await _users.GetCampaignIdsAsync(userId);

        return Ok(ToUserDto(user, campaignIds));
    }

    // ── POST /api/auth/password-reset-request ─────────────────────────────────
    [HttpPost("password-reset-request")]
    public async Task<IActionResult> PasswordResetRequest([FromBody] PasswordResetRequestDto req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var user  = await _users.GetByEmailAsync(email);

        // Always return 200 to avoid email enumeration
        if (user == null)
            return Ok(new { detail = "If that email is registered, a reset code has been sent." });

        var code = GenerateResetCode();

        await _resets.CreateAsync(new PasswordReset
        {
            Email     = email,
            ResetCode = code,
            CreatedAt = DateTime.UtcNow
        });

        // Send reset code via Brevo
        var html = $@"
<h2>Password Reset Request</h2>
<p>Hello {user.Name},</p>
<p>You requested a password reset for your Kaizen Events account. Use the code below to reset your password:</p>
<h1 style='background:#f4f4f4;padding:16px;text-align:center;letter-spacing:4px;font-family:monospace;'>{code}</h1>
<p>This code expires in 15 minutes. If you didn't request this, please ignore this email.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";
        await _email.SendEmailAsync(email, user.Name, "Kaizen Events — Password Reset Code", html);
        _logger.LogInformation("Password reset code sent to {Email}", email);

        await _audit.LogAsync(AuditEventType.PasswordReset,
            userId: user.Id, userEmail: user.Email, resourceType: "user", resourceId: user.Id,
            actionDetails: new { stage = "requested" },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { detail = "If that email is registered, a reset code has been sent." });
    }

    // ── POST /api/auth/password-reset-confirm ─────────────────────────────────
    [HttpPost("password-reset-confirm")]
    public async Task<IActionResult> PasswordResetConfirm([FromBody] PasswordResetConfirmRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var reset = await _resets.GetUnusedByEmailAndCodeAsync(email, req.Code);

        if (reset == null)
            return BadRequest(new { detail = "Invalid or expired reset code." });

        if ((DateTime.UtcNow - reset.CreatedAt).TotalHours > 24)
        {
            await _resets.MarkUsedAsync(reset.Id);
            return BadRequest(new { detail = "Reset code has expired." });
        }

        var (valid, error) = PasswordValidator.Validate(req.NewPassword);
        if (!valid)
            return BadRequest(new { detail = error });

        var user = await _users.GetByEmailAsync(email);
        if (user == null)
            return BadRequest(new { detail = "User not found." });

        user.HashedPassword = _hasher.Hash(req.NewPassword);
        user.UpdatedAt      = DateTime.UtcNow;
        await _users.UpdateAsync(user);

        await _resets.MarkUsedAsync(reset.Id);
        _blacklist.RevokeUserTokens(user.Id);

        await _audit.LogAsync(AuditEventType.PasswordChanged,
            userId: user.Id, userEmail: user.Email, resourceType: "user", resourceId: user.Id,
            actionDetails: new { method = "reset_code" },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { detail = "Password reset successfully." });
    }

    // ── POST /api/auth/change-password ────────────────────────────────────────
    /// <summary>
    /// Logged-in user changes their own password. Requires the current password
    /// for re-authentication. On success all existing tokens for the user are
    /// revoked — other devices must sign in again with the new password.
    /// </summary>
    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { detail = "Not authenticated." });

        var user = await _users.GetByIdAsync(userId);
        if (user == null) return Unauthorized(new { detail = "Not authenticated." });

        if (string.IsNullOrEmpty(req.CurrentPassword) || !_hasher.Verify(req.CurrentPassword, user.HashedPassword))
        {
            await _audit.LogAsync(AuditEventType.PasswordChanged,
                userId: user.Id, userEmail: user.Email, resourceType: "user", resourceId: user.Id,
                actionDetails: new { method = "change_password", reason = "wrong_current_password" },
                status: "failed",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());
            return BadRequest(new { detail = "Current password is incorrect." });
        }

        var (valid, error) = PasswordValidator.Validate(req.NewPassword ?? "");
        if (!valid) return BadRequest(new { detail = error });

        if (_hasher.Verify(req.NewPassword!, user.HashedPassword))
            return BadRequest(new { detail = "New password must be different from the current password." });

        user.HashedPassword = _hasher.Hash(req.NewPassword!);
        user.UpdatedAt      = DateTime.UtcNow;
        await _users.UpdateAsync(user);

        // Force re-login on all sessions (current device too — caller picks a new token next).
        _blacklist.RevokeUserTokens(user.Id);

        await _audit.LogAsync(AuditEventType.PasswordChanged,
            userId: user.Id, userEmail: user.Email, resourceType: "user", resourceId: user.Id,
            actionDetails: new { method = "change_password" },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { detail = "Password changed successfully. Please sign in again." });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<TokenResponse> BuildTokenResponseAsync(User user)
    {
        var campaignIds = await _users.GetCampaignIdsAsync(user.Id);
        return new TokenResponse(
            AccessToken  : _jwt.CreateAccessToken(user),
            RefreshToken : _jwt.CreateRefreshToken(user),
            TokenType    : "bearer",
            User         : ToUserDto(user, campaignIds));
    }

    private static UserDto ToUserDto(User user, List<string> campaignIds) => new(
        Id                 : user.Id,
        Email              : user.Email,
        Name               : user.Name,
        Role               : user.Role switch {
            Core.Enums.UserRole.SuperAdmin      => "super_admin",
            Core.Enums.UserRole.OrgAdmin        => "org_admin",
            Core.Enums.UserRole.KioskVolunteer  => "kiosk_volunteer",
            _                                   => user.Role.ToString().ToLowerInvariant()
        },
        CanApproveTransfers: user.CanApproveTransfers,
        IsActive           : user.IsActive,
        CampaignAccess     : campaignIds,
        CreatedAt          : user.CreatedAt,
        UpdatedAt          : user.UpdatedAt);

    private string? GetCurrentUserId()
        => User.FindFirst("sub")?.Value
        ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

    private static string GenerateResetCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return string.Create(8, chars, (span, c) =>
        {
            Span<byte> bytes = stackalloc byte[8];
            RandomNumberGenerator.Fill(bytes);
            for (int i = 0; i < span.Length; i++)
                span[i] = c[bytes[i] % c.Length];
        });
    }
}
