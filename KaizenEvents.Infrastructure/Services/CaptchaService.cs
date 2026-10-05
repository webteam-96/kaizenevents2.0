using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// Draws a distorted alphanumeric captcha, with no server-side session.
///
/// The answer is never stored anywhere. The token carries an HMAC of
/// "nonce|expiry|ANSWER", so verifying just recomputes the HMAC with whatever the
/// visitor typed. Type the wrong characters and it cannot match; forge a token and
/// you'd need the signing secret. Because nothing is held server-side, an app-pool
/// recycle doesn't invalidate a captcha someone is mid-way through solving, and a
/// second instance can validate a token the first one issued.
///
/// The only state kept is the set of nonces already redeemed, so one solved image
/// can't be replayed into a flood of submissions.
///
/// If the machine has no usable font, image rendering is impossible — rather than
/// break every public form, it degrades to a spelled-out arithmetic question.
/// </summary>
public class CaptchaService : ICaptchaService
{
    /// <summary>How long a visitor has to answer. Long enough to fill a contact form.</summary>
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(20);

    /// <summary>
    /// Deliberately missing I, L, O, S, Z, 0, 1, 2 and 5. Under this much distortion
    /// those pairs become coin flips, and a captcha a human fails is worse than none.
    /// 27 characters over 5 slots is still ~14 million combinations.
    /// </summary>
    private const string Alphabet = "ABCDEFGHJKMNPQRTUVWXY346789";
    private const int    Length   = 5;

    private const int Width  = 240;
    private const int Height = 72;

    private static readonly string[] NumberWords =
        { "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten" };

    /// <summary>Tried in order; the first family present on the machine wins.</summary>
    private static readonly string[] PreferredFonts =
    {
        "Verdana", "Tahoma", "Arial", "Segoe UI", "DejaVu Sans",
        "Liberation Sans", "Helvetica", "Nimbus Sans", "Times New Roman"
    };

    private readonly byte[] _secret;
    private readonly FontFamily? _fontFamily;
    private readonly ILogger<CaptchaService> _logger;

    /// <summary>nonce → when it stops being worth remembering (its own expiry).</summary>
    private readonly ConcurrentDictionary<string, DateTime> _redeemed = new();
    private DateTime _lastPrune = DateTime.UtcNow;

    public CaptchaService(IConfiguration config, ILogger<CaptchaService> logger)
    {
        _logger = logger;

        // Reuses an existing server secret rather than introducing a new config key.
        var secret = config["Security:RequestSigningKey"];
        if (string.IsNullOrWhiteSpace(secret)) secret = config["Jwt:SecretKey"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            // Last resort: a per-process key. Tokens then die with the process, which
            // only means the odd visitor is asked a fresh question after a restart.
            secret = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
            _logger.LogWarning("No Security:RequestSigningKey or Jwt:SecretKey configured — captcha " +
                               "tokens are signed with a per-process key and won't survive a restart.");
        }
        _secret = Encoding.UTF8.GetBytes(secret);

        _fontFamily = ResolveFont();
        if (_fontFamily == null)
            _logger.LogError("No system font found — the captcha is falling back to a text arithmetic " +
                             "question. Install any TrueType font on the server to get the image back.");
    }

    // ── Issue ────────────────────────────────────────────────────────────────

    public CaptchaChallenge Issue()
    {
        if (_fontFamily is { } family)
        {
            var text = RandomText();
            try
            {
                var dataUrl = Render(text, family);
                return new CaptchaChallenge(Token(text), dataUrl, null);
            }
            catch (Exception ex)
            {
                // Drawing failed unexpectedly — a broken font file, say. Still serve
                // something solvable rather than a dead form.
                _logger.LogError(ex, "Captcha image rendering failed — falling back to a text question");
            }
        }

        var (question, answer) = ComposeMath();
        return new CaptchaChallenge(Token(answer.ToString()), null, question);
    }

    // ── Verify ───────────────────────────────────────────────────────────────

    public bool Verify(string? token, string? answer)
    {
        Prune();

        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(answer)) return false;

        var parts = token.Split('.');
        if (parts.Length != 3) return false;

        var (nonce, expiryRaw, signature) = (parts[0], parts[1], parts[2]);
        if (!long.TryParse(expiryRaw, out var expiry)) return false;

        var expiresAt = DateTimeOffset.FromUnixTimeSeconds(expiry);
        if (expiresAt < DateTimeOffset.UtcNow) return false;                 // too slow

        var expected = Sign(nonce, expiry, Normalize(answer));
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(signature)))
            return false;                                                    // wrong answer, or forged

        // Correct — but only the first time. TryAdd fails if this token was already spent.
        return _redeemed.TryAdd(nonce, expiresAt.UtcDateTime);
    }

    // ── Drawing ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Paints the characters and then attacks them: each glyph gets its own size,
    /// colour, rotation and baseline, scratches are dragged across the whole plate,
    /// the image is pushed through a two-axis sine warp, softened, and speckled.
    /// The goal is to break the straight baselines and clean edges that off-the-shelf
    /// OCR depends on, while leaving the shapes obvious to a person.
    /// </summary>
    private string Render(string text, FontFamily family)
    {
        var rng = new Random(RandomNumberGenerator.GetInt32(int.MaxValue));

        using var image = new Image<Rgba32>(Width, Height);

        // Faintly tinted paper — never pure white, so a plain threshold filter can't
        // cleanly separate ink from background.
        var bg = new Rgba32((byte)rng.Next(238, 250), (byte)rng.Next(238, 250), (byte)rng.Next(240, 252));
        image.Mutate(ctx => ctx.BackgroundColor(bg));

        // Characters, each on its own rotated layer. Jitter is kept just under half a
        // slot — enough that the spacing looks irregular, not so much that neighbours
        // collide into an unreadable knot.
        var slot = (Width - 28) / (float)Length;
        for (var i = 0; i < text.Length; i++)
        {
            var size  = rng.Next(36, 46);
            var font  = family.CreateFont(size, FontStyle.Bold);
            var ink   = new Rgba32((byte)rng.Next(10, 75), (byte)rng.Next(10, 75), (byte)rng.Next(55, 140));

            using var glyph = new Image<Rgba32>(size * 2, size * 2);
            glyph.Mutate(c => c.DrawText(text[i].ToString(), font, ink, new PointF(size * 0.4f, size * 0.2f)));
            glyph.Mutate(c => c.Rotate(rng.Next(-24, 25)));

            var x = (int)(14 + i * slot + rng.Next(-3, 4) - size * 0.45f);
            var y = (int)((Height - glyph.Height) / 2f + rng.Next(-6, 7));
            image.Mutate(c => c.DrawImage(glyph, new Point(x, y), 1f));
        }

        // Scratches straight through the text, in ink-like colours so they can't be
        // filtered out by hue alone.
        for (var i = 0; i < rng.Next(3, 6); i++)
        {
            var points = new PointF[4];
            for (var p = 0; p < points.Length; p++)
                points[p] = new PointF(rng.Next(-10, Width + 10), rng.Next(0, Height));

            var scratch = new Rgba32((byte)rng.Next(20, 120), (byte)rng.Next(20, 120),
                                     (byte)rng.Next(40, 160), (byte)rng.Next(90, 170));
            image.Mutate(c => c.DrawLine(scratch, rng.Next(1, 3), points));
        }

        Warp(image, rng);
        image.Mutate(c => c.GaussianBlur(0.6f));
        Speckle(image, rng);

        using var ms = new MemoryStream();
        image.SaveAsPng(ms);
        return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
    }

    /// <summary>
    /// Two-axis sine displacement with bilinear sampling. Bends every stroke so no
    /// glyph sits on a predictable baseline, without tearing the image.
    /// </summary>
    private static void Warp(Image<Rgba32> image, Random rng)
    {
        var w = image.Width;
        var h = image.Height;

        var source = new Rgba32[w * h];
        image.CopyPixelDataTo(source);

        // Amplitudes stay small; past ~6px the characters stop being readable.
        float ampX = 2.5f + (float)rng.NextDouble() * 2.5f, ampY = 2.0f + (float)rng.NextDouble() * 2.0f;
        float freqX = 0.045f + (float)rng.NextDouble() * 0.035f, freqY = 0.05f + (float)rng.NextDouble() * 0.04f;
        float phaseX = (float)(rng.NextDouble() * Math.Tau), phaseY = (float)(rng.NextDouble() * Math.Tau);

        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < h; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < w; x++)
                {
                    var sx = x + ampX * MathF.Sin(y * freqX + phaseX);
                    var sy = y + ampY * MathF.Sin(x * freqY + phaseY);
                    row[x] = Sample(source, w, h, sx, sy);
                }
            }
        });
    }

    /// <summary>Bilinear read from the pre-warp copy, clamped at the edges.</summary>
    private static Rgba32 Sample(Rgba32[] src, int w, int h, float x, float y)
    {
        var x0 = (int)MathF.Floor(x);
        var y0 = (int)MathF.Floor(y);
        var fx = x - x0;
        var fy = y - y0;

        int Cx(int v) => v < 0 ? 0 : v >= w ? w - 1 : v;
        int Cy(int v) => v < 0 ? 0 : v >= h ? h - 1 : v;

        var p00 = src[Cy(y0) * w + Cx(x0)];
        var p10 = src[Cy(y0) * w + Cx(x0 + 1)];
        var p01 = src[Cy(y0 + 1) * w + Cx(x0)];
        var p11 = src[Cy(y0 + 1) * w + Cx(x0 + 1)];

        byte Mix(byte a, byte b, byte c, byte d) =>
            (byte)(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);

        return new Rgba32(
            Mix(p00.R, p10.R, p01.R, p11.R),
            Mix(p00.G, p10.G, p01.G, p11.G),
            Mix(p00.B, p10.B, p01.B, p11.B),
            255);
    }

    /// <summary>Fine grain sprinkled last, so the blur can't smooth it away.</summary>
    private static void Speckle(Image<Rgba32> image, Random rng)
    {
        var w = image.Width;
        var h = image.Height;
        var count = w * h / 22;

        image.ProcessPixelRows(accessor =>
        {
            for (var i = 0; i < count; i++)
            {
                var row = accessor.GetRowSpan(rng.Next(h));
                var x   = rng.Next(w);
                var v   = (byte)rng.Next(70, 210);
                row[x] = new Rgba32(v, v, (byte)Math.Min(255, v + 25));
            }
        });
    }

    private static FontFamily? ResolveFont()
    {
        foreach (var name in PreferredFonts)
            if (SystemFonts.TryGet(name, out var family)) return family;

        // Nothing from the list — take whatever this machine does have.
        return SystemFonts.Families.FirstOrDefault() is { } any && SystemFonts.Families.Any() ? any : null;
    }

    // ── Challenge content ────────────────────────────────────────────────────

    private static string RandomText()
    {
        var chars = new char[Length];
        for (var i = 0; i < Length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    /// <summary>
    /// Fallback only. One operand is spelled out so the text isn't uniformly
    /// machine-friendly. Results are always non-negative whole numbers.
    /// </summary>
    private static (string Question, int Answer) ComposeMath()
    {
        var a  = RandomNumberGenerator.GetInt32(2, 10);
        var b  = RandomNumberGenerator.GetInt32(1, a);
        var op = RandomNumberGenerator.GetInt32(0, 2);

        var (answer, symbol) = op == 0 ? (a + b, "+") : (a - b, "−");

        var spell = RandomNumberGenerator.GetInt32(0, 3);
        var left  = spell == 0 ? NumberWords[a] : a.ToString();
        var right = spell == 1 ? NumberWords[b] : b.ToString();

        return ($"{left} {symbol} {right}", answer);
    }

    // ── Token plumbing ───────────────────────────────────────────────────────

    private string Token(string answer)
    {
        var nonce  = RandomNumberGenerator.GetHexString(24, lowercase: true);
        var expiry = DateTimeOffset.UtcNow.Add(Lifetime).ToUnixTimeSeconds();
        return $"{nonce}.{expiry}.{Sign(nonce, expiry, Normalize(answer))}";
    }

    /// <summary>Whitespace and case are never the point — "  a3k9p " is "A3K9P".</summary>
    private static string Normalize(string answer) => answer.Trim().ToUpperInvariant();

    private string Sign(string nonce, long expiry, string answer)
    {
        var payload = Encoding.UTF8.GetBytes($"{nonce}|{expiry}|{answer}");
        return Convert.ToHexString(HMACSHA256.HashData(_secret, payload)).ToLowerInvariant();
    }

    /// <summary>Drops redeemed nonces once their tokens have expired anyway. Cheap and rare.</summary>
    private void Prune()
    {
        if (DateTime.UtcNow - _lastPrune < TimeSpan.FromMinutes(5)) return;
        _lastPrune = DateTime.UtcNow;

        var cutoff = DateTime.UtcNow;
        foreach (var (nonce, expiresAt) in _redeemed)
            if (expiresAt < cutoff) _redeemed.TryRemove(nonce, out _);
    }
}
