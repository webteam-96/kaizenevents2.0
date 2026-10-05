using System.Text.Json.Nodes;
using KaizenEvents.Shared.Helpers;

namespace KaizenEvents.API.Helpers;

/// <summary>
/// Gives every file a registrant uploaded the registrant's own name on disk.
///
/// The upload endpoint can only do this when the name was already typed at the moment
/// the file was picked — which is not guaranteed, because nothing forces a registrant
/// to fill the form top to bottom. Anything uploaded early lands under a random
/// 32-hex name. This runs at submit time, when the whole form is finally known, and
/// renames those leftovers.
///
/// It walks the entire form_data tree rather than trusting form_config's field list,
/// so it works no matter how the upload value is shaped — an object, a bare URL
/// string, or an array of either — and keeps working if a field is later retyped or
/// dropped from the config.
/// </summary>
public static class RegistrantUploadNaming
{
    /// <summary>How stored upload URLs always begin. Anything else is not ours to touch.</summary>
    public const string UrlPrefix = "/api/uploads/images/";

    /// <summary>
    /// Renames every still-anonymous upload referenced by <paramref name="formDataJson"/>
    /// to carry <paramref name="registrantName"/>, and returns form_data with the new
    /// URLs substituted in.
    ///
    /// Returns the input unchanged when there is no usable name, no upload to rename,
    /// or anything at all goes wrong — a failed rename must never cost someone their
    /// registration, so every error path degrades to "keep the random name".
    /// </summary>
    public static string ApplyRegistrantName(
        string formDataJson,
        string uploadRoot,
        string? registrantName,
        ILogger? logger = null)
    {
        var prefix = UploadFileNaming.SanitizePrefix(registrantName);
        if (prefix == null) return formDataJson;              // nothing to name the file after

        try
        {
            if (JsonNode.Parse(formDataJson) is not JsonNode root) return formDataJson;

            var renamed = 0;
            Rewrite(root, url =>
            {
                var moved = TryRename(url, uploadRoot, prefix, logger);
                if (moved != null) renamed++;
                return moved;
            });

            return renamed > 0 ? root.ToJsonString() : formDataJson;
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Could not apply registrant name to uploads — files keep their random names");
            return formDataJson;
        }
    }

    /// <summary>
    /// Walks the JSON tree and hands every upload URL string to <paramref name="map"/>,
    /// replacing it in place when a non-null replacement comes back.
    /// </summary>
    private static void Rewrite(JsonNode node, Func<string, string?> map)
    {
        switch (node)
        {
            case JsonObject obj:
                // Snapshot the keys: assigning to obj[key] while enumerating would throw.
                foreach (var key in obj.Select(kv => kv.Key).ToList())
                {
                    var child = obj[key];
                    if (child is JsonValue && child.GetValueKind() == System.Text.Json.JsonValueKind.String)
                    {
                        var replacement = MapIfUploadUrl(child.GetValue<string>(), map);
                        if (replacement != null) obj[key] = replacement;
                    }
                    else if (child != null) Rewrite(child, map);
                }
                break;

            case JsonArray arr:
                for (var i = 0; i < arr.Count; i++)
                {
                    var child = arr[i];
                    if (child is JsonValue && child.GetValueKind() == System.Text.Json.JsonValueKind.String)
                    {
                        var replacement = MapIfUploadUrl(child.GetValue<string>(), map);
                        if (replacement != null) arr[i] = replacement;
                    }
                    else if (child != null) Rewrite(child, map);
                }
                break;
        }
    }

    private static string? MapIfUploadUrl(string value, Func<string, string?> map)
        => value.StartsWith(UrlPrefix, StringComparison.Ordinal) ? map(value) : null;

    /// <summary>
    /// Renames one file on disk. Returns the new URL, or null when the file should be
    /// left alone: it already carries a name, it is missing, or the path escapes the
    /// upload root (an untrusted URL must never be able to move a file outside it).
    /// </summary>
    private static string? TryRename(string url, string uploadRoot, string prefix, ILogger? logger)
    {
        try
        {
            var relative = url[UrlPrefix.Length..];
            if (relative.Length == 0 || relative.Contains("..", StringComparison.Ordinal)) return null;

            var fileName = Path.GetFileName(relative);
            if (!UploadFileNaming.IsAnonymous(fileName)) return null;   // already named, or not ours

            var rootFull = Path.GetFullPath(uploadRoot);
            var oldFull  = Path.GetFullPath(Path.Combine(uploadRoot,
                relative.Replace('/', Path.DirectorySeparatorChar)));
            if (!oldFull.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase)) return null;
            if (!File.Exists(oldFull)) return null;

            var newName = UploadFileNaming.BuildFileName(prefix, Path.GetExtension(fileName));
            var newFull = Path.Combine(Path.GetDirectoryName(oldFull)!, newName);
            if (File.Exists(newFull)) return null;                      // astronomically unlikely; don't clobber

            File.Move(oldFull, newFull);

            var newRelative = relative[..^fileName.Length] + newName;
            logger?.LogInformation("Renamed registrant upload {Old} → {New}", fileName, newName);
            return UrlPrefix + newRelative;
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Could not rename registrant upload {Url} — keeping its random name", url);
            return null;
        }
    }
}
