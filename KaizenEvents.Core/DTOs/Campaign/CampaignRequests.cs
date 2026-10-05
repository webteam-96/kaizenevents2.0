using KaizenEvents.Core.Enums;

namespace KaizenEvents.Core.DTOs.Campaign;

public record CreateCampaignRequest(
    string Name,
    string OrganizationName,
    CampaignType CampaignType,
    FundCollectionMode? FundCollectionMode,
    string PaymentCollectionMethod,
    PaymentGateway PaymentGateway,
    string? PaymentAccountId,
    string? PaymentPurpose,
    string? Description,
    DateTime? StartDate,
    DateTime? EndDate,
    DateTime? RegistrationStartDate,
    DateTime? RegistrationEndDate,
    int? MaxRegistrations,
    bool ShowOnHomepage,
    bool KioskEnabled,
    bool UseExternalForm,
    string? ExternalFormUrl,
    // Free-event flag. Defaults true (paid) when the client omits it.
    bool PaymentEnabled = true);

public record UpdateCampaignRequest(
    string? Name,
    string? OrganizationName,
    CampaignType? CampaignType,
    FundCollectionMode? FundCollectionMode,
    string? PaymentCollectionMethod,
    PaymentGateway? PaymentGateway,
    string? PaymentAccountId,
    string? PaymentPurpose,
    string? Description,
    DateTime? StartDate,
    DateTime? EndDate,
    DateTime? RegistrationStartDate,
    DateTime? RegistrationEndDate,
    // true = remove the registration window (nulls alone are treated as "no change")
    bool? ClearRegistrationDates,
    int? MaxRegistrations,
    bool? ShowOnHomepage,
    bool? ShowOrganizationName,
    bool? ShowDescription,
    bool? ShowEventLogo,
    bool? KioskEnabled,
    bool? RegistrationEnabled,
    bool? HasLandingPage,
    bool? UseExternalForm,
    bool? PaymentEnabled,
    bool? WhatsappEnabled,
    string? ExternalFormUrl,
    string? EventLogo,
    string? LogoUrl,
    CampaignStatus? Status,
    // Custom ID sequences — empty string clears a prefix (null = no change)
    string? RegistrationIdPrefix,
    int? RegistrationNextNumber,
    string? InvoicePrefix,
    int? InvoiceNextNumber);
