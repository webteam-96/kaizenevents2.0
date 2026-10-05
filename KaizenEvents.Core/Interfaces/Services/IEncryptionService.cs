namespace KaizenEvents.Core.Interfaces.Services;

public interface IEncryptionService
{
    /// <summary>AES-256-GCM encrypt. Returns base64-encoded ciphertext.</summary>
    string Encrypt(string plaintext);

    /// <summary>Decrypts a value previously encrypted by Encrypt.</summary>
    string Decrypt(string ciphertext);

    /// <summary>Encrypts only when the value is non-null/non-empty.</summary>
    string? EncryptNullable(string? value)
        => string.IsNullOrEmpty(value) ? value : Encrypt(value);

    /// <summary>Decrypts only when the value is non-null/non-empty.</summary>
    string? DecryptNullable(string? value)
        => string.IsNullOrEmpty(value) ? value : Decrypt(value);
}
