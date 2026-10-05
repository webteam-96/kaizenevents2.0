using System.Text.Json;

namespace KaizenEvents.Core.DTOs.Registration;

public record SubmitRegistrationRequest(
    string CampaignId,
    Dictionary<string, JsonElement> FormData,
    decimal TotalAmount,
    string? CouponCode,
    string? MemberId,
    // Field IDs the client determined hidden (by field rules / skipped pages). These
    // are skipped during required-field validation — the client is the source of truth
    // for what the registrant actually saw. The server still runs its own field-rule
    // hide check as a fallback when this is null/empty.
    List<string>? HiddenFieldIds = null,

    // Set when the registrant is correcting an attempt they just made — they hit "Back to
    // form" on the payment screen, changed something and submitted again. Without these the
    // second submit created a SECOND registration and left the first sitting there payable,
    // so a reminder link could still be paid for the name they had already corrected.
    // PaymentToken is the registration's own resume secret, handed back by the create
    // response; it is what proves this caller owns the registration it is asking to amend,
    // since this endpoint is anonymous. A mismatch is not an error — it just means a new
    // registration is created, exactly as before.
    string? ExistingRegistrationId = null,
    string? PaymentToken = null);

public record PaymentInitiateRequest(
    string RegistrationId,
    string? PaymentGateway,
    string? ReturnUrl);

public record VerifyRazorpayRequest(
    string RegistrationId,
    string RazorpayOrderId,
    string RazorpayPaymentId,
    string RazorpaySignature);

public record UpdateRegistrationRequest(
    // Nullable so a registration-ID-only edit doesn't have to resend (and risk wiping) form data.
    Dictionary<string, JsonElement>? FormData,
    decimal? TotalAmount,
    // Admin override of the human-facing registration ID. Null = leave unchanged;
    // empty string = clear back to the auto-generated fallback (Id[..8]).
    string? RegistrationNumber = null);

public record CreateRefundRequest(
    string RegistrationId,
    decimal Amount,
    string Reason);

public record VerifyCashfreeRequest(
    string RegistrationId,
    string OrderId);

public record RetryPendingPaymentRequest(
    string? PaymentGateway = null,
    string? ReturnUrl = null);

public record PaymentCallbackRequest(
    string RegistrationId,
    string? PaymentId,
    string? PaymentGateway,
    string Status,
    decimal Amount);

/// <summary>Super-admin backfill: resend confirmation emails for these registration IDs.</summary>
public record ResendConfirmationRequest(List<string> RegistrationIds);
