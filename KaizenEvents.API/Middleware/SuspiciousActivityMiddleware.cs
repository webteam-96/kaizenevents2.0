using System.Text.RegularExpressions;

namespace KaizenEvents.API.Middleware;

/// <summary>
/// Detects obviously suspicious requests (SQL injection, XSS, path traversal patterns)
/// and returns 400 before they reach controllers.
/// </summary>
public class SuspiciousActivityMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<SuspiciousActivityMiddleware> _logger;

    private static readonly Regex[] SuspiciousPatterns =
    {
        new(@"(\%27)|(\')|(\-\-)|(\%23)|(#)",            RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)",        RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"((\%3C)|<)[^\n]+((\%3E)|>)",                          RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"\.\./|\.\.\\",                                         RegexOptions.Compiled),
    };

    public SuspiciousActivityMiddleware(RequestDelegate next, ILogger<SuspiciousActivityMiddleware> logger)
    {
        _next   = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path  = context.Request.Path.Value ?? "";
        var query = context.Request.QueryString.Value ?? "";
        var check = path + query;

        foreach (var pattern in SuspiciousPatterns)
        {
            if (pattern.IsMatch(check))
            {
                _logger.LogWarning("Suspicious request blocked: {Method} {Path}{Query}",
                    context.Request.Method, path, query);
                context.Response.StatusCode  = 400;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"detail\":\"Bad request.\"}");
                return;
            }
        }

        await _next(context);
    }
}
