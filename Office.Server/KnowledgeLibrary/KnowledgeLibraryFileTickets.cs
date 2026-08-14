using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Office.Server.KnowledgeLibrary;

public sealed class KnowledgeLibraryFileTickets
{
    private readonly ConcurrentDictionary<string, Ticket> _tickets = new(StringComparer.Ordinal);

    public string Issue(Guid sectionId, Guid documentId, int userId)
    {
        CleanupExpired();
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _tickets[token] = new Ticket(sectionId, documentId, userId, DateTime.UtcNow.AddHours(4));
        return token;
    }

    public bool TryGet(string token, out Ticket? ticket)
    {
        ticket = null;
        if (!_tickets.TryGetValue(token, out var found))
            return false;
        if (found.ExpiresAtUtc <= DateTime.UtcNow)
        {
            _tickets.TryRemove(token, out _);
            return false;
        }
        ticket = found;
        return true;
    }

    private void CleanupExpired()
    {
        var now = DateTime.UtcNow;
        foreach (var pair in _tickets.Where(x => x.Value.ExpiresAtUtc <= now))
            _tickets.TryRemove(pair.Key, out _);
    }

    public sealed class Ticket(Guid sectionId, Guid documentId, int userId, DateTime expiresAtUtc)
    {
        private int _historyRecorded;
        public Guid SectionId { get; } = sectionId;
        public Guid DocumentId { get; } = documentId;
        public int UserId { get; } = userId;
        public DateTime ExpiresAtUtc { get; } = expiresAtUtc;
        public bool TryMarkHistoryRecorded() => Interlocked.Exchange(ref _historyRecorded, 1) == 0;
    }
}
