namespace KaizenEvents.Core.DTOs.Auth;

public record TokenResponse(
    string AccessToken,
    string RefreshToken,
    string TokenType,
    UserDto User);

public record UserDto(
    string Id,
    string Email,
    string Name,
    string Role,
    bool CanApproveTransfers,
    bool IsActive,
    List<string> CampaignAccess,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record MessageResponse(string Message);

public record LoginBlockedResponse(
    string Detail,
    int RetryAfter,
    int RemainingAttempts);
