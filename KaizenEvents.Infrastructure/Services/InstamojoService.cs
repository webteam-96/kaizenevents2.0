using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Instamojo OAuth 2.0 payment service.
/// Caches the bearer token in-memory; re-fetches on 401.
/// </summary>
public class InstamojoService : IInstamojoService
{
    private readonly HttpClient _http;
    private readonly string _clientId;
    private readonly string _clientSecret;
    private readonly string _mode; // "sandbox" or "production"
    private readonly string? _webhookUrl;
    private readonly ILogger<InstamojoService> _logger;

    private string? _cachedToken;
    private DateTime _tokenExpiry = DateTime.MinValue;

    public InstamojoService(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<InstamojoService> logger)
    {
        _http         = httpClientFactory.CreateClient("Instamojo");
        _clientId     = config["Instamojo:ClientId"] ?? string.Empty;
        _clientSecret = config["Instamojo:ClientSecret"] ?? string.Empty;
        _mode         = config["Instamojo:Mode"] ?? "sandbox";
        _webhookUrl   = config["Instamojo:WebhookUrl"];
        _logger       = logger;
    }

    private string BaseUrl => _mode == "production"
        ? "https://api.instamojo.com"
        : "https://test.instamojo.com";

    // ── Create Payment Request ─────────────────────────────────────────────────
    public async Task<InstamojoPaymentResult> CreatePaymentRequestAsync(
        decimal amount, string purpose, string buyerName, string email, string? phone)
    {
        var token = await GetAccessTokenAsync();

        // Instamojo v2 requires phone in E.164 (e.g. "+919876543210"). The form
        // typically submits just 10 digits — normalize before sending.
        var normalizedPhone = NormalizePhoneForInstamojo(phone);
        _logger.LogInformation(
            "Instamojo CreatePaymentRequest: phone in={InPhone!r} -> out={OutPhone!r}, amount={Amount}, email={Email}",
            phone, normalizedPhone, amount, email);

        // Instamojo posts payment status to this URL on completion. Configured per
        // environment in appsettings (Instamojo:WebhookUrl). Sent on every create call
        // so we don't have to configure a webhook URL inside the Instamojo dashboard.
        var payload = new Dictionary<string, object?>
        {
            ["amount"]                  = amount.ToString("F2"),
            ["purpose"]                 = purpose,
            ["buyer_name"]              = buyerName,
            ["email"]                   = email,
            ["phone"]                   = normalizedPhone,
            ["send_email"]              = true,
            ["send_sms"]                = normalizedPhone != null,
            ["allow_repeated_payments"] = false
        };
        if (!string.IsNullOrWhiteSpace(_webhookUrl))
            payload["webhook"] = _webhookUrl;

        var body = JsonSerializer.Serialize(payload);

        // Instamojo deprecated /api/1.1/payment-requests/ in favour of /v2/payment_requests/.
        // The OAuth Bearer token issued by /oauth2/token/ only works against v2 endpoints —
        // v1.1 requires the legacy X-Api-Key + X-Auth-Token headers (which we don't use).
        var req = new HttpRequestMessage(
            HttpMethod.Post, $"{BaseUrl}/v2/payment_requests/")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var resp = await _http.SendAsync(req);
        if (!resp.IsSuccessStatusCode)
        {
            var errBody = await resp.Content.ReadAsStringAsync();
            _logger.LogError("Instamojo CreatePaymentRequest failed: {Status} {Body}", resp.StatusCode, errBody);
            resp.EnsureSuccessStatusCode();   // throws with original status
        }

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        // v2 returns the payment-request object at the root (no `payment_request` wrapper
        // that the old v1.1 response shape used). Fall back to the wrapper if Instamojo
        // ever decides to add it back — keeps the parser resilient.
        var root = doc.RootElement;
        var pr   = root.TryGetProperty("payment_request", out var wrapped) ? wrapped : root;

        return new InstamojoPaymentResult(
            PaymentRequestId: pr.GetProperty("id").GetString()!,
            PaymentUrl      : pr.GetProperty("longurl").GetString()!);
    }

    // ── Create Refund ──────────────────────────────────────────────────────────
    public async Task<InstamojoRefundResult> CreateRefundAsync(string paymentId, decimal refundAmount, string reason)
    {
        var token = await GetAccessTokenAsync();

        // Instamojo refund types: RFD (Refund — default), TNR, QFL, QNR, EWN, TAN, PTH, RTV, TAN
        // body (reason) max 100 chars per docs
        var body = JsonSerializer.Serialize(new
        {
            payment_id    = paymentId,
            type          = "RFD",
            body          = reason.Length > 100 ? reason[..100] : reason,
            refund_amount = refundAmount.ToString("F2")
        });

        var req = new HttpRequestMessage(
            HttpMethod.Post, $"{BaseUrl}/api/2.0/refunds/")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var resp = await _http.SendAsync(req);
        var json = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Instamojo refund failed ({Status}) for payment {PaymentId}: {Body}",
                resp.StatusCode, paymentId, json);
            throw new InvalidOperationException($"Instamojo refund failed: {resp.StatusCode}");
        }

        using var doc = JsonDocument.Parse(json);
        var refund = doc.RootElement.GetProperty("refund");

        var refundId = refund.GetProperty("id").GetString() ?? "";
        var status   = refund.GetProperty("status").GetString() ?? "pending";
        decimal amt = 0;
        if (refund.TryGetProperty("refund_amount", out var amtEl))
        {
            if (amtEl.ValueKind == JsonValueKind.String)
                decimal.TryParse(amtEl.GetString(), System.Globalization.CultureInfo.InvariantCulture, out amt);
            else if (amtEl.ValueKind == JsonValueKind.Number)
                amt = amtEl.GetDecimal();
        }

        return new InstamojoRefundResult(refundId, status, amt);
    }

    // ── Verify Webhook MAC ─────────────────────────────────────────────────────
    /// <summary>
    /// Instamojo HMAC-SHA1: HMAC of values sorted by key, joined by '|'.
    /// Salt is stored in the PaymentAccount (not global config).
    /// </summary>
    public bool VerifyWebhookMac(string mac, string salt, IEnumerable<KeyValuePair<string, string>> sortedValues)
    {
        // Sort keys alphabetically, join values with '|', compute HMAC-SHA1
        var payload = string.Join("|", sortedValues.Select(kv => kv.Value));
        return HMACSHA1.HashData(Encoding.UTF8.GetBytes(salt), Encoding.UTF8.GetBytes(payload))
            .Select(b => b.ToString("x2"))
            .Aggregate(string.Concat)
            .Equals(mac, StringComparison.OrdinalIgnoreCase);
    }

    // ── Payouts API (settlement reports) ──────────────────────────────────────
    public async Task<List<InstamojoPayoutEntry>> GetRecentPayoutsAsync(int maxPages = 5)
    {
        var results = new List<InstamojoPayoutEntry>();
        try
        {
            var token = await GetAccessTokenAsync();
            var url = $"{BaseUrl}/v2/payouts/?limit=50";
            int page = 0;

            while (!string.IsNullOrEmpty(url) && page < maxPages)
            {
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Add("Authorization", $"Bearer {token}");
                var resp = await _http.SendAsync(req);
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Instamojo GetPayouts failed: {Status}", resp.StatusCode);
                    break;
                }
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var root = doc.RootElement;

                if (!root.TryGetProperty("payouts", out var payouts) || payouts.ValueKind != JsonValueKind.Array)
                    break;

                foreach (var item in payouts.EnumerateArray())
                {
                    var payoutId = item.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "";
                    if (string.IsNullOrEmpty(payoutId)) continue;
                    var status   = item.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "";

                    decimal amount = 0;
                    if (item.TryGetProperty("amount", out var amt))
                    {
                        if (amt.ValueKind == JsonValueKind.Number) amount = amt.GetDecimal();
                        else if (amt.ValueKind == JsonValueKind.String && decimal.TryParse(amt.GetString(),
                            System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var p))
                            amount = p;
                    }

                    DateTime? settledAt = null;
                    if (item.TryGetProperty("settled_at", out var sa) && sa.ValueKind == JsonValueKind.String
                        && DateTime.TryParse(sa.GetString(), out var parsed))
                        settledAt = parsed;
                    else if (item.TryGetProperty("created_at", out var ca) && ca.ValueKind == JsonValueKind.String
                             && DateTime.TryParse(ca.GetString(), out var parsedC))
                        settledAt = parsedC;

                    var paymentIds = new List<string>();
                    if (item.TryGetProperty("transactions", out var txs) && txs.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var tx in txs.EnumerateArray())
                        {
                            if (tx.ValueKind == JsonValueKind.String) paymentIds.Add(tx.GetString()!);
                            else if (tx.ValueKind == JsonValueKind.Object && tx.TryGetProperty("id", out var txId))
                                paymentIds.Add(txId.GetString() ?? "");
                            else if (tx.ValueKind == JsonValueKind.Object && tx.TryGetProperty("payment_id", out var pId))
                                paymentIds.Add(pId.GetString() ?? "");
                        }
                    }

                    results.Add(new InstamojoPayoutEntry(payoutId, status, amount, settledAt, paymentIds));
                }

                // Pagination
                url = root.TryGetProperty("next", out var next) && next.ValueKind == JsonValueKind.String
                    ? next.GetString()!
                    : null!;
                page++;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Instamojo GetRecentPayouts threw");
        }
        return results;
    }

    // ── Payment details (fees + instrument) ──────────────────────────────────
    public async Task<InstamojoPaymentDetails?> GetPaymentDetailsAsync(string paymentId)
    {
        try
        {
            var token = await GetAccessTokenAsync();
            var req = new HttpRequestMessage(HttpMethod.Get, $"{BaseUrl}/v2/payments/{paymentId}/");
            req.Headers.Add("Authorization", $"Bearer {token}");
            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Instamojo GetPaymentDetails {PaymentId} failed: {Status}",
                    paymentId, resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root = doc.RootElement;

            // Some accounts return { "payment": {...} }, others return the object directly
            var payment = root.TryGetProperty("payment", out var p) ? p : root;

            decimal Decimal(string field)
            {
                if (!payment.TryGetProperty(field, out var el)) return 0m;
                if (el.ValueKind == JsonValueKind.Number) return el.GetDecimal();
                if (el.ValueKind == JsonValueKind.String && decimal.TryParse(
                    el.GetString(), System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture, out var v)) return v;
                return 0m;
            }
            string? Str(string field) =>
                payment.TryGetProperty(field, out var el) && el.ValueKind == JsonValueKind.String
                    ? el.GetString() : null;

            var amount = Decimal("amount");
            var totalFees = Decimal("fees");
            decimal fee = 0, tax = 0;

            // Prefer fees_split.fee + fees_split.tax if Instamojo returns it
            if (payment.TryGetProperty("fees_split", out var fsplit) && fsplit.ValueKind == JsonValueKind.Object)
            {
                if (fsplit.TryGetProperty("fee", out var fEl)) {
                    if (fEl.ValueKind == JsonValueKind.Number) fee = fEl.GetDecimal();
                    else if (fEl.ValueKind == JsonValueKind.String) decimal.TryParse(fEl.GetString(),
                        System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out fee);
                }
                if (fsplit.TryGetProperty("tax", out var tEl)) {
                    if (tEl.ValueKind == JsonValueKind.Number) tax = tEl.GetDecimal();
                    else if (tEl.ValueKind == JsonValueKind.String) decimal.TryParse(tEl.GetString(),
                        System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out tax);
                }
            }

            // Fallback: derive from total fee assuming 18% GST (tax = total - total/1.18)
            if (fee == 0 && totalFees > 0)
            {
                fee = Math.Round(totalFees / 1.18m, 4);
                tax = Math.Round(totalFees - fee, 4);
            }

            return new InstamojoPaymentDetails(
                PaymentId         : paymentId,
                Amount            : amount,
                Fee               : fee,
                Tax               : tax,
                InstrumentType    : Str("instrument_type"),
                BillingInstrument : Str("billing_instrument"),
                Status            : Str("status"));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Instamojo GetPaymentDetails threw for {PaymentId}", paymentId);
            return null;
        }
    }

    // ── Paged /v2/payments/ listing (for Month-wise Refresh) ──────────────────
    // Ports Rotary's CallInstaDetails_update_one_month_Transaction outer loop —
    // returns one page of payments with the API's reported total count, leaving
    // the caller to drive pagination + date filtering + upsert.
    public async Task<InstamojoPaymentPage?> FetchPaymentsPageAsync(int page = 1, int limit = 50)
    {
        try
        {
            var token = await GetAccessTokenAsync();
            var url = $"{BaseUrl}/v2/payments/?page={page}&limit={limit}";
            var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Add("Authorization", $"Bearer {token}");
            // Match Rotary's 5-min timeout — bulk pages can be slow on the API side.
            using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
            var resp = await _http.SendAsync(req, cts.Token);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Instamojo FetchPaymentsPage failed: page={Page} status={Status}",
                    page, resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(cts.Token));
            var root = doc.RootElement;

            int count = 0;
            if (root.TryGetProperty("count", out var cEl))
            {
                if (cEl.ValueKind == JsonValueKind.Number) count = cEl.GetInt32();
                else if (cEl.ValueKind == JsonValueKind.String && int.TryParse(cEl.GetString(), out var cv)) count = cv;
            }

            var items = new List<InstamojoPaymentItem>();
            if (root.TryGetProperty("payments", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in arr.EnumerateArray())
                {
                    string? Str(string k) =>
                        p.TryGetProperty(k, out var el) && el.ValueKind == JsonValueKind.String
                            ? el.GetString() : null;
                    decimal Dec(string k)
                    {
                        if (!p.TryGetProperty(k, out var el)) return 0m;
                        if (el.ValueKind == JsonValueKind.Number) return el.GetDecimal();
                        if (el.ValueKind == JsonValueKind.String && decimal.TryParse(el.GetString(),
                                System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture,
                                out var v)) return v;
                        return 0m;
                    }
                    decimal? DecOrNull(string k)
                    {
                        if (!p.TryGetProperty(k, out var el)) return null;
                        if (el.ValueKind == JsonValueKind.Null) return null;
                        if (el.ValueKind == JsonValueKind.Number) return el.GetDecimal();
                        if (el.ValueKind == JsonValueKind.String && decimal.TryParse(el.GetString(),
                                System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture,
                                out var v)) return v;
                        return null;
                    }
                    DateTime ParseDt(string k)
                    {
                        var s = Str(k);
                        return DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                                  System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                                  out var dt) ? dt : DateTime.MinValue;
                    }
                    DateTime? ParseDtOpt(string k)
                    {
                        var s = Str(k);
                        return DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                                  System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                                  out var dt) ? dt : null;
                    }

                    items.Add(new InstamojoPaymentItem(
                        Id                : Str("id") ?? "",
                        CreatedAt         : ParseDt("created_at"),
                        CompletedAt       : ParseDtOpt("completed_at"),
                        Title             : Str("title"),
                        Name              : Str("name"),
                        Email             : Str("email"),
                        Phone             : Str("phone"),
                        Amount            : Dec("amount"),
                        Fees              : DecOrNull("fees"),
                        TotalTaxes        : DecOrNull("total_taxes"),
                        Currency          : Str("currency"),
                        Cases             : Str("cases"),
                        InstrumentType    : Str("instrument_type"),
                        PaymentType       : Str("payment_type"),
                        BillingInstrument : Str("billing_instrument"),
                        PayoutUrl         : Str("payout")));
                }
            }

            return new InstamojoPaymentPage(count, items);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Instamojo FetchPaymentsPage timed out: page={Page}", page);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Instamojo FetchPaymentsPage threw: page={Page}", page);
            return null;
        }
    }

    // ── Phone normalization ───────────────────────────────────────────────────
    /// <summary>
    /// Convert a free-form phone string into E.164 ("+CCXXXXXXXXXX"), which is
    /// what Instamojo v2 requires. Handles common Indian variants:
    ///   "9876543210"            → "+919876543210"  (assumed India)
    ///   "919876543210"          → "+919876543210"
    ///   "09876543210"           → "+919876543210"  (strip STD-prefix 0)
    ///   "+919876543210"         → "+919876543210"  (untouched)
    ///   "+44 7700 900123"       → "+447700900123"  (untouched country code)
    /// Returns null for empty / unparseable input — caller skips sending phone.
    /// </summary>
    internal static string? NormalizePhoneForInstamojo(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;

        var trimmed = phone.Trim();
        var hasPlus = trimmed.StartsWith("+");
        var digits  = new string(trimmed.Where(char.IsDigit).ToArray());

        if (digits.Length == 0) return null;
        if (hasPlus)                                   return "+" + digits;
        if (digits.Length == 10)                       return "+91" + digits;          // Indian mobile, no CC
        if (digits.Length == 11 && digits[0] == '0')   return "+91" + digits[1..];     // STD-prefixed
        if (digits.Length == 12 && digits.StartsWith("91")) return "+" + digits;       // Already +91 but missing +
        // Anything else (international without +, very short, etc.) — be permissive
        // and let Instamojo reject so we surface a useful error in logs.
        return "+" + digits;
    }

    // ── OAuth Token ───────────────────────────────────────────────────────────
    private async Task<string> GetAccessTokenAsync()
    {
        if (_cachedToken != null && DateTime.UtcNow < _tokenExpiry)
            return _cachedToken;

        var body = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"]    = "client_credentials",
            ["client_id"]     = _clientId,
            ["client_secret"] = _clientSecret
        });

        var resp = await _http.PostAsync($"{BaseUrl}/oauth2/token/", body);
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        _cachedToken = root.GetProperty("access_token").GetString()!;
        var expiresIn = root.TryGetProperty("expires_in", out var exp) ? exp.GetInt32() : 3600;
        _tokenExpiry = DateTime.UtcNow.AddSeconds(expiresIn - 60);

        return _cachedToken;
    }
}
