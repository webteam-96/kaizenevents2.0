using KaizenEvents.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KaizenEvents.API.Controllers;

/// <summary>
/// Issues the challenge shown on public forms. Anonymous by necessity — the visitor
/// has no account. Answers are checked by whichever endpoint receives the form, not
/// here, so a token is worth nothing on its own.
/// </summary>
[ApiController]
[Route("api/captcha")]
public class CaptchaController : ApiControllerBase
{
    private readonly ICaptchaService _captcha;

    public CaptchaController(ICaptchaService captcha) => _captcha = captcha;

    // ── GET /api/captcha/image ────────────────────────────────────────────────
    /// <summary>
    /// Returns the image inline as a data URL rather than as a second image request.
    /// The image and its token have to be minted together — the token is a one-way
    /// signature, so nothing downstream could re-derive what to draw.
    /// </summary>
    [HttpGet("image")]
    [AllowAnonymous]
    public IActionResult Image()
    {
        var challenge = _captcha.Issue();

        // Never let a proxy or the browser hand the same challenge to the next visitor.
        Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        Response.Headers.Pragma       = "no-cache";

        return Ok(new
        {
            token    = challenge.Token,
            image    = challenge.ImageDataUrl,
            question = challenge.Question   // only set if the server has no font to draw with
        });
    }

    // ── GET /api/captcha/math ─────────────────────────────────────────────────
    /// <summary>Kept so an older cached bundle asking for /math still gets a challenge.</summary>
    [HttpGet("math")]
    [AllowAnonymous]
    public IActionResult Math() => Image();
}
