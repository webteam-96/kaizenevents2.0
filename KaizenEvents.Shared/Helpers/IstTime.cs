namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// Converts stored UTC timestamps to Indian Standard Time for anything the
/// user reads directly: CSV exports, Google Sheets rows, invoices, emails.
/// All timestamps in the database are UTC (DateTime.UtcNow); the platform's
/// audience is India-only, so display time is always IST (+05:30).
/// </summary>
public static class IstTime
{
    private static readonly TimeZoneInfo Ist = ResolveIst();

    private static TimeZoneInfo ResolveIst()
    {
        // Windows and IANA ids differ; try both so the code runs on IIS and Linux alike.
        foreach (var id in new[] { "India Standard Time", "Asia/Kolkata" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        // Last resort: fixed +05:30 (IST has no DST, so this is always correct).
        return TimeZoneInfo.CreateCustomTimeZone(
            "IST+0530", TimeSpan.FromMinutes(330), "India Standard Time", "India Standard Time");
    }

    /// <summary>Converts a UTC timestamp (Kind may be Unspecified — treated as UTC) to IST.</summary>
    public static DateTime FromUtc(DateTime utc)
    {
        if (utc.Kind == DateTimeKind.Local) utc = utc.ToUniversalTime();
        else if (utc.Kind == DateTimeKind.Unspecified) utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeFromUtc(utc, Ist);
    }
}
