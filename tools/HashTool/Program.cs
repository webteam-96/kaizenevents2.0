// Small one-shot tool to generate a BCrypt hash compatible with the
// KaizenEvents.API password verifier (same BCrypt.Net-Next library).
//
// Usage:
//   dotnet run --project tools/HashTool -- "<password>" [cost]
// Examples:
//   dotnet run --project tools/HashTool -- "Kaizentest1234"
//   dotnet run --project tools/HashTool -- "Kaizentest1234" 12
//
// Output is the hash string (paste verbatim into users.password_hash).

if (args.Length == 0 || string.IsNullOrEmpty(args[0]))
{
    Console.Error.WriteLine("Usage: dotnet run --project tools/HashTool -- \"<password>\" [cost]");
    return 1;
}

var password = args[0];
var cost = args.Length >= 2 && int.TryParse(args[1], out var c) ? c : 10;

var hash = BCrypt.Net.BCrypt.HashPassword(password, cost);
Console.WriteLine(hash);
return 0;
