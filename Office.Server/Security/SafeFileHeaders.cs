namespace Office.Server.Security
{
    /// <summary>
    /// Файлы с сетевых дисков отдаются с домена портала. SVG — это документ со скриптами:
    /// открытый во вкладке, он выполнился бы от имени пользователя и мог бы получить его токен.
    /// </summary>
    public static class SafeFileHeaders
    {
        public static void Apply(HttpResponse response, string fileName)
        {
            response.Headers.XContentTypeOptions = "nosniff";
            if (Path.GetExtension(fileName).Equals(".svg", StringComparison.OrdinalIgnoreCase))
                response.Headers.ContentSecurityPolicy = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";
        }
    }
}
