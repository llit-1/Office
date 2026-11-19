using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    /// <summary>
    /// Последний сигнал «я на связи» от приставки (приложение 2.0+, раз в 2 минуты).
    /// Отдельная таблица: VideoDevices общая со старым порталом, её схему не трогаем.
    /// Таблицу создаёт VideoDeviceHeartbeatSchemaInitializer при старте портала.
    /// </summary>
    [Table("OfficeVideoDeviceHeartbeats")]
    public class VideoDeviceHeartbeat
    {
        [Key]
        public Guid DeviceGuid { get; set; }

        /// <summary>Время получения сигнала по часам сервера (часам приставки не доверяем).</summary>
        public DateTime LastSeenUtc { get; set; }

        /// <summary>Адрес, с которого пришёл сигнал (для диагностики).</summary>
        [MaxLength(64)]
        public string? RemoteIp { get; set; }

        [MaxLength(20)]
        public string? AppVersion { get; set; }

        [MaxLength(10)]
        public string? Mode { get; set; }

        /// <summary>Плеер действительно воспроизводит (а не стоит на ошибке или загрузке).</summary>
        public bool IsPlaying { get; set; }

        /// <summary>Музыка идёт, но звук выключен по расписанию тишины.</summary>
        public bool Muted { get; set; }

        [MaxLength(260)]
        public string? CurrentFile { get; set; }

        public DateTime? LastConfigOkUtc { get; set; }

        [MaxLength(500)]
        public string? LastError { get; set; }

        /// <summary>Сколько файлов из плейлиста (или библиотеки музыки) готово к показу.</summary>
        public int ItemsReady { get; set; }

        public int ItemsTotal { get; set; }

        /// <summary>С какого сигнала скачано не всё (null — всё скачано): недокачка дольше 2 часов — проблема.</summary>
        public DateTime? IncompleteSinceUtc { get; set; }

        /// <summary>Сколько файлов приставка пропускает как сломанные.</summary>
        public int BrokenItems { get; set; }

        public long? FreeSpaceMb { get; set; }

        public long? UptimeSeconds { get; set; }

        /// <summary>Насколько часы приставки расходятся с часами сервера (+ — спешат). Сбитые часы ломают расписание тишины.</summary>
        public int? ClockSkewSeconds { get; set; }

        /// <summary>Когда приставку включили (по серверному времени): по скачкам видно перезагрузки и пропадание питания.</summary>
        public DateTime? BootedAtUtc { get; set; }

        /// <summary>Когда приставка последний раз перезагрузилась сама (по серверному времени).</summary>
        public DateTime? LastAutoRebootUtc { get; set; }

        /// <summary>Почему: "uptime", "playback_stall", "app_hang", "no_content".</summary>
        [MaxLength(20)]
        public string? LastAutoRebootReason { get; set; }

        /// <summary>"ethernet", "wifi", "other", "none".</summary>
        [MaxLength(10)]
        public string? NetworkType { get; set; }

        /// <summary>Уровень сигнала Wi-Fi, дБм.</summary>
        public int? WifiRssi { get; set; }

        /// <summary>Скорость последнего скачивания крупного файла, КБ/с.</summary>
        public long? DownloadKbps { get; set; }

        /// <summary>На какой адрес портала пришёл сигнал (основной или запасной).</summary>
        [MaxLength(100)]
        public string? PortalHost { get; set; }

        /// <summary>Подключён ли экран по HDMI; null — прошивка не сообщает.</summary>
        public bool? HdmiConnected { get; set; }

        public long? RamFreeMb { get; set; }

        /// <summary>Всего оперативной памяти, МБ.</summary>
        public long? RamTotalMb { get; set; }

        /// <summary>Сколько памяти стоит физически (по карте памяти ядра); прошивки-подделки завышают RamTotalMb.</summary>
        public long? RamPhysicalMb { get; set; }

        /// <summary>Сколько файлов приставка не скачала из-за нехватки места (держит запас 400 МБ).</summary>
        public int? NotEnoughSpaceItems { get; set; }

        public int? CpuTempC { get; set; }

        /// <summary>Последний обрыв связи, о котором приставка рассказала после восстановления: когда закончился…</summary>
        public DateTime? LastOutageEndedUtc { get; set; }

        /// <summary>…сколько длился…</summary>
        public long? LastOutageSeconds { get; set; }

        /// <summary>…и какую долю этого времени шёл контент (0–100).</summary>
        public int? LastOutagePlayingPercent { get; set; }

        /// <summary>Громкость музыки в системе приставки, 0–100.</summary>
        public int? VolumePercent { get; set; }

        /// <summary>Звук музыки выключен в системе приставки.</summary>
        public bool? SystemMuted { get; set; }

        /// <summary>Куда идёт звук: "line" (колонки), "hdmi" (телевизор), "default".</summary>
        [MaxLength(10)]
        public string? AudioOutput { get; set; }

        /// <summary>Сколько секунд воспроизведение стоит на месте (завис декодер); null — идёт.</summary>
        public long? StalledSeconds { get; set; }

        /// <summary>Сколько раз за час приложение перезапускало зависший плеер.</summary>
        public int? FreezesLastHour { get; set; }

        /// <summary>Есть root: обновление, перезагрузка и скриншот без ADB.</summary>
        public bool? HasRoot { get; set; }

        /// <summary>Приложение — владелец устройства: обновление и перезагрузка без ADB и без root.</summary>
        public bool? DeviceOwner { get; set; }
    }
}
