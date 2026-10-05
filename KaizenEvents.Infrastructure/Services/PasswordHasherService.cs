using KaizenEvents.Core.Interfaces.Services;

namespace KaizenEvents.Infrastructure.Services;

public class PasswordHasherService : IPasswordHasherService
{
    // Work factor 12 as specified in the project requirements
    private const int WorkFactor = 12;

    public string Hash(string password)
        => BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);

    public bool Verify(string password, string hash)
        => BCrypt.Net.BCrypt.Verify(password, hash);
}
