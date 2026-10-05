using System.Text.RegularExpressions;

namespace KaizenEvents.Shared.Helpers;

public static class SlugHelper
{
    public static string Generate(string name)
    {
        var slug = name.ToLowerInvariant();
        slug = Regex.Replace(slug, @"[^a-z0-9\s-]", "");
        slug = Regex.Replace(slug, @"[\s-]+", "-");
        return slug.Trim('-');
    }

    /// <summary>
    /// Generates a slug from name and appends a counter until it is unique.
    /// existsAsync(slug, excludeId) must return true if the slug is taken.
    /// </summary>
    public static async Task<string> GenerateUniqueAsync(
        string name,
        Func<string, string?, Task<bool>> existsAsync,
        string? excludeId = null)
    {
        var baseSlug = Generate(name);
        var slug     = baseSlug;
        var counter  = 1;

        while (await existsAsync(slug, excludeId))
        {
            slug = $"{baseSlug}-{counter}";
            counter++;
        }

        return slug;
    }

    private static readonly Regex SlugShape = new(@"^[a-z0-9]+(?:_[a-z0-9]+)+$", RegexOptions.Compiled);

    /// <summary>
    /// Turns a slug-shaped option value ("tanvi_sawant_goa_20_qty") into readable text
    /// ("Tanvi Sawant Goa 20 Qty"). Used by exports when a choice field's stored value no
    /// longer matches any current option (option edited/deleted after registration).
    /// Non-slug values pass through unchanged.
    /// </summary>
    public static string Humanize(string value)
    {
        if (string.IsNullOrEmpty(value) || !SlugShape.IsMatch(value)) return value;
        return string.Join(" ", value.Split('_')
            .Select(w => w.Length == 0 ? w : char.ToUpperInvariant(w[0]) + w[1..]));
    }
}
