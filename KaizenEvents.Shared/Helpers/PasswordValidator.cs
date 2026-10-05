namespace KaizenEvents.Shared.Helpers;

/// <summary>
/// Enforces the password strength rules from CLAUDE.md Section 7.
/// </summary>
public static class PasswordValidator
{
    private static readonly HashSet<string> WeakPasswords = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "12345678", "qwerty123", "admin123", "letmein",
        "welcome1", "monkey123", "dragon123", "master123", "login123",
        "password1", "password123"
    };

    // Note: "admin" intentionally removed from this list (2026-05-15) to allow
    // passwords containing the substring "admin" — see SECURITY.md changelog.
    // Other obvious words are still blocked.
    private static readonly string[] CommonWords =
        ["password", "user", "login", "welcome", "test"];

    private const string SpecialChars = "!@#$%^&*(),.?\":{}|<>_\\-+=[]\\;'`~";

    // Sequential number runs (012 … 890)
    private static readonly string[] SeqNumbers =
        ["012", "123", "234", "345", "456", "567", "678", "789", "890"];

    public static (bool Valid, string? Error) Validate(string password)
    {
        if (password.Length < 12)
            return (false, "Password must be at least 12 characters.");
        if (password.Length > 128)
            return (false, "Password must be at most 128 characters.");

        if (!password.Any(char.IsUpper))
            return (false, "Password must contain at least one uppercase letter.");
        if (!password.Any(char.IsLower))
            return (false, "Password must contain at least one lowercase letter.");
        if (!password.Any(char.IsDigit))
            return (false, "Password must contain at least one digit.");
        if (!password.Any(c => SpecialChars.Contains(c)))
            return (false, "Password must contain at least one special character.");

        // No more than 2 consecutive identical characters
        for (int i = 0; i < password.Length - 2; i++)
        {
            if (password[i] == password[i + 1] && password[i] == password[i + 2])
                return (false, "Password must not contain more than 2 consecutive repeated characters.");
        }

        // No sequential numbers
        foreach (var seq in SeqNumbers)
            if (password.Contains(seq))
                return (false, "Password must not contain sequential numbers.");

        // No sequential letters (abc, bcd … xyz)
        var lower = password.ToLowerInvariant();
        for (char c = 'a'; c <= 'x'; c++)
        {
            var seq = new string([c, (char)(c + 1), (char)(c + 2)]);
            if (lower.Contains(seq))
                return (false, "Password must not contain sequential letters.");
        }

        // Weak password list
        if (WeakPasswords.Contains(password))
            return (false, "Password is too common. Choose a stronger password.");

        // Common words
        foreach (var word in CommonWords)
            if (lower.Contains(word))
                return (false, $"Password must not contain the word '{word}'.");

        return (true, null);
    }
}
