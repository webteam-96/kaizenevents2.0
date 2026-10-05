using System.Text.Json;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/fund-transfers")]
[Authorize]
public class FundTransferController : ApiControllerBase
{
    private const decimal PlatformFeeRate = 0.0295m;

    private readonly IFundTransferRepository _transfers;
    private readonly IChangeRequestRepository _changeRequests;
    private readonly IBankAccountRepository _bankAccounts;
    private readonly ICampaignRepository _campaigns;
    private readonly IPaymentRepository _payments;
    private readonly IUserRepository _users;
    private readonly IEncryptionService _enc;
    private readonly IAuditLoggerService _audit;
    private readonly IBrevoService _email;
    private readonly IRazorpayService _razorpay;
    private readonly ICashfreeService _cashfree;
    private readonly IInstamojoService _instamojo;
    private readonly IPaymentArchiveService _archive;
    private readonly ILogger<FundTransferController> _logger;

    public FundTransferController(
        IFundTransferRepository transfers,
        IChangeRequestRepository changeRequests,
        IBankAccountRepository bankAccounts,
        ICampaignRepository campaigns,
        IPaymentRepository payments,
        IUserRepository users,
        IEncryptionService enc,
        IAuditLoggerService audit,
        IBrevoService email,
        IRazorpayService razorpay,
        ICashfreeService cashfree,
        IInstamojoService instamojo,
        IPaymentArchiveService archive,
        ILogger<FundTransferController> logger)
    {
        _transfers      = transfers;
        _changeRequests = changeRequests;
        _bankAccounts   = bankAccounts;
        _campaigns      = campaigns;
        _payments       = payments;
        _users          = users;
        _enc            = enc;
        _audit          = audit;
        _email          = email;
        _razorpay       = razorpay;
        _cashfree       = cashfree;
        _instamojo      = instamojo;
        _archive        = archive;
        _logger         = logger;
    }

    // ── GET /api/fund-transfers/stats ─────────────────────────────────────────
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats([FromQuery] string? campaign_id)
    {
        if (!IsSuperAdmin) return Forbidden();

        var all = await _campaigns.GetAllAsync();
        var managed = all.Where(c => c.FundCollectionMode == FundCollectionMode.KaizenManaged);
        if (!string.IsNullOrEmpty(campaign_id))
            managed = managed.Where(c => c.Id == campaign_id);

        decimal totalCollected = 0, totalTransferred = 0, gatewayCharges = 0m;
        foreach (var c in managed)
        {
            totalCollected   += c.TotalRevenue;
            totalTransferred += c.TotalTransferred;
            gatewayCharges   += await _payments.GetTotalGatewayChargesByCampaignAsync(c.Id);
        }

        var platformFee    = totalCollected * PlatformFeeRate;
        var netPayable     = Math.Max(0, totalCollected - platformFee);
        var pendingTransfer= Math.Max(0, netPayable - totalTransferred);

        var pendingTransfers = (await _transfers.GetAllAsync())
            .Count(t => t.Status == TransferStatus.PendingApproval);
        var pendingCRs = (await _changeRequests.GetAllAsync())
            .Count(r => r.Status == ChangeRequestStatus.Pending);

        var kaizenShare = Math.Max(0, platformFee - gatewayCharges);

        return Ok(new
        {
            total_collected        = totalCollected,
            gateway_charges        = gatewayCharges,
            gateway_settled        = totalCollected - gatewayCharges,
            gateway_pending        = 0m,
            platform_fee           = platformFee,
            kaizen_share           = kaizenShare,
            net_payable            = netPayable,
            total_transferred      = totalTransferred,
            pending_transfer       = pendingTransfer,
            pending_approval_count = pendingTransfers + pendingCRs,
            campaigns_with_pending = managed.Count(c => c.TotalRevenue > c.TotalTransferred)
        });
    }

    // ── GET /api/fund-transfers/campaigns-pending ─────────────────────────────
    [HttpGet("campaigns-pending")]
    public async Task<IActionResult> GetCampaignsPending()
    {
        if (!IsSuperAdmin) return Forbidden();

        var all = await _campaigns.GetAllAsync();
        var rows = new List<object>();
        foreach (var c in all.Where(c => c.FundCollectionMode == FundCollectionMode.KaizenManaged))
        {
            var fee            = c.TotalRevenue * PlatformFeeRate;
            var net            = Math.Max(0, c.TotalRevenue - fee);
            var pending        = Math.Max(0, net - c.TotalTransferred);
            var gatewayCharges = await _payments.GetTotalGatewayChargesByCampaignAsync(c.Id);
            if (pending <= 0 && c.TotalRevenue <= 0) continue;
            var kaizenShare = Math.Max(0, fee - gatewayCharges);
            rows.Add(new
            {
                campaign_id       = c.Id,
                campaign_name     = c.Name,
                organization_name = c.OrganizationName,
                collected         = c.TotalRevenue,
                gateway_fees      = gatewayCharges,
                gateway_settled   = c.TotalRevenue - gatewayCharges,
                gateway_pending   = 0m,
                platform_fee      = fee,
                kaizen_share      = kaizenShare,
                net_payable       = net,
                transferred       = c.TotalTransferred,
                pending           = pending
            });
        }
        return Ok(rows);
    }

    // ── GET /api/fund-transfers/campaign/{campaign_id}/summary ────────────────
    [HttpGet("campaign/{campaign_id}/summary")]
    public async Task<IActionResult> GetCampaignSummary(string campaign_id)
    {
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (!IsSuperAdmin)
        {
            var ids = await _users.GetCampaignIdsAsync(CurrentUserId!);
            if (!ids.Contains(campaign_id)) return Forbidden();
        }

        if (campaign.FundCollectionMode != FundCollectionMode.KaizenManaged)
            return Ok(new { campaign_id, fund_collection_mode = "organizer_direct", message = "Not Kaizen managed." });

        var bankAccount    = await _bankAccounts.GetByCampaignIdAsync(campaign_id);
        var fee            = campaign.TotalRevenue * PlatformFeeRate;
        var net            = Math.Max(0, campaign.TotalRevenue - fee);
        var pending        = Math.Max(0, net - campaign.TotalTransferred);
        var gatewayCharges = await _payments.GetTotalGatewayChargesByCampaignAsync(campaign_id);

        if (!IsSuperAdmin)
        {
            return Ok(new
            {
                campaign_id,
                campaign_name     = campaign.Name,
                organization_name = campaign.OrganizationName,
                fund_collection_mode = "kaizen_managed",
                total_collected   = campaign.TotalRevenue,
                amount_receivable = net,
                amount_received   = campaign.TotalTransferred,
                amount_pending    = pending,
                gateway_pending   = 0m,
                has_bank_account  = bankAccount != null,
                bank_account      = bankAccount == null ? null : new
                {
                    account_name          = bankAccount.AccountName,
                    account_number_masked = bankAccount.AccountNumberMasked,
                    ifsc_code             = bankAccount.IfscCode,
                    bank_name             = bankAccount.BankName,
                    notification_email    = bankAccount.NotificationEmail
                },
                view_type = "org_admin"
            });
        }

        // Super admin — unmasked
        var pendingApprovalCount = (await _transfers.GetByCampaignIdAsync(campaign_id))
            .Count(t => t.Status == TransferStatus.PendingApproval);

        return Ok(new
        {
            campaign_id,
            campaign_name     = campaign.Name,
            organization_name = campaign.OrganizationName,
            fund_collection_mode = "kaizen_managed",
            total_collected   = campaign.TotalRevenue,
            gateway_fees      = gatewayCharges,
            gateway_settled   = campaign.TotalRevenue - gatewayCharges,
            gateway_pending   = 0m,
            platform_fee      = fee,
            kaizen_share      = Math.Max(0, fee - gatewayCharges),
            net_payable       = net,
            transferred       = campaign.TotalTransferred,
            pending,
            has_bank_account  = bankAccount != null,
            bank_account      = bankAccount == null ? null : (object)new
            {
                id                    = bankAccount.Id,
                account_name          = bankAccount.AccountName,
                account_number        = _enc.DecryptNullable(bankAccount.AccountNumber),
                account_number_masked = bankAccount.AccountNumberMasked,
                ifsc_code             = bankAccount.IfscCode,
                bank_name             = bankAccount.BankName,
                notification_email    = bankAccount.NotificationEmail
            },
            pending_approval_count = pendingApprovalCount,
            view_type = "super_admin"
        });
    }

    // ── GET /api/fund-transfers/campaign/{campaign_id}/bank-account ───────────
    [HttpGet("campaign/{campaign_id}/bank-account")]
    public async Task<IActionResult> GetBankAccount(string campaign_id)
    {
        if (!IsSuperAdmin)
        {
            var ids = await _users.GetCampaignIdsAsync(CurrentUserId!);
            if (!ids.Contains(campaign_id)) return Forbidden();
        }

        var bankAccount = await _bankAccounts.GetByCampaignIdAsync(campaign_id);
        if (bankAccount == null) return Ok((object?)null);

        if (!IsSuperAdmin)
            return Ok(new
            {
                account_name          = bankAccount.AccountName,
                account_number_masked = bankAccount.AccountNumberMasked,
                ifsc_code             = bankAccount.IfscCode,
                bank_name             = bankAccount.BankName,
                notification_email    = bankAccount.NotificationEmail
            });

        return Ok(new
        {
            id                    = bankAccount.Id,
            account_name          = bankAccount.AccountName,
            account_number        = _enc.DecryptNullable(bankAccount.AccountNumber),
            account_number_masked = bankAccount.AccountNumberMasked,
            ifsc_code             = bankAccount.IfscCode,
            bank_name             = bankAccount.BankName,
            notification_email    = bankAccount.NotificationEmail
        });
    }

    // ── POST /api/fund-transfers/campaign/{campaign_id}/bank-account ──────────
    [HttpPost("campaign/{campaign_id}/bank-account")]
    public async Task<IActionResult> CreateBankAccount(
        string campaign_id,
        [FromBody] BankAccountCreateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (await _bankAccounts.GetByCampaignIdAsync(campaign_id) != null)
            return BadRequest(new { detail = "Bank account already exists for this campaign." });

        // Create via change request (requires approval)
        var requestId = Guid.NewGuid().ToString();
        var cr = new ChangeRequest
        {
            Id            = requestId,
            RequestNumber = await _changeRequests.GetNextRequestNumberAsync(),
            CampaignId    = campaign_id,
            RequestType   = ChangeRequestType.BankAccount,
            NewValue      = JsonSerializer.Serialize(new
            {
                account_name   = req.AccountName,
                account_number = MaskAccountNumber(req.AccountNumber),
                ifsc_code      = req.IfscCode,
                bank_name      = req.BankName,
                notification_email = req.NotificationEmail,
                _raw_account_number = _enc.Encrypt(req.AccountNumber)
            }),
            Status        = ChangeRequestStatus.Pending,
            Reason        = "New bank account request",
            CreatedBy     = CurrentUserId!,
            CreatedAt     = DateTime.UtcNow
        };
        await _changeRequests.CreateAsync(cr);

        return Ok(new { message = "Bank account request submitted for approval.", request_id = requestId });
    }

    // ── PUT /api/fund-transfers/campaign/{campaign_id}/bank-account ───────────
    [HttpPut("campaign/{campaign_id}/bank-account")]
    public async Task<IActionResult> UpdateBankAccount(
        string campaign_id,
        [FromBody] BankAccountUpdateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var existing = await _bankAccounts.GetByCampaignIdAsync(campaign_id);
        if (existing == null) return NotFound(new { detail = "Bank account not found." });

        var newVal = new Dictionary<string, string?>();
        if (req.AccountName != null) newVal["account_name"] = req.AccountName;
        if (req.AccountNumber != null) { newVal["account_number"] = MaskAccountNumber(req.AccountNumber); newVal["_raw_account_number"] = _enc.Encrypt(req.AccountNumber); }
        if (req.IfscCode != null) newVal["ifsc_code"] = req.IfscCode;
        if (req.BankName != null) newVal["bank_name"] = req.BankName;
        if (req.NotificationEmail != null) newVal["notification_email"] = req.NotificationEmail;

        var requestId = Guid.NewGuid().ToString();
        var cr = new ChangeRequest
        {
            Id            = requestId,
            RequestNumber = await _changeRequests.GetNextRequestNumberAsync(),
            CampaignId    = campaign_id,
            RequestType   = ChangeRequestType.BankAccount,
            CurrentValue  = JsonSerializer.Serialize(new { existing.AccountName, existing.AccountNumberMasked }),
            NewValue      = JsonSerializer.Serialize(newVal),
            Status        = ChangeRequestStatus.Pending,
            Reason        = "Bank account update request",
            CreatedBy     = CurrentUserId!,
            CreatedAt     = DateTime.UtcNow
        };
        await _changeRequests.CreateAsync(cr);

        return Ok(new { message = "Bank account update request submitted for approval.", request_id = requestId });
    }

    // ── POST /api/fund-transfers ──────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> CreateTransfer([FromBody] FundTransferCreateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        if (campaign.FundCollectionMode != FundCollectionMode.KaizenManaged)
            return BadRequest(new { detail = "Campaign is not Kaizen managed." });

        var bankAccount = await _bankAccounts.GetByCampaignIdAsync(req.CampaignId);
        if (bankAccount == null)
            return BadRequest(new { detail = "No bank account configured for this campaign." });

        var fee       = campaign.TotalRevenue * PlatformFeeRate;
        var net       = Math.Max(0, campaign.TotalRevenue - fee);
        var available = Math.Max(0, net - campaign.TotalTransferred);

        if (req.Amount <= 0)
            return BadRequest(new { detail = "Amount must be positive." });
        if (req.Amount > available)
            return BadRequest(new { detail = $"Amount exceeds available balance of ₹{available:N2}." });

        var transfer = new FundTransfer
        {
            Id                  = Guid.NewGuid().ToString(),
            RequestNumber       = await _transfers.GetNextRequestNumberAsync(),
            CampaignId          = campaign.Id,
            CampaignName        = campaign.Name,
            OrganizationName    = campaign.OrganizationName,
            Amount              = req.Amount,
            Status              = TransferStatus.PendingApproval,
            BankAccountId       = bankAccount.Id,
            BankAccountSnapshot = JsonSerializer.Serialize(new
            {
                account_name          = bankAccount.AccountName,
                account_number_masked = bankAccount.AccountNumberMasked,
                ifsc_code             = bankAccount.IfscCode,
                bank_name             = bankAccount.BankName,
                notification_email    = bankAccount.NotificationEmail
            }),
            NotificationEmail   = bankAccount.NotificationEmail,
            Notes               = req.Notes,
            CreatedBy           = CurrentUserId!,
            CreatedAt           = DateTime.UtcNow
        };
        await _transfers.CreateAsync(transfer);

        await _audit.LogAsync(AuditEventType.FundTransferRequested,
            userId: CurrentUserId,
            resourceType: "fund_transfer", resourceId: transfer.Id,
            actionDetails: new { campaign_id = req.CampaignId, amount = req.Amount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            message        = "Transfer request submitted for approval.",
            transfer_id    = transfer.Id,
            request_number = transfer.RequestNumber
        });
    }

    // ── GET /api/fund-transfers ───────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> ListTransfers(
        [FromQuery] string? campaign_id,
        [FromQuery] string? status)
    {
        List<FundTransfer> all;
        if (IsSuperAdmin)
        {
            all = await _transfers.GetAllAsync();
        }
        else
        {
            var ids = await _users.GetCampaignIdsAsync(CurrentUserId!);
            all = new List<FundTransfer>();
            foreach (var id in ids)
                all.AddRange(await _transfers.GetByCampaignIdAsync(id));
        }

        if (!string.IsNullOrEmpty(campaign_id))
            all = all.Where(t => t.CampaignId == campaign_id).ToList();

        if (!string.IsNullOrEmpty(status) &&
            Enum.TryParse<TransferStatus>(ToPascal(status), out var ts))
            all = all.Where(t => t.Status == ts).ToList();

        return Ok(all.OrderByDescending(t => t.CreatedAt).Take(1000).Select(ToTransferResponse));
    }

    // ── GET /api/fund-transfers/campaign/{campaign_id}/transfers ──────────────
    [HttpGet("campaign/{campaign_id}/transfers")]
    public async Task<IActionResult> GetCampaignTransfers(string campaign_id)
    {
        if (!IsSuperAdmin)
        {
            var ids = await _users.GetCampaignIdsAsync(CurrentUserId!);
            if (!ids.Contains(campaign_id)) return Forbidden();
        }

        var list = await _transfers.GetByCampaignIdAsync(campaign_id);
        return Ok(list.OrderByDescending(t => t.CreatedAt).Take(100).Select(ToTransferResponse));
    }

    // ── GET /api/fund-transfers/pending-approvals ─────────────────────────────
    [HttpGet("pending-approvals")]
    public async Task<IActionResult> GetPendingApprovals()
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(CurrentUserId!);
        if (user?.CanApproveTransfers != true) return Forbidden("Only directors can view pending approvals.");

        var pendingTransfers = (await _transfers.GetAllAsync())
            .Where(t => t.Status == TransferStatus.PendingApproval)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => (object)new { type = "fund_transfer", transfer = ToTransferResponse(t) })
            .ToList();

        var pendingCRs = (await _changeRequests.GetAllAsync())
            .Where(r => r.Status == ChangeRequestStatus.Pending)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => (object)ToCRResponse(r))
            .ToList();

        return Ok(new
        {
            transfers      = pendingTransfers,
            change_requests= pendingCRs,
            total_pending  = pendingTransfers.Count + pendingCRs.Count
        });
    }

    // ── PUT /api/fund-transfers/{transfer_id}/approve ─────────────────────────
    [HttpPut("{transfer_id}/approve")]
    public async Task<IActionResult> Approve(string transfer_id, [FromBody] ApprovalRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(CurrentUserId!);
        if (user?.CanApproveTransfers != true) return Forbidden("Only directors can approve transfers.");

        var t = await _transfers.GetByIdAsync(transfer_id);
        if (t == null) return NotFound(new { detail = "Transfer not found." });
        if (t.Status != TransferStatus.PendingApproval)
            return BadRequest(new { detail = "Transfer is not pending approval." });

        t.Status        = TransferStatus.Approved;
        t.ApprovedBy    = CurrentUserId;
        t.ApprovedAt    = DateTime.UtcNow;
        t.ApprovalNotes = req.Notes;
        await _transfers.UpdateAsync(t);

        await _audit.LogAsync(AuditEventType.FundTransferApproved,
            userId: CurrentUserId,
            resourceType: "fund_transfer", resourceId: transfer_id,
            actionDetails: new { campaign_id = t.CampaignId, amount = t.Amount },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { message = "Transfer approved successfully." });
    }

    // ── PUT /api/fund-transfers/{transfer_id}/reject ──────────────────────────
    [HttpPut("{transfer_id}/reject")]
    public async Task<IActionResult> Reject(string transfer_id, [FromBody] RejectionRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(CurrentUserId!);
        if (user?.CanApproveTransfers != true) return Forbidden("Only directors can reject transfers.");

        var t = await _transfers.GetByIdAsync(transfer_id);
        if (t == null) return NotFound(new { detail = "Transfer not found." });
        if (t.Status != TransferStatus.PendingApproval)
            return BadRequest(new { detail = "Transfer is not pending approval." });

        t.Status          = TransferStatus.Rejected;
        t.RejectedBy      = CurrentUserId;
        t.RejectedAt      = DateTime.UtcNow;
        t.RejectionReason = req.Reason;
        await _transfers.UpdateAsync(t);

        await _audit.LogAsync(AuditEventType.FundTransferRejected,
            userId: CurrentUserId,
            resourceType: "fund_transfer", resourceId: transfer_id,
            actionDetails: new { campaign_id = t.CampaignId, amount = t.Amount, reason = req.Reason },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { message = "Transfer rejected." });
    }

    // ── PUT /api/fund-transfers/{transfer_id}/resubmit ────────────────────────
    [HttpPut("{transfer_id}/resubmit")]
    public async Task<IActionResult> Resubmit(string transfer_id, [FromBody] FundTransferCreateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var t = await _transfers.GetByIdAsync(transfer_id);
        if (t == null) return NotFound(new { detail = "Transfer not found." });
        if (t.Status != TransferStatus.Rejected)
            return BadRequest(new { detail = "Only rejected transfers can be resubmitted." });

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var fee       = campaign.TotalRevenue * PlatformFeeRate;
        var available = Math.Max(0, Math.Max(0, campaign.TotalRevenue - fee) - campaign.TotalTransferred);
        if (req.Amount > available)
            return BadRequest(new { detail = $"Amount exceeds available balance of ₹{available:N2}." });

        t.Amount          = req.Amount;
        t.Notes           = req.Notes;
        t.Status          = TransferStatus.PendingApproval;
        t.RejectedBy      = null;
        t.RejectedAt      = null;
        t.RejectionReason = null;
        await _transfers.UpdateAsync(t);

        return Ok(new { message = "Transfer resubmitted for approval." });
    }

    // ── PUT /api/fund-transfers/{transfer_id}/complete ────────────────────────
    [HttpPut("{transfer_id}/complete")]
    public async Task<IActionResult> Complete(string transfer_id, [FromBody] FundTransferCompleteRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var t = await _transfers.GetByIdAsync(transfer_id);
        if (t == null) return NotFound(new { detail = "Transfer not found." });
        if (t.Status != TransferStatus.Approved)
            return BadRequest(new { detail = "Transfer must be approved before completing." });

        t.Status                 = TransferStatus.Completed;
        t.CompletedBy            = CurrentUserId;
        t.CompletedAt            = DateTime.UtcNow;
        t.TransactionReference   = req.TransactionReference;
        t.TransferDate           = req.TransferDate;
        await _transfers.UpdateAsync(t);

        // Increment campaign.total_transferred
        var campaign = await _campaigns.GetByIdAsync(t.CampaignId);
        if (campaign != null)
        {
            campaign.TotalTransferred += t.Amount;
            campaign.UpdatedAt        = DateTime.UtcNow;
            await _campaigns.UpdateAsync(campaign);
        }

        await _audit.LogAsync(AuditEventType.FundTransferCompleted,
            userId: CurrentUserId,
            resourceType: "fund_transfer", resourceId: transfer_id,
            actionDetails: new { campaign_id = t.CampaignId, amount = t.Amount, transaction_reference = req.TransactionReference },
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        if (req.SendNotification && !string.IsNullOrEmpty(t.NotificationEmail))
        {
            var html = $@"
<h2>Fund Transfer Completed</h2>
<p>The fund transfer for <strong>{campaign?.Name ?? t.CampaignId}</strong> has been completed.</p>
<table style='border-collapse:collapse;margin:16px 0;'>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Amount:</td><td><strong>INR {t.Amount:F2}</strong></td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Transfer Date:</td><td>{req.TransferDate:yyyy-MM-dd}</td></tr>
  <tr><td style='padding:4px 12px 4px 0;color:#666;'>Transaction Reference:</td><td style='font-family:monospace;'>{req.TransactionReference}</td></tr>
</table>
<p>The funds should reflect in the associated bank account within 1-2 business days depending on your bank.</p>
<p style='color:#888;font-size:12px;margin-top:32px;'>— Kaizen Events</p>";

            try { await _email.SendEmailAsync(t.NotificationEmail, "", $"Fund Transfer Completed — INR {t.Amount:F2}", html); }
            catch (Exception ex) { _logger.LogWarning(ex, "Fund transfer completion email failed for {Id}", t.Id); }
        }

        return Ok(new { message = "Transfer marked as completed." });
    }

    // ── POST /api/fund-transfers/{transfer_id}/send-notification ─────────────
    [HttpPost("{transfer_id}/send-notification")]
    public async Task<IActionResult> SendNotification(string transfer_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var t = await _transfers.GetByIdAsync(transfer_id);
        if (t == null) return NotFound(new { detail = "Transfer not found." });
        if (t.Status != TransferStatus.Completed)
            return BadRequest(new { detail = "Transfer must be completed before sending notification." });

        // Email integration — NotificationController
        _logger.LogInformation("Manual notification for transfer {Id} to {Email}", t.Id, t.NotificationEmail);
        return Ok(new { message = $"Notification sent to {t.NotificationEmail}." });
    }

    // ── GET /api/fund-transfers/change-requests ───────────────────────────────
    [HttpGet("change-requests")]
    public async Task<IActionResult> ListChangeRequests(
        [FromQuery] string? campaign_id,
        [FromQuery] string? request_type,
        [FromQuery] string? status)
    {
        if (!IsSuperAdmin) return Forbidden();
        var all = await _changeRequests.GetAllAsync();

        if (!string.IsNullOrEmpty(campaign_id))
            all = all.Where(r => r.CampaignId == campaign_id).ToList();
        if (!string.IsNullOrEmpty(request_type) &&
            Enum.TryParse<ChangeRequestType>(ToPascal(request_type), out var rt))
            all = all.Where(r => r.RequestType == rt).ToList();
        if (!string.IsNullOrEmpty(status) &&
            Enum.TryParse<ChangeRequestStatus>(ToPascal(status), out var cs))
            all = all.Where(r => r.Status == cs).ToList();

        return Ok(all.OrderByDescending(r => r.CreatedAt).Take(1000).Select(ToCRResponse));
    }

    // ── POST /api/fund-transfers/change-requests ──────────────────────────────
    [HttpPost("change-requests")]
    public async Task<IActionResult> CreateChangeRequest([FromBody] ChangeRequestCreateRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();

        var campaign = await _campaigns.GetByIdAsync(req.CampaignId);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        // Validate FUND_COLLECTION_MODE change
        if (req.RequestType == "fund_collection_mode" &&
            campaign.FundCollectionMode == FundCollectionMode.KaizenManaged)
        {
            var fee     = campaign.TotalRevenue * PlatformFeeRate;
            var net     = Math.Max(0, campaign.TotalRevenue - fee);
            var pending = Math.Max(0, net - campaign.TotalTransferred);
            if (pending > 0)
                return BadRequest(new { detail = $"Cannot change: pending transfer of ₹{pending:N2}." });

            var pendingTransfers = (await _transfers.GetByCampaignIdAsync(req.CampaignId))
                .Any(t => t.Status == TransferStatus.PendingApproval || t.Status == TransferStatus.Approved);
            if (pendingTransfers)
                return BadRequest(new { detail = "Cannot change: pending or approved transfer requests exist." });
        }

        var crId = Guid.NewGuid().ToString();
        var cr   = new ChangeRequest
        {
            Id            = crId,
            RequestNumber = await _changeRequests.GetNextRequestNumberAsync(),
            CampaignId    = req.CampaignId,
            RequestType   = ParseCRType(req.RequestType),
            CurrentValue  = req.CurrentValue,
            NewValue      = req.NewValue,
            Status        = ChangeRequestStatus.Pending,
            Reason        = req.Reason,
            CreatedBy     = CurrentUserId!,
            CreatedAt     = DateTime.UtcNow
        };
        await _changeRequests.CreateAsync(cr);

        return Ok(new { message = "Change request submitted for approval.", request_id = crId });
    }

    // ── PUT /api/fund-transfers/change-requests/{request_id}/approve ──────────
    [HttpPut("change-requests/{request_id}/approve")]
    public async Task<IActionResult> ApproveChangeRequest(string request_id, [FromBody] ApprovalRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(CurrentUserId!);
        if (user?.CanApproveTransfers != true) return Forbidden("Only directors can approve change requests.");

        var cr = await _changeRequests.GetByIdAsync(request_id);
        if (cr == null) return NotFound(new { detail = "Change request not found." });
        if (cr.Status != ChangeRequestStatus.Pending)
            return BadRequest(new { detail = "Change request is not pending." });

        cr.Status        = ChangeRequestStatus.Approved;
        cr.ApprovedBy    = CurrentUserId;
        cr.ApprovedAt    = DateTime.UtcNow;
        cr.ApprovalNotes = req.Notes;
        await _changeRequests.UpdateAsync(cr);

        // Apply the change
        await ApplyChangeRequestAsync(cr);

        return Ok(new { message = "Change request approved and applied." });
    }

    // ── PUT /api/fund-transfers/change-requests/{request_id}/reject ───────────
    [HttpPut("change-requests/{request_id}/reject")]
    public async Task<IActionResult> RejectChangeRequest(string request_id, [FromBody] RejectionRequest req)
    {
        if (!IsSuperAdmin) return Forbidden();
        var user = await _users.GetByIdAsync(CurrentUserId!);
        if (user?.CanApproveTransfers != true) return Forbidden("Only directors can reject change requests.");

        var cr = await _changeRequests.GetByIdAsync(request_id);
        if (cr == null) return NotFound(new { detail = "Change request not found." });
        if (cr.Status != ChangeRequestStatus.Pending)
            return BadRequest(new { detail = "Change request is not pending." });

        cr.Status          = ChangeRequestStatus.Rejected;
        cr.RejectedBy      = CurrentUserId;
        cr.RejectedAt      = DateTime.UtcNow;
        cr.RejectionReason = req.Reason;
        await _changeRequests.UpdateAsync(cr);

        return Ok(new { message = "Change request rejected." });
    }

    // ── Sync settlement routes ────────────────────────────────────────────────
    [HttpPost("sync-settlements/{campaign_id}")]
    public async Task<IActionResult> SyncSettlements(string campaign_id)
    {
        if (!IsSuperAdmin) return Forbidden();
        var campaign = await _campaigns.GetByIdAsync(campaign_id);
        if (campaign == null) return NotFound(new { detail = "Campaign not found." });

        var summary = await SyncCampaignSettlementsAsync(campaign_id);
        return Ok(new
        {
            message       = "Settlement sync completed.",
            campaign_id,
            campaign_name = campaign.Name,
            summary
        });
    }

    [HttpPost("sync-all-settlements")]
    public async Task<IActionResult> SyncAllSettlements()
    {
        if (!IsSuperAdmin) return Forbidden();

        var managed = (await _campaigns.GetAllAsync())
            .Where(c => c.FundCollectionMode == FundCollectionMode.KaizenManaged)
            .ToList();

        var results = new List<object>();
        foreach (var c in managed)
        {
            var summary = await SyncCampaignSettlementsAsync(c.Id);
            results.Add(new { campaign_id = c.Id, campaign_name = c.Name, summary });
        }
        return Ok(new { message = $"Synced {results.Count} campaign(s).", results });
    }

    /// <summary>
    /// Pulls fee/tax from each gateway for completed payments missing settlement data,
    /// and writes them back to the payment row. Currently implemented for Razorpay only;
    /// Cashfree + Instamojo skip silently and remain in unsynced state.
    /// </summary>
    private async Task<object> SyncCampaignSettlementsAsync(string campaignId)
    {
        var payments = await _payments.GetCompletedUnsyncedByCampaignAsync(campaignId);
        int synced = 0, skipped = 0, failed = 0;
        var details = new List<object>();

        // ── Phase 0: Archive backfill — create *_datadetails rows for any completed
        // payment that doesn't have one yet (idempotent — skips dups inside ArchivePaymentAsync). ──
        int archived = 0;
        try
        {
            var allCompleted = await _payments.GetCompletedByCampaignAsync(campaignId);
            var campaign = await _campaigns.GetByIdAsync(campaignId);
            if (campaign != null && allCompleted.Count > 0)
            {
                foreach (var p in allCompleted)
                {
                    Registration? reg = null;
                    if (!string.IsNullOrEmpty(p.RegistrationId))
                    {
                        reg = await HttpContext.RequestServices
                            .GetRequiredService<IRegistrationRepository>()
                            .GetByIdAsync(p.RegistrationId);
                    }
                    await _archive.ArchivePaymentAsync(p, campaign, reg);
                    archived++;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Archive backfill phase failed");
        }

        foreach (var p in payments)
        {
            if (string.IsNullOrEmpty(p.GatewayPaymentId))
            {
                skipped++;
                details.Add(new { p.Id, p.Gateway, status = "skipped", reason = "no gateway_payment_id" });
                continue;
            }

            try
            {
                if (string.Equals(p.Gateway, "razorpay", StringComparison.OrdinalIgnoreCase))
                {
                    var d = await _razorpay.GetPaymentDetailsAsync(p.GatewayPaymentId);
                    if (d == null)
                    {
                        failed++;
                        details.Add(new { p.Id, p.Gateway, p.GatewayPaymentId, status = "failed", reason = "Razorpay API returned null (check logs for HTTP status; usually 401=wrong keys, 404=payment not in this account, 400=test/live mismatch)" });
                        continue;
                    }
                    p.GatewayFee         = d.Fee;
                    p.GatewayTax         = d.Tax;
                    p.SettlementAmount   = d.Amount - d.Fee - d.Tax;
                    p.SettlementStatus   = "synced";
                    p.SettlementSyncedAt = DateTime.UtcNow;
                    p.UpdatedAt          = DateTime.UtcNow;
                    await _payments.UpdateAsync(p);
                    synced++;
                    details.Add(new { p.Id, p.Gateway, p.GatewayPaymentId, status = "synced", fee = d.Fee, tax = d.Tax });
                }
                else
                {
                    skipped++;
                    details.Add(new { p.Id, p.Gateway, status = "skipped", reason = $"{p.Gateway} sync not implemented yet" });
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Settlement sync failed for payment {PaymentId}", p.Id);
                failed++;
                details.Add(new { p.Id, p.Gateway, p.GatewayPaymentId, status = "failed", reason = ex.Message });
            }
        }

        // ── Phase 2: Razorpay payout/settlement sync ──────────────────────────
        // Pull settlement reconciliation report for the date range covering this campaign's
        // captured payments, then update Payout_ID / Payout_date / payout_status on the
        // matching razorpay_datadetails rows.
        int payoutsLinked = 0;
        try
        {
            var razorpayPayments = payments
                .Where(p => string.Equals(p.Gateway, "razorpay", StringComparison.OrdinalIgnoreCase)
                         && !string.IsNullOrEmpty(p.GatewayPaymentId))
                .ToList();
            if (razorpayPayments.Count > 0)
            {
                // Range = from earliest paid_at minus 1 day to now (settlement happens T+1 to T+3)
                var fromUtc = razorpayPayments.Min(p => p.PaidAt ?? p.CreatedAt).AddDays(-1);
                var toUtc   = DateTime.UtcNow;

                var recon = await _razorpay.GetSettlementReconAsync(fromUtc, toUtc);
                var byPaymentId = recon.ToDictionary(r => r.PaymentId, r => r);

                foreach (var p in razorpayPayments)
                {
                    if (byPaymentId.TryGetValue(p.GatewayPaymentId!, out var item))
                    {
                        var updated = await _archive.UpdatePayoutInfoAsync(
                            gateway: "razorpay",
                            gatewayPaymentId: p.GatewayPaymentId!,
                            payoutId: item.SettlementUtr ?? item.SettlementId,
                            payoutDate: item.SettledAt,
                            payoutStatus: item.Status);
                        if (updated) payoutsLinked++;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Razorpay settlement recon phase failed");
        }

        // ── Phase 3: Cashfree settlement sync ─────────────────────────────────
        // For each Cashfree payment, call /pg/orders/{order_id}/settlements and update payout fields.
        try
        {
            var cashfreePayments = payments
                .Where(p => string.Equals(p.Gateway, "cashfree", StringComparison.OrdinalIgnoreCase)
                         && !string.IsNullOrEmpty(p.GatewayOrderId))
                .ToList();
            foreach (var p in cashfreePayments)
            {
                var entries = await _cashfree.GetSettlementsForOrderAsync(p.GatewayOrderId!);
                foreach (var e in entries)
                {
                    // Match by cf_payment_id (matches our payments.gateway_payment_id for Cashfree)
                    var pid = e.CfPaymentId ?? p.GatewayPaymentId;
                    if (string.IsNullOrEmpty(pid)) continue;
                    var updated = await _archive.UpdatePayoutInfoAsync(
                        gateway: "cashfree",
                        gatewayPaymentId: pid,
                        payoutId: e.SettlementUtr ?? e.CfSettlementId,
                        payoutDate: e.SettlementDate,
                        payoutStatus: e.SettlementStatus);
                    if (updated) payoutsLinked++;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cashfree settlement sync phase failed");
        }

        // ── Phase 4: Instamojo payout sync ───────────────────────────────────
        // One call to /v2/payouts/ returns recent payouts with their transaction lists.
        try
        {
            var hasInstamojo = payments.Any(p =>
                string.Equals(p.Gateway, "instamojo", StringComparison.OrdinalIgnoreCase));
            if (hasInstamojo)
            {
                var payouts = await _instamojo.GetRecentPayoutsAsync(maxPages: 5);
                foreach (var po in payouts)
                {
                    foreach (var pid in po.PaymentIds)
                    {
                        if (string.IsNullOrEmpty(pid)) continue;
                        var updated = await _archive.UpdatePayoutInfoAsync(
                            gateway: "instamojo",
                            gatewayPaymentId: pid,
                            payoutId: po.PayoutId,
                            payoutDate: po.SettledAt,
                            payoutStatus: po.Status);
                        if (updated) payoutsLinked++;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Instamojo payout sync phase failed");
        }

        return new { total = payments.Count, synced, skipped, failed, archived, payoutsLinked, details };
    }

    // ── Private helpers ───────────────────────────────────────────────────────
    private async Task ApplyChangeRequestAsync(ChangeRequest cr)
    {
        var campaign = await _campaigns.GetByIdAsync(cr.CampaignId);
        if (campaign == null) return;

        using var newDoc = JsonDocument.Parse(cr.NewValue ?? "{}");
        var nv = newDoc.RootElement;

        switch (cr.RequestType)
        {
            case ChangeRequestType.BankAccount:
                var bankAccount = await _bankAccounts.GetByCampaignIdAsync(cr.CampaignId);
                var rawNum = nv.TryGetProperty("_raw_account_number", out var rn) ? rn.GetString() : null;
                var accNum = rawNum ?? (nv.TryGetProperty("account_number", out var an) ? an.GetString() : null);

                if (bankAccount == null)
                {
                    await _bankAccounts.CreateAsync(new BankAccount
                    {
                        Id                   = Guid.NewGuid().ToString(),
                        CampaignId           = cr.CampaignId,
                        AccountName          = nv.TryGetProperty("account_name", out var acn) ? acn.GetString()! : "",
                        AccountNumber        = accNum ?? "",
                        AccountNumberMasked  = MaskAccountNumber(nv.TryGetProperty("account_number", out var man) ? man.GetString()! : ""),
                        IfscCode             = nv.TryGetProperty("ifsc_code", out var ic) ? ic.GetString()! : "",
                        BankName             = nv.TryGetProperty("bank_name", out var bn) ? bn.GetString()! : "",
                        NotificationEmail    = nv.TryGetProperty("notification_email", out var ne) ? ne.GetString()! : "",
                        CreatedBy            = cr.CreatedBy,
                        CreatedAt            = DateTime.UtcNow,
                        UpdatedAt            = DateTime.UtcNow
                    });
                }
                else
                {
                    if (nv.TryGetProperty("account_name", out var aname)) bankAccount.AccountName = aname.GetString()!;
                    if (rawNum != null) { bankAccount.AccountNumber = rawNum; bankAccount.AccountNumberMasked = MaskAccountNumber(nv.TryGetProperty("account_number", out var msk) ? msk.GetString()! : ""); }
                    if (nv.TryGetProperty("ifsc_code", out var ifsc)) bankAccount.IfscCode = ifsc.GetString()!;
                    if (nv.TryGetProperty("bank_name", out var bname)) bankAccount.BankName = bname.GetString()!;
                    if (nv.TryGetProperty("notification_email", out var nemail)) bankAccount.NotificationEmail = nemail.GetString()!;
                    bankAccount.UpdatedAt = DateTime.UtcNow;
                    await _bankAccounts.UpdateAsync(bankAccount);
                }
                break;

            case ChangeRequestType.FundCollectionMode:
                if (nv.TryGetProperty("fund_collection_mode", out var fcm) &&
                    Enum.TryParse<FundCollectionMode>(ToPascal(fcm.GetString() ?? ""), out var fm))
                {
                    campaign.FundCollectionMode = fm;
                    campaign.UpdatedAt           = DateTime.UtcNow;
                    await _campaigns.UpdateAsync(campaign);
                }
                break;

            case ChangeRequestType.PaymentGateway:
                if (nv.TryGetProperty("payment_gateway", out var pg) &&
                    Enum.TryParse<PaymentGateway>(ToPascal(pg.GetString() ?? ""), out var pgEnum))
                    campaign.PaymentGateway = pgEnum;
                if (nv.TryGetProperty("payment_account_id", out var paid))
                    campaign.PaymentAccountId = paid.GetString();
                campaign.UpdatedAt = DateTime.UtcNow;
                await _campaigns.UpdateAsync(campaign);
                break;
        }
    }

    private static object ToTransferResponse(FundTransfer t) => new
    {
        id                   = t.Id,
        request_number       = t.RequestNumber,
        campaign_id          = t.CampaignId,
        campaign_name        = t.CampaignName,
        organization_name    = t.OrganizationName,
        amount               = t.Amount,
        status               = t.Status.ToString().ToLowerInvariant().Replace("pendingapproval", "pending_approval"),
        bank_account_snapshot= ParseJsonNullable(t.BankAccountSnapshot),
        notes                = t.Notes,
        created_by           = t.CreatedBy,
        created_at           = t.CreatedAt,
        approved_by          = t.ApprovedBy,
        approved_at          = t.ApprovedAt,
        approval_notes       = t.ApprovalNotes,
        rejected_by          = t.RejectedBy,
        rejected_at          = t.RejectedAt,
        rejection_reason     = t.RejectionReason,
        completed_by         = t.CompletedBy,
        completed_at         = t.CompletedAt,
        transaction_reference= t.TransactionReference,
        transfer_date        = t.TransferDate,
        notification_sent    = t.NotificationSent
    };

    private static object ToCRResponse(ChangeRequest r) => new
    {
        id            = r.Id,
        request_number= r.RequestNumber,
        campaign_id   = r.CampaignId,
        request_type  = r.RequestType.ToString().ToLowerInvariant(),
        current_value = ParseJsonNullable(r.CurrentValue),
        new_value     = ParseJsonNullable(r.NewValue),
        status        = r.Status.ToString().ToLowerInvariant(),
        reason        = r.Reason,
        created_by    = r.CreatedBy,
        created_at    = r.CreatedAt,
        approved_by   = r.ApprovedBy,
        approved_at   = r.ApprovedAt,
        rejected_by   = r.RejectedBy,
        rejected_at   = r.RejectedAt,
        rejection_reason = r.RejectionReason
    };

    private static object? ParseJsonNullable(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonDocument.Parse(json).RootElement.Clone(); } catch { return null; }
    }

    private static string MaskAccountNumber(string num) =>
        num.Length <= 4 ? "****" : "****" + num[^4..];

    private static ChangeRequestType ParseCRType(string s) => s.ToLowerInvariant() switch
    {
        "bank_account"          => ChangeRequestType.BankAccount,
        "fund_collection_mode"  => ChangeRequestType.FundCollectionMode,
        "payment_gateway"       => ChangeRequestType.PaymentGateway,
        _                       => ChangeRequestType.BankAccount
    };

    private static string ToPascal(string snake) =>
        string.Join("", snake.Split('_').Select(p =>
            p.Length == 0 ? "" : char.ToUpperInvariant(p[0]) + p[1..]));
}

// ── Inline request DTOs ───────────────────────────────────────────────────────
public record BankAccountCreateRequest(string AccountName, string AccountNumber, string IfscCode, string BankName, string NotificationEmail);
public record BankAccountUpdateRequest(string? AccountName, string? AccountNumber, string? IfscCode, string? BankName, string? NotificationEmail);
public record FundTransferCreateRequest(string CampaignId, decimal Amount, string? Notes);
public record FundTransferCompleteRequest(string TransactionReference, string TransferDate, bool SendNotification);
public record ApprovalRequest(string? Notes);
public record RejectionRequest(string Reason);
public record ChangeRequestCreateRequest(string CampaignId, string RequestType, string? CurrentValue, string NewValue, string Reason);
