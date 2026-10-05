namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// Writes tamper-evident audit log entries per CLAUDE.md Section 9.
/// Hash chain: integrity_hash = SHA-256(JSON(entry) + previous_hash)
/// Email masking: john.doe@example.com → j******e@example.com
/// Field redaction: sensitive keys → [REDACTED]
/// Dual write: file (logs/audit.log) + database
/// </summary>
public interface IAuditLoggerService
{
    Task LogAsync(
        string eventType,
        string? userId         = null,
        string? userEmail      = null,
        string? resourceType   = null,
        string? resourceId     = null,
        object? actionDetails  = null,
        string  status         = "success",
        string? errorMessage   = null,
        string? ipAddress      = null,
        string? userAgent      = null);
}

/// <summary>Standard event type constants per CLAUDE.md §9.</summary>
public static class AuditEventType
{
    // Auth
    public const string LoginSuccess        = "LOGIN_SUCCESS";
    public const string LoginFailed         = "LOGIN_FAILED";
    public const string Logout              = "LOGOUT";
    public const string TokenRefresh        = "TOKEN_REFRESH";
    public const string PasswordChanged     = "PASSWORD_CHANGED";
    public const string PasswordReset       = "PASSWORD_RESET";

    // Users
    public const string UserCreated         = "USER_CREATED";
    public const string UserUpdated         = "USER_UPDATED";
    public const string UserDeleted         = "USER_DELETED";
    public const string UserAccessChanged   = "USER_ACCESS_CHANGED";

    // Campaigns
    public const string CampaignCreated     = "CAMPAIGN_CREATED";
    public const string CampaignUpdated     = "CAMPAIGN_UPDATED";
    public const string CampaignArchived    = "CAMPAIGN_ARCHIVED";
    public const string CampaignUnarchived  = "CAMPAIGN_UNARCHIVED";

    // Registrations
    public const string RegistrationCreated = "REGISTRATION_CREATED";
    public const string RegistrationUpdated = "REGISTRATION_UPDATED";
    public const string RegistrationCancelled="REGISTRATION_CANCELLED";

    // Payments
    public const string PaymentInitiated    = "PAYMENT_INITIATED";
    public const string PaymentVerified     = "PAYMENT_VERIFIED";
    public const string PaymentFailed       = "PAYMENT_FAILED";
    public const string PaymentWebhook      = "PAYMENT_WEBHOOK";
    public const string RefundInitiated     = "REFUND_INITIATED";
    public const string RefundCompleted     = "REFUND_COMPLETED";

    // Fund transfers
    public const string FundTransferRequested = "FUND_TRANSFER_REQUESTED";
    public const string FundTransferApproved  = "FUND_TRANSFER_APPROVED";
    public const string FundTransferRejected  = "FUND_TRANSFER_REJECTED";
    public const string FundTransferCompleted = "FUND_TRANSFER_COMPLETED";

    // Offline payments
    public const string OfflineRegistration  = "OFFLINE_REGISTRATION";
    public const string OtpVerified          = "OTP_VERIFIED";
    public const string CashConfirmed        = "CASH_CONFIRMED";
    public const string NoShow               = "NO_SHOW";

    // Kiosk
    public const string KioskCheckIn         = "KIOSK_CHECK_IN";
    public const string KioskRegister        = "KIOSK_REGISTER";

    // Data management
    public const string DataExported         = "DATA_EXPORTED";
    public const string MembersUploaded      = "MEMBERS_UPLOADED";
    public const string FormUpdated          = "FORM_UPDATED";

    // Admin
    public const string ChangeRequestCreated = "CHANGE_REQUEST_CREATED";
    public const string ChangeRequestApproved= "CHANGE_REQUEST_APPROVED";
    public const string ChangeRequestRejected= "CHANGE_REQUEST_REJECTED";
    public const string SystemConfig         = "SYSTEM_CONFIG";
}
