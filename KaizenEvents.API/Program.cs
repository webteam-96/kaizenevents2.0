using System.Text;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Core.Interfaces.Services;
using KaizenEvents.Infrastructure.Data;
using KaizenEvents.Infrastructure.Repositories;
using KaizenEvents.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("MySQL")
    ?? throw new InvalidOperationException("Connection string 'MySQL' is missing.");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 21)),
        mySql => mySql.MigrationsAssembly("KaizenEvents.Infrastructure")));

// ── Repositories ──────────────────────────────────────────────────────────────
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<ICampaignRepository, CampaignRepository>();
builder.Services.AddScoped<IRegistrationRepository, RegistrationRepository>();
builder.Services.AddScoped<IPaymentRepository, PaymentRepository>();
builder.Services.AddScoped<IPaymentAccountRepository, PaymentAccountRepository>();
builder.Services.AddScoped<ICampaignMemberRepository, CampaignMemberRepository>();
builder.Services.AddScoped<IFundTransferRepository, FundTransferRepository>();
builder.Services.AddScoped<IBankAccountRepository, BankAccountRepository>();
builder.Services.AddScoped<IChangeRequestRepository, ChangeRequestRepository>();
builder.Services.AddScoped<ICouponCodeRepository, CouponCodeRepository>();
builder.Services.AddScoped<IAuditLogRepository, AuditLogRepository>();
builder.Services.AddScoped<INotificationLogRepository, NotificationLogRepository>();
builder.Services.AddScoped<INotificationSettingRepository, NotificationSettingRepository>();
builder.Services.AddScoped<IEmailTemplateRepository, EmailTemplateRepository>();
builder.Services.AddScoped<IWhatsAppTemplateRepository, WhatsAppTemplateRepository>();
builder.Services.AddScoped<ICampaignVendorSplitRepository, CampaignVendorSplitRepository>();
builder.Services.AddScoped<IRazorpayRouteAccountRepository, RazorpayRouteAccountRepository>();
builder.Services.AddScoped<ISheetsConfigRepository, SheetsConfigRepository>();
builder.Services.AddScoped<IDkimDomainRepository, DkimDomainRepository>();
builder.Services.AddScoped<IEmailSenderRepository, EmailSenderRepository>();
builder.Services.AddScoped<IKioskVolunteerRepository, KioskVolunteerRepository>();
builder.Services.AddScoped<IUrlShortcutRepository, UrlShortcutRepository>();
builder.Services.AddScoped<IPasswordResetRepository, PasswordResetRepository>();
builder.Services.AddScoped<IOrphanPaymentRepository, OrphanPaymentRepository>();
builder.Services.AddScoped<ICashfreeKycRepository, CashfreeKycRepository>();
builder.Services.AddScoped<IContactInquiryRepository, ContactInquiryRepository>();
builder.Services.AddScoped<IIntegrationSettingRepository, IntegrationSettingRepository>();
builder.Services.AddScoped<IRefundRepository, RefundRepository>();

// ── Core Services ─────────────────────────────────────────────────────────────
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IPasswordHasherService, PasswordHasherService>();
builder.Services.AddScoped<IEncryptionService, EncryptionService>();
builder.Services.AddSingleton<IRequestSignerService, RequestSignerService>();
builder.Services.AddSingleton<ITokenBlacklistService, TokenBlacklistService>();
builder.Services.AddSingleton<ILoginRateLimiterService, LoginRateLimiterService>();

// ── Payment / Integration Services ───────────────────────────────────────────
builder.Services.AddHttpClient();
builder.Services.AddScoped<IRazorpayService, RazorpayService>();
builder.Services.AddScoped<IInstamojoService, InstamojoService>();
builder.Services.AddScoped<ICashfreeService, CashfreeService>();
builder.Services.AddScoped<ICashfreeSplitResolver, CashfreeSplitResolver>();
builder.Services.AddScoped<IRazorpaySplitResolver, RazorpaySplitResolver>();
builder.Services.AddSingleton<IKaizenGatewayService, KaizenGatewayService>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IOtpService, OtpService>();
// Singleton: it resolves a font once and remembers which captcha tokens are spent.
builder.Services.AddSingleton<ICaptchaService, CaptchaService>();
builder.Services.AddScoped<IBrevoService, BrevoService>();
builder.Services.AddScoped<IEmailSenderResolver, EmailSenderResolver>();
builder.Services.AddScoped<IRegistrationEmailService, RegistrationEmailService>();
builder.Services.AddScoped<IEmailTemplateService, EmailTemplateService>();
builder.Services.AddScoped<IWhatsAppTemplateService, WhatsAppTemplateService>();
builder.Services.AddScoped<IRegistrationWhatsAppService, RegistrationWhatsAppService>();
builder.Services.AddScoped<IInvoiceService, InvoiceService>();
builder.Services.AddScoped<IGoogleSheetsService, GoogleSheetsService>();
builder.Services.AddScoped<IInteraktService, InteraktService>();
builder.Services.AddScoped<IAuditLoggerService, AuditLoggerService>();
builder.Services.AddScoped<IPaymentArchiveService, PaymentArchiveService>();

// ── Swagger / OpenAPI (gated by App:DisableDocs in production) ───────────────
var enableDocs = !builder.Configuration.GetValue<bool>("App:DisableDocs");
if (enableDocs)
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
        {
            Title       = "Kaizen Events API",
            Version     = "v1",
            Description = "Self-hosted event registration & management platform"
        });
        // Enable JWT auth in Swagger UI
        c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
        {
            Name        = "Authorization",
            Type        = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
            Scheme      = "Bearer",
            BearerFormat= "JWT",
            In          = Microsoft.OpenApi.Models.ParameterLocation.Header,
            Description = "Paste your JWT access token (without the 'Bearer ' prefix)."
        });
        c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
        {
            {
                new Microsoft.OpenApi.Models.OpenApiSecurityScheme
                {
                    Reference = new Microsoft.OpenApi.Models.OpenApiReference
                    {
                        Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                        Id   = "Bearer"
                    }
                },
                Array.Empty<string>()
            }
        });
    });
}

// ── Background Services ───────────────────────────────────────────────────────
builder.Services.AddHostedService<TokenBlacklistCleanupService>();
builder.Services.AddHostedService<AuditLogTtlService>();
builder.Services.AddHostedService<PendingPaymentReminderService>();
builder.Services.AddHostedService<BrevoHealthCheckService>();                    // loudly alarms if Brevo email is down
builder.Services.AddHostedService<ConfirmationEmailReconciliationService>();     // auto-retries missed confirmation emails
builder.Services.AddHostedService<CouponExpiryService>();                        // switches off coupons past their end date

// ── Authentication ────────────────────────────────────────────────────────────
var jwtSecret = builder.Configuration["Jwt:SecretKey"] ?? string.Empty;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // keep claim names as-is (don't remap "role" → ClaimTypes.Role)
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ClockSkew = TimeSpan.Zero
        };
    });

// ── CORS ─────────────────────────────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                  "https://events.yatrimitra.com",
                  "http://localhost:5173",
                  "http://localhost:3000",
                  "http://localhost:3001",
                  "https://kaizenevents.live"
              )
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials()
              .WithExposedHeaders("X-Request-Id")
              .SetPreflightMaxAge(TimeSpan.FromSeconds(600));
    });
});

// ── Controllers (snake_case JSON) ─────────────────────────────────────────────
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
    options.JsonSerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter(
            System.Text.Json.JsonNamingPolicy.SnakeCaseLower));
    options.JsonSerializerOptions.DefaultIgnoreCondition =
        System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});

var app = builder.Build();

// ── Run Migrations + Seed ─────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();

    var userRepo = scope.ServiceProvider.GetRequiredService<IUserRepository>();
    var hasher   = scope.ServiceProvider.GetRequiredService<IPasswordHasherService>();

    // Seed default super_admin if no users exist
    if (!await userRepo.ExistsAnyAsync())
    {
        var admin = new KaizenEvents.Core.Entities.User
        {
            Id = Guid.NewGuid().ToString(),
            Email = "admin@kaizenevents.com",
            Name = "Super Admin",
            Role = KaizenEvents.Core.Enums.UserRole.SuperAdmin,
            HashedPassword = hasher.Hash("Admin@KaizenEvents1"),
            CanApproveTransfers = true,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await userRepo.CreateAsync(admin);
    }

    // Seed demo user (pranav@kaizeninfotech.com) if not present
    if (await userRepo.GetByEmailAsync("pranav@kaizeninfotech.com") == null)
    {
        var demo = new KaizenEvents.Core.Entities.User
        {
            Id = Guid.NewGuid().ToString(),
            Email = "pranav@kaizeninfotech.com",
            Name = "Pranav (Demo)",
            Role = KaizenEvents.Core.Enums.UserRole.SuperAdmin,
            HashedPassword = hasher.Hash("Kaizentest1234"),
            CanApproveTransfers = true,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await userRepo.CreateAsync(demo);
    }

    // (Removed) One-time backfill of legacy commission/settlement splits — replaced
    // by the per-event splits feature. Super admins re-configure each Cashfree event
    // via the Payment Splits section in Edit Campaign.
}

// ── Swagger UI (only when not disabled in production) ────────────────────────
if (enableDocs)
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("v1/swagger.json", "Kaizen Events API v1");
        c.DocumentTitle = "Kaizen Events API Docs";
        c.RoutePrefix   = "swagger";
    });
}

// ── Middleware pipeline (order per CLAUDE.md Section 10) ─────────────────────
app.UseCors();
app.UseMiddleware<KaizenEvents.API.Middleware.GlobalExceptionMiddleware>();
// Rate limiter disabled per ops request — was blocking legitimate admin logins.
// app.UseMiddleware<KaizenEvents.API.Middleware.RateLimitMiddleware>();
app.UseMiddleware<KaizenEvents.API.Middleware.SuspiciousActivityMiddleware>();
app.UseMiddleware<KaizenEvents.API.Middleware.SecurityHeadersMiddleware>();
app.UseMiddleware<KaizenEvents.API.Middleware.RequestSigningMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health check (must stay at /health, not /api/health)
app.MapGet("/health", () => new { status = "healthy", service = "Kaizen Events API" });

app.Run();
