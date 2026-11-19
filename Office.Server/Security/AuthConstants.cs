namespace Office.Server.Security
{
    public static class AuthConstants
    {
        public const string RefreshCookieName = "office_refresh";
        public const string AuthChallengeHeaderName = "X-Office-Auth-Challenge";
        public const int AccessTokenLifetimeMinutes = 15;
        public const int RefreshTokenLifetimeDays = 14;
        public const string CookiePath = "/api/Authorization";
        public const string ImpersonationCookieName = "office_impersonation";
        public const int ImpersonationLifetimeHours = 8;
        // Shorter than a normal access token: after «Вернуться» a stale impersonated token dies sooner.
        public const int ImpersonatedAccessTokenLifetimeMinutes = 5;
        public const string AdminRole = "Admin";
    }
}
