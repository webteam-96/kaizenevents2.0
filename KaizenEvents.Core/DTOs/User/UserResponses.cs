namespace KaizenEvents.Core.DTOs.User;

public record UserResponse(
    string Id,
    string Email,
    string? Name,
    string Role,
    List<string> CampaignAccess,
    bool CanApproveTransfers,
    bool IsActive,
    DateTime CreatedAt);
