using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Office.Server.VideoDevices;

/// <summary>
/// Браузер не передаёт JWT в &lt;video src&gt;, поэтому превью видео в админке открывается
/// по короткоживущему тикету, выданному авторизованному пользователю. Тикет привязан к одному видео.
/// </summary>
public sealed class VideoPreviewTickets
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(4);
    private readonly ConcurrentDictionary<string, (Guid VideoGuid, DateTime ExpiresAtUtc)> _tickets = new(StringComparer.Ordinal);

    public string Issue(Guid videoGuid)
    {
        CleanupExpired();
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _tickets[token] = (videoGuid, DateTime.UtcNow.Add(Lifetime));
        return token;
    }

    public bool TryGet(string? token, out Guid videoGuid)
    {
        videoGuid = Guid.Empty;
        if (string.IsNullOrEmpty(token) || !_tickets.TryGetValue(token, out var ticket))
        {
            return false;
        }

        if (ticket.ExpiresAtUtc <= DateTime.UtcNow)
        {
            _tickets.TryRemove(token, out _);
            return false;
        }

        videoGuid = ticket.VideoGuid;
        return true;
    }

    private void CleanupExpired()
    {
        var now = DateTime.UtcNow;
        foreach (var pair in _tickets.Where(x => x.Value.ExpiresAtUtc <= now))
        {
            _tickets.TryRemove(pair.Key, out _);
        }
    }
}
