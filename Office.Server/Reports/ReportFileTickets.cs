using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Office.Server.Reports;

/// <summary>
/// Короткоживущие ссылки на файлы «Других отчётов»: iframe, img и video не умеют передавать заголовок Authorization.
/// </summary>
public sealed class ReportFileTickets
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);
    private readonly ConcurrentDictionary<string, Ticket> _tickets = new(StringComparer.Ordinal);

    public string Issue(string relativePath, int userId)
    {
        var now = DateTime.UtcNow;
        foreach (var expired in _tickets.Where(pair => pair.Value.ExpiresAtUtc <= now))
        {
            _tickets.TryRemove(expired.Key, out _);
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _tickets[token] = new Ticket(relativePath, userId, now.Add(Lifetime));
        return token;
    }

    public bool TryGet(string token, out Ticket? ticket)
    {
        ticket = null;
        if (!_tickets.TryGetValue(token, out var found))
        {
            return false;
        }

        if (found.ExpiresAtUtc <= DateTime.UtcNow)
        {
            _tickets.TryRemove(token, out _);
            return false;
        }

        ticket = found;
        return true;
    }

    public sealed record Ticket(string RelativePath, int UserId, DateTime ExpiresAtUtc);
}
