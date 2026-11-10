using System.Collections.Concurrent;

namespace Office.Server.Security
{
    /// <summary>
    /// Счётчик неудачных входов по логину: перебор пароля упирается в паузу портала,
    /// а не уходит пачкой запросов в AD.
    /// </summary>
    public sealed class LoginAttempts
    {
        public const int MaxFailures = 5;
        public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
        private const int CleanupThreshold = 10_000;

        public static LoginAttempts Shared { get; } = new();

        private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

        private sealed record Entry(int Failures, DateTime FirstFailureUtc);

        /// <summary>«DOMAIN\user», «user@domain» и «user» — один и тот же счётчик.</summary>
        public static string Key(string login)
        {
            var key = login.Trim().ToLowerInvariant();
            var slash = key.LastIndexOf('\\');
            if (slash >= 0)
                key = key[(slash + 1)..];
            var at = key.IndexOf('@');
            return at > 0 ? key[..at] : key;
        }

        public TimeSpan? BlockedFor(string login, DateTime nowUtc)
        {
            var key = Key(login);
            if (!_entries.TryGetValue(key, out var entry))
                return null;

            var until = entry.FirstFailureUtc + Window;
            if (until <= nowUtc)
            {
                _entries.TryRemove(key, out _);
                return null;
            }

            return entry.Failures >= MaxFailures ? until - nowUtc : null;
        }

        public void Fail(string login, DateTime nowUtc)
        {
            if (_entries.Count > CleanupThreshold)
            {
                foreach (var pair in _entries.Where(x => x.Value.FirstFailureUtc + Window <= nowUtc))
                    _entries.TryRemove(pair.Key, out _);
            }

            _entries.AddOrUpdate(
                Key(login),
                _ => new Entry(1, nowUtc),
                (_, entry) => entry.FirstFailureUtc + Window <= nowUtc
                    ? new Entry(1, nowUtc)
                    : entry with { Failures = entry.Failures + 1 });
        }

        public void Reset(string login) => _entries.TryRemove(Key(login), out _);
    }
}
