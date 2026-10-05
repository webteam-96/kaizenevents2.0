namespace KaizenEvents.Core.DTOs.User;

public record CreateUserRequest(
    string Email,
    string Name,
    string Password,
    string Role,
    List<string> CampaignAccess,
    bool CanApproveTransfers);

public record UpdateUserRequest(
    string? Name,
    string? Role,
    string? Password,
    List<string>? CampaignAccess,
    bool? CanApproveTransfers);

public record UpdateUserAccessRequest(List<string> CampaignIds);
