using System.Text;
using System.Text.RegularExpressions;

namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// Single source of truth for how registrant-uploaded files are named on disk.
///
/// A stored file is always "&lt;something&gt;-&lt;8 hex&gt;.ext" when we know who uploaded it, and
/// "&lt;32 hex&gt;.ext" when we don't. The random suffix is never optional — it prevents
/// collisions between two registrants with the same name and stops anyone guessing
/// another person's upload URL.
///
/// Two places produce these names: the upload endpoint (which knows the registrant's
/// name only if it was already typed when the file was picked) and the submit-time
/// backfill (which always knows it, because the whole form has been filled in by then).
/// Both go through here so the two can never drift apart.
/// </summary>
public static class UploadFileNaming
{
    /// <summary>Longest name prefix we keep; the rest is dropped so paths stay sane.</summary>
    public const int MaxPrefixLength = 40;

    private static readonly Regex CollapseHyphens = new("-{2,}", RegexOptions.Compiled);
    private static readonly Regex AnonymousName   = new("^[0-9a-f]{32}$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// Registrant name → safe filename prefix: letters/digits kept, everything else
    /// collapsed to single hyphens, trimmed, capped at <see cref="MaxPrefixLength"/>.
    /// Returns null when nothing usable survives (blank, or punctuation only).
    /// </summary>
    public static string? SanitizePrefix(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;

        var sb = new StringBuilder(name.Length);
        foreach (var c in name)
            sb.Append(char.IsLetterOrDigit(c) ? c : '-');

        var sanitized = CollapseHyphens.Replace(sb.ToString(), "-").Trim('-');

        if (sanitized.Length == 0) return null;
        return sanitized.Length > MaxPrefixLength
            ? sanitized[..MaxPrefixLength].TrimEnd('-')
            : sanitized;
    }

    /// <summary>
    /// Builds the stored filename. Without a prefix this is the legacy anonymous form
    /// (a bare 32-hex GUID), which <see cref="IsAnonymous"/> later recognises as
    /// "nobody's name was attached to this yet".
    /// </summary>
    public static string BuildFileName(string? sanitizedPrefix, string extension)
        => string.IsNullOrEmpty(sanitizedPrefix)
            ? $"{Guid.NewGuid():N}{extension}"
            : $"{sanitizedPrefix}-{Guid.NewGuid().ToString("N")[..8]}{extension}";

    /// <summary>
    /// True when a stored filename carries no registrant name — i.e. it is exactly the
    /// 32-hex anonymous form. Anything else is left alone, so a file that already has a
    /// name is never renamed twice and a hand-placed file is never touched.
    /// </summary>
    public static bool IsAnonymous(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return false;
        var stem = Path.GetFileNameWithoutExtension(fileName);
        return AnonymousName.IsMatch(stem);
    }
}
