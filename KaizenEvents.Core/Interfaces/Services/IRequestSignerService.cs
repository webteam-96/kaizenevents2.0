namespace KaizenEvents.Core.Interfaces.Services;

public interface IRequestSignerService
{
    /// <summary>
    /// Computes HMAC-SHA256 signature of "method:path:body:timestamp".
    /// Returns hex string signature.
    /// </summary>
    string Sign(string method, string path, string body, long timestampSeconds);

    /// <summary>
    /// Verifies signature and that timestamp is within 5 minutes of now.
    /// </summary>
    bool Verify(string method, string path, string body, long timestampSeconds, string signature);
}
