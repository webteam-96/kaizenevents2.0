using KaizenEvents.Core.Entities;
using KaizenEvents.Core.Interfaces.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

[ApiController]
public class UrlShortenerController : ApiControllerBase
{
    private readonly IUrlShortcutRepository _shortcuts;
    private readonly ICampaignRepository _campaigns;
    private readonly IConfiguration _config;

    public UrlShortenerController(
        IUrlShortcutRepository shortcuts,
        ICampaignRepository campaigns,
        IConfiguration config)
    {
        _shortcuts = shortcuts;
        _campaigns = campaigns;
        _config    = config;
    }

    // ── GET /s/{short_code} — public redirect ─────────────────────────────────
    [HttpGet("/s/{short_code}")]
    [AllowAnonymous]
    public new async Task<IActionResult> Redirect(string short_code)
    {
        var sc = await _shortcuts.GetByShortCodeAsync(short_code);
        if (sc == null) return NotFound(new { detail = "Short URL not found." });

        sc.Clicks++;
        sc.LastClicked = DateTime.UtcNow;
        await _shortcuts.UpdateAsync(sc);

        // 302, not 301: a permanent redirect is cached by the scanner's browser, which
        // both freezes the target (a corrected original_url would never reach devices
        // that already scanned) and stops repeat scans from counting as clicks.
        // base.Redirect — this action's own name hides ControllerBase.Redirect.
        return base.Redirect(sc.OriginalUrl);
    }

    // ── POST /api/short-urls ──────────────────────────────────────────────────
    [HttpPost("api/short-urls")]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateShortUrlRequest req)
    {
        // Return existing if already created for this campaign + url_type
        var existing = await _shortcuts.GetByCampaignIdAsync(req.CampaignId);
        var match    = existing.FirstOrDefault(s =>
            s.UrlType?.Equals(req.UrlType, StringComparison.OrdinalIgnoreCase) == true);

        if (match != null)
            return Ok(ToResponse(match, BuildBaseUrl()));

        var code = GenerateCode();
        var sc   = new UrlShortcut
        {
            Id          = Guid.NewGuid().ToString(),
            ShortCode   = code,
            OriginalUrl = req.OriginalUrl,
            CampaignId  = req.CampaignId,
            UrlType     = req.UrlType,
            Clicks      = 0,
            CreatedBy   = CurrentUserId ?? "",
            CreatedAt   = DateTime.UtcNow
        };
        await _shortcuts.CreateAsync(sc);
        return Ok(ToResponse(sc, BuildBaseUrl()));
    }

    // ── GET /api/short-urls/campaign/{campaign_id} ────────────────────────────
    [HttpGet("api/short-urls/campaign/{campaign_id}")]
    [Authorize]
    public async Task<IActionResult> GetByCampaign(string campaign_id)
    {
        var list = await _shortcuts.GetByCampaignIdAsync(campaign_id);
        var baseUrl = BuildBaseUrl();

        // Return as dict keyed by url_type per CLAUDE.md
        var dict = list
            .Where(s => s.UrlType != null)
            .ToDictionary(
            s => s.UrlType!,
            s =>
            {
                var shortUrl = $"{baseUrl}/s/{s.ShortCode}";
                return (object)new
                {
                    short_code   = s.ShortCode,
                    short_url    = shortUrl,
                    original_url = s.OriginalUrl,
                    clicks       = s.Clicks,
                    // Value the frontend encodes into the shareable QR code. Points at the
                    // tracked short URL so QR scans count as clicks, just like the link.
                    qr_token     = shortUrl
                };
            });

        return Ok(dict);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static object ToResponse(UrlShortcut s, string baseUrl)
    {
        var shortUrl = $"{baseUrl}/s/{s.ShortCode}";
        return new
        {
            short_code   = s.ShortCode,
            short_url    = shortUrl,
            original_url = s.OriginalUrl,
            // Value the frontend encodes into the shareable QR code (the tracked short URL).
            qr_token     = shortUrl
        };
    }

    // The short link must resolve to THIS app. In production the app is an IIS
    // sub-application mounted at /api, so the redirect route /s/{code} is publicly
    // reachable at {mount}/s/{code}. PathBase carries that mount prefix; the
    // configured public base is preferred because it also pins the scheme when a
    // proxy terminates TLS in front of IIS.
    private string BuildBaseUrl()
    {
        var configured = _config["App:PublicBaseUrl"];
        return !string.IsNullOrWhiteSpace(configured)
            ? configured.TrimEnd('/')
            : $"{Request.Scheme}://{Request.Host}{Request.PathBase}";
    }

    private static string GenerateCode()
    {
        const string chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        var buf = new char[6];
        for (int i = 0; i < 6; i++)
            buf[i] = chars[System.Security.Cryptography.RandomNumberGenerator.GetInt32(chars.Length)];
        return new string(buf);
    }
}

public record CreateShortUrlRequest(string OriginalUrl, string CampaignId, string UrlType);
