namespace KaizenEvents.Core.Interfaces.Services;

/// <summary>
/// A challenge to show the visitor plus the signed token that proves its answer.
/// Exactly one of <paramref name="ImageDataUrl"/> / <paramref name="Question"/> is set:
/// normally the image, but a text sum if the server has no font to draw with.
/// </summary>
/// <param name="Token">Opaque; must be posted back with the answer.</param>
/// <param name="ImageDataUrl">A ready-to-use <c>data:image/png;base64,…</c> string.</param>
/// <param name="Question">Fallback arithmetic question, e.g. "seven + 3".</param>
public record CaptchaChallenge(string Token, string? ImageDataUrl, string? Question);

/// <summary>
/// Self-hosted captcha for public forms. No third-party service, no keys, and nothing
/// about the visitor leaves the server.
/// </summary>
public interface ICaptchaService
{
    /// <summary>Creates a fresh challenge. The token must be sent back with the answer.</summary>
    CaptchaChallenge Issue();

    /// <summary>
    /// True when the answer matches the token and the token is unexpired and unused.
    /// Comparison ignores case. Every token is accepted at most once.
    /// </summary>
    bool Verify(string? token, string? answer);
}
