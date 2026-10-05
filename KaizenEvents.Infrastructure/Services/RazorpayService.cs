using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

public class RazorpayService : IRazorpayService
{
    private const string BaseUrl = "https://api.razorpay.com/v1";

    private readonly HttpClient _http;
    private readonly string _keyId;
    private readonly string _keySecret;
    private readonly string _webhookSecret;
    private readonly ILogger<RazorpayService> _logger;

    public RazorpayService(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<RazorpayService> logger)
    {
        _http          = httpClientFactory.CreateClient("Razorpay");
        _keyId         = config["Razorpay:KeyId"] ?? string.Empty;
        _keySecret     = config["Razorpay:KeySecret"] ?? string.Empty;
        _webhookSecret = config["Razorpay:WebhookSecret"] ?? string.Empty;
        _logger        = logger;
    }

    // ── Create Order ──────────────────────────────────────────────────────────
    public async Task<RazorpayOrderResult> CreateOrderAsync(decimal amountInRupees, string receipt)
    {
        var paise = (long)(amountInRupees * 100);

        var body = JsonSerializer.Serialize(new
        {
            amount   = paise,
            currency = "INR",
            receipt  = receipt
        });

        var req = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/orders")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(req);

        var resp = await _http.SendAsync(req);
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        return new RazorpayOrderResult(
            OrderId  : root.GetProperty("id").GetString()!,
            AmountPaise: root.GetProperty("amount").GetInt64(),
            Currency : root.GetProperty("currency").GetString()!,
            Receipt  : root.GetProperty("receipt").GetString()!);
    }

    // ── Create Order with Route Transfers ─────────────────────────────────────
    /// <summary>
    /// Razorpay Route split: at capture, the order amount is automatically distributed
    /// across the listed linked sub-accounts. Requires Route enabled on the master account.
    /// </summary>
    public async Task<RazorpayOrderResult> CreateOrderWithTransfersAsync(
        decimal amountInRupees, string receipt, IReadOnlyList<RazorpayTransfer> transfers)
    {
        var paise = (long)(amountInRupees * 100);

        // Sanity-check: transfers must sum to exactly the order amount
        var totalTransfers = transfers.Sum(t => t.AmountPaise);
        if (totalTransfers != paise)
            throw new InvalidOperationException(
                $"Razorpay transfers sum ({totalTransfers} paise) must equal the order amount ({paise} paise).");

        var body = JsonSerializer.Serialize(new
        {
            amount   = paise,
            currency = "INR",
            receipt  = receipt,
            transfers = transfers.Select(t => new
            {
                account  = t.AccountId,
                amount   = t.AmountPaise,
                currency = "INR",
                notes    = new { source = "kaizen_events" },
                on_hold  = 0
            }).ToArray()
        });

        var req = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/orders")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(req);

        var resp = await _http.SendAsync(req);
        var respBody = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay Route order failed: {Status} {Body}", resp.StatusCode, respBody);
            resp.EnsureSuccessStatusCode();
        }

        using var doc = JsonDocument.Parse(respBody);
        var root = doc.RootElement;

        return new RazorpayOrderResult(
            OrderId    : root.GetProperty("id").GetString()!,
            AmountPaise: root.GetProperty("amount").GetInt64(),
            Currency   : root.GetProperty("currency").GetString()!,
            Receipt    : root.TryGetProperty("receipt", out var r) ? r.GetString() ?? "" : "");
    }

    // ── Verify Signature ──────────────────────────────────────────────────────
    public bool VerifyPaymentSignature(string orderId, string paymentId, string signature)
    {
        var payload = $"{orderId}|{paymentId}";
        var key     = Encoding.UTF8.GetBytes(_keySecret);
        var data    = Encoding.UTF8.GetBytes(payload);
        var hash    = HMACSHA256.HashData(key, data);
        var expected = Convert.ToHexString(hash).ToLowerInvariant();
        return string.Equals(expected, signature, StringComparison.OrdinalIgnoreCase);
    }

    // ── Create Payment Link ───────────────────────────────────────────────────
    public async Task<RazorpayPaymentLinkResult> CreatePaymentLinkAsync(
        decimal amountInRupees, string description, string customerName, string email, string phone)
    {
        var paise = (long)(amountInRupees * 100);

        var body = JsonSerializer.Serialize(new
        {
            amount      = paise,
            currency    = "INR",
            description = description,
            customer    = new { name = customerName, email, contact = phone },
            notify      = new { sms = true, email = true },
            reminder_enable = true
        });

        var req = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/payment_links")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(req);

        var resp = await _http.SendAsync(req);
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        return new RazorpayPaymentLinkResult(
            PaymentLinkId: root.GetProperty("id").GetString()!,
            ShortUrl     : root.GetProperty("short_url").GetString()!);
    }

    // ── Create Refund ─────────────────────────────────────────────────────────
    public async Task<RazorpayRefundResult> CreateRefundAsync(string gatewayPaymentId, decimal amount)
    {
        var paise = (long)(amount * 100);

        var body = JsonSerializer.Serialize(new { amount = paise });

        var req = new HttpRequestMessage(
            HttpMethod.Post, $"{BaseUrl}/payments/{gatewayPaymentId}/refund")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(req);

        var resp = await _http.SendAsync(req);
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        return new RazorpayRefundResult(
            RefundId: root.GetProperty("id").GetString()!,
            Status  : root.GetProperty("status").GetString()!);
    }

    // ── Fetch payment details (fee + tax) ─────────────────────────────────────
    public async Task<RazorpayPaymentDetails?> GetPaymentDetailsAsync(string paymentId)
    {
        try
        {
            var req = new HttpRequestMessage(HttpMethod.Get, $"{BaseUrl}/payments/{paymentId}");
            SetBasicAuth(req);
            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Razorpay GetPaymentDetails failed for {PaymentId}: {Status}", paymentId, resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root = doc.RootElement;

            // Razorpay returns amounts in paise — convert to rupees
            decimal Paise(string field) =>
                root.TryGetProperty(field, out var el) && el.ValueKind == JsonValueKind.Number
                    ? el.GetInt64() / 100m
                    : 0m;

            return new RazorpayPaymentDetails(
                PaymentId: paymentId,
                Amount   : Paise("amount"),
                Fee      : Paise("fee"),
                Tax      : Paise("tax"),
                Method   : root.TryGetProperty("method", out var m) ? m.GetString() ?? "" : "",
                Status   : root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Razorpay GetPaymentDetails threw for {PaymentId}", paymentId);
            return null;
        }
    }

    // ── Settlement reconciliation (combines payments + settlement IDs) ────────
    public async Task<List<RazorpaySettlementReconItem>> GetSettlementReconAsync(DateTime fromUtc, DateTime toUtc)
    {
        var results = new List<RazorpaySettlementReconItem>();
        try
        {
            // Razorpay accepts epoch seconds for from/to
            var fromEpoch = new DateTimeOffset(fromUtc).ToUnixTimeSeconds();
            var toEpoch   = new DateTimeOffset(toUtc).ToUnixTimeSeconds();
            int skip = 0;
            const int pageSize = 100;

            while (true)
            {
                var url = $"{BaseUrl}/settlements/recon/combined?from={fromEpoch}&to={toEpoch}&count={pageSize}&skip={skip}";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                SetBasicAuth(req);
                var resp = await _http.SendAsync(req);
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Razorpay settlement recon failed: {Status}", resp.StatusCode);
                    break;
                }
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var root = doc.RootElement;

                if (!root.TryGetProperty("items", out var items) || items.GetArrayLength() == 0) break;

                foreach (var item in items.EnumerateArray())
                {
                    // entity_type = "payment" rows are the ones we care about
                    var entityType = item.TryGetProperty("entity_type", out var et) ? et.GetString() : null;
                    if (entityType != "payment") continue;

                    var paymentId = item.TryGetProperty("entity_id", out var pid) ? pid.GetString() : null;
                    if (string.IsNullOrEmpty(paymentId)) continue;

                    var settlementId = item.TryGetProperty("settlement_id", out var sid) ? sid.GetString() : null;
                    var settlementUtr = item.TryGetProperty("settlement_utr", out var utr) ? utr.GetString() : null;
                    var status = item.TryGetProperty("settlement_status", out var ss) ? ss.GetString() : null;

                    DateTime? settledAt = null;
                    if (item.TryGetProperty("settled_at", out var sa) && sa.ValueKind == JsonValueKind.Number)
                        settledAt = DateTimeOffset.FromUnixTimeSeconds(sa.GetInt64()).UtcDateTime;

                    results.Add(new RazorpaySettlementReconItem(
                        PaymentId    : paymentId,
                        SettlementId : settlementId ?? "",
                        SettlementUtr: settlementUtr,
                        SettledAt    : settledAt,
                        Status       : status));
                }

                if (items.GetArrayLength() < pageSize) break;
                skip += pageSize;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Razorpay GetSettlementRecon threw");
        }
        return results;
    }

    // ── Verify Webhook Signature ───────────────────────────────────────────────
    public bool VerifyWebhookSignature(string rawBody, string signature)
    {
        if (string.IsNullOrEmpty(_webhookSecret))
        {
            _logger.LogWarning("Razorpay webhook secret not configured — skipping verification");
            return true; // allow if not configured (dev mode)
        }

        var key   = Encoding.UTF8.GetBytes(_webhookSecret);
        var data  = Encoding.UTF8.GetBytes(rawBody);
        var hash  = HMACSHA256.HashData(key, data);
        var expected = Convert.ToHexString(hash).ToLowerInvariant();
        return string.Equals(expected, signature, StringComparison.OrdinalIgnoreCase);
    }

    // ── Route v2 onboarding ───────────────────────────────────────────────────
    private const string BaseUrlV2 = "https://api.razorpay.com/v2";

    private static object BuildAddress(RazorpayAddress a) => new
    {
        street1     = a.Street1,
        street2     = a.Street2,
        city        = a.City,
        state       = a.State,
        postal_code = a.PostalCode,
        country     = a.Country
    };

    /// <summary>Razorpay's contact_name validation rejects anything outside [A-Za-z ].</summary>
    private static string SanitizeContactName(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var sb = new System.Text.StringBuilder(s.Length);
        foreach (var c in s)
            if (char.IsLetter(c) || c == ' ') sb.Append(c);
        // Collapse multiple spaces
        var cleaned = System.Text.RegularExpressions.Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
        return cleaned.Length >= 4 ? cleaned : ""; // Razorpay min 4 chars
    }

    private object BuildLinkedAccountBody(LinkedAccountRequest req)
    {
        var legalInfo = new Dictionary<string, object?>();
        if (!string.IsNullOrWhiteSpace(req.Pan)) legalInfo["pan"] = req.Pan;
        if (!string.IsNullOrWhiteSpace(req.Gst)) legalInfo["gst"] = req.Gst;

        var body = new Dictionary<string, object?>
        {
            // type=route → Razorpay treats this as a Route Linked Account
            // (omitting it defaults to standard partner-onboarded account, which
            // requires Aggregator partner credentials and returns Access Denied).
            ["type"]                          = "route",
            ["email"]                         = req.Email,
            ["phone"]                         = req.Phone,
            ["legal_business_name"]           = req.LegalBusinessName,
            ["business_type"]                 = req.BusinessType,
            ["customer_facing_business_name"] = req.CustomerFacingBusinessName,
            ["contact_name"]                  = SanitizeContactName(req.ContactName) is var cn && cn.Length > 0
                                                  ? cn
                                                  : SanitizeContactName(req.CustomerFacingBusinessName),
            ["profile"] = new
            {
                category    = req.ProfileCategory,
                subcategory = req.ProfileSubcategory,
                addresses   = new { registered = BuildAddress(req.RegisteredAddress) }
            }
        };
        if (!string.IsNullOrWhiteSpace(req.ReferenceId)) body["reference_id"] = req.ReferenceId;
        if (legalInfo.Count > 0) body["legal_info"] = legalInfo;
        return body;
    }

    public async Task<RazorpayAccountResult> CreateLinkedAccountAsync(LinkedAccountRequest req)
    {
        var json = JsonSerializer.Serialize(BuildLinkedAccountBody(req));
        var http = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrlV2}/accounts")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(http);

        var resp = await _http.SendAsync(http);
        var raw  = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay /v2/accounts create failed: {Status} {Body}", resp.StatusCode, raw);
            throw new HttpRequestException($"Razorpay /v2/accounts create failed ({(int)resp.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        var accId     = root.GetProperty("id").GetString()!;
        var status    = root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";
        var actStatus = root.TryGetProperty("activation_status", out var a) ? a.GetString() : null;
        return new RazorpayAccountResult(accId, status, actStatus, raw);
    }

    public async Task<RazorpayAccountResult> UpdateLinkedAccountAsync(string accountId, LinkedAccountRequest req)
    {
        var json = JsonSerializer.Serialize(BuildLinkedAccountBody(req));
        var http = new HttpRequestMessage(new HttpMethod("PATCH"), $"{BaseUrlV2}/accounts/{accountId}")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(http);

        var resp = await _http.SendAsync(http);
        var raw  = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay /v2/accounts update failed: {Status} {Body}", resp.StatusCode, raw);
            throw new HttpRequestException($"Razorpay /v2/accounts update failed ({(int)resp.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        var accId     = root.GetProperty("id").GetString()!;
        var status    = root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";
        var actStatus = root.TryGetProperty("activation_status", out var a) ? a.GetString() : null;
        return new RazorpayAccountResult(accId, status, actStatus, raw);
    }

    public async Task<RazorpayAccountResult> GetLinkedAccountAsync(string accountId)
    {
        var http = new HttpRequestMessage(HttpMethod.Get, $"{BaseUrlV2}/accounts/{accountId}");
        SetBasicAuth(http);

        var resp = await _http.SendAsync(http);
        var raw  = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay /v2/accounts get failed: {Status} {Body}", resp.StatusCode, raw);
            throw new HttpRequestException($"Razorpay /v2/accounts get failed ({(int)resp.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        var accId     = root.GetProperty("id").GetString()!;
        var status    = root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";
        var actStatus = root.TryGetProperty("activation_status", out var a) ? a.GetString() : null;
        return new RazorpayAccountResult(accId, status, actStatus, raw);
    }

    public async Task<RazorpayStakeholderResult> CreateStakeholderAsync(string accountId, StakeholderRequest req)
    {
        // PAN is intentionally NOT sent here — Razorpay's stakeholder PAN regex requires
        // the 4th digit to be 'P' (personal PAN). We collect the business PAN at the
        // Linked Account level, not a stakeholder's personal PAN. KYC for stakeholder
        // can be completed later via Razorpay's activation form if required.

        // Stakeholder address uses singular `street` (not street1/street2) with min 10 chars.
        var combinedStreet = string.Join(", ",
            new[] { req.ResidentialAddress.Street1, req.ResidentialAddress.Street2 }
                .Where(s => !string.IsNullOrWhiteSpace(s)));
        if (combinedStreet.Length < 10) combinedStreet = (combinedStreet + ", " + "Kaizen Events Office").TrimStart(',', ' ');
        var residential = new
        {
            street      = combinedStreet,
            city        = req.ResidentialAddress.City,
            state       = req.ResidentialAddress.State,
            postal_code = req.ResidentialAddress.PostalCode,
            country     = req.ResidentialAddress.Country
        };
        var body = new Dictionary<string, object?>
        {
            ["name"]       = SanitizeContactName(req.Name) is var n && n.Length > 0 ? n : req.Name,
            ["email"]      = req.Email,
            ["phone"]      = new { primary = req.PrimaryPhone },
            ["addresses"]  = new { residential }
        };

        var json = JsonSerializer.Serialize(body);
        var http = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrlV2}/accounts/{accountId}/stakeholders")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(http);

        var resp = await _http.SendAsync(http);
        var raw  = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay /v2/stakeholders failed: {Status} {Body}", resp.StatusCode, raw);
            throw new HttpRequestException($"Razorpay /v2/stakeholders failed ({(int)resp.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        var sthId     = root.GetProperty("id").GetString()!;
        return new RazorpayStakeholderResult(sthId, raw);
    }

    public async Task<RazorpayProductResult> RequestRouteProductAsync(string accountId, RouteProductRequest req)
    {
        // POST /products creates the product entry only. Razorpay rejects `settlements`
        // here ("extra_field_sent") — bank details go in the follow-up PATCH below.
        var body = new
        {
            product_name = "route",
            tnc_accepted = true
        };

        var json = JsonSerializer.Serialize(body);
        var http = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrlV2}/accounts/{accountId}/products")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(http);

        var resp = await _http.SendAsync(http);
        var raw  = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay /v2/products failed: {Status} {Body}", resp.StatusCode, raw);
            throw new HttpRequestException($"Razorpay /v2/products failed ({(int)resp.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        var prodId    = root.GetProperty("id").GetString()!;
        var status    = root.TryGetProperty("activation_status", out var a) ? a.GetString() ?? ""
                      : root.TryGetProperty("status", out var s)            ? s.GetString() ?? ""
                      : "";
        return new RazorpayProductResult(prodId, status, raw);
    }

    public async Task<RazorpayProductResult> UpdateRouteProductAsync(string accountId, string productId, RouteProductRequest req)
    {
        var body = new
        {
            settlements = new
            {
                account_number   = req.AccountNumber,
                ifsc_code        = req.IfscCode,
                beneficiary_name = req.BeneficiaryName
            }
        };

        var json = JsonSerializer.Serialize(body);
        var http = new HttpRequestMessage(new HttpMethod("PATCH"), $"{BaseUrlV2}/accounts/{accountId}/products/{productId}")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        SetBasicAuth(http);

        var resp = await _http.SendAsync(http);
        var raw  = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay /v2/products PATCH failed: {Status} {Body}", resp.StatusCode, raw);
            throw new HttpRequestException($"Razorpay /v2/products PATCH failed ({(int)resp.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        var pid       = root.GetProperty("id").GetString()!;
        var status    = root.TryGetProperty("activation_status", out var a) ? a.GetString() ?? "" : "";
        return new RazorpayProductResult(pid, status, raw);
    }

    public async Task<RazorpayProductResult> GetRouteProductAsync(string accountId, string productId)
    {
        var http = new HttpRequestMessage(HttpMethod.Get, $"{BaseUrlV2}/accounts/{accountId}/products/{productId}");
        SetBasicAuth(http);
        var resp = await _http.SendAsync(http);
        var raw  = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay /v2/products GET failed: {Status} {Body}", resp.StatusCode, raw);
            throw new HttpRequestException($"Razorpay /v2/products GET failed ({(int)resp.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        var pid       = root.GetProperty("id").GetString()!;
        var status    = root.TryGetProperty("activation_status", out var a) ? a.GetString() ?? "" : "";
        return new RazorpayProductResult(pid, status, raw);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private void SetBasicAuth(HttpRequestMessage req)
    {
        var creds  = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_keyId}:{_keySecret}"));
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", creds);
    }
}
