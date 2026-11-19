using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.Security;
using Office.Server.VideoDevices;

namespace Office.Server.Controllers;

/// <summary>
/// API для самих приставок (приложение com.example.video). Пользователей с JWT у приставок нет,
/// поэтому доступ — по общему ключу <see cref="DeviceApiKeyAttribute"/>.
/// Файлы отдаются только из папки ВидеоТВ: видео — по имени из корня, аудио — по пути внутри корня.
/// Все ссылки в ответах относительные от сервера, приставка дописывает их к своему базовому адресу.
/// </summary>
[ApiController]
[Route(RoutePrefix)]
[AllowAnonymous]
[DeviceApiKey]
public class VideoDeviceApiController(
    RKNETDBContext context,
    IConfiguration configuration,
    IMemoryCache cache,
    ILogger<VideoDeviceApiController> logger) : ControllerBase
{
    public const string RoutePrefix = "api/video-device";

    /// <summary>
    /// Признак ответа «приставка не зарегистрирована». Приложение гасит экран только по нему:
    /// голый 404 от IIS или прокси (API не выложен, неверный путь) не должен выключать все экраны.
    /// </summary>
    public const string DeviceNotRegisteredCode = "device_not_registered";

    private string RootPath => VideoLibrary.GetRootPath(configuration);

    /// <summary>
    /// Сколько файл должен пролежать без изменений, прежде чем его отдавать приставкам
    /// (VideoDevices:StableFileAgeSeconds, по умолчанию 60 с). Защита от файлов, которые ещё копируются.
    /// </summary>
    private TimeSpan StableFileAge =>
        TimeSpan.FromSeconds(Math.Max(0, configuration.GetValue("VideoDevices:StableFileAgeSeconds", 60)));

    /// <summary>Списки музыки и рекламы кэшируются: 102 приставки раз в час не должны каждый раз обходить шару.</summary>
    private static readonly TimeSpan AudioListCacheTime = TimeSpan.FromSeconds(60);

    /// <summary>
    /// Настройки приставки. <paramref name="ip"/> — адрес, который приставка сообщает о себе (как в поле IP в админке).
    /// Неизвестная приставка получает 404 с кодом <see cref="DeviceNotRegisteredCode"/>.
    /// Если папка ВидеоТВ недоступна — 503: по пустому списку приставки удалили бы свой кэш.
    /// </summary>
    [HttpGet("config")]
    public async Task<IActionResult> GetConfig([FromQuery] string? ip, CancellationToken cancellationToken)
    {
        if (!VideoLibrary.TryNormalizeDeviceAddress(ip, out var address))
        {
            return BadRequest(new { message = "Некорректный IP приставки." });
        }

        var device = await context.VideoDevices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Ip.Trim() == address, cancellationToken);
        if (device == null)
        {
            return NotFound(new
            {
                code = DeviceNotRegisteredCode,
                message = $"Приставка {address} не зарегистрирована на портале."
            });
        }

        if (RootUnavailable() is { } unavailable)
        {
            return unavailable;
        }

        // В списке остаются все видео из настроек, в заданном порядке. Файлы, которых сейчас нет в папке
        // или которые ещё копируются, помечаются Available = false: приставка их не качает,
        // но и не удаляет уже скачанную копию.
        var videos = new List<DeviceVideoDto>();
        var missingVideos = new List<string>();
        foreach (var name in VideoLibrary.ParseVideoList(device.VideoList))
        {
            var ready = VideoLibrary.TryResolveVideoFile(RootPath, name, out var fullPath)
                && VideoLibrary.IsFileStable(fullPath, StableFileAge);
            videos.Add(new DeviceVideoDto
            {
                Name = name,
                Available = ready,
                SizeBytes = ready ? new FileInfo(fullPath).Length : 0,
                Url = VideoUrl(name)
            });
            if (!ready)
            {
                missingVideos.Add(name);
            }
        }

        if (missingVideos.Count > 0)
        {
            logger.LogWarning("Device {Ip} references missing videos: {Videos}", address, string.Join(", ", missingVideos));
        }

        var isMusic = device.OnlyMusic == 1;
        return Ok(new DeviceConfigDto
        {
            Mode = isMusic ? "music" : "video",
            MuteStartTime = device.MuteStartTime,
            MuteEndTime = device.MuteEndTime,
            Videos = videos,
            MissingVideos = missingVideos
        });
    }

    /// <summary>
    /// Сигнал «я на связи» — приставка присылает раз в 2 минуты вместе со своим состоянием.
    /// По нему админка показывает, что приставка в сети и действительно показывает контент.
    /// Время берётся по часам сервера: часы приставки могут быть сбиты.
    /// </summary>
    [HttpPost("heartbeat")]
    public async Task<IActionResult> Heartbeat([FromBody] HeartbeatRequest request, CancellationToken cancellationToken)
    {
        if (!VideoLibrary.TryNormalizeDeviceAddress(request.Ip, out var address))
        {
            return BadRequest(new { message = "Некорректный IP приставки." });
        }

        var device = await context.VideoDevices
            .FirstOrDefaultAsync(x => x.Ip.Trim() == address, cancellationToken);
        if (device == null)
        {
            return NotFound(new
            {
                code = DeviceNotRegisteredCode,
                message = $"Приставка {address} не зарегистрирована на портале."
            });
        }

        var now = DateTime.UtcNow;
        var heartbeat = await context.VideoDeviceHeartbeats.FirstOrDefaultAsync(x => x.DeviceGuid == device.Guid, cancellationToken);
        if (heartbeat == null)
        {
            heartbeat = new DbContexts.RKNETDB.Models.VideoDeviceHeartbeat { DeviceGuid = device.Guid };
            context.VideoDeviceHeartbeats.Add(heartbeat);
        }

        var appVersion = VideoLibrary.IsValidAppVersion(request.AppVersion) ? request.AppVersion : null;
        heartbeat.LastSeenUtc = now;
        heartbeat.RemoteIp = Truncate(HttpContext.Connection.RemoteIpAddress?.ToString(), 64);
        heartbeat.AppVersion = appVersion;
        heartbeat.Mode = request.Mode is "video" or "music" ? request.Mode : null;
        heartbeat.IsPlaying = request.IsPlaying;
        heartbeat.Muted = request.Muted;
        heartbeat.CurrentFile = Truncate(request.CurrentFile, 260);
        heartbeat.LastConfigOkUtc = request.LastConfigOkSecondsAgo is >= 0 and < 3650L * 24 * 3600
            ? now.AddSeconds(-request.LastConfigOkSecondsAgo.Value)
            : null;
        heartbeat.LastError = Truncate(request.LastError, 500);
        heartbeat.ItemsReady = Math.Max(0, request.ItemsReady);
        heartbeat.ItemsTotal = Math.Max(0, request.ItemsTotal);
        heartbeat.BrokenItems = Math.Max(0, request.BrokenItems);
        // Запоминаем, когда началась недокачка, — проблемой она станет только через 2 часа
        var incomplete = heartbeat.ItemsTotal > 0 && heartbeat.ItemsReady + heartbeat.BrokenItems < heartbeat.ItemsTotal;
        heartbeat.IncompleteSinceUtc = incomplete ? heartbeat.IncompleteSinceUtc ?? now : null;
        heartbeat.FreeSpaceMb = request.FreeSpaceMb is >= 0 ? request.FreeSpaceMb : null;
        heartbeat.UptimeSeconds = request.UptimeSeconds is >= 0 ? request.UptimeSeconds : null;
        heartbeat.ClockSkewSeconds = ClockSkewSeconds(request.DeviceTimeMs, now);
        heartbeat.BootedAtUtc = request.BootUptimeSeconds is >= 0 and < 3650L * 24 * 3600
            ? now.AddSeconds(-request.BootUptimeSeconds.Value)
            : null;
        heartbeat.NetworkType = request.NetworkType is "ethernet" or "wifi" or "other" or "none" ? request.NetworkType : null;
        heartbeat.WifiRssi = request.WifiRssi is >= -120 and <= 0 ? request.WifiRssi : null;
        heartbeat.DownloadKbps = request.DownloadKbps is >= 0 ? request.DownloadKbps : null;
        // Портал стоит за прокси, который подменяет имя хоста, — сам он не видит, на какой адрес (основной
        // или запасной) пришла приставка. Поэтому берём адрес со слов приставки (только похожий на имя хоста),
        // а для старых сборок — из X-Forwarded-Host или самого запроса.
        heartbeat.PortalHost = IsHostName(request.PortalHost)
            ? request.PortalHost!.Trim().ToLowerInvariant()
            : Truncate(Request.Headers["X-Forwarded-Host"].FirstOrDefault() ?? Request.Host.Host, 100);
        heartbeat.HdmiConnected = request.HdmiConnected;
        heartbeat.RamFreeMb = request.RamFreeMb is >= 0 ? request.RamFreeMb : null;
        heartbeat.RamTotalMb = request.RamTotalMb is > 0 ? request.RamTotalMb : null;
        heartbeat.RamPhysicalMb = request.RamPhysicalMb is > 0 and < 1024 * 1024 ? request.RamPhysicalMb : null;
        heartbeat.NotEnoughSpaceItems = request.NotEnoughSpaceItems is >= 0 and < 100000 ? request.NotEnoughSpaceItems : null;
        heartbeat.CpuTempC = request.CpuTempC is >= -20 and <= 150 ? request.CpuTempC : null;
        heartbeat.VolumePercent = request.VolumePercent is >= 0 and <= 100 ? request.VolumePercent : null;
        heartbeat.SystemMuted = request.SystemMuted;
        heartbeat.AudioOutput = request.AudioOutput is "line" or "hdmi" or "default" ? request.AudioOutput : null;
        heartbeat.StalledSeconds = request.StalledSeconds is > 0 and < 3650L * 24 * 3600 ? request.StalledSeconds : null;
        heartbeat.FreezesLastHour = request.FreezesLastHour is >= 0 and < 10000 ? request.FreezesLastHour : null;
        heartbeat.HasRoot = request.HasRoot;
        heartbeat.DeviceOwner = request.DeviceOwner;

        // Первый сигнал после обрыва связи несёт итог: сколько не было связи и шёл ли всё это время контент.
        // Обычные сигналы этих полей не содержат — прежний итог не затираем.
        if (request.OutageSeconds is > 0 and < 3650L * 24 * 3600 && request.OutagePlayingPercent is >= 0 and <= 100)
        {
            heartbeat.LastOutageEndedUtc = now;
            heartbeat.LastOutageSeconds = request.OutageSeconds;
            heartbeat.LastOutagePlayingPercent = request.OutagePlayingPercent;
        }

        // Сведения о последней авто-перезагрузке приставка присылает, пока помнит их; без них — прежние не затираем
        if (request.LastAutoRebootSecondsAgo is >= 0 and < 3650L * 24 * 3600
            && request.LastAutoRebootReason is { } rebootReason
            && AutoRebootReasons.Contains(rebootReason))
        {
            heartbeat.LastAutoRebootUtc = now.AddSeconds(-request.LastAutoRebootSecondsAgo.Value);
            heartbeat.LastAutoRebootReason = rebootReason;
        }

        // Версию в карточке приставки обновляем по сигналу — без опроса приставки по 8080.
        if (appVersion != null && device.Version != appVersion)
        {
            device.Version = appVersion;
        }

        await context.SaveChangesAsync(cancellationToken);
        // Время сервера: по нему приставка проверяет свои часы перед плановой ночной перезагрузкой
        return Ok(new { ok = true, serverTimeMs = new DateTimeOffset(now).ToUnixTimeMilliseconds() });
    }

    /// <summary>
    /// Публичные ключи ADB (сервер и инженеры) из таблицы OfficeAdbKeys. Приставка с root дописывает их
    /// в /data/misc/adb/adb_keys, чтобы с этих компьютеров к ней можно было подключиться без «Разрешить» на экране.
    /// Если БД недоступна — 503: пустой список приставка поняла бы как «все ключи отозваны».
    /// </summary>
    [HttpGet("adb-keys")]
    public async Task<IActionResult> GetAdbKeys(CancellationToken cancellationToken)
    {
        List<string> rows;
        try
        {
            rows = await context.Database
                .SqlQuery<string>($"SELECT [PublicKey] AS [Value] FROM [dbo].[OfficeAdbKeys] WHERE [Enabled] = 1 ORDER BY [Id]")
                .ToListAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Failed to read ADB keys");
            return Unavailable("Список ключей ADB временно недоступен.");
        }

        var keys = new List<string>();
        foreach (var row in rows)
        {
            if (AdbPublicKeys.Normalize(row) is { } key)
            {
                keys.Add(key);
            }
            else
            {
                logger.LogWarning("Invalid ADB public key in OfficeAdbKeys skipped");
            }
        }

        return Ok(new { keys });
    }

    public static readonly HashSet<string> AutoRebootReasons = ["uptime", "playback_stall", "app_hang", "no_content"];

    /// <summary>Имя хоста: латиница, цифры, точки и дефисы, до 100 символов.</summary>
    public static bool IsHostName(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && value.Trim().Length <= 100
        && System.Text.RegularExpressions.Regex.IsMatch(value.Trim(), @"^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$");

    /// <summary>
    /// Расхождение часов приставки с сервером, секунды (+ — спешат). Задержкой сети (доли секунды) пренебрегаем.
    /// Значения вне разумного диапазона (часы сброшены на 1970 год и т. п.) ограничиваются ±10 лет.
    /// </summary>
    public static int? ClockSkewSeconds(long? deviceTimeMs, DateTime nowUtc)
    {
        if (deviceTimeMs is not > 0)
        {
            return null;
        }

        var nowMs = new DateTimeOffset(DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
        var seconds = (deviceTimeMs.Value - nowMs) / 1000;
        const long limit = 10L * 365 * 24 * 3600;
        return (int)Math.Clamp(seconds, -limit, limit);
    }

    private static string? Truncate(string? value, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    [HttpGet("music")]
    public IActionResult GetMusic()
    {
        if (RootUnavailable() is { } unavailable)
        {
            return unavailable;
        }

        var dir = Path.Combine(RootPath, VideoLibrary.MusicDirectoryName);
        if (!Directory.Exists(dir))
        {
            logger.LogError("Music directory is unavailable: {Dir}", dir);
            return Unavailable("Папка с музыкой недоступна.");
        }

        return ListAudioOrUnavailable(dir);
    }

    /// <summary>Реклама: своя папка приставки (CustomAds), иначе общая папка «Реклама».</summary>
    [HttpGet("ads")]
    public async Task<IActionResult> GetAds([FromQuery] string? ip, CancellationToken cancellationToken)
    {
        string? customAds = null;
        if (VideoLibrary.TryNormalizeDeviceAddress(ip, out var address))
        {
            customAds = await context.VideoDevices
                .AsNoTracking()
                .Where(x => x.Ip.Trim() == address)
                .Select(x => x.CustomAds)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (RootUnavailable() is { } unavailable)
        {
            return unavailable;
        }

        // Папка ВидеоТВ доступна, а папок рекламы нет — значит рекламы действительно нет.
        var dir = VideoLibrary.ResolveAdsDirectory(RootPath, customAds);
        return dir == null ? Ok(new List<DeviceAudioDto>()) : ListAudioOrUnavailable(dir);
    }

    /// <summary>
    /// Шара недоступна с сервера — отвечаем 503, а не пустым списком.
    /// Пустой список приставка восприняла бы как «контент удалён» и стёрла бы кэш.
    /// </summary>
    private IActionResult? RootUnavailable()
    {
        try
        {
            if (Directory.Exists(RootPath))
            {
                return null;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogError(ex, "VideoTV root check failed: {Root}", RootPath);
        }

        logger.LogError("VideoTV root is unavailable: {Root}", RootPath);
        return Unavailable("Папка ВидеоТВ временно недоступна.");
    }

    private IActionResult ListAudioOrUnavailable(string directory)
    {
        try
        {
            var key = $"video-device:audio:{Request.PathBase}:{Path.GetFullPath(directory)}";
            var list = cache.GetOrCreate(key, entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = AudioListCacheTime;
                return ListAudio(directory);
            })!;
            return Ok(list);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Обрыв связи с шарой посреди обхода папки: частичный список удалил бы часть кэша на приставках.
            logger.LogError(ex, "Failed to list audio in {Dir}", directory);
            return Unavailable("Папка с аудио временно недоступна.");
        }
    }

    private ObjectResult Unavailable(string message) =>
        StatusCode(StatusCodes.Status503ServiceUnavailable, new { message });

    [HttpGet("videos/{fileName}")]
    public IActionResult GetVideo(string fileName)
    {
        if (!VideoLibrary.TryResolveVideoFile(RootPath, fileName, out var fullPath))
        {
            return BadRequest(new { message = "Некорректное имя видео." });
        }

        return ServeFile(fullPath);
    }

    /// <summary>APK для обновления приставки без ADB (команда «обновить» из админки).</summary>
    [HttpGet("apk")]
    public IActionResult GetApk([FromQuery] string? name)
    {
        if (!VideoLibrary.TryResolveApkFile(RootPath, name, out var fullPath))
        {
            return BadRequest(new { message = "Некорректное имя APK." });
        }

        return ServeFile(fullPath);
    }

    [HttpGet("audio")]
    public IActionResult GetAudio([FromQuery] string? path)
    {
        if (!VideoLibrary.TryResolveAudioFile(RootPath, path, out var fullPath))
        {
            return BadRequest(new { message = "Некорректный путь к аудио." });
        }

        return ServeFile(fullPath);
    }

    private IActionResult ServeFile(string fullPath)
    {
        var info = new FileInfo(fullPath);
        if (!info.Exists)
        {
            return NotFound(new { message = "Файл не найден." });
        }

        FileStream stream;
        try
        {
            // Запрещаем запись другим: если файл сейчас копируется на шару, открыть его не получится,
            // и приставка не скачает обрезанную копию — повторит позже.
            stream = VideoLibrary.OpenForServing(fullPath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "File is busy or unreadable, asking device to retry: {Path}", fullPath);
            Response.Headers.RetryAfter = "60";
            return Unavailable("Файл сейчас недоступен (возможно, ещё копируется). Повторите позже.");
        }

        var name = info.Name;
        SafeFileHeaders.Apply(Response, name);
        // Range + ETag (If-Range) нужны для докачки: после обрыва приставка запрашивает только остаток,
        // а если файл успели заменить — получает его целиком заново.
        return File(stream, VideoLibrary.ContentTypeFor(name), info.LastWriteTimeUtc, VideoLibrary.ETagFor(info),
            enableRangeProcessing: true);
    }

    private List<DeviceAudioDto> ListAudio(string directory)
    {
        // Приставка хранит файлы плоско, по имени. Одноимённые треки из разных подпапок затирали бы друг друга,
        // поэтому оставляем первый по пути и пишем в лог.
        // Файлы, изменённые совсем недавно (скорее всего, ещё копируются), в список не попадают —
        // приставка возьмёт их при следующей синхронизации. Проверка по времени дешёвая: данные уже есть в обходе папки.
        var result = new List<DeviceAudioDto>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var stableBefore = DateTime.UtcNow - StableFileAge;
        foreach (var file in new DirectoryInfo(directory)
                     .EnumerateFiles("*.*", SearchOption.AllDirectories)
                     .Where(f => VideoLibrary.AudioExtensions.Contains(f.Extension) && f.LastWriteTimeUtc <= stableBefore)
                     .OrderBy(f => f.FullName, StringComparer.OrdinalIgnoreCase))
        {
            var fullPath = file.FullName;
            var fileName = file.Name;
            if (!seen.Add(fileName))
            {
                logger.LogWarning("Duplicate audio file name skipped: {Path}", fullPath);
                continue;
            }

            result.Add(new DeviceAudioDto
            {
                Name = Path.GetFileNameWithoutExtension(fullPath),
                FileName = fileName,
                SizeBytes = file.Length,
                Url = AudioUrl(VideoLibrary.ToRelativePath(RootPath, fullPath))
            });
        }

        return result;
    }

    private string VideoUrl(string fileName) =>
        $"{Request.PathBase}/{RoutePrefix}/videos/{Uri.EscapeDataString(fileName)}";

    private string AudioUrl(string relativePath) =>
        $"{Request.PathBase}/{RoutePrefix}/audio?path={Uri.EscapeDataString(relativePath)}";

    public class HeartbeatRequest
    {
        public string? Ip { get; set; }
        public string? AppVersion { get; set; }
        public string? Mode { get; set; }
        public bool IsPlaying { get; set; }
        public bool Muted { get; set; }
        public string? CurrentFile { get; set; }
        /// <summary>Сколько секунд назад приставка последний раз успешно получила настройки; null — ни разу с запуска.</summary>
        public long? LastConfigOkSecondsAgo { get; set; }
        public string? LastError { get; set; }
        public int ItemsReady { get; set; }
        public int ItemsTotal { get; set; }
        public int BrokenItems { get; set; }
        public long? FreeSpaceMb { get; set; }
        public long? UptimeSeconds { get; set; }
        /// <summary>Часы приставки, мс с 1970 (UTC).</summary>
        public long? DeviceTimeMs { get; set; }
        /// <summary>Сколько секунд приставка работает с включения.</summary>
        public long? BootUptimeSeconds { get; set; }
        public string? NetworkType { get; set; }
        public int? WifiRssi { get; set; }
        public long? DownloadKbps { get; set; }
        public bool? HdmiConnected { get; set; }
        public long? RamFreeMb { get; set; }
        public long? RamTotalMb { get; set; }
        public long? RamPhysicalMb { get; set; }
        public int? NotEnoughSpaceItems { get; set; }
        public int? CpuTempC { get; set; }
        /// <summary>Адрес портала, на который ходит приставка (основной или запасной).</summary>
        public string? PortalHost { get; set; }
        public int? VolumePercent { get; set; }
        public bool? SystemMuted { get; set; }
        /// <summary>"line", "hdmi" или "default".</summary>
        public string? AudioOutput { get; set; }
        /// <summary>Сколько секунд воспроизведение стоит на месте (присылается, если 30+).</summary>
        public long? StalledSeconds { get; set; }
        public int? FreezesLastHour { get; set; }
        public bool? HasRoot { get; set; }
        public bool? DeviceOwner { get; set; }
        /// <summary>Только в первом сигнале после обрыва: длительность обрыва, секунды.</summary>
        public long? OutageSeconds { get; set; }
        /// <summary>Только в первом сигнале после обрыва: доля времени, когда шёл контент (0–100).</summary>
        public int? OutagePlayingPercent { get; set; }
        /// <summary>Сколько секунд назад приставка последний раз перезагрузилась сама.</summary>
        public long? LastAutoRebootSecondsAgo { get; set; }
        /// <summary>Причина: "uptime", "playback_stall", "app_hang", "no_content".</summary>
        public string? LastAutoRebootReason { get; set; }
    }

    public class DeviceConfigDto
    {
        /// <summary>"video" или "music". Смешанный режим больше не поддерживается.</summary>
        public string Mode { get; set; } = "video";
        public string? MuteStartTime { get; set; }
        public string? MuteEndTime { get; set; }
        public List<DeviceVideoDto> Videos { get; set; } = [];
        /// <summary>Имена видео с Available = false. Для диагностики.</summary>
        public List<string> MissingVideos { get; set; } = [];
    }

    public class DeviceVideoDto
    {
        public string Name { get; set; } = string.Empty;
        /// <summary>Файл есть в папке и его можно скачать. false — файла нет: качать не нужно, кэш не трогать.</summary>
        public bool Available { get; set; }
        public long SizeBytes { get; set; }
        public string Url { get; set; } = string.Empty;
    }

    public class DeviceAudioDto
    {
        public string Name { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        /// <summary>Точный размер: по нему приставка находит недокачанные и испорченные копии и перекачивает их.</summary>
        public long SizeBytes { get; set; }
        public string Url { get; set; } = string.Empty;
    }
}
