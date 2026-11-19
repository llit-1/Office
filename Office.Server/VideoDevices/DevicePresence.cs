using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.VideoDevices;

/// <summary>
/// Статус приставки по её сигналам:
/// - <c>playing</c> — сигнал свежий, контент показывается и всё в порядке;
/// - <c>problem</c> — сигнал свежий, но что-то не так (экран пустой, нет синхронизации, сломанные файлы…);
/// - <c>offline</c> — сигнала нет дольше порога (по умолчанию 5 минут при сигнале раз в 2 минуты).
/// Приставки со старым приложением сигналов не шлют — для них статус не определяется (null).
///
/// Нет связи — ещё не неисправность: на точках часто пропадает интернет, а приставка продолжает показывать
/// кэш. Поэтому для <c>offline</c> отдаются проблемы на момент последнего сигнала, а «требует внимания»
/// (<see cref="PresenceDto.Attention"/>) ставится, только если перед пропажей уже была проблема или связи
/// нет дольше <c>VideoDevices:OfflineAttentionHours</c> (по умолчанию сутки).
/// </summary>
public static class DevicePresence
{
    public const string Playing = "playing";
    public const string Problem = "problem";
    public const string Offline = "offline";

    /// <summary>Красный — контент не доходит до зрителя, реагировать сразу.</summary>
    public const string SeverityCritical = "critical";
    /// <summary>Жёлтый — работает, но деградирует или скоро сломается.</summary>
    public const string SeverityWarning = "warning";

    public static readonly TimeSpan DefaultOfflineAfter = TimeSpan.FromMinutes(5);

    /// <summary>Настройки дольше этого не обновлялись — повод показать проблему (обычная проверка — раз в час).</summary>
    private static readonly TimeSpan ConfigStaleAfter = TimeSpan.FromHours(3);

    /// <summary>Часы сбиты на 5 минут и больше — расписание тишины включается не вовремя.</summary>
    private const int ClockSkewProblemSeconds = 5 * 60;
    /// <summary>Новый ролик — 100–230 МБ: меньше гигабайта — скоро не влезет, меньше 300 МБ — уже не влезает.</summary>
    private const long LowFreeSpaceMb = 1024;
    private const long CriticalFreeSpaceMb = 300;
    private const int WarmCpuC = 80;
    private const int HotCpuC = 90;
    private const int WeakWifiRssi = -75;
    /// <summary>Приложение перезапускает плеер после минуты зависания; 30 с — уже видно, что что-то не так.</summary>
    private const long StalledProblemSeconds = 30;
    /// <summary>Столько перезапусков зависшего плеера за час — уже не случайность (файл или декодер).</summary>
    private const int FreezesProblemPerHour = 3;
    private const int QuietVolumePercent = 20;
    /// <summary>Скачивание нового контента — дело обычное (плюс случайная задержка до 10 минут); проблема — если не докачалось за 2 часа.</summary>
    public static readonly TimeSpan IncompleteDownloadGrace = TimeSpan.FromHours(2);
    /// <summary>Битые треки в музыке приставка пропускает: проблема — от 10 треков или 5% библиотеки.</summary>
    private const int BrokenTracksProblem = 10;
    private const double BrokenTracksProblemShare = 0.05;
    private static readonly TimeSpan RecentBoot = TimeSpan.FromMinutes(30);

    public static TimeSpan OfflineAfter(IConfiguration configuration)
    {
        var minutes = configuration.GetValue("VideoDevices:HeartbeatOfflineMinutes", DefaultOfflineAfter.TotalMinutes);
        return minutes > 0 ? TimeSpan.FromMinutes(minutes) : DefaultOfflineAfter;
    }

    public static readonly TimeSpan DefaultOfflineAttentionAfter = TimeSpan.FromHours(24);

    /// <summary>Сколько недавний обрыв связи показывается в замечаниях после восстановления.</summary>
    private static readonly TimeSpan OutageNoticeFor = TimeSpan.FromHours(24);
    /// <summary>Сколько показывать замечание «сама перезагрузилась».</summary>
    private static readonly TimeSpan AutoRebootNoticeWindow = TimeSpan.FromHours(24);

    public static string AutoRebootReasonText(string? reason) => reason switch
    {
        "uptime" => "плановая, долго работала без перезагрузки",
        "playback_stall" => "видео или музыка зависали, перезапуск плеера не помог",
        "app_hang" => "зависло приложение",
        "no_content" => "долго ничего не показывала, перезапуск приложения не помог",
        _ => "причина неизвестна"
    };

    public static TimeSpan OfflineAttentionAfter(IConfiguration configuration)
    {
        var hours = configuration.GetValue("VideoDevices:OfflineAttentionHours", DefaultOfflineAttentionAfter.TotalHours);
        return hours > 0 ? TimeSpan.FromHours(hours) : DefaultOfflineAttentionAfter;
    }

    public static PresenceDto? Describe(VideoDeviceHeartbeat? heartbeat, DateTime nowUtc, TimeSpan offlineAfter) =>
        Describe(heartbeat, nowUtc, offlineAfter, DefaultOfflineAttentionAfter);

    public static PresenceDto? Describe(VideoDeviceHeartbeat? heartbeat, DateTime nowUtc, TimeSpan offlineAfter, TimeSpan offlineAttentionAfter)
    {
        if (heartbeat == null)
        {
            return null;
        }

        var offline = nowUtc - heartbeat.LastSeenUtc > offlineAfter;
        // Без связи судим по последнему сигналу: «давно не получала настройки» считаем на его момент,
        // а не на сейчас — иначе любой обрыв дольше 3 часов выглядел бы как поломка.
        var asOf = offline ? heartbeat.LastSeenUtc : nowUtc;
        // Два уровня. Красные — контент не доходит до зрителя (реагировать сразу), жёлтые — работает,
        // но деградирует или скоро сломается. В Problems красные идут первыми: первая — подпись на карточке.
        var critical = new List<string>();
        var warnings = new List<string>();
        var notices = new List<string>();
        var isMusic = heartbeat.Mode == "music";

        if (!heartbeat.IsPlaying)
        {
            // В режиме музыки экран и должен быть пустым — проблема в том, что нет звука.
            critical.Add(isMusic ? "Музыка не играет" : "Экран не показывает контент");
        }

        if (heartbeat.StalledSeconds is >= StalledProblemSeconds)
        {
            critical.Add($"{(isMusic ? "Музыка зависла" : "Изображение зависло")}: стоит {FormatDuration((int)Math.Min(heartbeat.StalledSeconds.Value, int.MaxValue))}");
        }

        if (heartbeat.HdmiConnected == false && !isMusic)
        {
            critical.Add("Экран не подключён (HDMI)");
        }

        // Звук важен только для музыки: ролики идут без звука. Тишина по расписанию — не проблема.
        if (isMusic && !heartbeat.Muted)
        {
            if (heartbeat.SystemMuted == true || heartbeat.VolumePercent == 0)
            {
                critical.Add("Звук выключен на приставке (громкость 0%)");
            }

            if (heartbeat.AudioOutput == "hdmi" && heartbeat.HdmiConnected == false)
            {
                critical.Add("Звук идёт в HDMI, а телевизор не подключён");
            }
        }

        // Приставка не качает то, что не помещается с запасом 400 МБ: контент из уже скачанного играет,
        // но новое не появится. Нехватка места и недокачка из-за неё — одна проблема, одна строка.
        // Старые сборки не сообщают NotEnoughSpaceItems — для них признак: скачано не всё и места мало.
        var incomplete = heartbeat.ItemsTotal > 0 && heartbeat.ItemsReady + heartbeat.BrokenItems < heartbeat.ItemsTotal;
        var spaceShort = heartbeat.NotEnoughSpaceItems is > 0 || (incomplete && heartbeat.FreeSpaceMb is < LowFreeSpaceMb);
        if (spaceShort)
        {
            var text = incomplete
                ? $"Не хватает места: скачано {heartbeat.ItemsReady} из {heartbeat.ItemsTotal}"
                : $"Не хватает места: не скачано файлов — {heartbeat.NotEnoughSpaceItems}";
            text += heartbeat.FreeSpaceMb is { } free ? $" (свободно {free} МБ)" : "";
            (heartbeat.FreeSpaceMb is < CriticalFreeSpaceMb ? critical : warnings).Add(text);
        }
        else if (heartbeat.FreeSpaceMb is < CriticalFreeSpaceMb)
        {
            critical.Add($"Мало места: {heartbeat.FreeSpaceMb} МБ");
        }
        else if (heartbeat.FreeSpaceMb is < LowFreeSpaceMb)
        {
            warnings.Add($"Мало места: {heartbeat.FreeSpaceMb} МБ");
        }

        // Сломанные файлы приставка в «готовые» не считает — это не недокачка, о них отдельная строка.
        // Недокачка — проблема, только если тянется дольше 2 часов (обычная загрузка нового ролика — не повод).
        if (!spaceShort && incomplete)
        {
            var since = heartbeat.IncompleteSinceUtc ?? heartbeat.LastSeenUtc;
            var text = $"Скачано {heartbeat.ItemsReady} из {heartbeat.ItemsTotal}";
            if (asOf - since > IncompleteDownloadGrace)
            {
                warnings.Add($"{text} — уже {FormatDuration((int)(asOf - since).TotalSeconds)}");
            }
            else
            {
                notices.Add($"{text} — идёт загрузка");
            }
        }

        if (heartbeat.BrokenItems > 0)
        {
            // Роликов в плейлисте мало — каждый важен. Музыку приставка пропускает, пара битых треков незаметна.
            var manyBroken = !isMusic
                || heartbeat.BrokenItems >= BrokenTracksProblem
                || (heartbeat.ItemsTotal > 0 && heartbeat.BrokenItems >= heartbeat.ItemsTotal * BrokenTracksProblemShare);
            if (manyBroken)
            {
                warnings.Add($"Сломанных файлов: {heartbeat.BrokenItems}");
            }
            else
            {
                notices.Add($"Битых треков: {heartbeat.BrokenItems} — приставка их пропускает");
            }
        }

        if (heartbeat.LastConfigOkUtc == null || asOf - heartbeat.LastConfigOkUtc > ConfigStaleAfter)
        {
            warnings.Add(string.IsNullOrWhiteSpace(heartbeat.LastError)
                ? "Давно не получала настройки с портала"
                : $"Не получает настройки: {heartbeat.LastError}");
        }

        if (heartbeat.ClockSkewSeconds is { } skew && Math.Abs(skew) >= ClockSkewProblemSeconds)
        {
            warnings.Add($"Часы приставки {(skew > 0 ? "спешат" : "отстают")} на {FormatDuration(Math.Abs(skew))}");
        }

        if (heartbeat.FreezesLastHour is >= FreezesProblemPerHour)
        {
            warnings.Add($"Плеер зависал {heartbeat.FreezesLastHour} раз(а) за час — проверьте файл или приставку");
        }
        else if (heartbeat.FreezesLastHour is > 0)
        {
            notices.Add($"Плеер зависал за последний час: {heartbeat.FreezesLastHour} раз(а) — перезапускался автоматически");
        }

        if (heartbeat.CpuTempC is >= HotCpuC)
        {
            warnings.Add($"Перегрев: {heartbeat.CpuTempC} °C — приставка может тормозить и зависать");
        }
        else if (heartbeat.CpuTempC is >= WarmCpuC)
        {
            notices.Add($"Сильно греется: {heartbeat.CpuTempC} °C");
        }

        var problems = critical.Concat(warnings).ToList();
        var presence = offline ? Offline : problems.Count == 0 ? Playing : Problem;

        // Без связи: судим по последнему сигналу. Была проблема перед пропажей или связи нет дольше порога — внимание.
        var attention = presence == Problem
            || (presence == Offline && (problems.Count > 0 || nowUtc - heartbeat.LastSeenUtc > offlineAttentionAfter));
        // Красный: контент не доходит до зрителя — или связи нет и перед этим уже было плохо / слишком долго.
        var severity = presence switch
        {
            Problem => critical.Count > 0 ? SeverityCritical : SeverityWarning,
            Offline when attention => SeverityCritical,
            _ => null
        };

        // Замечания на статус не влияют: всё работает, но стоит знать. Без связи их нет — данные устарели.
        if (presence == Offline)
        {
            notices.Clear();
        }
        else
        {
            // Музыке экран не нужен: отключённый HDMI не проблема и не замечание (если звук не через телевизор —
            // тот случай выше, как «нет звука»)
            if (isMusic && heartbeat.VolumePercent is > 0 and < QuietVolumePercent && heartbeat.SystemMuted != true)
            {
                notices.Add($"Тихо: громкость на приставке {heartbeat.VolumePercent}%");
            }

            if (heartbeat.HasRoot == false && heartbeat.DeviceOwner != true)
            {
                notices.Add("Нет root и прав владельца устройства: обновление только через ADB, перезагрузка и скриншот недоступны");
            }

            if (IsRamOverstated(heartbeat))
            {
                notices.Add($"Прошивка завышает объём памяти: заявлено {FormatGb(heartbeat.RamTotalMb!.Value)}, " +
                            $"на самом деле {FormatGb(heartbeat.RamPhysicalMb!.Value)} — приставка слабее, чем выглядит");
            }

            if (heartbeat.NetworkType == "wifi" && heartbeat.WifiRssi is <= WeakWifiRssi)
            {
                notices.Add($"Слабый Wi-Fi: {heartbeat.WifiRssi} дБм");
            }

            if (heartbeat.BootedAtUtc is { } bootedAt && nowUtc - bootedAt < RecentBoot)
            {
                notices.Add($"Включилась {FormatDuration((int)(nowUtc - bootedAt).TotalSeconds)} назад");
            }

            if (heartbeat.LastAutoRebootUtc is { } autoReboot && nowUtc - autoReboot < AutoRebootNoticeWindow)
            {
                notices.Add($"Сама перезагрузилась {FormatDuration((int)(nowUtc - autoReboot).TotalSeconds)} назад: {AutoRebootReasonText(heartbeat.LastAutoRebootReason)}");
            }

            if (DescribeOutage(heartbeat, nowUtc) is { } outage)
            {
                notices.Add(outage);
            }
        }

        return new PresenceDto
        {
            Status = presence,
            Attention = attention,
            Severity = severity,
            LastSeenUtc = DateTime.SpecifyKind(heartbeat.LastSeenUtc, DateTimeKind.Utc),
            Problems = problems,
            Notices = notices,
            LastError = heartbeat.LastError,
            AppVersion = heartbeat.AppVersion,
            CurrentFile = heartbeat.CurrentFile,
            Muted = heartbeat.Muted,
            ItemsReady = heartbeat.ItemsReady,
            ItemsTotal = heartbeat.ItemsTotal,
            FreeSpaceMb = heartbeat.FreeSpaceMb,
            UptimeSeconds = heartbeat.UptimeSeconds,
            Mode = heartbeat.Mode,
            BrokenItems = heartbeat.BrokenItems,
            LastConfigOkUtc = heartbeat.LastConfigOkUtc is { } configOk ? DateTime.SpecifyKind(configOk, DateTimeKind.Utc) : null,
            ClockSkewSeconds = heartbeat.ClockSkewSeconds,
            BootedAtUtc = heartbeat.BootedAtUtc is { } booted ? DateTime.SpecifyKind(booted, DateTimeKind.Utc) : null,
            LastAutoRebootUtc = heartbeat.LastAutoRebootUtc is { } rebooted ? DateTime.SpecifyKind(rebooted, DateTimeKind.Utc) : null,
            LastAutoRebootReason = heartbeat.LastAutoRebootReason is { } reason ? AutoRebootReasonText(reason) : null,
            NetworkType = heartbeat.NetworkType,
            WifiRssi = heartbeat.WifiRssi,
            DownloadKbps = heartbeat.DownloadKbps,
            PortalHost = heartbeat.PortalHost,
            HdmiConnected = heartbeat.HdmiConnected,
            RamFreeMb = heartbeat.RamFreeMb,
            RamTotalMb = heartbeat.RamTotalMb,
            RamPhysicalMb = heartbeat.RamPhysicalMb,
            NotEnoughSpaceItems = heartbeat.NotEnoughSpaceItems,
            CpuTempC = heartbeat.CpuTempC,
            VolumePercent = heartbeat.VolumePercent,
            SystemMuted = heartbeat.SystemMuted,
            AudioOutput = heartbeat.AudioOutput,
            StalledSeconds = heartbeat.StalledSeconds,
            FreezesLastHour = heartbeat.FreezesLastHour,
            HasRoot = heartbeat.HasRoot,
            DeviceOwner = heartbeat.DeviceOwner
        };
    }

    /// <summary>
    /// «Была без связи 3 ч (до 14:20) — контент шёл всё время». Обрыв, о котором приставка рассказала
    /// в первом сигнале после восстановления связи; показывается сутки.
    /// </summary>
    public static string? DescribeOutage(VideoDeviceHeartbeat heartbeat, DateTime nowUtc)
    {
        if (heartbeat.LastOutageEndedUtc is not { } ended || nowUtc - ended > OutageNoticeFor
            || heartbeat.LastOutageSeconds is not { } seconds || heartbeat.LastOutagePlayingPercent is not { } percent)
        {
            return null;
        }

        var endedLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(ended, DateTimeKind.Utc), MoscowTime);
        var played = percent >= 99 ? "контент шёл всё время"
            : percent == 0 ? "контент не шёл"
            : $"контент шёл {percent}% времени";
        return $"Была без связи {FormatDuration((int)Math.Min(seconds, int.MaxValue))} (до {endedLocal:HH:mm}) — {played}";
    }

    private static readonly TimeZoneInfo MoscowTime = FindMoscowTime();

    private static TimeZoneInfo FindMoscowTime()
    {
        foreach (var id in new[] { "Europe/Moscow", "Russian Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.CreateCustomTimeZone("MSK", TimeSpan.FromHours(3), "MSK", "MSK");
    }

    /// <summary>
    /// Прошивка-подделка: заявленный объём памяти заметно больше физического (ядро забирает себе несколько
    /// процентов, поэтому заявлено обычно чуть меньше физического — сравниваем с запасом 20%).
    /// </summary>
    public static bool IsRamOverstated(VideoDeviceHeartbeat heartbeat) =>
        heartbeat.RamTotalMb is > 0 && heartbeat.RamPhysicalMb is > 0
        && heartbeat.RamTotalMb.Value > heartbeat.RamPhysicalMb.Value * 1.2;

    private static string FormatGb(long mb) =>
        (mb / 1024.0).ToString("0.#", System.Globalization.CultureInfo.GetCultureInfo("ru-RU")) + " ГБ";

    /// <summary>«40 с», «12 мин», «3 ч 5 мин», «2 дн».</summary>
    public static string FormatDuration(int seconds)
    {
        if (seconds < 60)
        {
            return $"{seconds} с";
        }

        var minutes = seconds / 60;
        if (minutes < 60)
        {
            return $"{minutes} мин";
        }

        var hours = minutes / 60;
        if (hours < 24)
        {
            return minutes % 60 == 0 ? $"{hours} ч" : $"{hours} ч {minutes % 60} мин";
        }

        return $"{hours / 24} дн";
    }

    public class PresenceDto
    {
        public string Status { get; set; } = Offline;
        /// <summary>
        /// Требует внимания: есть проблема, или нет связи и перед этим уже была проблема, или нет связи дольше
        /// порога. Просто «нет связи» без этого — не неисправность (интернет на точке), карточка серая.
        /// </summary>
        public bool Attention { get; set; }
        /// <summary>"critical" (красный), "warning" (жёлтый) или null — всё в порядке / просто нет связи.</summary>
        public string? Severity { get; set; }
        public DateTime LastSeenUtc { get; set; }
        public List<string> Problems { get; set; } = [];
        public string? LastError { get; set; }
        public string? AppVersion { get; set; }
        public string? CurrentFile { get; set; }
        public bool Muted { get; set; }
        public int ItemsReady { get; set; }
        public int ItemsTotal { get; set; }
        public long? FreeSpaceMb { get; set; }
        public long? UptimeSeconds { get; set; }

        /// <summary>Замечания: на статус не влияют, показываются в диагностике.</summary>
        public List<string> Notices { get; set; } = [];
        public string? Mode { get; set; }
        public int BrokenItems { get; set; }
        public DateTime? LastConfigOkUtc { get; set; }
        public int? ClockSkewSeconds { get; set; }
        public DateTime? BootedAtUtc { get; set; }
        public DateTime? LastAutoRebootUtc { get; set; }
        /// <summary>Причина последней авто-перезагрузки — уже человеческим текстом.</summary>
        public string? LastAutoRebootReason { get; set; }
        public string? NetworkType { get; set; }
        public int? WifiRssi { get; set; }
        public long? DownloadKbps { get; set; }
        public string? PortalHost { get; set; }
        public bool? HdmiConnected { get; set; }
        public long? RamFreeMb { get; set; }
        public long? RamTotalMb { get; set; }
        public long? RamPhysicalMb { get; set; }
        public int? NotEnoughSpaceItems { get; set; }
        public int? CpuTempC { get; set; }
        public int? VolumePercent { get; set; }
        public bool? SystemMuted { get; set; }
        public string? AudioOutput { get; set; }
        public long? StalledSeconds { get; set; }
        public int? FreezesLastHour { get; set; }
        public bool? HasRoot { get; set; }
        public bool? DeviceOwner { get; set; }
    }
}
