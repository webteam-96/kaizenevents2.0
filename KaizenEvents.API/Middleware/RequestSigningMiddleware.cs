using KaizenEvents.Core.Interfaces.Services;

namespace KaizenEvents.API.Middleware;

/// <summary>
/// Validates HMAC-SHA256 request signatures when present.
/// Headers: X-Request-Timestamp (Unix seconds), X-Request-Signature (hex).
/// If REQUEST_SIGNING_KEY is not configured, or headers are absent, the request passes through.
/// If headers are present but invalid, returns 401.
/// </summary>
public class RequestSigningMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IRequestSignerService _signer;
    private readonly ILogger<RequestSigningMiddleware> _logger;
    private readonly bool _signingConfigured;

    public RequestSigningMiddleware(
        RequestDelegate next,
        IRequestSignerService signer,
        IConfiguration config,
        ILogger<RequestSigningMiddleware> logger)
    {
        _next             = next;
        _signer           = signer;
        _logger           = logger;
        _signingConfigured = !string.IsNullOrEmpty(config["Security:RequestSigningKey"]);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Skip health check
        if (context.Request.Path.StartsWithSegments("/health"))
        {
            await _next(context);
            return;
        }

        var timestamp = context.Request.Headers["X-Request-Timestamp"].FirstOrDefault();
        var signature = context.Request.Headers["X-Request-Signature"].FirstOrDefault();

        // If signing is configured AND headers are present → validate
        if (_signingConfigured && (!string.IsNullOrEmpty(timestamp) || !string.IsNullOrEmpty(signature)))
        {
            if (string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(signature))
            {
                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"detail\":\"Missing request signing headers.\"}");
                return;
            }

            if (!long.TryParse(timestamp, out var ts))
            {
                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"detail\":\"Invalid X-Request-Timestamp.\"}");
                return;
            }

            // Buffer the body so we can read it for signature verification
            context.Request.EnableBuffering();
            string body;
            using (var reader = new StreamReader(context.Request.Body, leaveOpen: true))
            {
                body = await reader.ReadToEndAsync();
                context.Request.Body.Position = 0;
            }

            var method = context.Request.Method;
            var path   = context.Request.Path + context.Request.QueryString;

            if (!_signer.Verify(method, path, body, ts, signature))
            {
                _logger.LogWarning("Request signing validation failed for {Method} {Path} from {IP}",
                    method, path, context.Connection.RemoteIpAddress);

                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"detail\":\"Invalid or expired request signature.\"}");
                return;
            }
        }

        await _next(context);
    }
}
