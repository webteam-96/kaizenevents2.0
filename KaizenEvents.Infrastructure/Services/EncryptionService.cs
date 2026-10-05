using System.Security.Cryptography;
using System.Text;
using KaizenEvents.Core.Interfaces.Services;
using Microsoft.Extensions.Configuration;

namespace KaizenEvents.Infrastructure.Services;

/// <summary>
/// AES-256-GCM encryption with PBKDF2-HMAC-SHA256 key derivation.
/// Parameters match the Python DataEncryption class:
///   iterations = 480,000 | salt = "kaizen_security_salt_v1"
/// Wire format (base64url): nonce(12) + ciphertext(n) + tag(16)
/// </summary>
public class EncryptionService : IEncryptionService
{
    private readonly byte[] _key;

    public EncryptionService(IConfiguration config)
    {
        var password = config["Encryption:Key"]
            ?? throw new InvalidOperationException("Encryption:Key missing");
        var saltStr  = config["Encryption:Salt"] ?? "kaizen_security_salt_v1";
        var iterations = config.GetValue<int>("Encryption:Iterations", 480_000);

        var salt = Encoding.UTF8.GetBytes(saltStr);
        _key = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            32);  // 256-bit key
    }

    public string Encrypt(string plaintext)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var ciphertext = new byte[plaintextBytes.Length];
        var tag = new byte[16];

        using var aes = new AesGcm(_key, tagSizeInBytes: 16);
        aes.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        // Concatenate nonce + ciphertext + tag
        var result = new byte[nonce.Length + ciphertext.Length + tag.Length];
        nonce.CopyTo(result, 0);
        ciphertext.CopyTo(result, nonce.Length);
        tag.CopyTo(result, nonce.Length + ciphertext.Length);

        return Convert.ToBase64String(result);
    }

    public string Decrypt(string ciphertext)
    {
        var data = Convert.FromBase64String(ciphertext);

        // Extract nonce (12), ciphertext (n), tag (16)
        if (data.Length < 28)
            throw new CryptographicException("Invalid ciphertext: too short.");

        var nonce      = data[..12];
        var tag        = data[^16..];
        var encrypted  = data[12..^16];
        var plaintext  = new byte[encrypted.Length];

        using var aes = new AesGcm(_key, tagSizeInBytes: 16);
        aes.Decrypt(nonce, encrypted, tag, plaintext);

        return Encoding.UTF8.GetString(plaintext);
    }
}
