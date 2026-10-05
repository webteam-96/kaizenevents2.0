using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Cashfree Payments integration via REST API (v2023-08-01).
/// Sandbox: https://sandbox.cashfree.com/pg
/// Production: https://api.cashfree.com/pg
/// Auth: x-client-id + x-client-secret headers.
/// Amounts in RUPEES (not paise).
/// </summary>
public class CashfreeService : ICashfreeService
{
    private readonly HttpClient _http;
    private readonly string _appId;
    private readonly string _secretKey;
    private readonly string _baseUrl;
    private readonly string? _webhookPublicKey;
    private readonly string _vendorBusinessType;
    private readonly string _vendorAccountType;
    private readonly int _vendorScheduleOption;
    private readonly ILogger<CashfreeService> _logger;

    private const string ApiVersion = "2023-08-01";

    public CashfreeService(IHttpClientFactory httpFactory, IConfiguration config, ILogger<CashfreeService> logger)
    {
        _http      = httpFactory.CreateClient();
        _appId     = config["Cashfree:AppId"] ?? "";
        _secretKey = config["Cashfree:SecretKey"] ?? "";
        _webhookPublicKey   = config["Cashfree:WebhookPublicKey"];
        _vendorBusinessType = config["Cashfree:VendorBusinessType"] ?? "Education";
        _vendorAccountType  = config["Cashfree:VendorAccountType"]  ?? "CURRENT";
        // 0 = omit field, let Cashfree use merchant default
        _vendorScheduleOption = int.TryParse(config["Cashfree:VendorScheduleOption"], out var so) ? so : 0;
        _logger    = logger;

        var mode = config["Cashfree:Mode"]?.ToLowerInvariant() ?? "sandbox";
        _baseUrl = mode == "production"
            ? "https://api.cashfree.com/pg"
            : "https://sandbox.cashfree.com/pg";
    }

    public async Task<CashfreeOrderResult> CreateOrderAsync(
        decimal amount, string orderId, string customerName, string email, string phone, string? returnUrl,
        CashfreeCredentials? credentials = null,
        string? notifyUrl = null,
        IReadOnlyList<CashfreeVendorSplit>? vendorSplits = null)
    {
        // order_splits format: [{ "vendor_id": "X", "amount": 12.34 }, ...]
        // Sum of amounts must EXACTLY equal order amount; otherwise Cashfree rejects with "split mismatch".
        object? orderSplitsPayload = null;
        if (vendorSplits != null && vendorSplits.Count > 0)
        {
            orderSplitsPayload = vendorSplits
                .Select(v => new { vendor_id = v.VendorId, amount = v.Amount })
                .ToArray();
        }

        var body = new
        {
            order_id       = orderId,
            order_amount   = amount,
            order_currency = "INR",
            customer_details = new
            {
                customer_id    = orderId,
                customer_name  = customerName,
                customer_email = email,
                customer_phone = phone
            },
            order_meta = new
            {
                return_url = returnUrl ?? "",
                notify_url = string.IsNullOrWhiteSpace(notifyUrl) ? null : notifyUrl
            },
            order_splits = orderSplitsPayload
        };

        var request = BuildRequest(HttpMethod.Post, "/orders", body, credentials);
        var response = await _http.SendAsync(request);
        var json = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Cashfree CreateOrder failed: {Status} {Body}", response.StatusCode, json);
            throw new InvalidOperationException($"Cashfree CreateOrder failed: {response.StatusCode}");
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        return new CashfreeOrderResult(
            OrderId          : root.GetProperty("order_id").GetString()!,
            PaymentSessionId : root.GetProperty("payment_session_id").GetString()!,
            Amount           : amount,
            Currency         : "INR");
    }

    public async Task<CashfreeOrderStatus> GetOrderStatusAsync(string orderId, CashfreeCredentials? credentials = null)
    {
        var request = BuildRequest(HttpMethod.Get, $"/orders/{orderId}", null, credentials);
        var response = await _http.SendAsync(request);
        var json = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Cashfree GetOrder failed: {Status} {Body}", response.StatusCode, json);
            throw new InvalidOperationException($"Cashfree GetOrder failed: {response.StatusCode}");
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        string? cfPaymentId = null;
        if (root.TryGetProperty("cf_order_id", out var cfEl))
            cfPaymentId = cfEl.ToString();

        return new CashfreeOrderStatus(
            OrderId      : root.GetProperty("order_id").GetString()!,
            OrderStatus  : root.GetProperty("order_status").GetString()!,
            CfPaymentId  : cfPaymentId,
            Amount       : root.GetProperty("order_amount").GetDecimal());
    }

    public async Task<CashfreeRefundResult> CreateRefundAsync(string orderId, decimal refundAmount, string reason,
        CashfreeCredentials? credentials = null)
    {
        // refund_id must be unique per order; use a GUID short form
        var refundId = $"RFD-{Guid.NewGuid():N}"[..32];

        var body = new
        {
            refund_id     = refundId,
            refund_amount = refundAmount,
            refund_note   = reason.Length > 200 ? reason[..200] : reason
        };

        var request = BuildRequest(HttpMethod.Post, $"/orders/{orderId}/refunds", body, credentials);
        var response = await _http.SendAsync(request);
        var json = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Cashfree refund failed ({Status}) for order {OrderId}: {Body}",
                response.StatusCode, orderId, json);
            throw new InvalidOperationException($"Cashfree refund failed: {response.StatusCode}");
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var returnedRefundId = root.TryGetProperty("refund_id", out var rid) ? rid.GetString() ?? refundId : refundId;
        var status           = root.TryGetProperty("refund_status", out var st) ? st.GetString() ?? "PENDING" : "PENDING";
        decimal amt = refundAmount;
        if (root.TryGetProperty("refund_amount", out var amtEl))
        {
            if (amtEl.ValueKind == JsonValueKind.Number) amt = amtEl.GetDecimal();
            else if (amtEl.ValueKind == JsonValueKind.String)
                decimal.TryParse(amtEl.GetString(), System.Globalization.CultureInfo.InvariantCulture, out amt);
        }

        return new CashfreeRefundResult(returnedRefundId, status, amt);
    }

    // ── Easy Split Vendor APIs ────────────────────────────────────────────────

    public async Task<CashfreeVendorResult> CreateVendorAsync(CashfreeVendorRequest req,
        CashfreeCredentials? credentials = null)
    {
        var body = BuildVendorPayload(req);
        var request = BuildRequest(HttpMethod.Post, "/easy-split/vendors", body, credentials);
        return await SendVendorRequestAsync(request, req.VendorId, "create");
    }

    public async Task<CashfreeVendorResult> GetVendorAsync(string vendorId,
        CashfreeCredentials? credentials = null)
    {
        var request = BuildRequest(HttpMethod.Get, $"/easy-split/vendors/{vendorId}", null, credentials);
        return await SendVendorRequestAsync(request, vendorId, "get");
    }

    public async Task<CashfreeVendorResult> UpdateVendorAsync(CashfreeVendorRequest req,
        CashfreeCredentials? credentials = null)
    {
        var body = BuildVendorPayload(req, isUpdate: true);
        var request = BuildRequest(new HttpMethod("PATCH"), $"/easy-split/vendors/{req.VendorId}", body, credentials);
        return await SendVendorRequestAsync(request, req.VendorId, "update");
    }

    private object BuildVendorPayload(CashfreeVendorRequest req, bool isUpdate = false)
    {
        // Per Cashfree Vendor API v2023-08-01 docs.
        // Status defaults to ACTIVE; Cashfree validates and may transition to IN_VERIFICATION
        // until penny-drop completes.
        return new
        {
            vendor_id        = req.VendorId,
            status           = "ACTIVE",
            name             = req.Name,
            email            = req.Email,
            phone            = req.Phone,
            verify_account   = true,
            dashboard_access = false,
            schedule_option  = _vendorScheduleOption > 0 ? (int?)_vendorScheduleOption : null,
            kyc_details = new
            {
                account_type  = _vendorAccountType,
                business_type = _vendorBusinessType,
                pan           = req.Pan,
                gst           = string.IsNullOrWhiteSpace(req.Gst) ? null : req.Gst
            },
            bank = new
            {
                account_number = req.AccountNumber,
                account_holder = req.AccountHolder,
                ifsc           = req.Ifsc
            }
        };
    }

    private async Task<CashfreeVendorResult> SendVendorRequestAsync(HttpRequestMessage request, string vendorId, string action)
    {
        var response = await _http.SendAsync(request);
        var json = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Cashfree vendor {Action} failed ({Status}) for {VendorId}: {Body}",
                action, response.StatusCode, vendorId, json);
            throw new InvalidOperationException($"Cashfree vendor {action} failed: {response.StatusCode} — {json}");
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var status = root.TryGetProperty("status", out var st)
            ? (st.GetString() ?? "PENDING")
            : "PENDING";

        return new CashfreeVendorResult(vendorId, status, json);
    }

    // ── Settlement entries for a specific order ──────────────────────────────
    public async Task<List<CashfreeSettlementEntry>> GetSettlementsForOrderAsync(
        string orderId, CashfreeCredentials? credentials = null)
    {
        var results = new List<CashfreeSettlementEntry>();
        try
        {
            var request = BuildRequest(HttpMethod.Get, $"/orders/{orderId}/settlements", null, credentials);
            var response = await _http.SendAsync(request);
            var json = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Cashfree GetSettlementsForOrder {OrderId} failed ({Status}): {Body}",
                    orderId, response.StatusCode, json);
                return results;
            }

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // Response format: array of settlement entries, OR { "settlements": [...] } depending on API version
            JsonElement entries;
            if (root.ValueKind == JsonValueKind.Array)
                entries = root;
            else if (root.TryGetProperty("settlements", out var s) && s.ValueKind == JsonValueKind.Array)
                entries = s;
            else
                return results;

            foreach (var item in entries.EnumerateArray())
            {
                var cfPaymentId   = item.TryGetProperty("cf_payment_id", out var pid) ? pid.ToString() : null;
                var cfSettlementId= item.TryGetProperty("cf_settlement_id", out var sid) ? sid.ToString() : null;
                var settlementUtr = item.TryGetProperty("settlement_utr", out var utr) ? utr.GetString() : null;
                var status        = item.TryGetProperty("settlement_status", out var st) ? st.GetString() : null;

                DateTime? settledAt = null;
                if (item.TryGetProperty("settlement_initiated_on", out var siDate) && siDate.ValueKind == JsonValueKind.String)
                    DateTime.TryParse(siDate.GetString(), out var parsed1).ToString();
                if (item.TryGetProperty("settled_on", out var sDate) && sDate.ValueKind == JsonValueKind.String
                    && DateTime.TryParse(sDate.GetString(), out var parsed2))
                    settledAt = parsed2;
                else if (item.TryGetProperty("settlement_initiated_on", out var siDate2) && siDate2.ValueKind == JsonValueKind.String
                         && DateTime.TryParse(siDate2.GetString(), out var parsed3))
                    settledAt = parsed3;

                results.Add(new CashfreeSettlementEntry(
                    OrderId         : orderId,
                    CfPaymentId     : cfPaymentId,
                    CfSettlementId  : cfSettlementId,
                    SettlementUtr   : settlementUtr,
                    SettlementDate  : settledAt,
                    SettlementStatus: status));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cashfree GetSettlementsForOrder threw for {OrderId}", orderId);
        }
        return results;
    }

    // ── Per-order payment details (fee + tax breakdown) ───────────────────────
    public async Task<List<CashfreePaymentDetails>> GetOrderPaymentsAsync(
        string orderId, CashfreeCredentials? credentials = null)
    {
        var results = new List<CashfreePaymentDetails>();
        try
        {
            var request = BuildRequest(HttpMethod.Get, $"/orders/{orderId}/payments", null, credentials);
            var response = await _http.SendAsync(request);
            var json = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Cashfree GetOrderPayments {OrderId} failed ({Status}): {Body}",
                    orderId, response.StatusCode, json);
                return results;
            }

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Array) return results;

            foreach (var item in root.EnumerateArray())
            {
                string Str(string field) =>
                    item.TryGetProperty(field, out var el) && el.ValueKind == JsonValueKind.String
                        ? el.GetString() ?? "" : "";

                decimal Dec(string field)
                {
                    if (!item.TryGetProperty(field, out var el)) return 0m;
                    if (el.ValueKind == JsonValueKind.Number) return el.GetDecimal();
                    if (el.ValueKind == JsonValueKind.String && decimal.TryParse(
                        el.GetString(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var v)) return v;
                    return 0m;
                }

                results.Add(new CashfreePaymentDetails(
                    CfPaymentId   : Str("cf_payment_id"),
                    Amount        : Dec("payment_amount"),
                    Fee           : Dec("service_charge"),
                    Tax           : Dec("service_tax"),
                    PaymentMethod : item.TryGetProperty("payment_method", out var pm) ? pm.ToString() : null,
                    PaymentGroup  : Str("payment_group"),
                    Status        : Str("payment_status")));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cashfree GetOrderPayments threw for {OrderId}", orderId);
        }
        return results;
    }

    /// <summary>
    /// Verify webhook signature using RSA-SHA256 with Cashfree's public key.
    /// Payload = timestamp + rawBody, signature is Base64-encoded.
    /// </summary>
    public bool VerifyWebhookSignature(string timestamp, string rawBody, string signature)
    {
        if (string.IsNullOrEmpty(_webhookPublicKey))
        {
            _logger.LogWarning("Cashfree webhook public key not configured — skipping verification");
            return true; // allow if not configured (dev mode)
        }

        try
        {
            var payload = Encoding.UTF8.GetBytes(timestamp + rawBody);
            var signatureBytes = Convert.FromBase64String(signature);

            using var rsa = RSA.Create();
            rsa.ImportFromPem(_webhookPublicKey);

            return rsa.VerifyData(payload, signatureBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cashfree webhook signature verification failed");
            return false;
        }
    }

    private HttpRequestMessage BuildRequest(HttpMethod method, string path, object? body = null, CashfreeCredentials? credentials = null)
    {
        // Prefer per-request credentials (per-campaign account); fall back to global appsettings config
        var appId     = credentials?.AppId     ?? _appId;
        var secret    = credentials?.SecretKey ?? _secretKey;
        var baseUrl   = credentials?.Mode == "production"
            ? "https://api.cashfree.com/pg"
            : credentials?.Mode == "sandbox"
                ? "https://sandbox.cashfree.com/pg"
                : _baseUrl; // fall back to configured global mode when credentials.Mode is null

        var request = new HttpRequestMessage(method, $"{baseUrl}{path}");
        request.Headers.Add("x-client-id", appId);
        request.Headers.Add("x-client-secret", secret);
        request.Headers.Add("x-api-version", ApiVersion);

        if (body != null)
        {
            var json = JsonSerializer.Serialize(body, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
            });
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        return request;
    }
}
