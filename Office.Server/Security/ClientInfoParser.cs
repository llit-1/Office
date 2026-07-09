using System.Text.RegularExpressions;

namespace Office.Server.Security
{
    public sealed class ClientInfoParser
    {
        public ParsedClientInfo Parse(string? userAgent)
        {
            var normalizedUserAgent = string.IsNullOrWhiteSpace(userAgent)
                ? string.Empty
                : userAgent.Trim();

            var deviceType = DetectDeviceType(normalizedUserAgent, out var isMobile);
            var deviceOs = DetectOs(normalizedUserAgent);
            var (browser, browserVersion) = DetectBrowser(normalizedUserAgent);

            return new ParsedClientInfo
            {
                UserAgent = normalizedUserAgent.Length == 0 ? null : Truncate(normalizedUserAgent, 1024),
                DeviceType = deviceType,
                DeviceOs = deviceOs,
                Browser = browser,
                BrowserVersion = browserVersion,
                IsMobile = isMobile
            };
        }

        private static string DetectDeviceType(string userAgent, out bool isMobile)
        {
            if (string.IsNullOrWhiteSpace(userAgent))
            {
                isMobile = false;
                return "Unknown";
            }

            var value = userAgent.ToLowerInvariant();
            if (value.Contains("ipad") || value.Contains("tablet") || value.Contains("sm-t") || value.Contains("nexus 7"))
            {
                isMobile = false;
                return "Tablet";
            }

            if (value.Contains("mobile") || value.Contains("iphone") || value.Contains("android"))
            {
                isMobile = true;
                return "Mobile";
            }

            if (value.Contains("bot") || value.Contains("crawler") || value.Contains("spider"))
            {
                isMobile = false;
                return "Bot";
            }

            isMobile = false;
            return "Desktop";
        }

        private static string? DetectOs(string userAgent)
        {
            var value = userAgent.ToLowerInvariant();
            if (value.Contains("windows nt 10.0")) return "Windows 10/11";
            if (value.Contains("windows nt 6.3")) return "Windows 8.1";
            if (value.Contains("windows nt 6.1")) return "Windows 7";
            if (value.Contains("iphone") || value.Contains("cpu iphone os")) return "iOS";
            if (value.Contains("ipad") || value.Contains("cpu os")) return "iPadOS";
            if (value.Contains("android")) return "Android";
            if (value.Contains("mac os x") || value.Contains("macintosh")) return "macOS";
            if (value.Contains("linux")) return "Linux";
            return null;
        }

        private static (string? Browser, string? Version) DetectBrowser(string userAgent)
        {
            var value = userAgent.ToLowerInvariant();

            if (TryMatch(value, @"edg/([0-9\.]+)", "Edge", out var version)) return ("Edge", version);
            if (TryMatch(value, @"opr/([0-9\.]+)", "Opera", out version)) return ("Opera", version);
            if (TryMatch(value, @"chrome/([0-9\.]+)", "Chrome", out version) && !value.Contains("edg/") && !value.Contains("opr/")) return ("Chrome", version);
            if (TryMatch(value, @"firefox/([0-9\.]+)", "Firefox", out version)) return ("Firefox", version);
            if (TryMatch(value, @"version/([0-9\.]+).*safari", "Safari", out version) && value.Contains("safari") && !value.Contains("chrome")) return ("Safari", version);

            return (null, null);
        }

        private static bool TryMatch(string userAgent, string pattern, string _, out string? version)
        {
            var match = Regex.Match(userAgent, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (match.Success)
            {
                version = Truncate(match.Groups[1].Value, 50);
                return true;
            }

            version = null;
            return false;
        }

        private static string Truncate(string value, int maxLength)
        {
            return value.Length <= maxLength ? value : value[..maxLength];
        }
    }

    public sealed class ParsedClientInfo
    {
        public string? UserAgent { get; init; }
        public string? DeviceType { get; init; }
        public string? DeviceOs { get; init; }
        public string? Browser { get; init; }
        public string? BrowserVersion { get; init; }
        public bool IsMobile { get; init; }
    }
}
