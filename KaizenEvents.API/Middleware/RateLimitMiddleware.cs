using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;

namespace KaizenEvents.API.Middleware;

/// <summary>
/// Per-endpoint rate limiting per IP+UserAgent hash.
/// Endpoint-specific limits (path prefix match, first match wins):
///   /api/auth/login     → 5 req / 60s, block 600s
///   /api/auth/register  → 3 req / 60s, block 900s
///   /api/auth/reset     → 3 req / 300s, block 1800s
///   /api/payments       → 20 req / 60s, block 300s
///   /api/registrations  → 30 req / 60s, block 300s
///   Default             → 100 req / 60s, block 300s
/// </summary>
public class RateLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RateLimitMiddleware> _logger;

    private static readonly EndpointRule[] Rules =
    {
        new("/api/auth/login",        5,  60,  600),
        new("/api/auth/register",     3,  60,  900),
        new("/api/auth/reset",        3,  300, 1800),
        new("/api/payments",          20, 60,  300),
        new("/api/registrations",     30, 60,  300),
    };
    private static readonly EndpointRule DefaultRule = new(null, 100, 60, 300);

    // key → (timestamps of requests, blocked_until)
    private static readonly ConcurrentDictionary<string, (Queue<DateTime> Timestamps, DateTime? BlockedUntil)> State = new();
    private static DateTime _lastCleanup = DateTime.UtcNow;
    private static readonly object _cleanupLock = new();

    public RateLimitMiddleware(RequestDelegate next, ILogger<RateLimitMiddleware> logger)
    {
        _next   = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";

        // Skip /health and skip entirely in Development
        if (path.Equals("/health", StringComparison.OrdinalIgnoreCase) ||
            context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            await _next(context);
            return;
        }

        var rule = Array.Find(Rules, r => path.StartsWith(r.PathPrefix!, StringComparison.OrdinalIgnoreCase))
                   ?? DefaultRule;

        var key  = GetKey(context);
        var now  = DateTime.UtcNow;

        CleanupIfNeeded(now);

        var entry = State.GetOrAdd(key, _ => (new Queue<DateTime>(), null));

        // Check if blocked
        if (entry.BlockedUntil.HasValue && now < entry.BlockedUntil.Value)
        {
            var retryAfter = (int)(entry.BlockedUntil.Value - now).TotalSeconds;
            context.Response.Headers["Retry-After"] = retryAfter.ToString();
            context.Response.StatusCode = 429;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                detail = $"Too many requests. Try again in {retryAfter} seconds."
            }));
            return;
        }

        bool rateLimitExceeded = false;
        lock (entry.Timestamps)
        {
            // Remove timestamps outside window
            var window = now.AddSeconds(-rule.WindowSeconds);
            while (entry.Timestamps.Count > 0 && entry.Timestamps.Peek() < window)
                entry.Timestamps.Dequeue();

            if (entry.Timestamps.Count >= rule.MaxRequests)
            {
                // Block
                var blockedUntil = now.AddSeconds(rule.BlockDurationSeconds);
                State[key] = (entry.Timestamps, blockedUntil);
                _logger.LogWarning("Rate limit exceeded for key {Key}, blocked until {Until}", key, blockedUntil);
                rateLimitExceeded = true;
            }
            else
            {
                entry.Timestamps.Enqueue(now);
            }
        }

        if (rateLimitExceeded)
        {
            context.Response.Headers["Retry-After"] = rule.BlockDurationSeconds.ToString();
            context.Response.StatusCode = 429;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                detail = $"Too many requests. Try again in {rule.BlockDurationSeconds} seconds."
            }));
            return;
        }

        await _next(context);
    }

    private static string GetKey(HttpContext context)
    {
        var ip        = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var userAgent = context.Request.Headers.UserAgent.ToString();
        using var sha = SHA256.Create();
        var raw  = $"{ip}:{userAgent}";
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash);
    }

    private static void CleanupIfNeeded(DateTime now)
    {
        if ((now - _lastCleanup).TotalMinutes < 5) return;
        lock (_cleanupLock)
        {
            if ((now - _lastCleanup).TotalMinutes < 5) return;
            _lastCleanup = now;
            foreach (var key in State.Keys)
            {
                var entry = State[key];
                var window = now.AddSeconds(-3600); // keep up to 1h of history
                lock (entry.Timestamps)
                {
                    while (entry.Timestamps.Count > 0 && entry.Timestamps.Peek() < window)
                        entry.Timestamps.Dequeue();
                    if (entry.Timestamps.Count == 0 &&
                        (!entry.BlockedUntil.HasValue || entry.BlockedUntil.Value < now))
                        State.TryRemove(key, out _);
                }
            }
        }
    }

    private record EndpointRule(string? PathPrefix, int MaxRequests, int WindowSeconds, int BlockDurationSeconds);
}
