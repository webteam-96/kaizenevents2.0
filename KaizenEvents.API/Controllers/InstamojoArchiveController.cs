using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using MiniExcelLibs;
using System.Security.Cryptography;
using System.Text;
// MiniExcelLibs also exposes its own IConfiguration — disambiguate so the
// controller's constructor binds to the Microsoft DI one.
using IConfiguration = Microsoft.Extensions.Configuration.IConfiguration;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Instamojo finance archive — port of Rotary India project's Instamojo*.aspx pages.
/// Read-only for ops (filters, list, export); restricted-write for finance (manual payments,
/// purpose toggles, OTP-protected delete).
///
/// Access requires: Director permission (can_approve_transfers = true) AND a session-level
/// password gate (config: InstamojoArchive:AccessPassword). Sensitive views (Show Profit,
/// Paid-to-Customer report) require an additional ProfitPassword.
/// </summary>
[ApiController]
[Route("api/instamojo-archive")]
[Authorize]
public class InstamojoArchiveController : ApiControllerBase
{
    private readonly IUserRepository _users;
    private readonly AppDbContext _db;
    private readonly IInstamojoService _instamojo;
    private readonly IOtpService _otp;
    private readonly IBrevoService _email;
    private readonly IAuditLoggerService _audit;
    private readonly IMemoryCache _cache;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly ILogger<InstamojoArchiveController> _logger;

    /// <summary>Header the frontend sends to prove the user entered the archive password.</summary>
    private const string SessionHeader = "X-Instamojo-Session";

    public InstamojoArchiveController(
        IUserRepository users,
        AppDbContext db,
        IInstamojoService instamojo,
        IOtpService otp,
        IBrevoService email,
        IAuditLoggerService audit,
        IMemoryCache cache,
        IWebHostEnvironment env,
        IConfiguration config,
        ILogger<InstamojoArchiveController> logger)
    {
        _users     = users;
        _db        = db;
        _instamojo = instamojo;
        _otp       = otp;
        _email     = email;
        _audit     = audit;
        _cache     = cache;
        _env       = env;
        _config    = config;
        _logger    = logger;
    }

    // ── Constant-time, length-safe string compare ───────────────────────────
    // Used for every password equality check on this controller so that
    // attackers can't recover the secret one character at a time via timing.
    private static bool ConstantTimeEquals(string? a, string? b)
    {
        if (a is null || b is null) return false;
        var aBytes = Encoding.UTF8.GetBytes(a);
        var bBytes = Encoding.UTF8.GetBytes(b);
        if (aBytes.Length != bBytes.Length) return false;
        return CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
    }

    private static string SessionCacheKey(string userId, string token) =>
        $"instamojo-archive:session:{userId}:{token}";

    /// <summary>Returns true if the request carries a session token that matches one
    /// we issued for the current user and which has not yet expired.</summary>
    private bool HasValidArchiveSession()
    {
        if (string.IsNullOrEmpty(CurrentUserId)) return false;
        if (!Request.Headers.TryGetValue(SessionHeader, out var values)) return false;
        var token = values.ToString();
        if (string.IsNullOrWhiteSpace(token)) return false;
        return _cache.TryGetValue<bool>(SessionCacheKey(CurrentUserId, token), out _);
    }

    // ── POST /api/instamojo-archive/verify-password ──────────────────────────
    /// <summary>
    /// Validates the shared access password set in appsettings → InstamojoArchive:AccessPassword.
    /// Caller must already be authenticated as Super Admin or Director (can_approve_transfers).
    /// On success returns a session token (UUID) the frontend stores in localStorage; this
    /// token is also accepted as proof of password entry on subsequent requests within the TTL.
    /// </summary>
    [HttpPost("verify-password")]
    public async Task<IActionResult> VerifyPassword([FromBody] PasswordVerifyRequest req)
    {
        // Session check intentionally bypassed here — this is the endpoint that issues the session.
        var roleErr = await CheckArchiveAccessAsync(requireSession: false);
        if (roleErr != null) return roleErr;

        var expected = _config["InstamojoArchive:AccessPassword"] ?? "";
        if (string.IsNullOrEmpty(expected))
            return StatusCode(500, new { detail = "Archive password not configured on server." });

        if (!ConstantTimeEquals(req.Password, expected))
        {
            await _audit.LogAsync(
                eventType: "INSTAMOJO_ARCHIVE_ACCESS_DENIED",
                userId: CurrentUserId,
                resourceType: "instamojo_archive",
                status: "failed",
                errorMessage: "Wrong access password",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());
            return BadRequest(new { detail = "Incorrect password." });
        }

        var ttlMin = _config.GetValue<int?>("InstamojoArchive:SessionTtlMinutes") ?? 60;
        var token  = Guid.NewGuid().ToString("N");
        var expiry = DateTimeOffset.UtcNow.AddMinutes(ttlMin).ToUnixTimeSeconds();

        // Server-side session store so a stolen JWT alone isn't enough — caller must also
        // present this opaque token in X-Instamojo-Session on subsequent archive calls.
        _cache.Set(
            SessionCacheKey(CurrentUserId ?? "anon", token),
            true,
            TimeSpan.FromMinutes(ttlMin));

        await _audit.LogAsync(
            eventType: "INSTAMOJO_ARCHIVE_ACCESS_GRANTED",
            userId: CurrentUserId,
            resourceType: "instamojo_archive",
            actionDetails: new { ttl_min = ttlMin },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            success    = true,
            token,                      // opaque session token (frontend stores in localStorage + sends as X-Instamojo-Session)
            expires_at = expiry,        // unix seconds
            ttl_min    = ttlMin
        });
    }

    // ── POST /api/instamojo-archive/verify-profit-password ───────────────────
    /// <summary>Separate password for the "Show Profit" modal and the Paid-to-Customer report.</summary>
    [HttpPost("verify-profit-password")]
    public async Task<IActionResult> VerifyProfitPassword([FromBody] PasswordVerifyRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var expected = _config["InstamojoArchive:ProfitPassword"] ?? "";
        if (string.IsNullOrEmpty(expected))
            return StatusCode(500, new { detail = "Profit password not configured on server." });

        if (!ConstantTimeEquals(req.Password, expected))
            return BadRequest(new { detail = "Incorrect password." });

        return Ok(new { success = true });
    }

    // ── GET /api/instamojo-archive/list ──────────────────────────────────────
    /// <summary>
    /// Paginated transaction list with filters. Returns soft-deleted=0 rows only.
    /// </summary>
    [HttpGet("list")]
    public async Task<IActionResult> List(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? title_id,
        [FromQuery] int? payout_flag,        // 0=pending, 1=settled, null=all
        [FromQuery] string? payment_type,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int size = 50)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        if (page < 1) page = 1;
        if (size < 1 || size > 200) size = 50;

        var q = _db.InstamojoDataDetails
            .AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0);

        if (from.HasValue)        q = q.Where(d => d.TransactionDate >= from.Value);
        if (to.HasValue)          q = q.Where(d => d.TransactionDate <= to.Value);
        if (title_id.HasValue)    q = q.Where(d => d.FkTitleId == (uint)title_id.Value);
        if (payout_flag.HasValue) q = q.Where(d => d.PayoutFlag == payout_flag.Value);
        if (!string.IsNullOrWhiteSpace(payment_type))
            q = q.Where(d => d.PaymentType == payment_type);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(d =>
                (d.BuyerName != null         && d.BuyerName.Contains(s)) ||
                (d.BuyerEmailAddress != null && d.BuyerEmailAddress.Contains(s)) ||
                (d.BuyerPhoneNumber != null  && d.BuyerPhoneNumber.Contains(s)) ||
                (d.PaymentId != null         && d.PaymentId.Contains(s)));
        }

        var total = await q.CountAsync();
        var rows = await q
            .OrderByDescending(d => d.TransactionDate)
            .ThenByDescending(d => d.Id)
            .Skip((page - 1) * size)
            .Take(size)
            .Select(d => new
            {
                id                = d.Id,
                payment_id        = d.PaymentId,
                transaction_date  = d.TransactionDate,
                title             = d.Title,
                buyer_name        = d.BuyerName,
                buyer_phone       = d.BuyerPhoneNumber,
                buyer_email       = d.BuyerEmailAddress,
                sale_amount       = d.SaleAmount,
                instamojo_fees    = d.InstamojoFees,
                total_tax         = d.TotalTax,
                payout_flag       = d.PayoutFlag,
                payout_status     = d.PayoutStatus,
                payment_type      = d.PaymentType,
                payment_instrument= d.PaymentInstrument,
                billing_instrument= d.BillingInstrument,
                payout_id         = d.PayoutId,
                payout_date       = d.PayoutDate,
                fk_title_id       = d.FkTitleId
            })
            .ToListAsync();

        return Ok(new
        {
            total,
            page,
            size,
            total_pages = (int)Math.Ceiling(total / (double)size),
            results     = rows
        });
    }

    // ── GET /api/instamojo-archive/summary ───────────────────────────────────
    /// <summary>
    /// Aggregate stats for the summary cards. Profit fields excluded by default —
    /// require POST /show-profit with the profit password to retrieve.
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? title_id)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;

        var q = _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0);
        if (from.HasValue)     q = q.Where(d => d.TransactionDate >= from.Value);
        if (to.HasValue)       q = q.Where(d => d.TransactionDate <= to.Value);
        if (title_id.HasValue) q = q.Where(d => d.FkTitleId == (uint)title_id.Value);

        // Sum aggregates from instamojo_datadetails — matches Rotary's
        // GetIntamojoDetailsGrid (Tables[1] = totals, Tables[3] = payout-only totals).
        // The _payout columns are filtered to settled rows (payout_flag = 1).
        var agg = await q
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Count          = g.Count(),
                TotalSale      = g.Sum(x => (decimal?)x.SaleAmount ?? 0m),
                TotalFees      = g.Sum(x => (decimal?)x.InstamojoFees ?? 0m),   // Rotary's "taxDeducted"   = sum_taxdeduct
                TotalTax       = g.Sum(x => (decimal?)x.TotalTax ?? 0m),        // Rotary's "receivedAfterTax" = sum_totaltax
                SettledCnt     = g.Sum(x => x.PayoutFlag == 1 ? 1 : 0),
                PendingCnt     = g.Sum(x => x.PayoutFlag == 0 ? 1 : 0),
                SettledAmt     = g.Sum(x => x.PayoutFlag == 1 ? (decimal?)x.SaleAmount ?? 0m : 0m),
                PendingAmt     = g.Sum(x => x.PayoutFlag == 0 ? (decimal?)x.SaleAmount ?? 0m : 0m),
                SettledFees    = g.Sum(x => x.PayoutFlag == 1 ? (decimal?)x.InstamojoFees ?? 0m : 0m),  // sum_taxdeduct_payout
                SettledTaxAmt  = g.Sum(x => x.PayoutFlag == 1 ? (decimal?)x.TotalTax ?? 0m : 0m),       // sum_totaltax_payout
                LatestMod      = g.Max(x => x.ModifiedDate)
            })
            .FirstOrDefaultAsync();

        // Distinct event count (Rotary's "Total Events" — counts unique fk_title_id)
        var totalEvents = await q.Select(x => x.FkTitleId).Distinct().CountAsync();

        // Sum manual customer-payouts from instamojo_payment_details
        // (keyed by fk_title_id which is varchar(200) in old schema)
        var pdQuery = _db.Set<KaizenEvents.Core.Entities.InstamojoDataDetail>(); // placeholder
        decimal totalPaid = 0m;
        try
        {
            var pdRaw = await _db.Database
                .SqlQueryRaw<decimal?>(BuildPaidSumSql(from, to, title_id))
                .ToListAsync();
            totalPaid = pdRaw.FirstOrDefault() ?? 0m;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not query instamojo_payment_details — table may be empty");
        }

        // ── Rotary formulas (Instamojodetails_list.aspx.cs BindTableData) ─────
        // amountReceived          = Sum_Collectedamount
        // taxDeducted             = sum_taxdeduct          (= SUM Instamojo_Fees)
        // receivedAfterTax        = sum_totaltax           (= SUM Total_Tax)
        // amountReceived_payout   = Sum_Collectedamount_payout
        // taxDeducted_payout      = sum_taxdeduct_payout   (settled only)
        // receivedAfterTax_payout = sum_totaltax_payout    (settled only)
        // bal_amount              = SUM amount FROM instamojo_payment_details
        //
        // profit         = amountReceived - (taxDeducted + receivedAfterTax)        ← Receivable
        // profit_payout  = amountReceived_payout - (taxDeducted_payout + receivedAfterTax_payout)  ← Received
        // profit3        = taxDeducted + receivedAfterTax                           ← Instamojo Commission
        // Balance_amount = profit - profit_payout                                   ← Balance
        // profit1        = 97.05% × amountReceived                                  ← Total Customer Payout
        // profit5        = 97.05% × amountReceived_payout                           ← Settled Customer Payout
        // pend_customer  = profit1 - profit5                                        ← Pending Customer Payout
        // profit_payout1 = profit5 - bal_amount                                     ← Kaizen Balance
        // profit2        = profit - profit1                                         ← Profit (gated)
        var totalCollection         = agg?.TotalSale     ?? 0m;
        var settledCollection       = agg?.SettledAmt    ?? 0m;
        var totalFees               = agg?.TotalFees     ?? 0m;   // SUM Instamojo_Fees (all rows)
        var totalTaxAmt             = agg?.TotalTax      ?? 0m;   // SUM Total_Tax     (all rows)
        var settledFees             = agg?.SettledFees   ?? 0m;   // SUM Instamojo_Fees (settled)
        var settledTaxAmt           = agg?.SettledTaxAmt ?? 0m;   // SUM Total_Tax     (settled)

        var instamojoCommission     = totalFees + totalTaxAmt;                            // profit3
        var receivable              = totalCollection - instamojoCommission;              // profit
        var received                = settledCollection - (settledFees + settledTaxAmt);  // profit_payout
        var balance                 = receivable - received;                              // Balance_amount1

        var customerShare           = 1m - commissionPct;                                 // 0.9705 with default 2.95%
        var totalCustomerPayout     = customerShare * totalCollection;                    // profit1
        var settledCustomerPayout   = customerShare * settledCollection;                  // profit5
        var pendingCustomerPayout   = totalCustomerPayout - settledCustomerPayout;        // pend_customer_payout1
        var kaizenBalance           = settledCustomerPayout - totalPaid;                  // profit_payout1

        return Ok(new
        {
            total_count          = agg?.Count ?? 0,
            // Top counters (Rotary labels — lbl_transactioncount / lbl_eventcount / lbl_LatestModifiedDate)
            total_transaction    = agg?.Count ?? 0,
            total_events         = totalEvents,
            updated_on           = agg?.LatestMod,
            // Top-line cards (Rotary labels)
            total_collection     = totalCollection,
            instamojo_commission = instamojoCommission,
            receivable,
            received,
            balance,
            // Customer payout breakdown (count + sum on collection side)
            settled_count        = agg?.SettledCnt ?? 0,
            pending_count        = agg?.PendingCnt ?? 0,
            settled_amount       = settledCollection,
            pending_amount       = agg?.PendingAmt ?? 0m,
            // Phase-4-style cards — Total / Settled / Pending Customer Payout + Kaizen panel
            total_customer_payout   = totalCustomerPayout,
            settled_customer_payout = settledCustomerPayout,
            pending_customer_payout = pendingCustomerPayout,
            paid                    = totalPaid,
            kaizen_balance          = kaizenBalance,
            // Aux
            total_tax            = agg?.TotalTax ?? 0m,
            commission_percent   = commissionPct,
            customer_share       = customerShare
        });
    }

    // ── POST /api/instamojo-archive/refresh-period ───────────────────────────
    /// <summary>
    /// "Month wise Refresh" — pulls a fresh page of Instamojo transactions for the
    /// selected period and upserts into <c>instamojo_datadetails</c>. Direct port of
    /// Rotary's <c>btn_fetch_one_month_click</c> → <c>CallInstaDetails_update_one_month_Transaction</c>.
    ///
    /// Range values mirror Rotary's <c>ddl_month_number</c> exactly:
    ///   1D / 10 / 15 / 20 / 25 / 1M / 2 / 3 / 4 / 5 / 6.
    ///
    /// Algorithm:
    ///   1. Convert range value to a fromDate (today − N days / today − N months)
    ///   2. Fetch page 1 of /v2/payments/ to learn the API's total count
    ///   3. Walk pages, upserting each payment whose created_at &gt;= fromDate
    ///   4. Break early once a row is older than fromDate (API rows are date-desc)
    ///
    /// Each upsert mirrors Rotary's SP <c>web_AddUpdateImportDataMembers</c>:
    /// look up fk_title_id from the Title, insert if new, then INSERT-or-UPDATE
    /// the data row by Payment_ID.
    /// </summary>
    [HttpPost("refresh-period")]
    public async Task<IActionResult> RefreshPeriod([FromBody] RefreshPeriodRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var allowed = new HashSet<string> { "1D", "10", "15", "20", "25", "1M", "2", "3", "4", "5", "6" };
        if (string.IsNullOrWhiteSpace(req.Range) || !allowed.Contains(req.Range))
            return BadRequest(new { detail = "Invalid range. Allowed: 1D, 10, 15, 20, 25, 1M, 2, 3, 4, 5, 6." });

        var fromDate = ResolveRangeFromDate(req.Range);
        _logger.LogInformation("Month-wise Refresh starting (range={Range}, fromDate={FromDate}) by user {UserId}",
            req.Range, fromDate.ToString("yyyy-MM-dd"), CurrentUserId);

        var firstPage = await _instamojo.FetchPaymentsPageAsync(page: 1, limit: 50);
        if (firstPage == null)
            return BadRequest(new { detail = "Could not fetch payments from Instamojo. Check API credentials." });

        var totalApi   = firstPage.Count;
        var pageCount  = (int)Math.Ceiling(totalApi / 50.0);
        var inserted   = 0;
        var updated    = 0;
        var skippedOld = false;
        var newTitles  = 0;

        // In-memory cache of (Title → pk_title_id) to avoid hitting DB per row.
        var titleCache = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        async Task<int> ResolveTitleIdAsync(string title)
        {
            if (titleCache.TryGetValue(title, out var cached)) return cached;
            var existing = await _db.InstamojoPaymentTitles
                .FirstOrDefaultAsync(t => t.Title == title);
            if (existing != null)
            {
                titleCache[title] = existing.Id;
                return existing.Id;
            }
            // Create new purpose row (Rotary's SP also auto-creates if missing).
            var row = new KaizenEvents.Core.Entities.InstamojoPaymentTitle
            {
                Title       = title,
                IsActive    = 1,
                IsDeleted   = 0,
                CreatedDate = DateTime.UtcNow
            };
            _db.InstamojoPaymentTitles.Add(row);
            await _db.SaveChangesAsync();   // assigns row.Id
            titleCache[title] = row.Id;
            newTitles++;
            return row.Id;
        }

        for (var page = 1; page <= Math.Max(1, pageCount); page++)
        {
            var pg = page == 1 ? firstPage : await _instamojo.FetchPaymentsPageAsync(page, 50);
            if (pg == null || pg.Payments.Count == 0) break;

            foreach (var item in pg.Payments)
            {
                // Rotary skips rows lacking fees/total_taxes — likely still in progress
                // on Instamojo's side. Replicating to avoid storing half-formed rows.
                if (item.Fees == null || item.TotalTaxes == null) continue;

                if (item.CreatedAt.Date < fromDate)
                {
                    skippedOld = true;
                    break;
                }

                // Title / Name de-tangling — matches Rotary's parens-extraction logic.
                var (titleText, buyerName) = SplitTitleAndName(item.Title, item.Name);
                if (string.IsNullOrWhiteSpace(titleText)) continue;

                var fkTitleId = await ResolveTitleIdAsync(titleText);
                var payoutId  = ExtractPayoutIdFromUrl(item.PayoutUrl);
                var payoutFlag = !string.IsNullOrEmpty(item.PayoutUrl) ? 1 : 0;

                var existingData = await _db.InstamojoDataDetails
                    .FirstOrDefaultAsync(d => d.PaymentId == item.Id);

                if (existingData == null)
                {
                    _db.InstamojoDataDetails.Add(new KaizenEvents.Core.Entities.InstamojoDataDetail
                    {
                        PaymentId           = item.Id,
                        TransactionDate     = item.CreatedAt == DateTime.MinValue ? null : item.CreatedAt,
                        TransactionType     = item.PaymentType,
                        PayoutId            = payoutId,
                        PayoutDate          = item.CompletedAt,
                        Title               = titleText,
                        BuyerName           = buyerName,
                        BuyerEmailAddress   = item.Email,
                        BuyerPhoneNumber    = item.Phone,
                        SaleCurrency        = item.Currency,
                        SaleAmount          = (int)Math.Round(item.Amount, 0),
                        InstamojoFees       = (float?)item.Fees,
                        TotalTax            = (float?)item.TotalTaxes,
                        RelatedCase         = item.Cases,
                        PaymentInstrument   = item.InstrumentType,
                        PaymentType         = item.PaymentType,
                        PayoutStatus        = string.IsNullOrEmpty(item.PayoutUrl) ? "Pending" : "Completed",
                        PayoutFlag          = payoutFlag,
                        BillingInstrument   = item.BillingInstrument,
                        FkTitleId           = (uint)fkTitleId,
                        CreatedDate         = DateTime.UtcNow,
                        ModifiedDate        = DateTime.UtcNow,
                        IsDeleted           = 0
                    });
                    inserted++;
                }
                else
                {
                    // Update key fields — covers the "pending → settled" transition that's
                    // the whole point of running Month-wise Refresh.
                    existingData.PayoutId          = payoutId;
                    existingData.PayoutDate        = item.CompletedAt;
                    existingData.InstamojoFees     = (float?)item.Fees;
                    existingData.TotalTax          = (float?)item.TotalTaxes;
                    existingData.PaymentInstrument = item.InstrumentType ?? existingData.PaymentInstrument;
                    existingData.BillingInstrument = item.BillingInstrument ?? existingData.BillingInstrument;
                    existingData.PaymentType       = item.PaymentType ?? existingData.PaymentType;
                    existingData.PayoutStatus      = string.IsNullOrEmpty(item.PayoutUrl) ? "Pending" : "Completed";
                    existingData.PayoutFlag        = payoutFlag;
                    existingData.FkTitleId         = (uint)fkTitleId;
                    existingData.ModifiedDate      = DateTime.UtcNow;
                    updated++;
                }
            }

            // Save per page so a mid-way failure still preserves progress.
            await _db.SaveChangesAsync();

            if (skippedOld) break;
        }

        await _audit.LogAsync(
            eventType: "INSTAMOJO_ARCHIVE_MONTH_WISE_REFRESH",
            userId: CurrentUserId,
            resourceType: "instamojo_archive",
            actionDetails: new { range = req.Range, from = fromDate, inserted, updated, new_titles = newTitles },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            success     = true,
            range       = req.Range,
            from        = fromDate,
            inserted,
            updated,
            new_titles  = newTitles,
            api_total   = totalApi,
            message     = $"Transaction Updated. Inserted {inserted}, updated {updated}, new titles {newTitles}."
        });
    }

    private static DateTime ResolveRangeFromDate(string range) =>
        range switch
        {
            "1D" => DateTime.UtcNow.AddDays(-1).Date,
            "1M" => DateTime.UtcNow.AddMonths(-1).Date,
            _    => int.TryParse(range, out var n)
                    ? (range.Length <= 2 && n <= 30 // 10, 15, 20, 25 = days
                        ? DateTime.UtcNow.AddDays(-n).Date
                        : DateTime.UtcNow.AddMonths(-n).Date) // 2..6 = months
                    : DateTime.UtcNow.AddDays(-15).Date
        };

    private static string? ExtractPayoutIdFromUrl(string? payoutUrl)
    {
        if (string.IsNullOrWhiteSpace(payoutUrl)) return null;
        var trimmed = payoutUrl.TrimEnd('/');
        var idx = trimmed.LastIndexOf('/');
        return idx >= 0 ? trimmed[(idx + 1)..] : trimmed;
    }

    /// <summary>
    /// Rotary's title/name parens-extraction logic. When Instamojo returns the
    /// same value for title and name, the actual title is often wrapped in
    /// parentheses, e.g. "Member Name (PURPOSE EVENT)". Split it out so the
    /// archived row has clean Title + Buyer Name fields.
    /// </summary>
    private static (string Title, string? Name) SplitTitleAndName(string? rawTitle, string? rawName)
    {
        var title = rawTitle?.Trim() ?? "";
        var name  = rawName?.Trim();

        if (!string.IsNullOrEmpty(title) && title == name && title.Contains('(') && title.Contains(')'))
        {
            var start = title.IndexOf('(') + 1;
            var end   = title.IndexOf(')');
            if (end > start) title = title.Substring(start, end - start).Trim();
        }
        if (!string.IsNullOrEmpty(name) && name == rawTitle)
        {
            var paren = name!.IndexOf('(');
            if (paren > 0) name = name[..paren].Trim();
        }
        return (title, name);
    }

    private static string BuildPaidSumSql(DateTime? from, DateTime? to, int? titleId)
    {
        // Rotary's stored proc INNER JOINs to instamojo_paymenttitle and excludes
        // orphan payments whose fk_title_id is NULL / '0' / '' or points to a
        // soft-deleted title. Match that behaviour exactly so the "Paid" card on
        // /instamojo/list (and Kaizen Balance = Settled CP − Paid) matches Rotary's UI.
        // instamojo_payment_details.fk_title_id is VARCHAR; paymenttitle.pk_title_id
        // is INT — cast to UNSIGNED for the join.
        var sb = new System.Text.StringBuilder();
        sb.Append("SELECT COALESCE(SUM(p.amount),0) AS Value FROM instamojo_payment_details p ");
        sb.Append("INNER JOIN instamojo_paymenttitle t ON CAST(p.fk_title_id AS UNSIGNED) = t.pk_title_id ");
        sb.Append("WHERE (p.isdeleted IS NULL OR p.isdeleted = 0) ");
        sb.Append("AND   (t.isdeleted IS NULL OR t.isdeleted = 0)");
        if (from.HasValue)     sb.Append(" AND p.createddate >= '" + from.Value.ToString("yyyy-MM-dd HH:mm:ss") + "'");
        if (to.HasValue)       sb.Append(" AND p.createddate <= '" + to.Value.ToString("yyyy-MM-dd HH:mm:ss") + "'");
        if (titleId.HasValue)  sb.Append(" AND p.fk_title_id = '" + titleId.Value + "'");
        return sb.ToString();
    }

    // ── GET /api/instamojo-archive/dropdowns ─────────────────────────────────
    /// <summary>
    /// Returns DISTINCT values for the Payout Flag and Payment Type dropdowns —
    /// matches Rotary's API_GetInstaDropdownList stored proc behavior.
    /// Only rows with non-empty values are returned. Sorted alphabetically.
    /// </summary>
    [HttpGet("dropdowns")]
    public async Task<IActionResult> GetDropdowns()
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        // Payout flags — distinct (payout_flag, payout_status) pairs
        // Rotary's stored proc API_GetInstaDropdownList returns "true"/"false" as the text;
        // fall back to that if our row's payout_status column is NULL.
        var payoutRaw = await _db.InstamojoDataDetails
            .AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0)
            .GroupBy(d => new { d.PayoutFlag, d.PayoutStatus })
            .Select(g => new { g.Key.PayoutFlag, g.Key.PayoutStatus })
            .Distinct()
            .ToListAsync();

        // Reduce to one row per flag (preferring DB-supplied status if present)
        var payoutFlags = payoutRaw
            .GroupBy(x => x.PayoutFlag)
            .Select(g =>
            {
                var dbStatus = g.Select(x => x.PayoutStatus).FirstOrDefault(s => !string.IsNullOrEmpty(s));
                return new
                {
                    value = g.Key.ToString(),
                    text  = dbStatus ?? (g.Key == 1 ? "true" : "false")
                };
            })
            .OrderBy(x => x.value)
            .ToList();

        // Payment types — distinct payment_instrument values, NO sort (preserve DB natural order to match Rotary)
        var paymentTypes = await _db.InstamojoDataDetails
            .AsNoTracking()
            .Where(d => (d.IsDeleted == null || d.IsDeleted == 0)
                     && d.PaymentInstrument != null
                     && d.PaymentInstrument != "")
            .Select(d => d.PaymentInstrument!)
            .Distinct()
            .ToListAsync();

        return Ok(new
        {
            payout_flags  = payoutFlags,
            payment_types = paymentTypes
        });
    }

    // ── GET /api/instamojo-archive/purposes ──────────────────────────────────
    /// <summary>
    /// Paginated list of all instamojo_paymenttitle rows for the Purpose listing page.
    /// </summary>
    [HttpGet("purposes")]
    public async Task<IActionResult> ListPurposes(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int size = 50)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        if (page < 1) page = 1;
        if (size < 1 || size > 200) size = 50;

        var q = _db.InstamojoPaymentTitles.AsNoTracking()
            .Where(t => t.IsDeleted == null || t.IsDeleted == 0);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(t => t.Title != null && t.Title.Contains(s));
        }

        var total = await q.CountAsync();
        var rows = await q
            .OrderBy(t => t.Title)
            .Skip((page - 1) * size)
            .Take(size)
            .Select(t => new
            {
                id           = t.Id,
                title        = t.Title,
                is_active    = t.IsActive ?? 1,
                payee        = t.Payee,
                bank_details = t.BankDetails,
                created_date = t.CreatedDate
            })
            .ToListAsync();

        return Ok(new
        {
            total,
            page,
            size,
            total_pages = (int)Math.Ceiling(total / (double)size),
            results     = rows
        });
    }

    // ── PATCH /api/instamojo-archive/purposes/{id}/active ────────────────────
    /// <summary>Toggles IsActive on the title row (0 ↔ 1).</summary>
    [HttpPatch("purposes/{id}/active")]
    public async Task<IActionResult> ToggleActive(int id, [FromBody] ToggleActiveRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoPaymentTitles.FirstOrDefaultAsync(t => t.Id == id);
        if (row == null) return NotFound(new { detail = "Title not found." });

        row.IsActive     = req.IsActive == 1 ? 1 : 0;
        row.ModifiedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true, id, is_active = row.IsActive });
    }

    // ── PATCH /api/instamojo-archive/purposes/{id} ───────────────────────────
    /// <summary>Updates Payee and Bank Details on a title row (matches Rotary's edit modal).</summary>
    [HttpPatch("purposes/{id}")]
    public async Task<IActionResult> UpdatePurpose(int id, [FromBody] UpdatePurposeRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoPaymentTitles.FirstOrDefaultAsync(t => t.Id == id);
        if (row == null) return NotFound(new { detail = "Title not found." });

        row.Payee        = req.Payee;
        row.BankDetails  = req.BankDetails;
        row.ModifiedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true, id, payee = row.Payee, bank_details = row.BankDetails });
    }

    // ── GET /api/instamojo-archive/purposes/{titleId}/banks ──────────────────
    /// <summary>
    /// Returns the purpose title + all non-deleted bank rows for that title.
    /// Mirrors Rotary's <c>get_all_instamojo_purpose_bank_list</c> SP (two result sets).
    /// </summary>
    [HttpGet("purposes/{titleId:int}/banks")]
    public async Task<IActionResult> ListPurposeBanks(int titleId)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var title = await _db.InstamojoPaymentTitles.AsNoTracking()
            .Where(t => t.Id == titleId)
            .Select(t => new { id = t.Id, title = t.Title })
            .FirstOrDefaultAsync();
        if (title == null) return NotFound(new { detail = "Purpose not found." });

        var banks = await _db.InstamojoPurposeBankDetails.AsNoTracking()
            .Where(b => b.FkTitleId == titleId && (b.IsDeleted == null || b.IsDeleted == 0))
            .OrderBy(b => b.Id)
            .Select(b => new
            {
                pk_purposetitle_bank_details_id = b.Id,
                fk_title_id     = b.FkTitleId,
                account_name    = b.AccountName,
                bank_name       = b.BankName,
                account_number  = b.AccountNumber,
                bank_branch     = b.BankBranch,
                ifsc_code       = b.IfscCode,
                created_date    = b.CreatedDate,
                modified_date   = b.ModifiedDate
            })
            .ToListAsync();

        return Ok(new { title, banks });
    }

    // ── POST /api/instamojo-archive/purposes/{titleId}/banks ─────────────────
    /// <summary>Adds a new bank row under a purpose title.</summary>
    [HttpPost("purposes/{titleId:int}/banks")]
    public async Task<IActionResult> AddPurposeBank(int titleId, [FromBody] PurposeBankRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var titleExists = await _db.InstamojoPaymentTitles.AnyAsync(t => t.Id == titleId);
        if (!titleExists) return NotFound(new { detail = "Purpose not found." });

        if (string.IsNullOrWhiteSpace(req.AccountName))   return BadRequest(new { detail = "Account name is required." });
        if (string.IsNullOrWhiteSpace(req.AccountNumber)) return BadRequest(new { detail = "Account number is required." });
        if (string.IsNullOrWhiteSpace(req.IfscCode))      return BadRequest(new { detail = "IFSC code is required." });

        int? createdBy = int.TryParse(CurrentUserId, out var uid) ? uid : null;

        var row = new KaizenEvents.Core.Entities.InstamojoPurposeBankDetails
        {
            FkTitleId     = titleId,
            AccountName   = req.AccountName.Trim(),
            BankName      = req.BankName?.Trim(),
            AccountNumber = req.AccountNumber.Trim(),
            BankBranch    = req.BankBranch?.Trim(),
            IfscCode      = req.IfscCode.Trim(),
            CreatedBy     = createdBy,
            CreatedDate   = DateTime.UtcNow,
            IsDeleted     = 0
        };
        _db.InstamojoPurposeBankDetails.Add(row);
        await _db.SaveChangesAsync();

        return Ok(new { success = true, pk_purposetitle_bank_details_id = row.Id });
    }

    // ── PATCH /api/instamojo-archive/purposes/{titleId}/banks/{bankId} ───────
    /// <summary>Updates an existing bank row.</summary>
    [HttpPatch("purposes/{titleId:int}/banks/{bankId:int}")]
    public async Task<IActionResult> UpdatePurposeBank(int titleId, int bankId, [FromBody] PurposeBankRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoPurposeBankDetails.FirstOrDefaultAsync(
            b => b.Id == bankId && b.FkTitleId == titleId && (b.IsDeleted == null || b.IsDeleted == 0));
        if (row == null) return NotFound(new { detail = "Bank record not found." });

        if (string.IsNullOrWhiteSpace(req.AccountName))   return BadRequest(new { detail = "Account name is required." });
        if (string.IsNullOrWhiteSpace(req.AccountNumber)) return BadRequest(new { detail = "Account number is required." });
        if (string.IsNullOrWhiteSpace(req.IfscCode))      return BadRequest(new { detail = "IFSC code is required." });

        int? modifiedBy = int.TryParse(CurrentUserId, out var uid) ? uid : null;

        row.AccountName   = req.AccountName.Trim();
        row.BankName      = req.BankName?.Trim();
        row.AccountNumber = req.AccountNumber.Trim();
        row.BankBranch    = req.BankBranch?.Trim();
        row.IfscCode      = req.IfscCode.Trim();
        row.ModifiedBy    = modifiedBy;
        row.ModifiedDate  = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, pk_purposetitle_bank_details_id = row.Id });
    }

    // ── DELETE /api/instamojo-archive/purposes/{titleId}/banks/{bankId} ──────
    /// <summary>Soft-deletes a bank row (sets isdeleted=1, deletedby, deleteddate).</summary>
    [HttpDelete("purposes/{titleId:int}/banks/{bankId:int}")]
    public async Task<IActionResult> DeletePurposeBank(int titleId, int bankId)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoPurposeBankDetails.FirstOrDefaultAsync(
            b => b.Id == bankId && b.FkTitleId == titleId && (b.IsDeleted == null || b.IsDeleted == 0));
        if (row == null) return NotFound(new { detail = "Bank record not found." });

        int? deletedBy = int.TryParse(CurrentUserId, out var uid) ? uid : null;

        row.IsDeleted   = 1;
        row.DeletedBy   = deletedBy;
        row.DeletedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, pk_purposetitle_bank_details_id = bankId });
    }

    // ── GET /api/instamojo-archive/purposes/autocomplete ─────────────────────
    [HttpGet("purposes/autocomplete")]
    public async Task<IActionResult> AutocompletePurposes([FromQuery] string? q, [FromQuery] int limit = 10)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        if (limit < 1 || limit > 50) limit = 10;
        var query = _db.InstamojoPaymentTitles.AsNoTracking()
            .Where(t => (t.IsDeleted == null || t.IsDeleted == 0) && (t.IsActive == null || t.IsActive == 1));

        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(t => t.Title != null && t.Title.Contains(q.Trim()));

        var rows = await query
            .OrderBy(t => t.Title)
            .Take(limit)
            .Select(t => new { id = t.Id, title = t.Title })
            .ToListAsync();
        return Ok(rows);
    }

    // ── POST /api/instamojo-archive/{paymentId}/mark-refund ──────────────────
    /// <summary>
    /// Marks a transaction's payout_flag = 1 (Settled / Refund processed). One-way action,
    /// matches Rotary's behavior. Cannot be undone via this endpoint.
    /// </summary>
    [HttpPost("{paymentId}/mark-refund")]
    public async Task<IActionResult> MarkRefund(string paymentId)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoDataDetails.FirstOrDefaultAsync(d => d.PaymentId == paymentId);
        if (row == null) return NotFound(new { detail = "Payment not found." });

        if (row.PayoutFlag == 1)
            return Ok(new { success = true, already_settled = true, payment_id = paymentId, payout_flag = 1 });

        row.PayoutFlag   = 1;
        row.ModifiedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true, payment_id = paymentId, payout_flag = 1 });
    }

    // ── POST /api/instamojo-archive/{paymentId}/refresh ──────────────────────
    /// <summary>
    /// Refreshes a single transaction by calling Instamojo's payment API and updating
    /// fee/tax/instrument fields on the local archive row. Matches Rotary's per-row Refresh.
    /// </summary>
    [HttpPost("{paymentId}/refresh")]
    public async Task<IActionResult> RefreshOne(string paymentId)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoDataDetails.FirstOrDefaultAsync(d => d.PaymentId == paymentId);
        if (row == null) return NotFound(new { detail = "Payment not found." });

        var details = await _instamojo.GetPaymentDetailsAsync(paymentId);
        if (details == null)
            return BadRequest(new { detail = "Could not fetch from Instamojo. Check API credentials and that this payment exists in the connected Instamojo account." });

        row.InstamojoFees      = (float)details.Fee;
        row.TotalTax           = (float)details.Tax;
        row.PaymentInstrument  = details.InstrumentType ?? row.PaymentInstrument;
        row.BillingInstrument  = details.BillingInstrument ?? row.BillingInstrument;
        row.ModifiedDate       = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            success            = true,
            payment_id         = paymentId,
            instamojo_fees     = row.InstamojoFees,
            total_tax          = row.TotalTax,
            payment_instrument = row.PaymentInstrument,
            billing_instrument = row.BillingInstrument
        });
    }

    // ── POST /api/instamojo-archive/show-profit ──────────────────────────────
    /// <summary>
    /// Returns profit numbers IF the request includes the correct profit password.
    /// Sensitive — do not log the password value.
    /// </summary>
    [HttpPost("show-profit")]
    public async Task<IActionResult> ShowProfit([FromBody] ShowProfitRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var expected = _config["InstamojoArchive:ProfitPassword"] ?? "";
        if (string.IsNullOrEmpty(expected) || !ConstantTimeEquals(req.Password, expected))
            return BadRequest(new { detail = "Incorrect password." });

        await _audit.LogAsync(
            eventType: "INSTAMOJO_ARCHIVE_PROFIT_REVEALED",
            userId: CurrentUserId,
            resourceType: "instamojo_archive",
            actionDetails: new { req.From, req.To, req.TitleId },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;

        var q = _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0);
        if (req.From.HasValue)     q = q.Where(d => d.TransactionDate >= req.From.Value);
        if (req.To.HasValue)       q = q.Where(d => d.TransactionDate <= req.To.Value);
        if (req.TitleId.HasValue)  q = q.Where(d => d.FkTitleId == (uint)req.TitleId.Value);

        var totalSale = await q.SumAsync(d => (decimal?)d.SaleAmount) ?? 0m;
        var totalFees = await q.SumAsync(d => (decimal?)d.InstamojoFees) ?? 0m;
        var totalTax  = await q.SumAsync(d => (decimal?)d.TotalTax) ?? 0m;

        decimal totalPaid = 0m;
        try
        {
            var pdRaw = await _db.Database
                .SqlQueryRaw<decimal?>(BuildPaidSumSql(req.From, req.To, req.TitleId))
                .ToListAsync();
            totalPaid = pdRaw.FirstOrDefault() ?? 0m;
        }
        catch { /* ignore */ }

        var receivable = Math.Max(0, totalSale - (totalSale * commissionPct));
        var profit     = Math.Max(0, receivable - totalPaid - totalFees - totalTax);

        return Ok(new
        {
            total_collection = totalSale,
            commission       = totalSale * commissionPct,
            receivable,
            paid_to_customer = totalPaid,
            gateway_fees     = totalFees,
            tax              = totalTax,
            profit
        });
    }

    // ── GET /api/instamojo-archive/payments/dashboard ────────────────────────
    /// <summary>
    /// Per-purpose dashboard metrics for the InstamojoAddMemberDetails port.
    /// Returns all card values EXCEPT the "Profit" number — which is gated by the
    /// existing /show-profit endpoint (matches Rotary's "Show Profit" reveal).
    /// All filters optional; passing none returns global aggregates.
    /// </summary>
    [HttpGet("payments/dashboard")]
    public async Task<IActionResult> PaymentsDashboard(
        [FromQuery] int? title_id,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;
        var customerShare = 1m - commissionPct;   // 0.9705 by default

        // Source 1: instamojo_datadetails (collections)
        var dataQ = _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0);
        if (title_id.HasValue) dataQ = dataQ.Where(d => d.FkTitleId == (uint)title_id.Value);
        if (from.HasValue)     dataQ = dataQ.Where(d => d.TransactionDate >= from.Value);
        if (to.HasValue)       dataQ = dataQ.Where(d => d.TransactionDate <= to.Value);

        var amountReceived      = (decimal)(await dataQ.SumAsync(d => (double?)d.SaleAmount)     ?? 0);
        var taxDeducted         = (decimal)(await dataQ.SumAsync(d => (double?)d.TotalTax)       ?? 0);
        var receivedAfterTax    = (decimal)(await dataQ.SumAsync(d => (double?)d.InstamojoFees)  ?? 0);

        var settledQ = dataQ.Where(d => d.PayoutFlag == 1);
        var amountReceivedPayout   = (decimal)(await settledQ.SumAsync(d => (double?)d.SaleAmount)    ?? 0);
        var taxDeductedPayout      = (decimal)(await settledQ.SumAsync(d => (double?)d.TotalTax)      ?? 0);
        var receivedAfterTaxPayout = (decimal)(await settledQ.SumAsync(d => (double?)d.InstamojoFees) ?? 0);

        // Source 2: instamojo_payment_details (Kaizen's outgoing payouts).
        // Rotary's SP excludes "orphan" payments whose fk_title_id points to a NULL /
        // '0' / '' / soft-deleted title — pre-fetch the active title id list and use
        // it as a Contains filter so EF generates a clean WHERE … IN clause.
        var activeTitleIds = (await _db.InstamojoPaymentTitles.AsNoTracking()
                .Where(t => t.IsDeleted == null || t.IsDeleted == 0)
                .Select(t => t.Id)
                .ToListAsync())
            .Select(id => id.ToString())
            .ToList();

        var paidQ = _db.InstamojoPaymentDetails.AsNoTracking()
            .Where(p => (p.IsDeleted == null || p.IsDeleted == 0)
                     && p.FkTitleId != null
                     && activeTitleIds.Contains(p.FkTitleId));
        if (title_id.HasValue) paidQ = paidQ.Where(p => p.FkTitleId == title_id.Value.ToString());
        if (from.HasValue)     paidQ = paidQ.Where(p => p.CreatedDate >= from.Value);
        if (to.HasValue)       paidQ = paidQ.Where(p => p.CreatedDate <= to.Value);
        var balAmount = await paidQ.SumAsync(p => (decimal?)p.Amount) ?? 0m;

        // Derived (matches Rotary's profit*/balance* formulas)
        var instamojoCommission = taxDeducted + receivedAfterTax;             // profit3
        var receivable          = amountReceived - instamojoCommission;       // profit
        var receivedSettled     = amountReceivedPayout
                                  - (taxDeductedPayout + receivedAfterTaxPayout); // profit_payout
        var balanceTotal        = receivable - receivedSettled;               // Balance_amount1

        var totalCustomerPayout   = customerShare * amountReceived;           // profit1
        var settledCustomerPayout = customerShare * amountReceivedPayout;     // profit5
        var pendCustomerPayout    = totalCustomerPayout - settledCustomerPayout; // pend_customer_payout1

        var kaizenBalance = settledCustomerPayout - balAmount;                // profit_payout1
        // profit  = receivable - totalCustomerPayout — RETURNED ONLY VIA /show-profit (password gated)

        return Ok(new
        {
            // Instamojo strip
            total_collection      = amountReceived,
            instamojo_commission  = instamojoCommission,
            receivable,
            received              = receivedSettled,
            balance               = balanceTotal,
            // Customer payout column
            total_customer_payout   = totalCustomerPayout,
            settled_customer_payout = settledCustomerPayout,
            pending_customer_payout = pendCustomerPayout,
            // Kaizen panel (profit deliberately omitted; use /show-profit)
            paid           = balAmount,
            kaizen_balance = kaizenBalance,
            // Convenience meta
            commission_pct = commissionPct,
            customer_share = customerShare
        });
    }

    // ── GET /api/instamojo-archive/payments ──────────────────────────────────
    /// <summary>
    /// Paginated rows from instamojo_payment_details (Kaizen's outgoing payouts) joined
    /// with the purpose title and (optionally) the linked structured bank-account row.
    /// Powers the grid on the InstamojoAddMemberDetails port.
    /// </summary>
    [HttpGet("payments")]
    public async Task<IActionResult> ListPayments(
        [FromQuery] int? title_id,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int size = 20)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        if (page < 1) page = 1;
        if (size < 1 || size > 200) size = 20;

        var q = _db.InstamojoPaymentDetails.AsNoTracking()
            .Where(p => p.IsDeleted == null || p.IsDeleted == 0);
        if (title_id.HasValue) q = q.Where(p => p.FkTitleId == title_id.Value.ToString());
        if (from.HasValue)     q = q.Where(p => p.CreatedDate >= from.Value);
        if (to.HasValue)       q = q.Where(p => p.CreatedDate <= to.Value);

        var total = await q.CountAsync();

        // 1) Page the payments table only (single-table query, fully translatable).
        var pageRows = await q
            .OrderByDescending(p => p.CreatedDate).ThenByDescending(p => p.Id)
            .Skip((page - 1) * size).Take(size)
            .Select(p => new
            {
                p.Id,
                p.FkTitleId,
                p.Amount,
                p.CreatedDate,
                p.FkBankDetailsId,
                p.Remark
            })
            .ToListAsync();

        // 2) Resolve titles + structured bank rows in two cheap lookup queries,
        //    then stitch client-side. Avoids the int↔varchar SQL join translation issue
        //    (instamojo_payment_details.fk_title_id is varchar(200); paymenttitle.pk_title_id is int).
        var titleIds = pageRows
            .Select(r => int.TryParse(r.FkTitleId, out var x) ? x : 0)
            .Where(x => x > 0).Distinct().ToList();
        var bankIds = pageRows
            .Select(r => r.FkBankDetailsId ?? 0)
            .Where(x => x > 0).Distinct().ToList();

        var titles = titleIds.Count == 0
            ? new Dictionary<int, (string? Title, string? BankDetails)>()
            : await _db.InstamojoPaymentTitles.AsNoTracking()
                .Where(t => titleIds.Contains(t.Id))
                .ToDictionaryAsync(t => t.Id, t => (t.Title, t.BankDetails));

        var banks = bankIds.Count == 0
            ? new Dictionary<int, (string? AccountName, string? BankName, string? AccountNumber)>()
            : await _db.InstamojoPurposeBankDetails.AsNoTracking()
                .Where(b => bankIds.Contains(b.Id))
                .ToDictionaryAsync(b => b.Id, b => (b.AccountName, b.BankName, b.AccountNumber));

        var rows = pageRows.Select(r =>
        {
            int.TryParse(r.FkTitleId, out var titleIntId);
            titles.TryGetValue(titleIntId, out var t);

            string? bank = null;
            if ((r.FkBankDetailsId ?? 0) > 0 && banks.TryGetValue(r.FkBankDetailsId!.Value, out var b))
            {
                var parts = new[] { b.AccountName, b.BankName, b.AccountNumber }
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .ToArray();
                if (parts.Length > 0) bank = string.Join(" | ", parts);
            }
            bank ??= t.BankDetails;

            return new
            {
                id                 = r.Id,
                title              = t.Title,
                fk_title_id        = r.FkTitleId,
                amount             = r.Amount,
                created_date       = r.CreatedDate,
                bank_details       = bank,
                fk_bank_details_id = r.FkBankDetailsId,
                remark             = r.Remark
            };
        }).ToList();

        return Ok(new
        {
            total,
            page,
            size,
            total_pages = (int)Math.Ceiling(total / (double)size),
            results     = rows
        });
    }

    // ── GET /api/instamojo-archive/payments/{id} ─────────────────────────────
    /// <summary>Single payment row — used by the InstamojoAddPayment edit page to prefill the form.</summary>
    [HttpGet("payments/{id:int}")]
    public async Task<IActionResult> GetPayment(int id)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var p = await _db.InstamojoPaymentDetails.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && (x.IsDeleted == null || x.IsDeleted == 0));
        if (p == null) return NotFound(new { detail = "Payment record not found." });

        // Resolve title separately — payment.fk_title_id is varchar; title.pk_title_id is int.
        string? title = null;
        if (int.TryParse(p.FkTitleId, out var titleIntId) && titleIntId > 0)
        {
            title = await _db.InstamojoPaymentTitles.AsNoTracking()
                .Where(t => t.Id == titleIntId)
                .Select(t => t.Title)
                .FirstOrDefaultAsync();
        }

        return Ok(new
        {
            id            = p.Id,
            fk_title_id   = p.FkTitleId,
            title,
            amount        = p.Amount,
            remark        = p.Remark,
            fk_bank_details_id = p.FkBankDetailsId,
            created_date  = p.CreatedDate,
            modified_date = p.ModifiedDate
        });
    }

    // ── GET /api/instamojo-archive/payments/summary?title_id= ────────────────
    /// <summary>
    /// Per-purpose 4-card summary used on the Add/Edit form: Total Transaction count,
    /// Amount Collected, Paid, Balance. Mirrors Rotary's
    /// <c>cls_Instamojo.GetIntamojoPaymentDetails_Page(fk_title_id)</c>.
    /// </summary>
    [HttpGet("payments/summary")]
    public async Task<IActionResult> PaymentsSummary([FromQuery] int? title_id)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;
        var customerShare = 1m - commissionPct;

        var dataQ = _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0);
        if (title_id.HasValue) dataQ = dataQ.Where(d => d.FkTitleId == (uint)title_id.Value);

        var totalTransaction = await dataQ.CountAsync();
        var amountCollected  = (decimal)(await dataQ.SumAsync(d => (double?)d.SaleAmount) ?? 0);

        var paidQ = _db.InstamojoPaymentDetails.AsNoTracking()
            .Where(p => p.IsDeleted == null || p.IsDeleted == 0);
        if (title_id.HasValue)
        {
            paidQ = paidQ.Where(p => p.FkTitleId == title_id.Value.ToString());
        }
        else
        {
            // Global mode (no title filter) — exclude orphan payments whose
            // fk_title_id points to a missing/deleted purpose, matching
            // Rotary's stored proc behaviour and our other Paid endpoints.
            var activeTitleIds = (await _db.InstamojoPaymentTitles.AsNoTracking()
                    .Where(t => t.IsDeleted == null || t.IsDeleted == 0)
                    .Select(t => t.Id)
                    .ToListAsync())
                .Select(id => id.ToString())
                .ToList();
            paidQ = paidQ.Where(p => p.FkTitleId != null && activeTitleIds.Contains(p.FkTitleId));
        }
        var paid    = await paidQ.SumAsync(p => (decimal?)p.Amount) ?? 0m;

        var customerPayout = customerShare * amountCollected;
        var balance        = customerPayout - paid;

        return Ok(new
        {
            total_transaction = totalTransaction,
            amount_collected  = amountCollected,
            paid,
            balance
        });
    }

    // ── POST /api/instamojo-archive/payments ─────────────────────────────────
    /// <summary>Creates a new outgoing payment row (Add mode on InstamojoAddPayment).</summary>
    [HttpPost("payments")]
    public async Task<IActionResult> CreatePayment([FromBody] PaymentUpsertRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        if (!req.TitleId.HasValue || req.TitleId.Value <= 0)
            return BadRequest(new { detail = "Purpose is required." });
        if (!req.Amount.HasValue || req.Amount.Value <= 0)
            return BadRequest(new { detail = "Amount is required." });

        // Balance guard — matches Rotary's "Entered Amount is Greter than Balance Amount!!" check.
        var balanceErr = await EnforceBalanceAsync(req.TitleId.Value, req.Amount.Value, excludePaymentId: null);
        if (balanceErr != null) return balanceErr;

        var row = new KaizenEvents.Core.Entities.InstamojoPaymentDetail
        {
            FkTitleId       = req.TitleId.Value.ToString(),
            Amount          = req.Amount.Value,
            Remark          = req.Remark?.Trim(),
            FkBankDetailsId = (req.BankDetailsId.HasValue && req.BankDetailsId.Value > 0) ? req.BankDetailsId : null,
            CreatedDate     = DateTime.UtcNow,
            IsDeleted       = 0
        };
        _db.InstamojoPaymentDetails.Add(row);
        await _db.SaveChangesAsync();

        return Ok(new { success = true, id = row.Id, message = "Payment added Successfully" });
    }

    // ── PATCH /api/instamojo-archive/payments/{id} ───────────────────────────
    /// <summary>Updates an existing outgoing payment row (Edit mode on InstamojoAddPayment).</summary>
    [HttpPatch("payments/{id:int}")]
    public async Task<IActionResult> UpdatePayment(int id, [FromBody] PaymentUpsertRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoPaymentDetails
            .FirstOrDefaultAsync(p => p.Id == id && (p.IsDeleted == null || p.IsDeleted == 0));
        if (row == null) return NotFound(new { detail = "Payment record not found." });

        if (!req.TitleId.HasValue || req.TitleId.Value <= 0)
            return BadRequest(new { detail = "Purpose is required." });
        if (!req.Amount.HasValue || req.Amount.Value <= 0)
            return BadRequest(new { detail = "Amount is required." });

        var balanceErr = await EnforceBalanceAsync(req.TitleId.Value, req.Amount.Value, excludePaymentId: id);
        if (balanceErr != null) return balanceErr;

        row.FkTitleId       = req.TitleId.Value.ToString();
        row.Amount          = req.Amount.Value;
        row.Remark          = req.Remark?.Trim();
        row.FkBankDetailsId = (req.BankDetailsId.HasValue && req.BankDetailsId.Value > 0) ? req.BankDetailsId : null;
        row.ModifiedDate    = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, id = row.Id, message = "Payment Updated Successfully" });
    }

    /// <summary>
    /// Returns BadRequest if the requested amount would push the purpose's outgoing payments
    /// past the available balance (Customer Payout − already-paid). Mirrors Rotary's check
    /// — exact wording preserved (typo and all) so users see the same error.
    /// When updating an existing payment, that row's existing amount is excluded from the
    /// running total so editing without changing the value never trips the guard.
    /// </summary>
    private async Task<IActionResult?> EnforceBalanceAsync(int titleId, decimal amount, int? excludePaymentId)
    {
        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;
        var customerShare = 1m - commissionPct;

        var collected = (decimal)(await _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => (d.IsDeleted == null || d.IsDeleted == 0) && d.FkTitleId == (uint)titleId)
            .SumAsync(d => (double?)d.SaleAmount) ?? 0);

        var paidOthers = await _db.InstamojoPaymentDetails.AsNoTracking()
            .Where(p =>
                (p.IsDeleted == null || p.IsDeleted == 0) &&
                p.FkTitleId == titleId.ToString() &&
                (excludePaymentId == null || p.Id != excludePaymentId.Value))
            .SumAsync(p => (decimal?)p.Amount) ?? 0m;

        var available = (customerShare * collected) - paidOthers;
        if (amount > available)
            return BadRequest(new { detail = "Entered Amount is Greter than Balance Amount!!" });
        return null;
    }

    // ── POST /api/instamojo-archive/payments/{id}/request-delete-otp ─────────
    /// <summary>
    /// First step of the OTP-protected delete (matches Rotary's flow). Generates a 6-digit
    /// OTP, stores it for 10 minutes keyed by current user + payment id, and emails it via
    /// Brevo to <c>InstamojoArchive:DeleteOtpRecipient</c> (single configured inbox —
    /// matches Rotary's <c>Instamojo_Delete_record_OTP</c> AppSetting behavior).
    ///
    /// When <c>InstamojoArchive:DevReturnOtpInResponse</c> = true the OTP is also returned
    /// in the response body — for local development/testing only, never enable in prod.
    /// </summary>
    [HttpPost("payments/{id:int}/request-delete-otp")]
    public async Task<IActionResult> RequestDeleteOtp(int id)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var row = await _db.InstamojoPaymentDetails.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id && (p.IsDeleted == null || p.IsDeleted == 0));
        if (row == null) return NotFound(new { detail = "Payment record not found." });

        var contextKey = OtpContextKey(id);
        var otp = _otp.Generate(contextKey);
        _logger.LogInformation("Instamojo delete OTP issued for payment {PaymentId} by user {UserId}",
            id, CurrentUserId);

        // Send the OTP email to the configured single recipient (mirrors Rotary's
        // AppSettings["Instamojo_Delete_record_OTP"]). Falls back to a no-op + warn
        // if the recipient is missing — useful in dev/local where SMTP is off.
        var recipient = _config["InstamojoArchive:DeleteOtpRecipient"] ?? "";
        bool emailed = false;
        if (!string.IsNullOrWhiteSpace(recipient))
        {
            var subject = "Kaizen Events — OTP for Instamojo Delete Record";
            var html = BuildDeleteOtpEmailHtml(otp, id);
            try
            {
                emailed = await _email.SendEmailAsync(recipient, recipient, subject, html);
                if (!emailed)
                    _logger.LogWarning("Brevo returned false for delete-OTP email to {Recipient}", recipient);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send delete-OTP email to {Recipient}", recipient);
            }
        }
        else
        {
            _logger.LogWarning("InstamojoArchive:DeleteOtpRecipient not configured — OTP not emailed.");
        }

        // dev_otp can only ever leak in non-Production environments — even if someone
        // accidentally flips the flag on a prod appsettings.Production.json, this guard
        // makes the response field a no-op.
        var devReturn = !_env.IsProduction()
            && _config.GetValue<bool>("InstamojoArchive:DevReturnOtpInResponse");

        await _audit.LogAsync(
            eventType: "INSTAMOJO_ARCHIVE_DELETE_OTP_REQUESTED",
            userId: CurrentUserId,
            resourceType: "instamojo_payment_detail",
            resourceId: id.ToString(),
            actionDetails: new { emailed, recipient = MaskEmail(recipient) },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            success     = true,
            payment_id  = id,
            ttl_min     = 10,
            emailed,
            recipient_masked = MaskEmail(recipient),
            // Only populated when the dev flag is on AND the env is non-Production.
            dev_otp     = devReturn ? otp : null
        });
    }

    /// <summary>Renders the OTP email body. Plain inline HTML, Brevo-friendly.</summary>
    private static string BuildDeleteOtpEmailHtml(string otp, int paymentId) => $@"
<!doctype html>
<html><body style=""font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5"">
  <p>Hello,</p>
  <p>An OTP has been requested to <strong>delete</strong> an Instamojo payment record
     in the Kaizen Events archive (record ID: <strong>{paymentId}</strong>).</p>
  <p>One-time password:</p>
  <p style=""font-size:28px;font-weight:bold;letter-spacing:6px;
            padding:12px 16px;background:#f4f4f4;border-radius:6px;
            display:inline-block"">{otp}</p>
  <p>This OTP expires in <strong>10 minutes</strong>. If you did not request this
     deletion, you can ignore this email — no action will be taken without the code.</p>
  <p style=""color:#888;font-size:12px;margin-top:24px"">
    Kaizen Events &mdash; Instamojo For Accounts
  </p>
</body></html>";

    /// <summary>Render a recipient address as <c>a******z@d.com</c> for telemetry.</summary>
    private static string MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@')) return "";
        var parts = email.Split('@', 2);
        var local = parts[0];
        var domain = parts[1];
        if (local.Length <= 2) return $"{local[..1]}*@{domain}";
        return $"{local[..1]}{new string('*', Math.Min(6, local.Length - 2))}{local[^1]}@{domain}";
    }

    // ── POST /api/instamojo-archive/payments/{id}/confirm-delete ─────────────
    /// <summary>Verifies the OTP and soft-deletes the payment row.</summary>
    [HttpPost("payments/{id:int}/confirm-delete")]
    public async Task<IActionResult> ConfirmDeletePayment(int id, [FromBody] OtpConfirmRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        if (string.IsNullOrWhiteSpace(req.Otp))
            return BadRequest(new { detail = "OTP is required." });

        var contextKey = OtpContextKey(id);
        if (!_otp.VerifyAndConsume(contextKey, req.Otp))
        {
            await _audit.LogAsync(
                eventType: "INSTAMOJO_ARCHIVE_DELETE_OTP_FAILED",
                userId: CurrentUserId,
                resourceType: "instamojo_payment_detail",
                resourceId: id.ToString(),
                status: "failed",
                errorMessage: "Invalid or exhausted OTP",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());
            return BadRequest(new { detail = "Invalid OTP." });
        }

        var row = await _db.InstamojoPaymentDetails
            .FirstOrDefaultAsync(p => p.Id == id && (p.IsDeleted == null || p.IsDeleted == 0));
        if (row == null) return NotFound(new { detail = "Payment record not found." });

        row.IsDeleted    = 1;
        row.ModifiedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            eventType: "INSTAMOJO_ARCHIVE_PAYMENT_DELETED",
            userId: CurrentUserId,
            resourceType: "instamojo_payment_detail",
            resourceId: id.ToString(),
            actionDetails: new { fk_title_id = row.FkTitleId, amount = row.Amount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, payment_id = id });
    }

    private string OtpContextKey(int paymentId) =>
        $"instamojo-archive:delete:{CurrentUserId ?? "anon"}:{paymentId}";

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  Reports (Phase 5) — exact column layouts ported from Rotary's        ║
    // ║  InstamojoReports.aspx. All exports use MiniExcel (real .xlsx).      ║
    // ╚══════════════════════════════════════════════════════════════════════╝

    private const string XlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <summary>MiniExcel writer config — auto-sizes columns to content so finance team
    /// doesn't have to hand-resize each column after opening the file.</summary>
    private static readonly MiniExcelLibs.OpenXml.OpenXmlConfiguration XlsxWriteConfig = new()
    {
        EnableAutoWidth   = true,
        FastMode          = true,
    };

    private static string SafeFilenamePart(string? s) =>
        string.IsNullOrWhiteSpace(s) ? "All"
            : new string(s.Where(c => !Path.GetInvalidFileNameChars().Contains(c) && c != ' ').ToArray());

    /// <summary>
    /// Resolve the purpose's title text for filenames. Returns null when no purpose
    /// was selected — caller decides the "ForAll" fallback.
    /// </summary>
    private async Task<string?> ResolveTitleAsync(int? titleId)
    {
        if (!titleId.HasValue || titleId.Value <= 0) return null;
        return await _db.InstamojoPaymentTitles.AsNoTracking()
            .Where(t => t.Id == titleId.Value).Select(t => t.Title).FirstOrDefaultAsync();
    }

    // ── GET /api/instamojo-archive/reports/instamojo-customer ────────────────
    /// <summary>
    /// Per-transaction customer report. Mirrors Rotary's "Instamojo Report Customer"
    /// Excel button on InstamojoReports.aspx (button 3.1). All columns and header
    /// names match Rotary verbatim — including the "Instamojo Comission" typo.
    /// </summary>
    [HttpGet("reports/instamojo-customer")]
    public async Task<IActionResult> ReportInstamojoCustomer([FromQuery] int? title_id)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;
        var customerShare = 1m - commissionPct;

        var q = _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0);
        if (title_id.HasValue) q = q.Where(d => d.FkTitleId == (uint)title_id.Value);

        var src = await q.OrderBy(d => d.TransactionDate)
            .Select(d => new
            {
                d.PaymentId, d.PayoutId, d.TransactionDate, d.Title,
                d.BuyerName, d.BuyerPhoneNumber, d.BuyerEmailAddress,
                d.SaleAmount, d.InstamojoFees, d.TotalTax
            })
            .ToListAsync();

        if (src.Count == 0) return BadRequest(new { detail = "Record Not Found!" });

        var rows = src.Select((d, i) => new Dictionary<string, object?>
        {
            ["Sr.No."]              = i + 1,
            ["Payment ID"]          = d.PaymentId,
            ["Payout ID"]           = d.PayoutId,
            ["Transaction Date"]    = d.TransactionDate,
            ["Title"]               = d.Title,
            ["Buyer Name"]          = d.BuyerName,
            ["Buyer_Phone_Number"]  = d.BuyerPhoneNumber,
            ["Buyer_Email_Address"] = d.BuyerEmailAddress,
            ["Sale Amount"]         = d.SaleAmount,
            ["Instamojo Comission"] = (decimal)(d.InstamojoFees ?? 0f) + (decimal)(d.TotalTax ?? 0f),
            ["Customer Payout"]     = decimal.Round(customerShare * (decimal)(d.SaleAmount ?? 0), 2),
        }).ToList();

        var ms = new MemoryStream();
        await ms.SaveAsAsync(rows, configuration: XlsxWriteConfig);
        ms.Position = 0;

        var fname = $"InstamojoReport_{DateTime.UtcNow:yyyyMMdd_HHmmss}.xlsx";
        return File(ms, XlsxMime, fname);
    }

    // ── GET /api/instamojo-archive/reports/customer-payment ──────────────────
    /// <summary>
    /// Two-sheet .xlsx: "Pending payment Report" + "Customer Payment Report".
    /// Mirrors Rotary's "Customer Payment Report" button (button 3.2).
    /// Sheet 1 = unsettled rows (payout_flag != 1); Sheet 2 = settled rows.
    /// </summary>
    [HttpGet("reports/customer-payment")]
    public async Task<IActionResult> ReportCustomerPayment([FromQuery] int? title_id)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;
        var customerShare = 1m - commissionPct;

        var q = _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => d.IsDeleted == null || d.IsDeleted == 0);
        if (title_id.HasValue) q = q.Where(d => d.FkTitleId == (uint)title_id.Value);

        var src = await q.OrderBy(d => d.TransactionDate)
            .Select(d => new
            {
                d.PaymentId, d.TransactionDate, d.Title, d.BuyerName,
                d.BuyerPhoneNumber, d.BuyerEmailAddress,
                d.SaleAmount, d.PayoutFlag, d.PayoutStatus
            })
            .ToListAsync();

        if (src.Count == 0) return BadRequest(new { detail = "Record Not Found!" });

        List<Dictionary<string, object?>> Map(IEnumerable<dynamic> rows) =>
            rows.Select((d, i) => new Dictionary<string, object?>
            {
                ["Sr.No."]              = i + 1,
                ["Payment ID"]          = d.PaymentId,
                ["Transaction Date"]    = d.TransactionDate,
                ["Title"]               = d.Title,
                ["Buyer Name"]          = d.BuyerName,
                ["Buyer_Phone_Number"]  = d.BuyerPhoneNumber,
                ["Buyer_Email_Address"] = d.BuyerEmailAddress,
                ["Sale Amount"]         = d.SaleAmount,
                ["Customer Payout"]     = decimal.Round(customerShare * (decimal)((int?)d.SaleAmount ?? 0), 2),
                ["Payout Status"]       = d.PayoutStatus
            }).ToList();

        var pending  = Map(src.Where(d => d.PayoutFlag != 1));
        var settled  = Map(src.Where(d => d.PayoutFlag == 1));

        var sheets = new Dictionary<string, object>
        {
            ["Pending payment Report"]  = pending,
            ["Customer Payment Report"] = settled
        };

        var ms = new MemoryStream();
        await ms.SaveAsAsync(sheets, configuration: XlsxWriteConfig);
        ms.Position = 0;

        var fname = $"Instamojo_paymentSummary_details{DateTime.UtcNow:yyyyMMdd_HHmmss}.xlsx";
        return File(ms, XlsxMime, fname);
    }

    // ── GET /api/instamojo-archive/reports/pending-payout ────────────────────
    /// <summary>
    /// Per-transaction Pending Customer Payout report. Mirrors Rotary's
    /// "Pending Customer Payout" button (button 3.3). Filters rows with non-zero
    /// pending payout (i.e. payout_flag != 1). Footer row holds totals.
    /// </summary>
    [HttpGet("reports/pending-payout")]
    public async Task<IActionResult> ReportPendingPayout([FromQuery] int? title_id)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var commissionPct = _config.GetValue<decimal?>("InstamojoArchive:CommissionPercent") ?? 0.0295m;
        var customerShare = 1m - commissionPct;

        var q = _db.InstamojoDataDetails.AsNoTracking()
            .Where(d => (d.IsDeleted == null || d.IsDeleted == 0) && d.PayoutFlag != 1);
        if (title_id.HasValue) q = q.Where(d => d.FkTitleId == (uint)title_id.Value);

        var src = await q.OrderBy(d => d.TransactionDate)
            .Select(d => new
            {
                d.TransactionDate, d.PaymentId,
                d.BuyerName, d.BuyerPhoneNumber, d.BuyerEmailAddress,
                d.SaleAmount
            })
            .ToListAsync();

        if (src.Count == 0) return BadRequest(new { detail = "Record Not Found!" });

        decimal totalSale = 0m, totalPending = 0m;
        var rows = new List<Dictionary<string, object?>>(src.Count + 1);
        for (var i = 0; i < src.Count; i++)
        {
            var d = src[i];
            var sale    = (decimal)(d.SaleAmount ?? 0);
            var pending = decimal.Round(customerShare * sale, 2);
            totalSale    += sale;
            totalPending += pending;
            rows.Add(new Dictionary<string, object?>
            {
                ["Sr.No."]                  = i + 1,
                ["Transaction Date"]        = d.TransactionDate,
                ["Payment ID"]              = d.PaymentId,
                ["Name"]                    = d.BuyerName,
                ["Mobile Number"]           = d.BuyerPhoneNumber,
                ["EmailId"]                 = d.BuyerEmailAddress,
                ["Sale Amount"]             = sale,
                ["Pending Customer Payout"] = pending
            });
        }
        // Totals row (Rotary appends a row with Total label + two sums).
        rows.Add(new Dictionary<string, object?>
        {
            ["Sr.No."]                  = "Total",
            ["Transaction Date"]        = null,
            ["Payment ID"]              = null,
            ["Name"]                    = null,
            ["Mobile Number"]           = null,
            ["EmailId"]                 = null,
            ["Sale Amount"]             = totalSale,
            ["Pending Customer Payout"] = totalPending
        });

        var ms = new MemoryStream();
        await ms.SaveAsAsync(rows, configuration: XlsxWriteConfig);
        ms.Position = 0;

        var titleText = await ResolveTitleAsync(title_id);
        var fname = titleText == null
            ? "PendingpayoutForAll.xlsx"
            : $"Pendingpayout_{SafeFilenamePart(titleText)}.xlsx";
        return File(ms, XlsxMime, fname);
    }

    // ── POST /api/instamojo-archive/reports/paid-to-customer ─────────────────
    /// <summary>
    /// Sensitive report — what Kaizen has actually paid out per Purpose
    /// (joined from instamojo_payment_details). Mirrors Rotary's button 3.4.
    /// Gated by InstamojoArchive:PaidToCustomerReportPassword.
    /// </summary>
    [HttpPost("reports/paid-to-customer")]
    public async Task<IActionResult> ReportPaidToCustomer(
        [FromQuery] int? title_id,
        [FromBody]  PasswordVerifyRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var expected = _config["InstamojoArchive:PaidToCustomerReportPassword"] ?? "";
        if (string.IsNullOrEmpty(expected) || !ConstantTimeEquals(req.Password, expected))
            return BadRequest(new { detail = "Wrong password!!" });

        await _audit.LogAsync(
            eventType: "INSTAMOJO_ARCHIVE_PAID_REPORT_EXPORTED",
            userId: CurrentUserId,
            resourceType: "instamojo_archive",
            actionDetails: new { title_id },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        var q = _db.InstamojoPaymentDetails.AsNoTracking()
            .Where(p => p.IsDeleted == null || p.IsDeleted == 0);
        if (title_id.HasValue) q = q.Where(p => p.FkTitleId == title_id.Value.ToString());

        var payments = await q.OrderBy(p => p.CreatedDate).ToListAsync();
        if (payments.Count == 0) return BadRequest(new { detail = "Record Not Found!" });

        var titleIds = payments
            .Select(p => int.TryParse(p.FkTitleId, out var x) ? x : 0)
            .Where(x => x > 0).Distinct().ToList();
        var bankIds = payments
            .Select(p => p.FkBankDetailsId ?? 0)
            .Where(x => x > 0).Distinct().ToList();

        var titles = titleIds.Count == 0
            ? new Dictionary<int, string?>()
            : await _db.InstamojoPaymentTitles.AsNoTracking()
                .Where(t => titleIds.Contains(t.Id))
                .ToDictionaryAsync(t => t.Id, t => t.Title);
        var banks = bankIds.Count == 0
            ? new Dictionary<int, (string? AccountName, string? BankName, string? AccountNumber)>()
            : await _db.InstamojoPurposeBankDetails.AsNoTracking()
                .Where(b => bankIds.Contains(b.Id))
                .ToDictionaryAsync(b => b.Id, b => (b.AccountName, b.BankName, b.AccountNumber));

        var rows = new List<Dictionary<string, object?>>(payments.Count);
        for (var i = 0; i < payments.Count; i++)
        {
            var p = payments[i];
            int.TryParse(p.FkTitleId, out var ti);
            titles.TryGetValue(ti, out var title);

            string? bankCell = null;
            if ((p.FkBankDetailsId ?? 0) > 0 && banks.TryGetValue(p.FkBankDetailsId!.Value, out var b))
            {
                var parts = new[] { b.AccountName, b.BankName, b.AccountNumber }
                    .Where(s => !string.IsNullOrWhiteSpace(s)).ToArray();
                if (parts.Length > 0) bankCell = string.Join(" | ", parts);
            }

            rows.Add(new Dictionary<string, object?>
            {
                ["Sr.No."]           = i + 1,
                ["Title"]            = title,
                ["Amount"]           = p.Amount,
                ["Transaction Date"] = p.CreatedDate,
                ["Bank Details"]     = bankCell,
                ["Remark"]           = p.Remark
            });
        }

        var ms = new MemoryStream();
        await ms.SaveAsAsync(
            new Dictionary<string, object> { ["Report"] = rows },
            configuration: XlsxWriteConfig);
        ms.Position = 0;

        var fname = $"Instamojo_Paid_to_customer_Report{DateTime.UtcNow:yyyyMMdd_HHmmss}.xlsx";
        return File(ms, XlsxMime, fname);
    }

    // ── POST /api/instamojo-archive/reports/paid-with-date ────────────────────
    /// <summary>
    /// "Paid to customer Report with transaction date" — port of Rotary's
    /// <c>ImageButton1_to_customer_Report_with_transaction_date_click</c> handler.
    /// Same password gate as the standard Paid report, same single "Report" sheet,
    /// but the row layout adds the Customer Transaction Date (most-recent customer
    /// payment for that purpose) so finance sees money-in date alongside money-out.
    /// </summary>
    [HttpPost("reports/paid-with-date")]
    public async Task<IActionResult> ReportPaidWithDate(
        [FromQuery] int? title_id,
        [FromBody]  PasswordVerifyRequest req)
    {
        var roleErr = await CheckArchiveAccessAsync();
        if (roleErr != null) return roleErr;

        var expected = _config["InstamojoArchive:PaidToCustomerReportPassword"] ?? "";
        if (string.IsNullOrEmpty(expected) || !ConstantTimeEquals(req.Password, expected))
            return BadRequest(new { detail = "Wrong password!!" });

        await _audit.LogAsync(
            eventType: "INSTAMOJO_ARCHIVE_PAID_WITH_DATE_REPORT_EXPORTED",
            userId: CurrentUserId,
            resourceType: "instamojo_archive",
            actionDetails: new { title_id },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        // Pull Kaizen's outgoing payouts (same filter as the standard Paid report —
        // INNER JOIN to paymenttitle so orphan payments are excluded).
        var pq = _db.InstamojoPaymentDetails.AsNoTracking()
            .Where(p => p.IsDeleted == null || p.IsDeleted == 0);
        if (title_id.HasValue) pq = pq.Where(p => p.FkTitleId == title_id.Value.ToString());

        var payments = await pq.OrderBy(p => p.CreatedDate).ToListAsync();
        if (payments.Count == 0) return BadRequest(new { detail = "Record Not Found!" });

        var titleIds = payments
            .Select(p => int.TryParse(p.FkTitleId, out var x) ? x : 0)
            .Where(x => x > 0).Distinct().ToList();
        var bankIds = payments
            .Select(p => p.FkBankDetailsId ?? 0)
            .Where(x => x > 0).Distinct().ToList();

        var titles = titleIds.Count == 0
            ? new Dictionary<int, string?>()
            : await _db.InstamojoPaymentTitles.AsNoTracking()
                .Where(t => titleIds.Contains(t.Id) && (t.IsDeleted == null || t.IsDeleted == 0))
                .ToDictionaryAsync(t => t.Id, t => t.Title);
        var banks = bankIds.Count == 0
            ? new Dictionary<int, (string? AccountName, string? BankName, string? AccountNumber)>()
            : await _db.InstamojoPurposeBankDetails.AsNoTracking()
                .Where(b => bankIds.Contains(b.Id))
                .ToDictionaryAsync(b => b.Id, b => (b.AccountName, b.BankName, b.AccountNumber));

        // Per-purpose latest customer transaction date (joined via fk_title_id).
        // Lets each Kaizen payout show "customer transaction happened on …" alongside its own date.
        var txDateByTitle = titleIds.Count == 0
            ? new Dictionary<uint, DateTime?>()
            : await _db.InstamojoDataDetails.AsNoTracking()
                .Where(d => titleIds.Select(x => (uint)x).Contains(d.FkTitleId)
                         && (d.IsDeleted == null || d.IsDeleted == 0))
                .GroupBy(d => d.FkTitleId)
                .Select(g => new { Tid = g.Key, LatestTx = g.Max(x => x.TransactionDate) })
                .ToDictionaryAsync(x => x.Tid, x => x.LatestTx);

        // Orphan-payment skip: any row whose title is missing or soft-deleted
        // would have been silently dropped by Rotary's stored proc, so filter
        // here too (same logic as BuildPaidSumSql).
        var rows = new List<Dictionary<string, object?>>();
        var srNo = 0;
        foreach (var p in payments)
        {
            if (!int.TryParse(p.FkTitleId, out var ti) || ti <= 0) continue;
            if (!titles.TryGetValue(ti, out var title) || title == null) continue;
            srNo++;

            string? bankCell = null;
            if ((p.FkBankDetailsId ?? 0) > 0 && banks.TryGetValue(p.FkBankDetailsId!.Value, out var b))
            {
                var parts = new[] { b.AccountName, b.BankName, b.AccountNumber }
                    .Where(s => !string.IsNullOrWhiteSpace(s)).ToArray();
                if (parts.Length > 0) bankCell = string.Join(" | ", parts);
            }

            txDateByTitle.TryGetValue((uint)ti, out var latestTx);

            rows.Add(new Dictionary<string, object?>
            {
                ["Sr.No."]                    = srNo,
                ["Title"]                     = title,
                ["Amount"]                    = p.Amount,
                ["Payout Date"]               = p.CreatedDate,
                ["Customer Transaction Date"] = latestTx,
                ["Bank Details"]              = bankCell,
                ["Remark"]                    = p.Remark
            });
        }

        if (rows.Count == 0) return BadRequest(new { detail = "Record Not Found!" });

        var ms = new MemoryStream();
        await ms.SaveAsAsync(
            new Dictionary<string, object> { ["Report"] = rows },
            configuration: XlsxWriteConfig);
        ms.Position = 0;

        var fname = $"Instamojo_Paid_to_customer_Report_with_transaction_date{DateTime.UtcNow:yyyyMMdd_HHmmss}.xlsx";
        return File(ms, XlsxMime, fname);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Archive access requires: authenticated AND (Super Admin OR Director) AND a valid
    /// session token (presented in the <c>X-Instamojo-Session</c> header) issued by a
    /// recent successful call to <see cref="VerifyPassword"/>. Pass <c>requireSession:false</c>
    /// only from <see cref="VerifyPassword"/> itself — that's the one endpoint that
    /// legitimately runs before the session token exists.
    /// Returns null if allowed, Forbidden() otherwise.
    /// </summary>
    private async Task<IActionResult?> CheckArchiveAccessAsync(bool requireSession = true)
    {
        if (!IsAdminRole) return Forbidden("Admin role required.");

        // Org admins must have can_approve_transfers (Director flag).
        if (!IsSuperAdmin)
        {
            if (string.IsNullOrEmpty(CurrentUserId)) return Forbidden();
            var user = await _users.GetByIdAsync(CurrentUserId);
            if (user?.CanApproveTransfers != true)
                return Forbidden("Director permission required for Instamojo For Accounts.");
        }

        if (requireSession && !HasValidArchiveSession())
            return Forbidden("Instamojo For Accounts session expired. Please re-enter the password.");
        return null;
    }
}

public record PasswordVerifyRequest(string Password);
public record ShowProfitRequest(string Password, DateTime? From, DateTime? To, int? TitleId);
public record ToggleActiveRequest(int IsActive);
public record UpdatePurposeRequest(string? Payee, string? BankDetails);
public record PurposeBankRequest(
    string? AccountName,
    string? BankName,
    string? AccountNumber,
    string? BankBranch,
    string? IfscCode);
public record OtpConfirmRequest(string? Otp);
public record PaymentUpsertRequest(
    int? TitleId,
    decimal? Amount,
    string? Remark,
    int? BankDetailsId);
public record RefreshPeriodRequest(string? Range);
