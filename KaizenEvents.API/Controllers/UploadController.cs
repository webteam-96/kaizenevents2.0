using System.Text.Json;
using KaizenEvents.Core.Interfaces.Repositories;
using KaizenEvents.Shared.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace KaizenEvents.API.Controllers;

[ApiController]
[Route("api/uploads")]
public class UploadController : ApiControllerBase
{
    private static readonly HashSet<string> AllowedMimeTypes = new()
    {
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"
    };

    private const long MaxFileSizeBytes = 5 * 1024 * 1024; // 5MB

    // Magic bytes map: prefix → content-type
    private static readonly (byte[] Magic, string MimeType)[] MagicBytes =
    {
        (new byte[] { 0xFF, 0xD8, 0xFF }, "image/jpeg"),
        (new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, "image/png"),
        (new byte[] { 0x47, 0x49, 0x46, 0x38, 0x37, 0x61 }, "image/gif"),
        (new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61 }, "image/gif"),
    };

    private readonly IWebHostEnvironment _env;
    private readonly ICampaignRepository _campaigns;
    private readonly ILogger<UploadController> _logger;

    public UploadController(IWebHostEnvironment env, ICampaignRepository campaigns, ILogger<UploadController> logger)
    {
        _env       = env;
        _campaigns = campaigns;
        _logger    = logger;
    }

    private string UploadRoot => Path.Combine(_env.ContentRootPath, "uploads");

    // ── POST /api/uploads/image ───────────────────────────────────────────────
    [HttpPost("image")]
    [Authorize]
    public async Task<IActionResult> UploadImage(IFormFile file)
    {
        var (error, bytes, ext, contentType) = await ValidateImage(file);
        if (error != null) return BadRequest(new { detail = error });

        var (relativePath, url) = await SaveFileAsync(bytes!, ext!, contentType!);

        _logger.LogInformation("File uploaded by {UserId}: {Path}", CurrentUserId, relativePath);

        return Ok(new
        {
            success      = true,
            filename     = Path.GetFileName(relativePath),
            path         = relativePath,
            url          = $"/api/uploads/images/{relativePath}",
            size         = bytes!.Length,
            content_type = contentType
        });
    }

    // ── POST /api/uploads/email-attachment ────────────────────────────────────
    // Authorized upload for email-template custom attachments. Same image/doc
    // whitelist as the public endpoint (incl. PDF), 2MB cap. Files land under an
    // email-attachments subfolder so they're distinguishable from form uploads.
    [HttpPost("email-attachment")]
    [Authorize]
    public async Task<IActionResult> UploadEmailAttachment(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { detail = "No file provided." });

        const long maxBytes = 2 * 1024 * 1024; // 2MB per attachment (Brevo message limit)
        if (file.Length > maxBytes)
            return BadRequest(new { detail = "File too large. Max 2MB per email attachment." });

        var ct = file.ContentType?.ToLowerInvariant() ?? "";
        var allowedTypes = new HashSet<string>
        {
            "image/jpeg", "image/png", "image/gif", "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // xlsx
            "text/plain", "text/csv"
        };
        if (!allowedTypes.Contains(ct))
            return BadRequest(new { detail = $"File type '{ct}' not allowed. Supported: images, PDF, Word, Excel, CSV, TXT." });

        byte[] bytes;
        await using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            bytes = ms.ToArray();
        }

        if (ct.StartsWith("image/") && !VerifyMagicBytes(bytes, ct))
            return BadRequest(new { detail = "File content does not match declared image type." });

        var ext = ct switch
        {
            "image/jpeg"                                                              => ".jpg",
            "image/png"                                                               => ".png",
            "image/gif"                                                               => ".gif",
            "image/webp"                                                              => ".webp",
            "application/pdf"                                                         => ".pdf",
            "application/msword"                                                      => ".doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
            "application/vnd.ms-excel"                                                => ".xls",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"       => ".xlsx",
            "text/csv"                                                                => ".csv",
            "text/plain"                                                              => ".txt",
            _                                                                         => Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? ""
        };

        var (relativePath, url) = await SaveFileAsync(bytes, ext, ct, subfolder: "email-attachments");

        _logger.LogInformation("Email attachment uploaded by {UserId}: {Path}", CurrentUserId, relativePath);

        return Ok(new
        {
            success      = true,
            name         = file.FileName,
            path         = relativePath,
            url,
            size         = bytes.Length,
            content_type = ct
        });
    }

    // ── POST /api/uploads/public ──────────────────────────────────────────────
    // Anonymous upload endpoint for public registration form file fields.
    // Accepts images (JPG/PNG/GIF/WebP) AND common documents (PDF, DOC/DOCX, XLS/XLSX);
    // fields configured with accept_types audio/video/audio_video also accept media.
    // Stricter validation: no SVG (XSS risk), rate-limited via middleware.
    // campaign_id/field_id/registrant_name are OPTIONAL and untrusted — any parse or
    // lookup failure falls back to the legacy defaults (5MB, images+docs) instead of erroring.
    [HttpPost("public")]
    [AllowAnonymous]
    [RequestSizeLimit(30 * 1024 * 1024)] // 25MB media ceiling + multipart overhead
    public async Task<IActionResult> UploadPublic(
        IFormFile file,
        [FromForm(Name = "campaign_id")] string? campaignId = null,
        [FromForm(Name = "field_id")] string? fieldId = null,
        [FromForm(Name = "registrant_name")] string? registrantName = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { detail = "No file provided." });

        var (acceptTypes, maxSizeMb) = await ResolveUploadFieldConfigAsync(campaignId, fieldId);

        // Hard size ceiling: 25MB for audio/video fields, 5MB otherwise.
        // Effective limit = min(configured max_file_size_mb, ceiling); default 5MB.
        var isMediaField  = acceptTypes is "audio" or "video" or "audio_video";
        var ceilingMb     = isMediaField ? 25d : 5d;
        var effectiveMb   = maxSizeMb.HasValue ? Math.Min(maxSizeMb.Value, ceilingMb) : ceilingMb;
        var maxBytes      = (long)(effectiveMb * 1024 * 1024);
        if (file.Length > maxBytes)
            return BadRequest(new { detail = $"File too large. Max {effectiveMb:0.##}MB for this upload." });

        var ct = file.ContentType?.ToLowerInvariant() ?? "";

        // Whitelist of allowed public upload types (images + common docs)
        var allowedTypes = new HashSet<string>
        {
            "image/jpeg", "image/png", "image/gif", "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // xlsx
            "text/plain", "text/csv"
        };
        // .m4a (iPhone Voice Memos, most Android recorders) is reported as audio/x-m4a
        // by Chromium/Safari/Firefox — not audio/mp4 — so it must be whitelisted explicitly.
        if (acceptTypes is "audio" or "audio_video")
            allowedTypes.UnionWith(new[] { "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg" });
        if (acceptTypes is "video" or "audio_video")
            allowedTypes.UnionWith(new[] { "video/mp4", "video/webm", "video/quicktime" });

        if (!allowedTypes.Contains(ct))
        {
            var supported = isMediaField
                ? (acceptTypes == "audio" ? "MP3, M4A, WAV, OGG audio"
                    : acceptTypes == "video" ? "MP4, WebM, MOV video"
                    : "audio (MP3, M4A, WAV, OGG) and video (MP4, WebM, MOV)")
                : "images, PDF, Word, Excel, CSV, TXT";
            return BadRequest(new { detail = $"File type '{ct}' not allowed. Supported: {supported}." });
        }

        byte[] bytes;
        await using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            bytes = ms.ToArray();
        }

        // Verify magic bytes for images; for documents/media, trust the content-type + extension check
        if (ct.StartsWith("image/") && !VerifyMagicBytes(bytes, ct))
            return BadRequest(new { detail = "File content does not match declared image type." });

        var ext = ct switch
        {
            "image/jpeg"                                                              => ".jpg",
            "image/png"                                                               => ".png",
            "image/gif"                                                               => ".gif",
            "image/webp"                                                              => ".webp",
            "application/pdf"                                                         => ".pdf",
            "application/msword"                                                      => ".doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
            "application/vnd.ms-excel"                                                => ".xls",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"       => ".xlsx",
            "text/csv"                                                                => ".csv",
            "text/plain"                                                              => ".txt",
            "audio/mpeg"                                                              => ".mp3",
            "audio/mp4"                                                               => ".m4a",
            "audio/x-m4a"                                                             => ".m4a",
            "audio/aac"                                                               => ".aac",
            "audio/wav"                                                               => ".wav",
            "audio/x-wav"                                                             => ".wav",
            "audio/ogg"                                                               => ".ogg",
            "video/mp4"                                                               => ".mp4",
            "video/webm"                                                              => ".webm",
            "video/quicktime"                                                         => ".mov",
            _                                                                         => Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? ""
        };

        var (relativePath, _) = await SaveFileAsync(bytes, ext, ct, UploadFileNaming.SanitizePrefix(registrantName));

        _logger.LogInformation("Public upload received: {Path} ({Type})", relativePath, ct);

        return Ok(new
        {
            success      = true,
            filename     = file.FileName,
            path         = relativePath,
            url          = $"/api/uploads/images/{relativePath}",
            size         = bytes.Length,
            content_type = ct
        });
    }

    // ── POST /api/uploads/images ──────────────────────────────────────────────
    [HttpPost("images")]
    [Authorize]
    public async Task<IActionResult> UploadMultipleImages(List<IFormFile> files)
    {
        var results = new List<object>();
        var errors  = new List<object>();

        foreach (var file in files)
        {
            var (error, bytes, ext, contentType) = await ValidateImage(file);
            if (error != null)
            {
                errors.Add(new { filename = file.FileName, error });
                continue;
            }

            var (relativePath, _) = await SaveFileAsync(bytes!, ext!, contentType!);
            results.Add(new
            {
                original_filename = file.FileName,
                filename          = Path.GetFileName(relativePath),
                path              = relativePath,
                url               = $"/api/uploads/images/{relativePath}",
                size              = bytes!.Length
            });
        }

        return Ok(new { success = results.Count > 0, uploaded = results, errors });
    }

    // ── GET /api/uploads/images/{date_path} ───────────────────────────────────
    [HttpGet("images/{**date_path}")]
    public IActionResult GetImage(string date_path, [FromQuery] string? download = null)
    {
        var filePath = Path.Combine(UploadRoot, date_path.Replace('/', Path.DirectorySeparatorChar));

        // Security: ensure path is within upload root
        var fullPath = Path.GetFullPath(filePath);
        var rootFull = Path.GetFullPath(UploadRoot);
        if (!fullPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        if (!System.IO.File.Exists(fullPath))
            return NotFound(new { detail = "Image not found." });

        var provider    = new FileExtensionContentTypeProvider();
        var contentType = provider.TryGetContentType(fullPath, out var ct) ? ct : "application/octet-stream";

        // ?download=1 → Content-Disposition: attachment with the stored filename.
        // Default stays inline — landing pages embed images from this endpoint.
        if (download == "1")
            return PhysicalFile(fullPath, contentType, Path.GetFileName(fullPath));

        return PhysicalFile(fullPath, contentType);
    }

    // ── DELETE /api/uploads/images/{date_path} ────────────────────────────────
    [HttpDelete("images/{**date_path}")]
    [Authorize]
    public IActionResult DeleteImage(string date_path)
    {
        var filePath = Path.Combine(UploadRoot, date_path.Replace('/', Path.DirectorySeparatorChar));

        var fullPath = Path.GetFullPath(filePath);
        var rootFull = Path.GetFullPath(UploadRoot);
        if (!fullPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        if (!System.IO.File.Exists(fullPath))
            return NotFound(new { detail = "Image not found." });

        System.IO.File.Delete(fullPath);
        return Ok(new { success = true, message = "Image deleted successfully." });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<(string? error, byte[]? bytes, string? ext, string? contentType)> ValidateImage(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return ("No file provided.", null, null, null);

        var contentType = file.ContentType?.ToLowerInvariant() ?? "";
        if (!AllowedMimeTypes.Contains(contentType))
            return ($"File type '{contentType}' not allowed.", null, null, null);

        if (file.Length > MaxFileSizeBytes)
            return ($"File too large. Maximum size is {MaxFileSizeBytes / 1024 / 1024}MB.", null, null, null);

        byte[] bytes;
        await using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            bytes = ms.ToArray();
        }

        if (!VerifyMagicBytes(bytes, contentType))
            return ("File content does not match declared type.", null, null, null);

        var ext = contentType switch
        {
            "image/jpeg"   => ".jpg",
            "image/png"    => ".png",
            "image/gif"    => ".gif",
            "image/webp"   => ".webp",
            "image/svg+xml"=> ".svg",
            _              => ".jpg"
        };

        return (null, bytes, ext, contentType);
    }

    private static bool VerifyMagicBytes(byte[] content, string contentType)
    {
        if (contentType == "image/svg+xml")
        {
            var text = System.Text.Encoding.UTF8.GetString(content, 0, Math.Min(100, content.Length)).ToLower();
            return text.Contains("<?xml") || text.Contains("<svg");
        }
        if (contentType == "image/webp")
            return content.Length > 12 &&
                   content[0] == 0x52 && content[1] == 0x49 && content[2] == 0x46 && content[3] == 0x46 &&
                   content[8] == 0x57 && content[9] == 0x45 && content[10] == 0x42 && content[11] == 0x50;

        foreach (var (magic, mime) in MagicBytes)
        {
            if (mime != contentType || content.Length < magic.Length) continue;
            if (content.Take(magic.Length).SequenceEqual(magic)) return true;
        }
        return false;
    }

    private async Task<(string relativePath, string url)> SaveFileAsync(byte[] bytes, string ext, string contentType, string? filenamePrefix = null, string? subfolder = null)
    {
        var dateDir  = DateTime.UtcNow.ToString("yyyy/MM");
        if (!string.IsNullOrEmpty(subfolder))
            dateDir = $"{subfolder}/{dateDir}";
        var saveDir  = Path.Combine(UploadRoot, dateDir.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(saveDir);

        // With a prefix (sanitized registrant name) the file stays identifiable when
        // downloaded; the random suffix ALWAYS remains to prevent collisions/guessing.
        // No prefix here just means the name wasn't typed yet — RegistrationController
        // backfills it at submit time, when the whole form is known.
        var filename = UploadFileNaming.BuildFileName(filenamePrefix, ext);
        var fullPath = Path.Combine(saveDir, filename);

        await System.IO.File.WriteAllBytesAsync(fullPath, bytes);

        var relative = $"{dateDir}/{filename}";
        return (relative, $"/api/uploads/images/{relative}");
    }

    /// <summary>
    /// Reads accept_types + max_file_size_mb for a file_upload field from the campaign's
    /// form_config. Both inputs are untrusted (anonymous endpoint) — any missing/invalid
    /// campaign, field or JSON returns (null, null) so the caller uses legacy defaults.
    /// </summary>
    private async Task<(string? acceptTypes, double? maxSizeMb)> ResolveUploadFieldConfigAsync(string? campaignId, string? fieldId)
    {
        if (string.IsNullOrWhiteSpace(campaignId) || string.IsNullOrWhiteSpace(fieldId))
            return (null, null);

        try
        {
            var campaign = await _campaigns.GetByIdAsync(campaignId.Trim());
            if (campaign == null || string.IsNullOrEmpty(campaign.FormConfig))
                return (null, null);

            using var doc = JsonDocument.Parse(campaign.FormConfig);
            if (!doc.RootElement.TryGetProperty("fields", out var fields) || fields.ValueKind != JsonValueKind.Array)
                return (null, null);

            foreach (var f in fields.EnumerateArray())
            {
                if (f.ValueKind != JsonValueKind.Object) continue;
                var id = f.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
                    ? idEl.GetString() : null;
                if (!string.Equals(id, fieldId.Trim(), StringComparison.Ordinal)) continue;

                string? accept = f.TryGetProperty("accept_types", out var aEl) && aEl.ValueKind == JsonValueKind.String
                    ? aEl.GetString()?.Trim().ToLowerInvariant() : null;

                double? maxMb = null;
                if (f.TryGetProperty("max_file_size_mb", out var mEl))
                {
                    if (mEl.ValueKind == JsonValueKind.Number && mEl.TryGetDouble(out var d) && d > 0)
                        maxMb = d;
                    else if (mEl.ValueKind == JsonValueKind.String &&
                             double.TryParse(mEl.GetString(), System.Globalization.NumberStyles.Float,
                                 System.Globalization.CultureInfo.InvariantCulture, out var ds) && ds > 0)
                        maxMb = ds;
                }

                return (accept, maxMb);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve upload field config for campaign {CampaignId} / field {FieldId} — using defaults",
                campaignId, fieldId);
        }

        return (null, null);
    }
}
