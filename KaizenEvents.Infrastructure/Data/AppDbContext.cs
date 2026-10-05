using System.Text.RegularExpressions;
using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace KaizenEvents.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // DbSets
    public DbSet<User> Users => Set<User>();
    public DbSet<UserCampaignAccess> UserCampaignAccess => Set<UserCampaignAccess>();
    public DbSet<Campaign> Campaigns => Set<Campaign>();
    public DbSet<Registration> Registrations => Set<Registration>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentAccount> PaymentAccounts => Set<PaymentAccount>();
    public DbSet<CampaignMember> CampaignMembers => Set<CampaignMember>();
    public DbSet<FundTransfer> FundTransfers => Set<FundTransfer>();
    public DbSet<BankAccount> BankAccounts => Set<BankAccount>();
    public DbSet<ChangeRequest> ChangeRequests => Set<ChangeRequest>();
    public DbSet<CouponCode> CouponCodes => Set<CouponCode>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();
    public DbSet<NotificationSetting> NotificationSettings => Set<NotificationSetting>();
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<WhatsAppTemplate> WhatsAppTemplates => Set<WhatsAppTemplate>();
    public DbSet<CampaignVendorSplit> CampaignVendorSplits => Set<CampaignVendorSplit>();
    public DbSet<RazorpayRouteAccount> RazorpayRouteAccounts => Set<RazorpayRouteAccount>();
    public DbSet<SheetsConfig> SheetsConfigs => Set<SheetsConfig>();
    public DbSet<DkimDomain> DkimDomains => Set<DkimDomain>();
    public DbSet<EmailSender> EmailSenders => Set<EmailSender>();
    public DbSet<KioskVolunteer> KioskVolunteers => Set<KioskVolunteer>();
    public DbSet<UrlShortcut> UrlShortcuts => Set<UrlShortcut>();
    public DbSet<PasswordReset> PasswordResets => Set<PasswordReset>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<OrphanPayment> OrphanPayments => Set<OrphanPayment>();
    public DbSet<ContactInquiry> ContactInquiries => Set<ContactInquiry>();
    public DbSet<IntegrationSetting> IntegrationSettings => Set<IntegrationSetting>();
    public DbSet<CashfreeKyc> CashfreeKycs => Set<CashfreeKyc>();

    // Per-gateway payment archive (finance team's reporting tables)
    public DbSet<InstamojoDataDetail>   InstamojoDataDetails   => Set<InstamojoDataDetail>();
    public DbSet<RazorpayDataDetail>    RazorpayDataDetails    => Set<RazorpayDataDetail>();
    public DbSet<CashfreeDataDetail>    CashfreeDataDetails    => Set<CashfreeDataDetail>();
    public DbSet<InstamojoPaymentTitle> InstamojoPaymentTitles => Set<InstamojoPaymentTitle>();
    public DbSet<RazorpayPaymentTitle>  RazorpayPaymentTitles  => Set<RazorpayPaymentTitle>();
    public DbSet<CashfreePaymentTitle>  CashfreePaymentTitles  => Set<CashfreePaymentTitle>();
    public DbSet<InstamojoPurposeBankDetails> InstamojoPurposeBankDetails => Set<InstamojoPurposeBankDetails>();
    public DbSet<InstamojoPaymentDetail>      InstamojoPaymentDetails     => Set<InstamojoPaymentDetail>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Global DateTime UTC handling ────────────────────────────────────
        // MySQL stores DateTime without timezone metadata, so EF Core hands us
        // back DateTimeKind.Unspecified — which System.Text.Json then serialises
        // WITHOUT a 'Z' suffix, causing JS clients to treat the value as local
        // time and mis-render audit logs / created_at fields by the UTC offset.
        // The converter below marks every DateTime read from the DB as Utc,
        // so JSON output looks like "2026-05-11T14:30:00Z" and the frontend
        // can convert it to any display timezone correctly.
        var utcConverter = new ValueConverter<DateTime, DateTime>(
            v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        var nullableUtcConverter = new ValueConverter<DateTime?, DateTime?>(
            v => !v.HasValue ? v : (v.Value.Kind == DateTimeKind.Utc ? v : v.Value.ToUniversalTime()),
            v => !v.HasValue ? v : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc));

        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType == typeof(DateTime))
                    property.SetValueConverter(utcConverter);
                else if (property.ClrType == typeof(DateTime?))
                    property.SetValueConverter(nullableUtcConverter);
            }
        }

        ConfigureUsers(modelBuilder);
        ConfigureUserCampaignAccess(modelBuilder);
        ConfigureCampaigns(modelBuilder);
        ConfigureRegistrations(modelBuilder);
        ConfigurePayments(modelBuilder);
        ConfigurePaymentAccounts(modelBuilder);
        ConfigureCampaignMembers(modelBuilder);
        ConfigureFundTransfers(modelBuilder);
        ConfigureBankAccounts(modelBuilder);
        ConfigureChangeRequests(modelBuilder);
        ConfigureCouponCodes(modelBuilder);
        ConfigureAuditLogs(modelBuilder);
        ConfigureNotificationLogs(modelBuilder);
        ConfigureNotificationSettings(modelBuilder);
        ConfigureEmailTemplates(modelBuilder);
        ConfigureWhatsAppTemplates(modelBuilder);
        ConfigureCampaignVendorSplits(modelBuilder);
        ConfigureRazorpayRouteAccounts(modelBuilder);
        ConfigureSheetsConfigs(modelBuilder);
        ConfigureDkimDomains(modelBuilder);
        ConfigureEmailSenders(modelBuilder);
        ConfigureKioskVolunteers(modelBuilder);
        ConfigureUrlShortcuts(modelBuilder);
        ConfigurePasswordResets(modelBuilder);
        ConfigureRefunds(modelBuilder);
        ConfigureIntegrationSettings(modelBuilder);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // users
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureUsers(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique().HasDatabaseName("idx_users_email");
            e.HasIndex(u => u.Role).HasDatabaseName("idx_users_role");
            e.HasIndex(u => u.IsActive).HasDatabaseName("idx_users_is_active");

            e.Property(u => u.Role)
                .HasConversion(ToSnake<UserRole>())
                .HasColumnType("ENUM('super_admin','org_admin','kiosk_volunteer')");
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // user_campaign_access
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureUserCampaignAccess(ModelBuilder b)
    {
        b.Entity<UserCampaignAccess>(e =>
        {
            e.HasKey(x => new { x.UserId, x.CampaignId });

            e.HasOne(x => x.User)
                .WithMany(u => u.CampaignAccess)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Campaign)
                .WithMany(c => c.UserAccess)
                .HasForeignKey(x => x.CampaignId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // campaigns
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureCampaigns(ModelBuilder b)
    {
        b.Entity<Campaign>(e =>
        {
            e.HasIndex(c => c.Slug).IsUnique().HasDatabaseName("idx_campaigns_slug");
            e.HasIndex(c => c.Status).HasDatabaseName("idx_campaigns_status");
            e.HasIndex(c => c.CreatedBy).HasDatabaseName("idx_campaigns_created_by");
            e.HasIndex(c => c.CampaignType).HasDatabaseName("idx_campaigns_type");

            e.Property(c => c.CampaignType)
                .HasConversion(ToSnake<CampaignType>())
                .HasColumnType("ENUM('open','closed_group')");

            e.Property(c => c.FundCollectionMode)
                .HasConversion(ToSnakeNullable<FundCollectionMode>())
                .HasColumnType("ENUM('kaizen_managed','organizer_direct')");

            e.Property(c => c.Status)
                .HasConversion(ToSnake<CampaignStatus>())
                .HasColumnType("ENUM('draft','active','paused','completed','closed','archived')");

            e.Property(c => c.PaymentGateway)
                .HasConversion(ToSnake<PaymentGateway>())
                .HasColumnType("ENUM('razorpay','instamojo','cashfree')");

            e.Property(c => c.TotalRevenue).HasPrecision(12, 2);
            e.Property(c => c.TotalTransferred).HasPrecision(12, 2);

            e.Property(c => c.RegistrationNextNumber).HasDefaultValue(1);
            e.Property(c => c.InvoiceNextNumber).HasDefaultValue(1);

            e.HasOne(c => c.Creator)
                .WithMany()
                .HasForeignKey(c => c.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(c => c.PaymentAccount)
                .WithMany(pa => pa.Campaigns)
                .HasForeignKey(c => c.PaymentAccountId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // registrations
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureRegistrations(ModelBuilder b)
    {
        b.Entity<Registration>(e =>
        {
            e.HasIndex(r => r.CampaignId).HasDatabaseName("idx_registrations_campaign");
            e.HasIndex(r => r.PaymentStatus).HasDatabaseName("idx_registrations_payment_status");
            e.HasIndex(r => r.InvoiceNumber).HasDatabaseName("idx_registrations_invoice");
            e.HasIndex(r => r.MemberId).HasDatabaseName("idx_registrations_member");
            // Uniqueness guards for the custom-ID sequences, scoped PER CAMPAIGN: prefixes
            // and counters are per-campaign, so two events sharing a prefix (e.g. "INV")
            // must be able to both produce INV1 without colliding. MySQL unique indexes
            // allow multiple NULLs, so existing rows with NULL registration_number are unaffected.
            e.HasIndex(r => new { r.CampaignId, r.InvoiceNumber }, "ux_registrations_campaign_invoice").IsUnique();
            e.HasIndex(r => new { r.CampaignId, r.RegistrationNumber }, "ux_registrations_campaign_reg_number").IsUnique();

            e.Property(r => r.PaymentStatus)
                .HasConversion(ToSnake<PaymentStatus>())
                .HasColumnType("ENUM('pending','completed','failed','refunded','partial_refund','no_show')");

            e.Property(r => r.RegistrationStatus)
                .HasConversion(ToSnake<RegistrationStatus>())
                .HasColumnType("ENUM('draft','submitted','confirmed','cancelled','no_show')");

            e.Property(r => r.TotalAmount).HasPrecision(12, 2);
            e.Property(r => r.AdditionalPaymentAmount).HasPrecision(12, 2);
            e.Property(r => r.RefundAmount).HasPrecision(12, 2);
            e.Property(r => r.CouponDiscount).HasPrecision(12, 2);

            // Drives the per-coupon usage stats (times used / average / total given).
            e.HasIndex(r => r.CouponCode).HasDatabaseName("idx_registrations_coupon");

            e.HasOne(r => r.Campaign)
                .WithMany()
                .HasForeignKey(r => r.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // payments
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigurePayments(ModelBuilder b)
    {
        b.Entity<Payment>(e =>
        {
            e.HasIndex(p => p.CampaignId).HasDatabaseName("idx_payments_campaign");
            e.HasIndex(p => p.RegistrationId).HasDatabaseName("idx_payments_registration");
            e.HasIndex(p => p.GatewayPaymentRequestId).HasDatabaseName("idx_payments_gateway_request");
            e.HasIndex(p => p.GatewayPaymentId).HasDatabaseName("idx_payments_gateway_payment");
            e.HasIndex(p => p.Status).HasDatabaseName("idx_payments_status");

            e.Property(p => p.Amount).HasPrecision(12, 2);
            e.Property(p => p.GatewayFee).HasPrecision(12, 4);
            e.Property(p => p.GatewayTax).HasPrecision(12, 4);
            e.Property(p => p.SettlementAmount).HasPrecision(12, 2);

            e.HasOne(p => p.Campaign)
                .WithMany()
                .HasForeignKey(p => p.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(p => p.Registration)
                .WithMany(r => r.Payments)
                .HasForeignKey(p => p.RegistrationId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(p => p.PaymentAccount)
                .WithMany()
                .HasForeignKey(p => p.PaymentAccountId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // payment_accounts
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigurePaymentAccounts(ModelBuilder b)
    {
        b.Entity<PaymentAccount>(e =>
        {
            e.HasIndex(pa => pa.Name).IsUnique();
            e.HasIndex(pa => pa.IsActive).HasDatabaseName("idx_payment_accounts_active");

            e.Property(pa => pa.GatewayType)
                .HasConversion(ToSnake<PaymentGatewayType>())
                .HasColumnType("ENUM('instamojo','razorpay','cashfree')");

            e.Property(pa => pa.TotalAmountCollected).HasPrecision(12, 2);

            e.HasOne(pa => pa.Creator)
                .WithMany()
                .HasForeignKey(pa => pa.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // campaign_members
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureCampaignMembers(ModelBuilder b)
    {
        b.Entity<CampaignMember>(e =>
        {
            e.HasIndex(m => m.CampaignId).HasDatabaseName("idx_members_campaign");
            e.HasIndex(m => m.Mobile).HasDatabaseName("idx_members_mobile");
            e.HasIndex(m => m.Status).HasDatabaseName("idx_members_status");
            e.HasIndex(m => new { m.CampaignId, m.Mobile })
                .IsUnique()
                .HasDatabaseName("uk_members_campaign_mobile");

            e.Property(m => m.Status)
                .HasConversion(ToSnake<MemberStatus>())
                .HasColumnType("ENUM('unregistered','registered')");

            e.HasOne(m => m.Campaign)
                .WithMany()
                .HasForeignKey(m => m.CampaignId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(m => m.Registration)
                .WithMany()
                .HasForeignKey(m => m.RegistrationId)
                .OnDelete(DeleteBehavior.SetNull);

            e.HasOne(m => m.Creator)
                .WithMany()
                .HasForeignKey(m => m.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // fund_transfers
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureFundTransfers(ModelBuilder b)
    {
        b.Entity<FundTransfer>(e =>
        {
            e.HasIndex(ft => ft.RequestNumber).IsUnique();
            e.HasIndex(ft => ft.CampaignId).HasDatabaseName("idx_transfers_campaign");
            e.HasIndex(ft => ft.Status).HasDatabaseName("idx_transfers_status");
            e.HasIndex(ft => ft.CreatedAt).HasDatabaseName("idx_transfers_created_at");

            e.Property(ft => ft.Status)
                .HasConversion(ToSnake<TransferStatus>())
                .HasColumnType("ENUM('pending_approval','approved','rejected','completed')");

            e.Property(ft => ft.Amount).HasPrecision(12, 2);

            e.HasOne(ft => ft.Campaign)
                .WithMany()
                .HasForeignKey(ft => ft.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(ft => ft.Creator)
                .WithMany()
                .HasForeignKey(ft => ft.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // bank_accounts
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureBankAccounts(ModelBuilder b)
    {
        b.Entity<BankAccount>(e =>
        {
            e.HasIndex(ba => ba.CampaignId).IsUnique();

            e.HasOne(ba => ba.Campaign)
                .WithMany()
                .HasForeignKey(ba => ba.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(ba => ba.Creator)
                .WithMany()
                .HasForeignKey(ba => ba.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // change_requests
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureChangeRequests(ModelBuilder b)
    {
        b.Entity<ChangeRequest>(e =>
        {
            e.HasIndex(cr => cr.RequestNumber).IsUnique();
            e.HasIndex(cr => cr.Status).HasDatabaseName("idx_change_requests_status");
            e.HasIndex(cr => cr.CampaignId).HasDatabaseName("idx_change_requests_campaign");

            e.Property(cr => cr.RequestType)
                .HasConversion(ToSnake<ChangeRequestType>())
                .HasColumnType("ENUM('fund_transfer','bank_account','payment_gateway','fund_collection_mode')");

            e.Property(cr => cr.Status)
                .HasConversion(ToSnake<ChangeRequestStatus>())
                .HasColumnType("ENUM('pending','approved','rejected')");

            e.HasOne(cr => cr.Campaign)
                .WithMany()
                .HasForeignKey(cr => cr.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(cr => cr.Creator)
                .WithMany()
                .HasForeignKey(cr => cr.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // coupon_codes
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureCouponCodes(ModelBuilder b)
    {
        b.Entity<CouponCode>(e =>
        {
            e.HasIndex(c => new { c.CampaignId, c.Code })
                .IsUnique()
                .HasDatabaseName("uk_coupon_campaign_code");

            e.Property(c => c.DiscountValue).HasPrecision(12, 2);
            e.Property(c => c.MaxDiscountAmount).HasPrecision(12, 2);
            e.Property(c => c.MinDiscountAmount).HasPrecision(12, 2);

            // The admin list is always "this campaign, mine (or all, for a super admin)".
            e.HasIndex(c => new { c.CampaignId, c.CreatedBy })
                .HasDatabaseName("idx_coupon_campaign_creator");

            e.HasOne(c => c.Campaign)
                .WithMany()
                .HasForeignKey(c => c.CampaignId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // audit_logs
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureAuditLogs(ModelBuilder b)
    {
        b.Entity<AuditLog>(e =>
        {
            e.HasIndex(a => new { a.EventType, a.Timestamp }).HasDatabaseName("idx_audit_event_type");
            e.HasIndex(a => new { a.UserId, a.Timestamp }).HasDatabaseName("idx_audit_user");
            e.HasIndex(a => new { a.ResourceType, a.ResourceId }).HasDatabaseName("idx_audit_resource");
            e.HasIndex(a => a.Timestamp).HasDatabaseName("idx_audit_timestamp");
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // notification_logs
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureNotificationLogs(ModelBuilder b)
    {
        b.Entity<NotificationLog>(e =>
        {
            e.HasIndex(n => n.CampaignId).HasDatabaseName("idx_notif_logs_campaign");

            e.HasOne(n => n.Campaign)
                .WithMany()
                .HasForeignKey(n => n.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // notification_settings
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureNotificationSettings(ModelBuilder b)
    {
        b.Entity<NotificationSetting>(e =>
        {
            e.HasIndex(ns => ns.CampaignId).IsUnique();

            e.HasOne(ns => ns.Campaign)
                .WithMany()
                .HasForeignKey(ns => ns.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // email_templates — 4 per campaign (one per trigger)
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureEmailTemplates(ModelBuilder b)
    {
        b.Entity<EmailTemplate>(e =>
        {
            // (campaign_id, trigger) is unique — auto-seed creates exactly 4 rows per campaign.
            e.HasIndex(t => new { t.CampaignId, t.Trigger })
                .IsUnique()
                .HasDatabaseName("idx_email_templates_campaign_trigger");

            e.HasOne(t => t.Campaign)
                .WithMany()
                .HasForeignKey(t => t.CampaignId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // whatsapp_templates — WhatsApp counterpart of email_templates (one per trigger)
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureWhatsAppTemplates(ModelBuilder b)
    {
        b.Entity<WhatsAppTemplate>(e =>
        {
            // (campaign_id, trigger) is unique — auto-seed creates one row per trigger per campaign.
            e.HasIndex(t => new { t.CampaignId, t.Trigger })
                .IsUnique()
                .HasDatabaseName("idx_whatsapp_templates_campaign_trigger");

            e.HasOne(t => t.Campaign)
                .WithMany()
                .HasForeignKey(t => t.CampaignId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // razorpay_route_accounts — vendor registry for Razorpay Route splits
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureRazorpayRouteAccounts(ModelBuilder b)
    {
        b.Entity<RazorpayRouteAccount>(e =>
        {
            e.HasIndex(r => r.AccountId).IsUnique()
                .HasDatabaseName("idx_razorpay_route_account_id");
            e.HasIndex(r => r.Role)
                .HasDatabaseName("idx_razorpay_route_role");
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // campaign_vendor_splits — many vendors per campaign with per-vendor percentages
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureCampaignVendorSplits(ModelBuilder b)
    {
        b.Entity<CampaignVendorSplit>(e =>
        {
            // (campaign_id, gateway, vendor_id) uniquely identifies one split row.
            // A vendor can't appear twice for the same campaign+gateway.
            e.HasIndex(s => new { s.CampaignId, s.Gateway, s.VendorId })
                .IsUnique()
                .HasDatabaseName("idx_campaign_vendor_splits_unique");

            e.HasIndex(s => s.CampaignId)
                .HasDatabaseName("idx_campaign_vendor_splits_campaign");

            e.HasOne(s => s.Campaign)
                .WithMany()
                .HasForeignKey(s => s.CampaignId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // sheets_configs
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureSheetsConfigs(ModelBuilder b)
    {
        b.Entity<SheetsConfig>(e =>
        {
            e.HasIndex(sc => sc.CampaignId).HasDatabaseName("idx_sheets_campaign");

            e.HasOne(sc => sc.Campaign)
                .WithMany()
                .HasForeignKey(sc => sc.CampaignId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // dkim_domains
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureDkimDomains(ModelBuilder b)
    {
        b.Entity<DkimDomain>(e =>
        {
            e.HasIndex(d => d.Domain).IsUnique();

            e.HasOne(d => d.Creator)
                .WithMany()
                .HasForeignKey(d => d.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // email_senders
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureEmailSenders(ModelBuilder b)
    {
        b.Entity<EmailSender>(e =>
        {
            e.HasIndex(es => es.Email).IsUnique();

            e.HasOne(es => es.Domain)
                .WithMany(d => d.EmailSenders)
                .HasForeignKey(es => es.DomainId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // kiosk_volunteers
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureKioskVolunteers(ModelBuilder b)
    {
        b.Entity<KioskVolunteer>(e =>
        {
            e.HasIndex(kv => kv.UserId).IsUnique();

            e.HasOne(kv => kv.User)
                .WithMany()
                .HasForeignKey(kv => kv.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // creator has a separate FK on the same table — disable cascade to avoid cycle
            e.HasOne(kv => kv.Creator)
                .WithMany()
                .HasForeignKey(kv => kv.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // url_shortcuts
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureUrlShortcuts(ModelBuilder b)
    {
        b.Entity<UrlShortcut>(e =>
        {
            e.HasIndex(u => u.ShortCode).IsUnique().HasDatabaseName("idx_short_code");

            e.HasOne(u => u.Campaign)
                .WithMany()
                .HasForeignKey(u => u.CampaignId)
                .OnDelete(DeleteBehavior.SetNull);

            e.HasOne(u => u.Creator)
                .WithMany()
                .HasForeignKey(u => u.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // password_resets
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigurePasswordResets(ModelBuilder b)
    {
        b.Entity<PasswordReset>(e =>
        {
            e.HasIndex(pr => new { pr.Email, pr.Used }).HasDatabaseName("idx_pw_reset_email");
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // refunds
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureRefunds(ModelBuilder b)
    {
        b.Entity<Refund>(e =>
        {
            e.HasIndex(r => r.RegistrationId).HasDatabaseName("idx_refunds_registration");

            e.Property(r => r.Amount).HasPrecision(12, 2);

            e.HasOne(r => r.Registration)
                .WithMany(reg => reg.Refunds)
                .HasForeignKey(r => r.RegistrationId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // integration_settings
    // ──────────────────────────────────────────────────────────────────────────
    private static void ConfigureIntegrationSettings(ModelBuilder b)
    {
        b.Entity<IntegrationSetting>(e =>
        {
            e.HasIndex(i => i.Type).IsUnique();
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Enum → snake_case string converters
    // ──────────────────────────────────────────────────────────────────────────
    private static ValueConverter<TEnum, string> ToSnake<TEnum>() where TEnum : struct, Enum
        => new(
            v => PascalToSnake(v.ToString()),
            v => (TEnum)Enum.Parse(typeof(TEnum), SnakeToPascal(v), true));

    private static ValueConverter<TEnum?, string?> ToSnakeNullable<TEnum>() where TEnum : struct, Enum
        => new(
            v => v.HasValue ? PascalToSnake(v.Value.ToString()) : null,
            v => v != null ? (TEnum?)Enum.Parse(typeof(TEnum), SnakeToPascal(v), true) : null);

    private static string PascalToSnake(string pascal)
        => Regex.Replace(pascal, "(?<=[a-z0-9])([A-Z])", "_$1").ToLowerInvariant();

    private static string SnakeToPascal(string snake)
        => string.Concat(snake.Split('_').Select(w =>
            w.Length == 0 ? w : char.ToUpperInvariant(w[0]) + w[1..]));
}
