using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KaizenEvents.API.Helpers;
using KaizenEvents.Core.DTOs.Payment;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentController : ApiControllerBase
{
    private readonly IPaymentRepository _payments;
    private readonly IRegistrationRepository _registrations;
    private readonly ICampaignRepository _campaigns;
    private readonly IPaymentAccountRepository _paymentAccounts;
    private readonly IOrphanPaymentRepository _orphanPayments;
    private readonly ICouponCodeRepository _coupons;
    private readonly IRazorpayService _razorpay;
    private readonly IInstamojoService _instamojo;
    private readonly ICashfreeService _cashfree;
    private readonly ICashfreeSplitResolver _cashfreeSplits;
    private readonly IRazorpaySplitResolver _razorpaySplits;
    private readonly IKaizenGatewayService _kaizenGateway;
    private readonly ICashfreeKycRepository _kyc;
    private readonly IRazorpayRouteAccountRepository _razorpayRoute;
    private readonly ICampaignVendorSplitRepository _vendorSplits;
    private readonly IEncryptionService _enc;
    private readonly IAuditLoggerService _audit;
    private readonly IPaymentArchiveService _archive;
    private readonly IRegistrationEmailService _regEmail;
    private readonly IGoogleSheetsService _sheets;
    private readonly IConfiguration _config;
    private readonly ILogger<PaymentController> _logger;

    public PaymentController(
        IPaymentRepository payments,
        IRegistrationRepository registrations,
        ICampaignRepository campaigns,
        IPaymentAccountRepository paymentAccounts,
        IOrphanPaymentRepository orphanPayments,
        ICouponCodeRepository coupons,
        IRazorpayService razorpay,
        IInstamojoService instamojo,
        ICashfreeService cashfree,
        ICashfreeSplitResolver cashfreeSplits,
        IRazorpaySplitResolver razorpaySplits,
        IKaizenGatewayService kaizenGateway,
        ICashfreeKycRepository kyc,
        IRazorpayRouteAccountRepository razorpayRoute,
        ICampaignVendorSplitRepository vendorSplits,
        IEncryptionService enc,
        IAuditLoggerService audit,
        IPaymentArchiveService archive,
        IRegistrationEmailService regEmail,
        IGoogleSheetsService sheets,
        IConfiguration config,
        ILogger<PaymentController> logger)
    {
        _payments       = payments;
        _registrations  = registrations;
        _campaigns      = campaigns;
        _paymentAccounts= paymentAccounts;
        _orphanPayments = orphanPayments;
        _coupons        = coupons;
        _razorpay       = razorpay;
        _instamojo      = instamojo;
        _cashfree       = cashfree;
        _cashfreeSplits = cashfreeSplits;
        _razorpaySplits = razorpaySplits;
        _kaizenGateway  = kaizenGateway;
        _kyc            = kyc;
        _razorpayRoute  = razorpayRoute;
        _vendorSplits   = vendorSplits;
        _enc            = enc;
        _audit          = audit;
        _archive        = archive;
        _regEmail       = regEmail;
        _sheets         = sheets;
        _config         = config;
        _logger         = logger;
    }

    /// <summary>
    /// Best-effort archive write to the gateway-specific *_datadetails table.
    /// Failures are logged but never block the payment flow.
    /// </summary>
    private async Task ArchivePaymentSafelyAsync(Payment payment)
    {
        try
        {
            var campaign = await _campaigns.GetByIdAsync(payment.CampaignId);
            if (campaign == null) return;
            var registration = await _registrations.GetByIdAsync(payment.RegistrationId);
            await _archive.ArchivePaymentAsync(payment, campaign, registration);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to archive payment {PaymentId}", payment.Id);
        }
    }

    // ── POST /api/payments/create ─────────────────────────────────────────────
    [HttpPost("create")]
    [AllowAnonymous]
    public async Task<IActionResult> Create([FromBody] CreatePaymentRequest req)
    {
        var registration = await _registrations.GetByIdAsync(req.RegistrationId);
        if (registration == null)
            return NotFound(new { detail = "Registration not found." });

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var gateway = (req.PaymentGateway ?? campaign.PaymentGateway.ToString()).ToLowerInvariant();

        // Safety net: if BuyerPhone is blank, try to resolve from the registration's
        // form_data by finding a field of type phone/tel. If still missing, fail fast
        // instead of silently substituting a dummy number (which Instamojo rejects).
        var buyerPhoneResolved = req.BuyerPhone;
        if (string.IsNullOrWhiteSpace(buyerPhoneResolved))
        {
            buyerPhoneResolved = TryResolvePhoneFromFormData(registration, campaign) ?? "";
            if (string.IsNullOrWhiteSpace(buyerPhoneResolved))
                return BadRequest(new { detail = "Buyer phone is required. Please add a phone field to the registration form." });
            _logger.LogInformation("BuyerPhone was blank in request; resolved from registration form_data: {Phone}", buyerPhoneResolved);
        }

        PaymentAccount? account = null;
        if (campaign.PaymentAccountId != null)
            account = await _paymentAccounts.GetByIdAsync(campaign.PaymentAccountId);

        var payment = new Payment
        {
            Id             = Guid.NewGuid().ToString(),
            CampaignId     = campaign.Id,
            RegistrationId = registration.Id,
            Amount         = req.Amount,
            Gateway        = gateway,
            PaymentAccountId = campaign.PaymentAccountId,
            BuyerName      = req.BuyerName,
            BuyerEmail     = req.BuyerEmail,
            BuyerPhone     = buyerPhoneResolved,
            Purpose        = req.Purpose,
            Status         = "pending",
            Source         = "web",
            CreatedAt      = DateTime.UtcNow,
            UpdatedAt      = DateTime.UtcNow
        };

        string? paymentUrl = null;
        string? orderId    = null;
        string? keyId      = null;
        string? paymentSessionId = null;
        string? cashfreeMode     = null;
        string? proxyMethod      = null;
        string? proxyFormAction  = null;
        Dictionary<string, string>? proxyFormFields = null;

        if (gateway == "razorpay")
        {
            // Direct-to-organizer: payment lands on the organizer's Razorpay merchant
            // account. When the account is in Route mode (RazorpayRoute enabled + a
            // Kaizen default vendor set), the gateway's Route transfers[] route
            // per-event slices at order time. Accounts in single_account mode always
            // take the plain path — see RazorpaySplitResolver.DecideAsync.
            RazorpayOrderResult order;
            var decision = await _razorpaySplits.DecideAsync(campaign, account, req.Amount);
            if (decision.ErrorDetail != null)
                return BadRequest(new { detail = decision.ErrorDetail });

            if (decision.UseRoute)
            {
                order = await _razorpay.CreateOrderWithTransfersAsync(
                    req.Amount, registration.InvoiceNumber ?? registration.Id, decision.Splits!.Transfers!);
                payment.VendorSplitsJson = decision.Splits.TransfersJson;
            }
            else
            {
                order = await _razorpay.CreateOrderAsync(req.Amount, registration.InvoiceNumber ?? registration.Id);
            }

            payment.GatewayOrderId = order.OrderId;
            orderId = order.OrderId;

            // Try per-account key first; fall back to global config if decryption fails or not set
            keyId = _config["Razorpay:KeyId"] ?? string.Empty;
            if (!string.IsNullOrEmpty(account?.RazorpayKeyId))
            {
                try { keyId = _enc.Decrypt(account.RazorpayKeyId); }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to decrypt RazorpayKeyId for account {Id} — using global config key", account.Id); }
            }
        }
        else if (gateway == "instamojo")
        {
            var pr = await _instamojo.CreatePaymentRequestAsync(
                req.Amount, req.Purpose, req.BuyerName, req.BuyerEmail, buyerPhoneResolved);
            payment.GatewayPaymentRequestId = pr.PaymentRequestId;
            paymentUrl = pr.PaymentUrl;
        }
        else if (gateway == "cashfree")
        {
            // Direct-to-organizer: payment lands on the organizer's Cashfree merchant
            // account. When CashfreeVendorSplits is enabled + a Kaizen default vendor is
            // configured, the gateway's Easy Split routes per-event slices (incl. the
            // Kaizen commission) at order time. No Kaizen-hosted proxy.
            IReadOnlyList<CashfreeVendorSplit>? vendorSplits = null;
            string? vendorSplitsJson = null;
            if (_config.GetValue<bool>("CashfreeVendorSplits:Enabled"))
            {
                var resolved = await _cashfreeSplits.ResolveAsync(campaign.Id, req.Amount);
                if (resolved.ErrorDetail != null)
                    return BadRequest(new { detail = resolved.ErrorDetail });
                vendorSplits     = resolved.Splits;
                vendorSplitsJson = resolved.SplitsJson;
            }

            var returnUrl = $"{(_config["App:FrontendUrl"] ?? "").TrimEnd('/')}/payment-complete";

            var cfOrderId = $"CF-{registration.Id[..8].ToUpperInvariant()}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
            var cfCreds   = BuildCashfreeCredentialsForReturn(account);
            var cfOrder = await _cashfree.CreateOrderAsync(
                req.Amount, cfOrderId, req.BuyerName, req.BuyerEmail,
                buyerPhoneResolved,
                returnUrl, cfCreds, notifyUrl: null, vendorSplits);

            payment.GatewayOrderId   = cfOrder.OrderId;
            payment.VendorSplitsJson = vendorSplitsJson;
            orderId = cfOrder.OrderId;

            cashfreeMode      = account?.CashfreeMode ?? _config["Cashfree:Mode"] ?? "sandbox";
            paymentSessionId  = cfOrder.PaymentSessionId;
        }

        await _payments.CreateAsync(payment);

        await _audit.LogAsync(AuditEventType.PaymentInitiated,
            resourceType: "payment", resourceId: payment.Id,
            actionDetails: new { registration_id = req.RegistrationId, campaign_id = req.CampaignId, gateway, amount = req.Amount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        // Link payment to registration
        registration.PaymentId      = payment.Id;
        registration.PaymentGateway = gateway;
        registration.UpdatedAt      = DateTime.UtcNow;
        await _registrations.UpdateAsync(registration);

        return Ok(new PaymentResponse(
            PaymentId        : payment.Id,
            Gateway          : gateway,
            PaymentUrl       : paymentUrl,
            OrderId          : orderId,
            RazorpayKeyId    : keyId,
            Amount           : req.Amount,
            Currency         : "INR",
            Status           : "pending",
            PaymentSessionId : paymentSessionId,
            CashfreeMode     : cashfreeMode,
            Method           : proxyMethod,
            FormAction       : proxyFormAction,
            FormFields       : proxyFormFields));
    }

    // ── POST /api/payments/verify/razorpay ────────────────────────────────────
    [HttpPost("verify/razorpay")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyRazorpay([FromBody] VerifyRazorpayPaymentRequest req)
    {
        var payment = await _payments.GetByIdAsync(req.PaymentId);
        if (payment == null)
            return NotFound(new { detail = "Payment not found." });

        // Idempotent
        if (payment.Status == "completed")
            return Ok(new PaymentVerifyResponse(true, "Payment already verified.", "completed", payment.Id));

        // Verify signature
        if (!_razorpay.VerifyPaymentSignature(req.RazorpayOrderId, req.RazorpayPaymentId, req.RazorpaySignature))
        {
            payment.Status    = "failed";
            payment.UpdatedAt = DateTime.UtcNow;
            await _payments.UpdateAsync(payment);

            await _audit.LogAsync(AuditEventType.PaymentFailed,
                resourceType: "payment", resourceId: payment.Id,
                actionDetails: new { reason = "invalid_signature", gateway = "razorpay" },
                status: "failed",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

            return BadRequest(new { detail = "Invalid payment signature." });
        }

        await CompletePaymentAsync(payment, req.RazorpayPaymentId);

        await _audit.LogAsync(AuditEventType.PaymentVerified,
            resourceType: "payment", resourceId: payment.Id,
            actionDetails: new { gateway = "razorpay", registration_id = payment.RegistrationId, amount = payment.Amount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new PaymentVerifyResponse(true, "Payment verified successfully.", "completed", payment.Id));
    }

    // ── POST /api/payments/webhook/razorpay ───────────────────────────────────
    /// <summary>
    /// Razorpay webhook endpoint. Backup for when users close the browser mid-payment.
    /// Events: payment.captured, payment.failed, order.paid, refund.processed, etc.
    /// Auth: HMAC-SHA256 of raw body using Razorpay.WebhookSecret (configure in dashboard → Webhooks).
    /// </summary>
    [HttpPost("webhook/razorpay")]
    [AllowAnonymous]
    public async Task<IActionResult> RazorpayWebhook()
    {
        // Read raw body (required for signature verification — can't use model binding)
        string rawBody;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            rawBody = await reader.ReadToEndAsync();

        var signature = Request.Headers["X-Razorpay-Signature"].ToString();

        // Verify signature
        if (!_razorpay.VerifyWebhookSignature(rawBody, signature))
        {
            _logger.LogWarning("Razorpay webhook signature verification failed");
            return BadRequest(new { status = "error", message = "Signature verification failed." });
        }

        using var doc = JsonDocument.Parse(rawBody);
        var root = doc.RootElement;

        var eventType = root.TryGetProperty("event", out var eventEl) ? eventEl.GetString() : null;
        _logger.LogInformation("Razorpay webhook received: {EventType}", eventType);

        // Only process payment success events
        if (eventType != "payment.captured" && eventType != "order.paid")
        {
            return Ok(new { status = "ok", message = $"Event {eventType} acknowledged." });
        }

        // Extract payment details from payload.payment.entity
        if (!root.TryGetProperty("payload", out var payloadEl) ||
            !payloadEl.TryGetProperty("payment", out var paymentEl) ||
            !paymentEl.TryGetProperty("entity", out var entityEl))
        {
            return Ok(new { status = "error", message = "Missing payment entity in payload." });
        }

        var orderId     = entityEl.TryGetProperty("order_id", out var oid)  ? oid.GetString()  : null;
        var rzpPayId    = entityEl.TryGetProperty("id", out var pid)        ? pid.GetString()  : null;
        decimal amount  = entityEl.TryGetProperty("amount", out var amt)    ? amt.GetDecimal() / 100m : 0;

        if (string.IsNullOrEmpty(orderId))
            return Ok(new { status = "error", message = "Missing order_id." });

        // Find payment record
        var payment = await _payments.GetByGatewayOrderIdAsync(orderId);
        if (payment == null)
        {
            _logger.LogWarning("Razorpay webhook: payment not found for order_id {OrderId}", orderId);
            await _orphanPayments.CreateAsync(new OrphanPayment
            {
                Id               = Guid.NewGuid().ToString(),
                Type             = "razorpay_webhook",
                RawPayload       = rawBody,
                GatewayPaymentId = rzpPayId,
                Amount           = amount,
                Status           = "needs_review",
                CreatedAt        = DateTime.UtcNow
            });
            return Ok(new { status = "error", message = "Payment not found." });
        }

        // Idempotent — if already completed, ack and exit
        if (payment.Status == "completed")
            return Ok(new { status = "ok", message = "Already processed." });

        // Update payment
        payment.GatewayPaymentId = rzpPayId;
        payment.Status           = "completed";
        payment.PaidAt           = DateTime.UtcNow;
        payment.UpdatedAt        = DateTime.UtcNow;

        // Fetch fee + tax from Razorpay (best-effort — failure here doesn't block payment)
        if (!string.IsNullOrEmpty(rzpPayId))
        {
            var details = await _razorpay.GetPaymentDetailsAsync(rzpPayId);
            if (details != null)
            {
                payment.GatewayFee         = details.Fee;
                payment.GatewayTax         = details.Tax;
                payment.SettlementAmount   = details.Amount - details.Fee - details.Tax;
                payment.SettlementStatus   = "synced";
                payment.SettlementSyncedAt = DateTime.UtcNow;
            }
        }

        await _payments.UpdateAsync(payment);

        // Finalize registration
        await FinalizeRegistrationAsync(payment);
        await ArchivePaymentSafelyAsync(payment);

        await _audit.LogAsync(AuditEventType.PaymentWebhook,
            resourceType: "payment", resourceId: payment.Id,
            actionDetails: new { gateway = "razorpay", order_id = orderId, razorpay_payment_id = rzpPayId, amount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        _logger.LogInformation("Razorpay webhook processed: order {OrderId} → payment {PaymentId} completed", orderId, payment.Id);
        return Ok(new { status = "success", message = "Payment confirmed." });
    }

    // ── POST /api/payments/webhook/instamojo ──────────────────────────────────
    /// <summary>Instamojo webhook for registrations created through the platform.</summary>
    [HttpPost("webhook/instamojo")]
    [AllowAnonymous]
    public async Task<IActionResult> InstamojoWebhook()
    {
        var form = await Request.ReadFormAsync();
        var payload = form.ToDictionary(k => k.Key, k => k.Value.ToString());

        // Diagnostic: log every webhook hit so "is Instamojo reaching us?" is trivially answerable.
        _logger.LogInformation(
            "Instamojo webhook received: keys=[{Keys}], payment_request_id={PrId}, status={Status}",
            string.Join(",", payload.Keys),
            payload.GetValueOrDefault("payment_request_id"),
            payload.GetValueOrDefault("status"));

        if (!payload.TryGetValue("payment_request_id", out var prId) || string.IsNullOrEmpty(prId))
            return Ok(new { status = "error", message = "Missing payment_request_id." });

        if (!payload.TryGetValue("payment_id", out var gwPaymentId))
            gwPaymentId = null;

        payload.TryGetValue("status", out var status);
        payload.TryGetValue("mac", out var mac);

        var payment = await _payments.GetByGatewayPaymentRequestIdAsync(prId);
        if (payment == null)
        {
            _logger.LogWarning("Instamojo webhook: payment not found for request_id {PrId}", prId);
            return Ok(new { status = "error", message = "Payment not found." });
        }

        // MAC verification
        if (!string.IsNullOrEmpty(mac))
        {
            var account = payment.PaymentAccountId != null
                ? await _paymentAccounts.GetByIdAsync(payment.PaymentAccountId)
                : null;

            string? salt = null;
            if (!string.IsNullOrEmpty(account?.InstamojoSalt))
            {
                try { salt = _enc.Decrypt(account.InstamojoSalt); }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to decrypt InstamojoSalt for account {Id}", account.Id); }
            }
            if (!string.IsNullOrEmpty(salt))
            {
                var sorted = payload
                    .Where(kv => kv.Key != "mac")
                    .OrderBy(kv => kv.Key)
                    .ToList();

                if (!_instamojo.VerifyWebhookMac(mac, salt, sorted))
                {
                    _logger.LogWarning("Instamojo webhook MAC mismatch for request_id {PrId}", prId);
                    return BadRequest(new { status = "error", message = "MAC verification failed." });
                }
            }
            else
            {
                _logger.LogWarning("Instamojo salt not configured for payment account — skipping MAC verification");
            }
        }

        var isCredit = string.Equals(status, "credit", StringComparison.OrdinalIgnoreCase);
        payment.GatewayPaymentId = gwPaymentId;
        payment.Status           = isCredit ? "completed" : "failed";
        payment.UpdatedAt        = DateTime.UtcNow;
        if (isCredit) payment.PaidAt = DateTime.UtcNow;

        // Best-effort fee fetch from Instamojo (failure doesn't block payment)
        if (isCredit && !string.IsNullOrEmpty(gwPaymentId))
        {
            var details = await _instamojo.GetPaymentDetailsAsync(gwPaymentId);
            if (details != null)
            {
                payment.GatewayFee         = details.Fee;
                payment.GatewayTax         = details.Tax;
                payment.SettlementAmount   = details.Amount - details.Fee - details.Tax;
                payment.SettlementStatus   = "synced";
                payment.SettlementSyncedAt = DateTime.UtcNow;
            }
        }

        await _payments.UpdateAsync(payment);

        if (isCredit)
        {
            await FinalizeRegistrationAsync(payment);
            await ArchivePaymentSafelyAsync(payment);
        }

        return Ok(new { status = "success", message = "Webhook processed." });
    }

    // ── POST /api/payments/webhook/cashfree ─────────────────────────────────────
    /// <summary>
    /// Cashfree sends payment webhook with RSA-SHA256 signed payload.
    /// Headers: x-webhook-signature, x-webhook-timestamp
    /// Body: JSON with type (PAYMENT_SUCCESS_WEBHOOK, etc.) and data.order.order_id + data.payment.
    /// </summary>
    [HttpPost("webhook/cashfree")]
    [AllowAnonymous]
    public async Task<IActionResult> CashfreeWebhook()
    {
        // Read raw body for signature verification
        string rawBody;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            rawBody = await reader.ReadToEndAsync();

        var timestamp = Request.Headers["x-webhook-timestamp"].ToString();
        var signature = Request.Headers["x-webhook-signature"].ToString();

        // Verify signature
        if (!string.IsNullOrEmpty(signature))
        {
            if (!_cashfree.VerifyWebhookSignature(timestamp, rawBody, signature))
            {
                _logger.LogWarning("Cashfree webhook signature verification failed");
                return BadRequest(new { status = "error", message = "Signature verification failed." });
            }
        }

        // Parse payload
        using var doc = JsonDocument.Parse(rawBody);
        var root = doc.RootElement;

        var eventType = root.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;
        _logger.LogInformation("Cashfree webhook received: {EventType}", eventType);

        if (eventType != "PAYMENT_SUCCESS_WEBHOOK")
        {
            // Log non-success events but return OK so Cashfree doesn't retry
            _logger.LogInformation("Cashfree webhook event {Type} — no action needed", eventType);
            return Ok(new { status = "ok", message = $"Event {eventType} acknowledged." });
        }

        // Extract order_id and payment details
        if (!root.TryGetProperty("data", out var dataEl))
            return Ok(new { status = "error", message = "Missing data in payload." });

        string? orderId = null;
        string? cfPaymentId = null;
        decimal? amount = null;

        if (dataEl.TryGetProperty("order", out var orderEl))
        {
            orderId = orderEl.TryGetProperty("order_id", out var oid) ? oid.GetString() : null;
            amount  = orderEl.TryGetProperty("order_amount", out var amt) ? amt.GetDecimal() : null;
        }

        if (dataEl.TryGetProperty("payment", out var payEl))
        {
            cfPaymentId = payEl.TryGetProperty("cf_payment_id", out var cfId) ? cfId.ToString() : null;
        }

        if (string.IsNullOrEmpty(orderId))
            return Ok(new { status = "error", message = "Missing order_id in payload." });

        // Find payment record
        var payment = await _payments.GetByGatewayOrderIdAsync(orderId);
        if (payment == null)
        {
            _logger.LogWarning("Cashfree webhook: payment not found for order_id {OrderId}", orderId);
            // Store as orphan payment
            await _orphanPayments.CreateAsync(new OrphanPayment
            {
                Id               = Guid.NewGuid().ToString(),
                Type             = "cashfree_webhook",
                RawPayload       = rawBody,
                GatewayPaymentId = cfPaymentId,
                Amount           = amount ?? 0,
                Status           = "needs_review",
                CreatedAt        = DateTime.UtcNow
            });
            return Ok(new { status = "error", message = "Payment not found." });
        }

        // Already completed — idempotent
        if (payment.Status == "completed")
            return Ok(new { status = "ok", message = "Already processed." });

        // Update payment
        payment.GatewayPaymentId = cfPaymentId;
        payment.Status           = "completed";
        payment.PaidAt           = DateTime.UtcNow;
        payment.UpdatedAt        = DateTime.UtcNow;

        // Best-effort fee fetch from Cashfree's per-order payments endpoint
        if (!string.IsNullOrEmpty(orderId))
        {
            var detailsList = await _cashfree.GetOrderPaymentsAsync(orderId);
            // Match on cf_payment_id when we have it, else just take the first SUCCESS row
            var match = !string.IsNullOrEmpty(cfPaymentId)
                ? detailsList.FirstOrDefault(d => string.Equals(d.CfPaymentId, cfPaymentId, StringComparison.OrdinalIgnoreCase))
                : detailsList.FirstOrDefault(d => string.Equals(d.Status, "SUCCESS", StringComparison.OrdinalIgnoreCase));

            if (match != null)
            {
                payment.GatewayFee         = match.Fee;
                payment.GatewayTax         = match.Tax;
                payment.SettlementAmount   = match.Amount - match.Fee - match.Tax;
                payment.SettlementStatus   = "synced";
                payment.SettlementSyncedAt = DateTime.UtcNow;
            }
        }

        await _payments.UpdateAsync(payment);

        // Finalize registration (increment stats, sync sheets, coupon usage)
        await FinalizeRegistrationAsync(payment);
        await ArchivePaymentSafelyAsync(payment);

        await _audit.LogAsync(AuditEventType.PaymentWebhook,
            resourceType: "payment", resourceId: payment.Id,
            actionDetails: new { gateway = "cashfree", order_id = orderId, cf_payment_id = cfPaymentId, amount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        _logger.LogInformation("Cashfree webhook processed: order {OrderId} → payment {PaymentId} completed", orderId, payment.Id);
        return Ok(new { status = "success", message = "Payment confirmed." });
    }

    // ── POST /api/payments/cashfree/return ────────────────────────────────────
    /// <summary>
    /// Frontend's /payment-complete page calls this after returning from the Kaizen-hosted
    /// Cashfree proxy. Verifies the proxy's HMAC signature, then re-confirms with Cashfree's
    /// own API before activating the registration. Idempotent — safe to call multiple times.
    /// </summary>
    [HttpPost("cashfree/return")]
    [AllowAnonymous]
    public async Task<IActionResult> CashfreeReturn([FromBody] CashfreeReturnRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.OrderId)
            || string.IsNullOrWhiteSpace(req.Status)
            || string.IsNullOrWhiteSpace(req.Signature))
            return BadRequest(new { detail = "Missing required parameters." });

        if (!_kaizenGateway.IsConfigured)
            return BadRequest(new { detail = "Kaizen gateway not configured on server." });

        // 1. Verify proxy's signature on (order_id + status)
        var statusUpper = req.Status.ToUpperInvariant();
        if (!_kaizenGateway.VerifyReturnSignature(req.OrderId, statusUpper, req.Signature))
        {
            _logger.LogWarning("Kaizen proxy return signature mismatch for order {OrderId}", req.OrderId);
            return BadRequest(new { detail = "Invalid signature." });
        }

        // 2. Lookup our payment record
        var payment = await _payments.GetByGatewayOrderIdAsync(req.OrderId);
        if (payment == null)
            return NotFound(new { detail = "Payment not found for the given order_id." });

        // Idempotent — already finalized
        if (payment.Status == "completed")
        {
            var doneReg = await _registrations.GetByIdAsync(payment.RegistrationId);
            return Ok(new { status = "completed", registration_id = payment.RegistrationId, registration_number = doneReg?.RegistrationNumber });
        }

        // 3. Verify with Cashfree directly — never trust the redirect status alone
        var account = payment.PaymentAccountId != null
            ? await _paymentAccounts.GetByIdAsync(payment.PaymentAccountId)
            : null;
        var cfCreds = BuildCashfreeCredentialsForReturn(account);

        try
        {
            var cfStatus = await _cashfree.GetOrderStatusAsync(req.OrderId, cfCreds);
            var paid = string.Equals(cfStatus.OrderStatus, "PAID", StringComparison.OrdinalIgnoreCase);

            if (!paid)
            {
                payment.Status    = string.Equals(statusUpper, "CANCELLED", StringComparison.Ordinal) ? "failed" : "pending";
                payment.UpdatedAt = DateTime.UtcNow;
                await _payments.UpdateAsync(payment);
                return Ok(new { status = payment.Status, registration_id = payment.RegistrationId, gateway_status = cfStatus.OrderStatus });
            }

            await CompletePaymentAsync(payment, cfStatus.CfPaymentId ?? req.OrderId);

            await _audit.LogAsync(AuditEventType.PaymentVerified,
                resourceType: "payment", resourceId: payment.Id,
                actionDetails: new { gateway = "cashfree", order_id = req.OrderId, source = "kaizen_proxy_return" },
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

            var completedReg = await _registrations.GetByIdAsync(payment.RegistrationId);
            return Ok(new { status = "completed", registration_id = payment.RegistrationId, registration_number = completedReg?.RegistrationNumber });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to verify Cashfree order {OrderId} during proxy return", req.OrderId);
            return StatusCode(500, new { detail = "Could not verify payment with Cashfree. Try again or contact support." });
        }
    }

    private CashfreeCredentials? BuildCashfreeCredentialsForReturn(PaymentAccount? account)
    {
        if (account?.CashfreeAppId == null || account.CashfreeSecretKey == null) return null;
        try
        {
            return new CashfreeCredentials(
                AppId    : _enc.Decrypt(account.CashfreeAppId),
                SecretKey: _enc.Decrypt(account.CashfreeSecretKey),
                Mode     : account.CashfreeMode ?? "sandbox");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to decrypt Cashfree credentials for account {Id} — falling back to global config", account.Id);
            return null;
        }
    }

    // ── GET /api/payments/callback/instamojo ──────────────────────────────────
    [HttpGet("callback/instamojo")]
    [AllowAnonymous]
    public async Task<IActionResult> InstamojoCallback(
        [FromQuery] string? payment_id,
        [FromQuery] string? payment_request_id,
        [FromQuery] string? payment_status)
    {
        var frontendUrl = _config["App:FrontendUrl"] ?? "http://localhost:3000";

        if (string.IsNullOrEmpty(payment_request_id))
            return Redirect($"{frontendUrl}/payment-failed?error=missing_id");

        var payment = await _payments.GetByGatewayPaymentRequestIdAsync(payment_request_id);
        if (payment == null)
            return Redirect($"{frontendUrl}/payment-failed?error=not_found");

        if (payment.Status == "completed")
            return Redirect($"{frontendUrl}/payment-success?payment_id={payment.Id}&registration_id={payment.RegistrationId}");

        return Redirect($"{frontendUrl}/payment-status?payment_id={payment.Id}&registration_id={payment.RegistrationId}");
    }

    // ── GET /api/payments/status/{payment_id} ─────────────────────────────────
    [HttpGet("status/{payment_id}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetStatus(string payment_id)
    {
        var payment = await _payments.GetByIdAsync(payment_id);
        if (payment == null)
            return NotFound(new { detail = "Payment not found." });

        return Ok(new PaymentStatusResponse(
            PaymentId       : payment.Id,
            Status          : payment.Status,
            Gateway         : payment.Gateway,
            Amount          : payment.Amount,
            GatewayPaymentId: payment.GatewayPaymentId,
            PaidAt          : payment.PaidAt));
    }

    // ── GET /api/payments/registration/{registration_id} ─────────────────────
    [HttpGet("registration/{registration_id}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetByRegistration(string registration_id)
    {
        var payment = await _payments.GetByRegistrationIdAsync(registration_id);
        if (payment == null)
            return Ok(new RegistrationPaymentResponse(null));

        return Ok(new RegistrationPaymentResponse(new PaymentDetail(
            Id              : payment.Id,
            Status          : payment.Status,
            Gateway         : payment.Gateway,
            Amount          : payment.Amount,
            GatewayPaymentId: payment.GatewayPaymentId,
            PaidAt          : payment.PaidAt)));
    }

    // ── GET /api/payments/webhook-url/{campaign_slug} ─────────────────────────
    [HttpGet("webhook-url/{campaign_slug}")]
    [Authorize]
    public async Task<IActionResult> GetWebhookUrl(string campaign_slug)
    {
        var campaign = await _campaigns.GetBySlugAsync(campaign_slug);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        // Prefer the configured public base (includes the /api mount prefix in prod);
        // fall back to the request, keeping PathBase so IIS sub-application mounts resolve.
        var configuredBase = _config["App:PublicBaseUrl"];
        var baseUrl    = !string.IsNullOrWhiteSpace(configuredBase)
            ? configuredBase.TrimEnd('/')
            : $"{Request.Scheme}://{Request.Host}{Request.PathBase}";
        var webhookUrl = $"{baseUrl}/api/payments/webhook/instamojo/external/{campaign_slug}";

        return Ok(new WebhookUrlResponse(
            CampaignSlug: campaign.Slug,
            CampaignName: campaign.Name,
            WebhookUrl  : webhookUrl,
            Instructions: new List<string>
            {
                "1. Log in to your Instamojo dashboard.",
                "2. Go to Settings → Webhooks.",
                "3. Add the webhook URL above.",
                $"4. Configure your Instamojo salt in the campaign payment account settings."
            }));
    }

    // ── POST /api/payments/webhook/instamojo/external/{campaign_slug} ─────────
    [HttpPost("webhook/instamojo/external/{campaign_slug}")]
    [AllowAnonymous]
    public async Task<IActionResult> InstamojoExternalWebhookBySlug(string campaign_slug)
    {
        var form    = await Request.ReadFormAsync();
        var payload = form.ToDictionary(k => k.Key, k => k.Value.ToString());

        if (!payload.TryGetValue("payment_request_id", out var prId) || string.IsNullOrEmpty(prId))
            return Ok(new { status = "error", message = "Missing payment_request_id." });
        if (!payload.TryGetValue("payment_id", out var gwPaymentId) || string.IsNullOrEmpty(gwPaymentId))
            return Ok(new { status = "error", message = "Missing payment_id." });

        payload.TryGetValue("status", out var status);
        payload.TryGetValue("amount", out var amountStr);
        payload.TryGetValue("buyer", out var buyerEmail);
        payload.TryGetValue("buyer_name", out var buyerName);
        payload.TryGetValue("buyer_phone", out var buyerPhone);
        payload.TryGetValue("purpose", out var purpose);

        // Duplicate check
        var existing = await _payments.GetByGatewayPaymentRequestIdAsync(prId);
        if (existing != null)
            return Ok(new { status = "success", message = "Already processed." });
        existing = await _payments.GetByGatewayPaymentIdAsync(gwPaymentId);
        if (existing != null)
            return Ok(new { status = "success", message = "Already processed." });

        if (!string.Equals(status, "credit", StringComparison.OrdinalIgnoreCase))
            return Ok(new { status = "success", message = "Non-credit status ignored." });

        var campaign = await _campaigns.GetBySlugAsync(campaign_slug);
        if (campaign == null)
            return Ok(new { status = "error", message = $"Campaign '{campaign_slug}' not found." });

        decimal.TryParse(amountStr, System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var amount);

        var result = await CreateExternalRegistrationAsync(
            campaign, gwPaymentId, prId, amount, buyerName, buyerEmail, buyerPhone, purpose, "external");

        return Ok(new { status = "success", message = "Processed.", registration_id = result, campaign = campaign.Name });
    }

    // ── POST /api/payments/webhook/instamojo/external ─────────────────────────
    [HttpPost("webhook/instamojo/external")]
    [AllowAnonymous]
    public async Task<IActionResult> InstamojoExternalWebhook()
    {
        var form    = await Request.ReadFormAsync();
        var payload = form.ToDictionary(k => k.Key, k => k.Value.ToString());

        if (!payload.TryGetValue("payment_request_id", out var prId) || string.IsNullOrEmpty(prId))
            return Ok(new { status = "error", message = "Missing payment_request_id." });
        if (!payload.TryGetValue("payment_id", out var gwPaymentId) || string.IsNullOrEmpty(gwPaymentId))
            return Ok(new { status = "error", message = "Missing payment_id." });

        payload.TryGetValue("status", out var status);
        payload.TryGetValue("amount", out var amountStr);
        payload.TryGetValue("buyer", out var buyerEmail);
        payload.TryGetValue("buyer_name", out var buyerName);
        payload.TryGetValue("buyer_phone", out var buyerPhone);
        payload.TryGetValue("purpose", out var purpose);

        // Duplicate check
        var dup1 = await _payments.GetByGatewayPaymentRequestIdAsync(prId);
        if (dup1 != null)
            return Ok(new { status = "success", message = "Already processed." });
        var dup2 = await _payments.GetByGatewayPaymentIdAsync(gwPaymentId);
        if (dup2 != null)
            return Ok(new { status = "success", message = "Already processed." });

        if (!string.Equals(status, "credit", StringComparison.OrdinalIgnoreCase))
            return Ok(new { status = "success", message = "Non-credit status ignored." });

        decimal.TryParse(amountStr, System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var amount);

        // Campaign matching
        Campaign? campaign = null;

        // Try 1: extract slug from purpose ("CampaignSlug - Registration")
        if (!string.IsNullOrWhiteSpace(purpose))
        {
            var parts = purpose.Split(" - ", 2, StringSplitOptions.TrimEntries);
            if (parts.Length >= 1)
            {
                var candidateSlug = parts[0].ToLowerInvariant()
                    .Replace(" ", "-")
                    .Trim('-');
                campaign = await _campaigns.GetBySlugAsync(candidateSlug);
            }
        }

        // Try 2: any active campaign using an Instamojo account
        if (campaign == null)
        {
            var allCampaigns = await _campaigns.GetPublicActiveAsync();
            campaign = allCampaigns.FirstOrDefault();
        }

        // No campaign found → orphan
        if (campaign == null)
        {
            var orphan = new OrphanPayment
            {
                Id                       = Guid.NewGuid().ToString(),
                Type                     = "orphan_external",
                GatewayPaymentId         = gwPaymentId,
                GatewayPaymentRequestId  = prId,
                Amount                   = amount,
                BuyerName                = buyerName,
                BuyerEmail               = buyerEmail,
                BuyerPhone               = buyerPhone,
                Purpose                  = purpose,
                Status                   = "needs_review",
                RawPayload               = JsonSerializer.Serialize(payload),
                CreatedAt                = DateTime.UtcNow
            };
            await _orphanPayments.CreateAsync(orphan);
            _logger.LogWarning("Orphan payment created for payment_id {GwId} — no matching campaign", gwPaymentId);
            return Ok(new { status = "success", message = "Payment stored for review - no campaign found." });
        }

        var registrationId = await CreateExternalRegistrationAsync(
            campaign, gwPaymentId, prId, amount, buyerName, buyerEmail, buyerPhone, purpose, "external");

        return Ok(new { status = "success", message = "Processed.", registration_id = registrationId });
    }

    // ── GET /api/payments/orphan-payments ─────────────────────────────────────
    [HttpGet("orphan-payments")]
    [Authorize]
    public async Task<IActionResult> GetOrphanPayments()
    {
        if (!IsAdminRole) return Forbidden();
        var list = await _orphanPayments.GetAllAsync();
        return Ok(new { orphan_payments = list.Select(ToOrphanResponse) });
    }

    // ── POST /api/payments/orphan-payments/{payment_id}/assign ────────────────
    [HttpPost("orphan-payments/{payment_id}/assign")]
    [Authorize]
    public async Task<IActionResult> AssignOrphan(string payment_id, [FromQuery] string campaign_id)
    {
        if (!IsAdminRole) return Forbidden();

        var orphan = await _orphanPayments.GetByIdAsync(payment_id);
        if (orphan == null)
            return NotFound(new { detail = "Orphan payment not found." });

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null)
            return NotFound(new { detail = "Campaign not found." });

        var registrationId = await CreateExternalRegistrationAsync(
            campaign,
            orphan.GatewayPaymentId ?? "",
            orphan.GatewayPaymentRequestId ?? "",
            orphan.Amount,
            orphan.BuyerName,
            orphan.BuyerEmail,
            orphan.BuyerPhone,
            orphan.Purpose,
            "external_manual");

        // Mark orphan as assigned
        orphan.Status = "assigned";
        await _orphanPayments.UpdateAsync(orphan);

        return Ok(new AssignOrphanResponse(
            Success       : true,
            Message       : "Orphan payment assigned successfully.",
            RegistrationId: registrationId));
    }

    // ── Shared helpers ────────────────────────────────────────────────────────

    /// <summary>Marks payment as complete and cascades to registration + campaign + account stats.</summary>
    private async Task CompletePaymentAsync(Payment payment, string gatewayPaymentId)
    {
        payment.GatewayPaymentId = gatewayPaymentId;
        payment.Status           = "completed";
        payment.PaidAt           = DateTime.UtcNow;
        payment.UpdatedAt        = DateTime.UtcNow;
        await _payments.UpdateAsync(payment);

        await FinalizeRegistrationAsync(payment);
        await ArchivePaymentSafelyAsync(payment);
    }

    private async Task FinalizeRegistrationAsync(Payment payment)
    {
        var reg = await _registrations.GetByIdAsync(payment.RegistrationId);
        bool justCompleted = false;
        if (reg != null && reg.PaymentStatus != PaymentStatus.Completed)
        {
            reg.PaymentStatus      = PaymentStatus.Completed;
            reg.RegistrationStatus = RegistrationStatus.Confirmed;
            reg.GatewayPaymentId   = payment.GatewayPaymentId;
            reg.UpdatedAt          = DateTime.UtcNow;
            await _registrations.UpdateAsync(reg);
            justCompleted = true;

            // Increment coupon usage now that payment is confirmed
            if (!string.IsNullOrWhiteSpace(reg.CouponCode))
            {
                var coupon = await _coupons.GetByCodeAsync(reg.CampaignId, reg.CouponCode);
                if (coupon != null && !await _coupons.TryConsumeAsync(coupon.Id))
                {
                    // Atomic claim lost the race for the coupon's last use. The payment is
                    // already settled, so the registration stands and the counter stays at
                    // the limit rather than being pushed past it. Logged for reconciliation.
                    _logger.LogWarning(
                        "Coupon {Code} on campaign {CampaignId} was already at its usage limit " +
                        "when registration {RegistrationId} redeemed it. The registration stands.",
                        coupon.Code, reg.CampaignId, reg.Id);
                }
            }
        }

        var campaign = await _campaigns.GetByIdAsync(payment.CampaignId);
        if (campaign != null && justCompleted)
        {
            campaign.CurrentRegistrations++;
            campaign.TotalRevenue += payment.Amount;
            campaign.UpdatedAt    = DateTime.UtcNow;
            await _campaigns.UpdateAsync(campaign);
        }

        if (payment.PaymentAccountId != null && justCompleted)
        {
            var account = await _paymentAccounts.GetByIdAsync(payment.PaymentAccountId);
            if (account != null)
            {
                account.TotalTransactions++;
                account.TotalAmountCollected += payment.Amount;
                account.LastTransactionAt    = DateTime.UtcNow;
                account.UpdatedAt            = DateTime.UtcNow;
                await _paymentAccounts.UpdateAsync(account);
            }
        }

        // Send confirmation email only on the first state transition. This catches the
        // Instamojo case (webhook is the only confirmation path) without double-sending
        // for Razorpay/Cashfree, where the frontend verify handler usually fires first
        // and the webhook arrives later as a safety net.
        if (justCompleted && reg != null && campaign != null)
        {
            try { await _regEmail.SendConfirmationAsync(reg, campaign); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to send confirmation email for registration {RegId}", reg.Id); }

            // Push the now-completed registration to Google Sheets. Same idempotent
            // upsert that registration-time and resume-payment paths use, so admins
            // see the row appear as soon as ANY gateway's webhook confirms payment.
            try { await _sheets.SyncRegistrationAsync(reg, campaign); }
            catch (Exception ex) { _logger.LogWarning(ex, "Google Sheets sync failed after payment completion for registration {RegId}", reg.Id); }
        }
    }

    /// <summary>Creates a registration + payment record for an external Instamojo payment.</summary>
    private async Task<string> CreateExternalRegistrationAsync(
        Campaign campaign,
        string gatewayPaymentId,
        string gatewayPaymentRequestId,
        decimal amount,
        string? buyerName,
        string? buyerEmail,
        string? buyerPhone,
        string? purpose,
        string source)
    {
        var now = DateTime.UtcNow;

        var formData = JsonSerializer.Serialize(new
        {
            name    = buyerName ?? "",
            email   = buyerEmail ?? "",
            phone   = buyerPhone ?? "",
            source  = "external_form",
            purpose = purpose ?? ""
        });

        var db  = HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var reg = new Registration
        {
            Id                 = Guid.NewGuid().ToString(),
            CampaignId         = campaign.Id,
            FormData           = formData,
            TotalAmount        = amount,
            PaymentStatus      = PaymentStatus.Completed,
            RegistrationStatus = RegistrationStatus.Confirmed,
            GatewayPaymentId   = gatewayPaymentId,
            PaymentGateway     = "instamojo",
            Source             = source,
            RegistrationNumber = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign),
            InvoiceNumber      = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now),
            CreatedAt          = now,
            UpdatedAt          = now
        };
        try { await _registrations.CreateAsync(reg); }
        catch (DbUpdateException)
        {
            // Concurrent claim raced on a unique number index — retry once with fresh numbers
            reg.RegistrationNumber = await CampaignNumberSequence.NextRegistrationNumberAsync(db, campaign);
            reg.InvoiceNumber      = await CampaignNumberSequence.NextInvoiceNumberAsync(db, campaign, now);
            await _registrations.CreateAsync(reg);
        }

        var payment = new Payment
        {
            Id                      = Guid.NewGuid().ToString(),
            CampaignId              = campaign.Id,
            RegistrationId          = reg.Id,
            Amount                  = amount,
            Gateway                 = "instamojo",
            PaymentAccountId        = campaign.PaymentAccountId,
            GatewayPaymentId        = gatewayPaymentId,
            GatewayPaymentRequestId = gatewayPaymentRequestId,
            BuyerName               = buyerName ?? "",
            BuyerEmail              = buyerEmail ?? "",
            BuyerPhone              = buyerPhone ?? "",
            Purpose                 = purpose,
            Status                  = "completed",
            Source                  = source,
            PaidAt                  = now,
            CreatedAt               = now,
            UpdatedAt               = now
        };
        await _payments.CreateAsync(payment);

        reg.PaymentId = payment.Id;
        await _registrations.UpdateAsync(reg);

        campaign.CurrentRegistrations++;
        campaign.TotalRevenue += amount;
        campaign.UpdatedAt    = now;
        await _campaigns.UpdateAsync(campaign);

        if (campaign.PaymentAccountId != null)
        {
            var account = await _paymentAccounts.GetByIdAsync(campaign.PaymentAccountId);
            if (account != null)
            {
                account.TotalTransactions++;
                account.TotalAmountCollected += amount;
                account.LastTransactionAt    = now;
                account.UpdatedAt            = now;
                await _paymentAccounts.UpdateAsync(account);
            }
        }

        return reg.Id;
    }

    private static OrphanPaymentResponse ToOrphanResponse(OrphanPayment o) => new(
        Id                     : o.Id,
        Type                   : o.Type,
        GatewayPaymentId       : o.GatewayPaymentId,
        GatewayPaymentRequestId: o.GatewayPaymentRequestId,
        Amount                 : o.Amount,
        BuyerName              : o.BuyerName,
        BuyerEmail             : o.BuyerEmail,
        BuyerPhone             : o.BuyerPhone,
        Purpose                : o.Purpose,
        Status                 : o.Status,
        CreatedAt              : o.CreatedAt);

    // Resolve buyer phone from the registration's form_data when the request didn't carry it.
    // Looks up campaign.form_config to find a field whose type is `phone` or `tel`,
    // then reads that field's value from registration.form_data.
    private string? TryResolvePhoneFromFormData(Registration registration, Campaign campaign)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(campaign.FormConfig) || string.IsNullOrWhiteSpace(registration.FormData))
                return null;

            using var cfg = JsonDocument.Parse(campaign.FormConfig);
            using var data = JsonDocument.Parse(registration.FormData);

            if (!cfg.RootElement.TryGetProperty("fields", out var fields) || fields.ValueKind != JsonValueKind.Array)
                return null;

            foreach (var field in fields.EnumerateArray())
            {
                if (!field.TryGetProperty("type", out var typeEl)) continue;
                var type = typeEl.GetString();
                if (type != "phone" && type != "tel") continue;

                if (!field.TryGetProperty("id", out var idEl)) continue;
                var fieldId = idEl.GetString();
                if (string.IsNullOrWhiteSpace(fieldId)) continue;

                if (data.RootElement.TryGetProperty(fieldId, out var valEl) && valEl.ValueKind == JsonValueKind.String)
                {
                    var val = valEl.GetString();
                    if (!string.IsNullOrWhiteSpace(val)) return val.Trim();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve buyer phone from registration form_data");
        }
        return null;
    }
}

/// <summary>Request body for POST /api/payments/cashfree/return (proxy → frontend → here).</summary>
public record CashfreeReturnRequest(
    string OrderId,
    string Status,
    string Signature);
