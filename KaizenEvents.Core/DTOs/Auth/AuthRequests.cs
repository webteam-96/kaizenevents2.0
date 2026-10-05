namespace KaizenEvents.Core.DTOs.Auth;

public record RegisterRequest(
    string Email,
    string Name,
    string Password);

public record LoginRequest(
    string Email,
    string Password);

public record RefreshTokenRequest(
    string RefreshToken);

public record PasswordResetRequestDto(
    string Email);

public record PasswordResetConfirmRequest(
    string Email,
    string Code,
    string NewPassword);

public record ChangePasswordRequest(
    string CurrentPassword,
    string NewPassword);
