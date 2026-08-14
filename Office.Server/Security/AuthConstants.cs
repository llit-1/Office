namespace Office.Server.Security
{
    public static class AuthConstants
    {
        public const string RefreshCookieName = "office_refresh";
        public const string AuthChallengeHeaderName = "X-Office-Auth-Challenge";
        public const int AccessTokenLifetimeMinutes = 15;
        public const int RefreshTokenLifetimeDays = 14;
    }
}
