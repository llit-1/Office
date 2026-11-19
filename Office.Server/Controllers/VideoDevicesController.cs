using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Security;
using Office.Server.VideoDevices;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "VideoDevices")]
    public class VideoDevicesController : ControllerBase
    {
        private static readonly Guid[] TestLocationTypeGuids =
        [
            Guid.Parse("3810B715-2164-4524-F182-08DBF1A777FF"),
            Guid.Parse("3DC24D14-FAE6-4993-A403-C4142755409A"),
            Guid.Parse("8FE12BFC-1860-4B79-8763-81C984E2A643")
        ];

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        private readonly RKNETDBContext _context;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<VideoDevicesController> _logger;
        private readonly VideoPreviewTickets _previewTickets;

        public VideoDevicesController(
            RKNETDBContext context,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<VideoDevicesController> logger,
            VideoPreviewTickets previewTickets)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
            _previewTickets = previewTickets;
        }

        private string VideoTvRootPath => VideoLibrary.GetRootPath(_configuration);

        [HttpGet("devices")]
        public async Task<IActionResult> GetDevices()
        {
            var devices = await _context.VideoDevices
                .AsNoTracking()
                .Include(x => x.Location)
                .ThenInclude(x => x!.LocationType)
                .Include(x => x.Orientation)
                .OrderBy(x => x.Location != null ? x.Location.Name : string.Empty)
                .Select(x => new DeviceDto
                {
                    Guid = x.Guid,
                    LocationGuid = x.LocationGuid,
                    LocationName = x.Location != null ? x.Location.Name : string.Empty,
                    LocationTypeGuid = x.Location != null ? x.Location.LocationTypeGuid : null,
                    Ip = x.Ip,
                    VideoList = x.VideoList,
                    OnlyMusic = x.OnlyMusic,
                    CustomAds = x.CustomAds,
                    MuteStartTime = x.MuteStartTime,
                    MuteEndTime = x.MuteEndTime,
                    Version = x.Version,
                    OrientationGuid = x.OrientationGuid,
                    OrientationName = x.Orientation != null ? x.Orientation.Name : null,
                    IsTestLocation = x.Location != null
                        && x.Location.LocationTypeGuid.HasValue
                        && TestLocationTypeGuids.Contains(x.Location.LocationTypeGuid.Value)
                })
                .ToListAsync();

            var presence = await LoadPresenceAsync();
            foreach (var device in devices)
            {
                device.Presence = presence.GetValueOrDefault(device.Guid);
            }

            return Ok(new
            {
                devices,
                serverVersion = GetActualVersion(),
                usedVideoNames = devices
                    .Select(x => NormalizeSingleVideoName(x.VideoList))
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(x => x)
                    .ToList()
            });
        }

        /// <summary>
        /// Статусы приставок по их сигналам (без опроса самих приставок). Страница админки
        /// запрашивает это раз в минуту, чтобы «нет связи» появлялось без перезагрузки.
        /// </summary>
        [HttpGet("devices/presence")]
        public async Task<IActionResult> GetDevicesPresence()
        {
            var presence = await LoadPresenceAsync();
            return Ok(presence.Select(x => new { deviceGuid = x.Key, presence = x.Value }));
        }

        private async Task<Dictionary<Guid, DevicePresence.PresenceDto>> LoadPresenceAsync()
        {
            var now = DateTime.UtcNow;
            var offlineAfter = DevicePresence.OfflineAfter(_configuration);
            var attentionAfter = DevicePresence.OfflineAttentionAfter(_configuration);
            var heartbeats = await _context.VideoDeviceHeartbeats.AsNoTracking().ToListAsync();
            return heartbeats
                .Select(x => (x.DeviceGuid, Presence: DevicePresence.Describe(x, now, offlineAfter, attentionAfter)))
                .Where(x => x.Presence != null)
                .ToDictionary(x => x.DeviceGuid, x => x.Presence!);
        }

        [HttpGet("form-data")]
        public async Task<IActionResult> GetFormData([FromQuery] Guid? deviceGuid)
        {
            var rootError = GetVideoTvRootAvailabilityError();
            if (rootError != null)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = rootError });
            }

            SyncVideoLibraryWithDisk();

            var videos = await _context.VideoInfo
                .AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new VideoOptionDto
                {
                    Guid = x.Guid,
                    Name = x.Name,
                    Position = x.Position
                })
                .ToListAsync();

            var locations = await _context.Locations
                .AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new LocationOptionDto
                {
                    Guid = x.Guid,
                    Name = x.Name
                })
                .ToListAsync();

            DeviceDto? device = null;
            if (deviceGuid.HasValue)
            {
                device = await _context.VideoDevices
                    .AsNoTracking()
                    .Include(x => x.Location)
                    .Where(x => x.Guid == deviceGuid.Value)
                    .Select(x => new DeviceDto
                    {
                        Guid = x.Guid,
                        LocationGuid = x.LocationGuid,
                        LocationName = x.Location != null ? x.Location.Name : string.Empty,
                        Ip = x.Ip,
                        VideoList = x.VideoList,
                        OnlyMusic = x.OnlyMusic,
                        CustomAds = x.CustomAds,
                        MuteStartTime = x.MuteStartTime,
                        MuteEndTime = x.MuteEndTime,
                        Version = x.Version,
                        OrientationGuid = x.OrientationGuid
                    })
                    .FirstOrDefaultAsync();
            }

            return Ok(new
            {
                videos,
                locations,
                customAdsDirectories = GetCustomAdsDirectoryNames(),
                device
            });
        }

        [HttpPost("devices")]
        public async Task<IActionResult> CreateDevice([FromBody] SaveDeviceRequest request)
        {
            var (validationError, ip) = await ValidateDeviceRequest(request, null);
            if (validationError != null)
            {
                return BadRequest(new { message = validationError });
            }

            var device = new VideoDevice
            {
                Guid = Guid.NewGuid(),
                LocationGuid = request.LocationGuid,
                Status = 1,
                Ip = ip,
                OrientationGuid = await GetDefaultOrientationGuid(),
                VideoList = VideoLibrary.SerializeVideoList(request.VideoNames),
                OnlyMusic = request.ContentType,
                CustomAds = NormalizeOptionalValue(request.CustomAds),
                MuteStartTime = NormalizeOptionalValue(request.MuteStartTime),
                MuteEndTime = NormalizeOptionalValue(request.MuteEndTime)
            };

            _context.VideoDevices.Add(device);
            await _context.SaveChangesAsync();
            return Ok(new { ok = true, deviceGuid = device.Guid });
        }

        [HttpPut("devices/{guid:guid}")]
        public async Task<IActionResult> UpdateDevice(Guid guid, [FromBody] SaveDeviceRequest request)
        {
            var device = await _context.VideoDevices.FirstOrDefaultAsync(x => x.Guid == guid);
            if (device == null)
            {
                return NotFound(new { message = "Устройство не найдено." });
            }

            var (validationError, ip) = await ValidateDeviceRequest(request, guid);
            if (validationError != null)
            {
                return BadRequest(new { message = validationError });
            }

            device.LocationGuid = request.LocationGuid;
            device.Status = 1;
            device.Ip = ip;
            device.VideoList = VideoLibrary.SerializeVideoList(request.VideoNames);
            device.OnlyMusic = request.ContentType;
            device.CustomAds = NormalizeOptionalValue(request.CustomAds);
            device.MuteStartTime = NormalizeOptionalValue(request.MuteStartTime);
            device.MuteEndTime = NormalizeOptionalValue(request.MuteEndTime);

            await _context.SaveChangesAsync();
            return Ok(new { ok = true });
        }

        [HttpDelete("devices/{guid:guid}")]
        public async Task<IActionResult> DeleteDevice(Guid guid)
        {
            var device = await _context.VideoDevices.FirstOrDefaultAsync(x => x.Guid == guid);
            if (device == null)
            {
                return NotFound(new { message = "Устройство не найдено." });
            }

            _context.VideoDevices.Remove(device);
            await _context.SaveChangesAsync();
            return Ok(new { ok = true });
        }

        [HttpPost("replace-video")]
        public async Task<IActionResult> ReplaceVideoInDevices([FromBody] ReplaceVideoRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FromVideo) || string.IsNullOrWhiteSpace(request.ToVideo))
            {
                return BadRequest(new { message = "Не выбраны видео для замены." });
            }

            var toVideoError = GetVideoNameError(request.ToVideo.Trim());
            if (toVideoError != null)
            {
                return BadRequest(new { message = toVideoError });
            }

            var fromValue = $"[{request.FromVideo.Trim()}]";
            var toValue = $"[{request.ToVideo.Trim()}]";
            var devices = await _context.VideoDevices
                .Where(x => x.VideoList == fromValue)
                .ToListAsync();

            foreach (var device in devices)
            {
                device.VideoList = toValue;
            }

            await _context.SaveChangesAsync();
            return Ok(new { ok = true, updatedCount = devices.Count });
        }

        [HttpGet("videos")]
        public IActionResult GetVideos()
        {
            var rootError = GetVideoTvRootAvailabilityError();
            if (rootError != null)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = rootError });
            }

            SyncVideoLibraryWithDisk();

            var videos = _context.VideoInfo
                .AsNoTracking()
                .OrderBy(x => x.Position)
                .ThenBy(x => x.Name)
                .AsEnumerable()
                .Select(x =>
                {
                    var fullPath = string.IsNullOrWhiteSpace(x.Path)
                        ? Path.Combine(VideoTvRootPath, x.Name)
                        : x.Path;
                    var fileInfo = new FileInfo(fullPath);
                    if (!fileInfo.Exists || !VideoLibrary.VideoExtensions.Contains(fileInfo.Extension))
                    {
                        return null;
                    }

                    return new VideoFileDto
                    {
                        Guid = x.Guid,
                        Position = x.Position,
                        Name = x.Name,
                        SizeInMb = Math.Round(fileInfo.Length / (1024.0 * 1024.0), 2),
                        PreviewTicket = _previewTickets.Issue(x.Guid)
                    };
                })
                .Where(x => x != null)
                .ToList();

            return Ok(videos);
        }

        [HttpGet("apks")]
        public IActionResult GetApkFiles()
        {
            var rootError = GetVideoTvRootAvailabilityError();
            if (rootError != null)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = rootError });
            }

            // Порядок тот же, что у GetActualVersion: первым в списке идёт «серверная версия».
            var files = VideoLibrary.OrderApkFiles(Directory
                    .EnumerateFiles(VideoTvRootPath, "*.apk", SearchOption.TopDirectoryOnly)
                    .Select(path => new FileInfo(path)))
                .Select(fileInfo => new ApkFileDto
                {
                    Name = fileInfo.Name,
                    Version = Path.GetFileNameWithoutExtension(fileInfo.Name),
                    SizeInMb = Math.Round(fileInfo.Length / (1024.0 * 1024.0), 2),
                    UpdatedAt = fileInfo.LastWriteTime
                })
                .ToList();

            return Ok(files);
        }

        [HttpPost("videos/{guid:guid}/position")]
        public async Task<IActionResult> SwapPosition(Guid guid, [FromBody] SwapPositionRequest request)
        {
            SyncVideoLibraryWithDisk();

            var currentVideo = await _context.VideoInfo.FirstOrDefaultAsync(x => x.Guid == guid);
            var targetVideo = await _context.VideoInfo.FirstOrDefaultAsync(x => x.Position == request.NewPosition);

            if (currentVideo == null || targetVideo == null)
            {
                return NotFound(new { message = "Видео или позиция не найдены." });
            }

            var oldPosition = currentVideo.Position;
            targetVideo.Position = oldPosition;
            currentVideo.Position = request.NewPosition;
            await _context.SaveChangesAsync();
            return Ok(new { ok = true });
        }

        /// <summary>
        /// Превью видео для &lt;video src&gt;. Браузер не шлёт JWT, поэтому доступ — по тикету из GET videos.
        /// Раньше здесь был GetFile(path), который отдавал любой файл с сервера по произвольному пути.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("videos/preview/{ticket}")]
        public async Task<IActionResult> GetVideoPreview(string ticket)
        {
            if (!_previewTickets.TryGet(ticket, out var videoGuid))
            {
                return Unauthorized(new { message = "Ссылка на видео истекла. Обновите список видео." });
            }

            var name = await _context.VideoInfo
                .AsNoTracking()
                .Where(x => x.Guid == videoGuid)
                .Select(x => x.Name)
                .FirstOrDefaultAsync();
            if (name == null
                || !VideoLibrary.TryResolveVideoFile(VideoTvRootPath, name, out var fullPath)
                || !System.IO.File.Exists(fullPath))
            {
                return NotFound(new { message = "Файл не найден." });
            }

            FileStream stream;
            try
            {
                stream = VideoLibrary.OpenForServing(fullPath);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _logger.LogWarning(ex, "Preview file is busy or unreadable: {Path}", fullPath);
                return StatusCode(StatusCodes.Status503ServiceUnavailable,
                    new { message = "Файл сейчас недоступен (возможно, ещё копируется)." });
            }

            SafeFileHeaders.Apply(Response, name);
            return File(stream, VideoLibrary.ContentTypeFor(name), enableRangeProcessing: true);
        }

        /// <summary>Проверка связи с новой приставкой (ещё не сохранённой), поэтому IP может быть не из БД.</summary>
        [HttpPost("devices/check")]
        public async Task<IActionResult> TryToConnectDevice([FromBody] DeviceIpRequest request)
        {
            if (!VideoLibrary.TryNormalizeDeviceAddress(request.Ip, out var ip))
            {
                return BadRequest(new { message = InvalidIpMessage });
            }

            var result = await GetDeviceStatusResult(Guid.Empty, ip, GetActualVersion());
            await UpdateDeviceVersion(result);

            return Ok(new
            {
                ok = result.Ok,
                status = result.Status,
                serverVersion = result.ServerVersion,
                versionFromDevice = result.VersionFromDevice,
                errorMessage = result.ErrorMessage
            });
        }

        [HttpPost("devices/status")]
        public async Task<IActionResult> GetDeviceStatus([FromBody] DeviceIpRequest request)
        {
            var (error, ip) = await ResolveRegisteredDeviceAsync(request.Ip);
            if (error != null)
            {
                return error;
            }

            var result = await GetDeviceStatusResult(Guid.Empty, ip, GetActualVersion());
            await UpdateDeviceVersion(result);

            return Ok(new
            {
                ok = result.Ok,
                status = result.Status,
                serverVersion = result.ServerVersion,
                versionFromDevice = result.VersionFromDevice,
                errorMessage = result.ErrorMessage
            });
        }

        [HttpPost("devices/status/batch")]
        public async Task<IActionResult> GetDevicesStatus([FromBody] DeviceStatusBatchRequest request)
        {
            var devices = await FilterRegisteredDevicesAsync(request.Devices);

            if (devices.Count == 0)
            {
                return Ok(new { devices = Array.Empty<DeviceStatusResult>() });
            }

            var serverVersion = GetActualVersion();

            using var gate = new SemaphoreSlim(MaxParallelDeviceChecks);
            var results = await Task.WhenAll(devices.Select(device =>
                CheckDeviceLimited(gate, device.Guid, device.Ip, serverVersion)));
            var versionsByIp = results
                .Where(x => !string.IsNullOrWhiteSpace(x.VersionFromDevice))
                .GroupBy(x => x.Ip)
                .ToDictionary(x => x.Key, x => x.First().VersionFromDevice!);

            if (versionsByIp.Count > 0)
            {
                var ips = versionsByIp.Keys.ToList();
                var dbDevices = await _context.VideoDevices
                    .Where(x => ips.Contains(x.Ip.Trim()))
                    .ToListAsync();

                foreach (var device in dbDevices)
                {
                    var ip = device.Ip.Trim();
                    if (versionsByIp.TryGetValue(ip, out var versionFromDevice) && device.Version != versionFromDevice)
                    {
                        device.Version = versionFromDevice;
                    }
                }

                await _context.SaveChangesAsync();
            }

            return Ok(new { devices = results });
        }

        [HttpPost("devices/status/stream")]
        public async Task StreamDevicesStatus([FromBody] DeviceStatusBatchRequest request)
        {
            var devices = await FilterRegisteredDevicesAsync(request.Devices);

            Response.ContentType = "application/x-ndjson; charset=utf-8";

            if (devices.Count == 0)
            {
                return;
            }

            var serverVersion = GetActualVersion();
            using var gate = new SemaphoreSlim(MaxParallelDeviceChecks);
            var tasks = devices
                .Select(device => CheckDeviceLimited(gate, device.Guid, device.Ip, serverVersion))
                .ToList();

            while (tasks.Count > 0)
            {
                var finishedTask = await Task.WhenAny(tasks);
                tasks.Remove(finishedTask);

                var result = await finishedTask;
                await UpdateDeviceVersion(result);

                var line = JsonSerializer.Serialize(result, JsonOptions) + "\n";
                await Response.WriteAsync(line);
                await Response.Body.FlushAsync();
            }
        }

        [HttpPost("devices/reload")]
        public async Task<IActionResult> ReloadDevice([FromBody] DeviceIpRequest request)
        {
            var (error, ip) = await ResolveRegisteredDeviceAsync(request.Ip);
            if (error != null)
            {
                return error;
            }

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);

                using var response = await client.GetAsync($"http://{ip}?action=reload");
                if (!response.IsSuccessStatusCode)
                {
                    return Ok(new { ok = false, errorMessage = $"Не удалось перезагрузить: {response.StatusCode}" });
                }

                return Ok(new { ok = true, data = $"Success: {ip}" });
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, errorMessage = GetDeviceRequestErrorMessage(ex, "Приставка не ответила за 10 секунд.", "Не удалось перезапустить приложение на приставке.") });
            }
        }

        /// <summary>
        /// Команды диагностики (приложение 2.0+): «синхронизировать сейчас», «перекачать файл», «перезагрузить
        /// приставку». Уходят на порт 8080 приставки с ключом приставок — без него приставка их не выполнит.
        /// </summary>
        [HttpPost("devices/command")]
        public async Task<IActionResult> SendDeviceCommand([FromBody] DeviceCommandRequest request)
        {
            if (request.Command is not ("sync" or "redownload" or "reboot" or "volume" or "update" or "owner-release"))
            {
                return BadRequest(new { message = "Неизвестная команда." });
            }

            var fileName = request.FileName?.Trim() ?? string.Empty;
            if (request.Command == "redownload" && !IsSafeDeviceFileName(fileName))
            {
                return BadRequest(new { message = "Укажите имя файла." });
            }

            if (request.Command == "volume" && request.Value is not (>= 0 and <= 100))
            {
                return BadRequest(new { message = "Громкость — число от 0 до 100." });
            }

            // Приставка скачает APK у портала сама (api/video-device/apk) — проверяем, что такой файл есть
            if (request.Command == "update"
                && (!VideoLibrary.TryResolveApkFile(VideoTvRootPath, fileName, out var apkPath) || !System.IO.File.Exists(apkPath)))
            {
                return BadRequest(new { message = $"APK «{fileName}» не найден в папке ВидеоТВ." });
            }

            var key = _configuration[DeviceApiKeyAttribute.ConfigKey];
            if (string.IsNullOrWhiteSpace(key))
            {
                return Ok(new { ok = false, errorMessage = "На портале не задан ключ приставок (VideoDevices:DeviceApiKey)." });
            }

            var (error, ip) = await ResolveRegisteredDeviceAsync(request.Ip);
            if (error != null)
            {
                return error;
            }

            var url = $"http://{ip}/?action={request.Command}";
            if (request.Command is "redownload" or "update")
            {
                url += "&param1=" + Uri.EscapeDataString(fileName);
            }
            else if (request.Command == "volume")
            {
                url += "&param1=" + request.Value;
            }

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                using var message = new HttpRequestMessage(HttpMethod.Get, url);
                message.Headers.TryAddWithoutValidation(DeviceApiKeyAttribute.HeaderName, key);
                using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead);
                var text = await ReadLimitedAsync(response, 4096);
                var deviceMessage = TryReadDeviceMessage(text);

                _logger.LogInformation("Device command {Command} {File} -> {Ip}: {Status}", request.Command, fileName, ip, (int)response.StatusCode);
                if (response.IsSuccessStatusCode)
                {
                    return Ok(new { ok = true, data = deviceMessage ?? "Готово" });
                }

                // Старое приложение не знает этих команд и отвечает «Unknown action»
                var errorMessage = deviceMessage
                    ?? (response.StatusCode == System.Net.HttpStatusCode.BadRequest
                        ? "Приложение на приставке не поддерживает эту команду — обновите его до последней версии."
                        : $"Приставка ответила {(int)response.StatusCode}.");
                return Ok(new { ok = false, errorMessage });
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, errorMessage = GetDeviceRequestErrorMessage(ex, "Приставка не ответила за 10 секунд.", "Не удалось отправить команду на приставку.") });
            }
        }

        /// <summary>Имя файла без пути — приставка ищет его только в своих папках с контентом.</summary>
        public static bool IsSafeDeviceFileName(string? name) =>
            !string.IsNullOrWhiteSpace(name)
            && name.Length <= 260
            && name.Trim() is not ("." or "..")
            && name.IndexOfAny(['/', '\\']) < 0
            && !name.Any(char.IsControl);

        private static async Task<string> ReadLimitedAsync(HttpResponseMessage response, int maxBytes)
        {
            await using var stream = await response.Content.ReadAsStreamAsync();
            var buffer = new byte[maxBytes];
            var total = 0;
            int read;
            while (total < maxBytes && (read = await stream.ReadAsync(buffer.AsMemory(total, maxBytes - total))) > 0)
            {
                total += read;
            }

            return Encoding.UTF8.GetString(buffer, 0, total);
        }

        private static string? TryReadDeviceMessage(string text)
        {
            try
            {
                using var json = JsonDocument.Parse(text);
                return json.RootElement.TryGetProperty("message", out var message) && message.ValueKind == JsonValueKind.String
                    ? message.GetString()
                    : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        /// <summary>
        /// Сделать приложение «владельцем устройства» (device owner) — для приставок без root: после этого
        /// приложение само ставит обновления и перезагружает приставку, без ADB. Выполняется один раз через ADB.
        /// Android откажет, если на приставке добавлены аккаунты (например, Google) — текст ошибки вернём как есть.
        /// Снять права можно командой owner-release (без сброса приставки).
        /// </summary>
        [HttpPost("devices/grant-owner")]
        public async Task<IActionResult> GrantDeviceOwner([FromBody] DeviceIpRequest request)
        {
            var (error, ip) = await ResolveRegisteredDeviceAsync(request.Ip);
            if (error != null)
            {
                return error;
            }

            var appSettings = GetAndroidAppSettings();
            if (appSettings.ErrorMessage != null)
            {
                return Ok(new { ok = false, errorMessage = appSettings.ErrorMessage });
            }

            var adbTarget = $"{VideoLibrary.HostOf(ip)}:5555";
            try
            {
                var adbPath = GetAdbPath();
                var connectResult = await RunProcessAsync(adbPath, ["connect", adbTarget], TimeSpan.FromMinutes(2));
                if (!connectResult.Success || IsAdbConnectFailed(connectResult.Output))
                {
                    return Ok(new { ok = false, errorMessage = $"Не удалось подключиться по ADB к {adbTarget}. {connectResult.Output}".Trim() });
                }

                var component = $"{appSettings.PackageName}/.admin.VideoDeviceAdminReceiver";
                var result = await RunProcessAsync(adbPath, ["-s", adbTarget, "shell", "dpm", "set-device-owner", component], TimeSpan.FromMinutes(2));
                _logger.LogInformation("Grant device owner on {Target}: {Output}", adbTarget, result.Output);
                if (!result.Output.Contains("Success", StringComparison.OrdinalIgnoreCase))
                {
                    return Ok(new { ok = false, errorMessage = $"Android не выдал права владельца: {result.Output}".Trim() });
                }

                return Ok(new { ok = true, data = "Права владельца устройства выданы" });
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, errorMessage = $"Не удалось выполнить ADB-команду: {ex.Message}" });
            }
        }

        [HttpPost("devices/start-app")]
        public async Task<IActionResult> StartDeviceApp([FromBody] DeviceIpRequest request)
        {
            var (error, ip) = await ResolveRegisteredDeviceAsync(request.Ip);
            if (error != null)
            {
                return error;
            }

            var appSettings = GetAndroidAppSettings();
            if (appSettings.ErrorMessage != null)
            {
                return Ok(new { ok = false, errorMessage = appSettings.ErrorMessage });
            }

            var adbPath = GetAdbPath();
            var host = VideoLibrary.HostOf(ip);
            var adbTarget = $"{host}:5555";

            try
            {
                var connectResult = await RunProcessAsync(adbPath, ["connect", adbTarget], TimeSpan.FromMinutes(5));
                if (!connectResult.Success || IsAdbConnectFailed(connectResult.Output))
                {
                    return Ok(new
                    {
                        ok = false,
                        errorMessage = $"Не удалось подключиться по ADB к {adbTarget}. {connectResult.Output}".Trim()
                    });
                }

                var startResult = await StartAndroidApp(adbPath, adbTarget, appSettings.PackageName!, appSettings.ActivityName!);

                if (!startResult.Success || IsAdbStartFailed(startResult.Output))
                {
                    return Ok(new
                    {
                        ok = false,
                        errorMessage = $"Не удалось запустить приложение через ADB. {startResult.Output}".Trim()
                    });
                }

                return Ok(new { ok = true, adbOutput = startResult.Output, componentName = $"{appSettings.PackageName}/{appSettings.ActivityName}" });
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, errorMessage = $"Не удалось выполнить ADB-команду: {ex.Message}" });
            }
        }

        [HttpPost("devices/update-app")]
        public async Task<IActionResult> UpdateDeviceApp([FromBody] UpdateDeviceAppRequest request)
        {
            var (error, ip) = await ResolveRegisteredDeviceAsync(request.Ip);
            if (error != null)
            {
                return error;
            }

            if (string.IsNullOrWhiteSpace(request.ApkName))
            {
                return BadRequest(new { message = "APK файл не выбран." });
            }

            var host = VideoLibrary.HostOf(ip);
            var adbTarget = $"{host}:5555";
            var installApkPath = string.Empty;
            var connected = false;
            AndroidAppSettings? appSettingsForRecovery = null;
            string? adbPathForRecovery = null;

            try
            {
                var apkPath = GetSafeApkPath(request.ApkName);
                if (apkPath == null)
                {
                    return NotFound(new { message = "APK файл не найден." });
                }

                if (!System.IO.File.Exists(apkPath))
                {
                    return NotFound(new { message = $"APK файл не найден или недоступен: {request.ApkName}" });
                }

                var appSettings = GetAndroidAppSettings();
                if (appSettings.ErrorMessage != null)
                {
                    return Ok(new { ok = false, errorMessage = appSettings.ErrorMessage });
                }

                var adbPath = GetAdbPath();
                adbPathForRecovery = adbPath;
                appSettingsForRecovery = appSettings;
                installApkPath = CopyApkToAdbSafeTempPath(apkPath);

                var connectResult = await RunProcessAsync(adbPath, ["connect", adbTarget], TimeSpan.FromMinutes(5));
                if (!connectResult.Success || IsAdbConnectFailed(connectResult.Output))
                {
                    return Ok(new
                    {
                        ok = false,
                        errorMessage = $"Не удалось подключиться по ADB к {adbTarget}. {connectResult.Output}".Trim()
                    });
                }

                connected = true;

                // Место проверяем заранее: на приставках с маленькой памятью музыка забивает её целиком,
                // и Android отказывает в установке («not enough space») — понятнее сказать об этом сразу.
                var freeMb = await GetFreeDataSpaceMbAsync(adbPath, adbTarget);
                if (freeMb is < MinFreeSpaceForInstallMb)
                {
                    return Ok(new
                    {
                        ok = false,
                        errorMessage = $"На приставке почти нет места ({freeMb} МБ свободно) — Android не установит APK. Освободите место."
                    });
                }

                // Приложение перед установкой не останавливаем: install -r сам заменит его и перезапустит процесс.
                // Раньше здесь был force-stop, и если установка падала, приставка оставалась с тёмным экраном.
                var installResult = await RunProcessAsync(adbPath, ["-s", adbTarget, "install", "-r", installApkPath], TimeSpan.FromMinutes(5));
                if (!installResult.Success || IsAdbInstallFailed(installResult.Output))
                {
                    return Ok(new
                    {
                        ok = false,
                        errorMessage = $"Не удалось установить APK через ADB. {installResult.Output}".Trim()
                    });
                }

                var startResult = await StartAndroidApp(adbPath, adbTarget, appSettings.PackageName!, appSettings.ActivityName!);
                if (!startResult.Success || IsAdbStartFailed(startResult.Output))
                {
                    return Ok(new
                    {
                        ok = false,
                        errorMessage = $"APK установлен, но приложение не запустилось. {startResult.Output}".Trim()
                    });
                }

                var versionFromApk = Path.GetFileNameWithoutExtension(apkPath);
                var device = await _context.VideoDevices.FirstOrDefaultAsync(x => x.Ip.Trim() == ip);
                // Имя APK вида "2.0-test" — не версия: в БД не пишем, приставка сама сообщит версию при проверке статуса.
                if (device != null && VideoLibrary.IsValidAppVersion(versionFromApk))
                {
                    device.Version = versionFromApk;
                    await _context.SaveChangesAsync();
                }

                return Ok(new
                {
                    ok = true,
                    version = versionFromApk,
                    installOutput = installResult.Output,
                    startOutput = startResult.Output
                });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogError(ex, "VideoDevices app update configuration error. Ip={Ip}, ApkName={ApkName}", request.Ip, request.ApkName);
                return Ok(new { ok = false, errorMessage = ex.Message });
            }
            catch (IOException ex)
            {
                _logger.LogError(ex, "VideoDevices app update file access error. Ip={Ip}, ApkName={ApkName}", request.Ip, request.ApkName);
                return Ok(new { ok = false, errorMessage = $"Не удалось получить доступ к APK файлу: {ex.Message}" });
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogError(ex, "VideoDevices app update access denied. Ip={Ip}, ApkName={ApkName}", request.Ip, request.ApkName);
                return Ok(new { ok = false, errorMessage = $"Нет доступа к APK файлу: {ex.Message}" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "VideoDevices app update unexpected error. Ip={Ip}, ApkName={ApkName}", request.Ip, request.ApkName);
                return Ok(new { ok = false, errorMessage = $"Не удалось обновить приложение через ADB: {ex.Message}" });
            }
            finally
            {
                TryDeleteTempApk(installApkPath);
                // Что бы ни случилось с установкой, приставка не должна остаться без приложения на экране.
                // Сделать его рабочим столом по умолчанию: иначе после падения Android показывает окно выбора
                // лаунчера, и точка стоит с тёмным экраном, пока кто-нибудь не нажмёт.
                if (connected && adbPathForRecovery != null && appSettingsForRecovery?.PackageName != null)
                {
                    await EnsureAppRunningAsync(adbPathForRecovery, adbTarget, appSettingsForRecovery.PackageName, appSettingsForRecovery.ActivityName!);
                }
            }
        }

        /// <summary>Ниже этого Android обычно отказывает в установке (порог «мало места» ~10% раздела данных).</summary>
        private const long MinFreeSpaceForInstallMb = 350;

        private static async Task<long?> GetFreeDataSpaceMbAsync(string adbPath, string adbTarget)
        {
            try
            {
                // df -k /data: последняя строка, 4-й столбец — свободно, КБ
                var result = await RunProcessAsync(adbPath, ["-s", adbTarget, "shell", "df", "-k", "/data"], TimeSpan.FromSeconds(30));
                return VideoLibrary.ParseDfFreeMb(result.Output);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>Сделать приложение рабочим столом по умолчанию и запустить. Ошибки не важны — это страховка.</summary>
        private async Task EnsureAppRunningAsync(string adbPath, string adbTarget, string packageName, string activityName)
        {
            try
            {
                var component = $"{packageName}/{NormalizeAndroidActivityName(packageName, activityName)}";
                await RunProcessAsync(adbPath, ["-s", adbTarget, "shell", "cmd", "package", "set-home-activity", component], TimeSpan.FromSeconds(30));
                await StartAndroidApp(adbPath, adbTarget, packageName, activityName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not ensure app is running on {Target}", adbTarget);
            }
        }

        [HttpGet("devices/screenshot")]
        public async Task<IActionResult> GetScreenshot([FromQuery] string ip)
        {
            var (error, normalizedIp) = await ResolveRegisteredDeviceAsync(ip);
            if (error != null)
            {
                return error;
            }

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(30);

                using var response = await client.GetAsync($"http://{normalizedIp}?action=screen");
                if (!response.IsSuccessStatusCode)
                {
                    return Ok(new { ok = false, errorMessage = $"Не удалось получить скриншот: {response.StatusCode}" });
                }

                var content = await response.Content.ReadAsByteArrayAsync();
                // Отдаём только PNG: тело чужого ответа не должно уходить пользователю как есть.
                // Проверяем сигнатуру, а не Content-Type: приставка шлёт этот заголовок дважды.
                if (!content.AsSpan().StartsWith(PngSignature))
                {
                    return Ok(new { ok = false, errorMessage = "Приставка вернула не изображение." });
                }

                return File(content, "image/png");
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, errorMessage = GetDeviceRequestErrorMessage(ex, "Приставка не отдала скриншот за 30 секунд.", "Не удалось получить скриншот с приставки.") });
            }
        }

        private async Task<DeviceStatusResult> GetDeviceStatusResult(Guid guid, string ip, string serverVersion)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(15);
                // Приложение отвечает коротким номером версии; большой ответ — не наше приложение.
                client.MaxResponseContentBufferSize = 1024;

                using var response = await client.GetAsync($"http://{ip}/?action=getIP");
                if (response.IsSuccessStatusCode)
                {
                    var body = (await response.Content.ReadAsStringAsync()).Trim();
                    if (VideoLibrary.IsValidAppVersion(body))
                    {
                        return new DeviceStatusResult
                        {
                            Guid = guid,
                            Ip = ip,
                            Ok = true,
                            Status = "online",
                            ServerVersion = serverVersion,
                            VersionFromDevice = body
                        };
                    }

                    // Ответ не похож на версию приложения: тело не показываем и не сохраняем.
                    _logger.LogWarning("Device {Ip} answered on port 8080, but not with an app version", ip);
                }
            }
            catch
            {
                // fall back to ICMP ping below
            }

            var host = VideoLibrary.HostOf(ip);
            if (!string.IsNullOrWhiteSpace(host))
            {
                try
                {
                    using var ping = new System.Net.NetworkInformation.Ping();
                    var reply = await ping.SendPingAsync(host, 2000);
                    if (reply.Status == System.Net.NetworkInformation.IPStatus.Success)
                    {
                        return new DeviceStatusResult
                        {
                            Guid = guid,
                            Ip = ip,
                            Ok = true,
                            Status = "ping",
                            ServerVersion = serverVersion
                        };
                    }
                }
                catch
                {
                    // unreachable
                }
            }

            return new DeviceStatusResult
            {
                Guid = guid,
                Ip = ip,
                Ok = false,
                Status = "offline",
                ServerVersion = serverVersion,
                ErrorMessage = "Приставка не отвечает, ping недоступен."
            };
        }

        private async Task<DeviceStatusResult> CheckDeviceLimited(SemaphoreSlim gate, Guid guid, string ip, string serverVersion)
        {
            await gate.WaitAsync();
            try
            {
                return await GetDeviceStatusResult(guid, ip, serverVersion);
            }
            finally
            {
                gate.Release();
            }
        }

        private async Task UpdateDeviceVersion(DeviceStatusResult result)
        {
            if (!VideoLibrary.IsValidAppVersion(result.VersionFromDevice))
            {
                return;
            }

            var device = await _context.VideoDevices.FirstOrDefaultAsync(x => x.Ip.Trim() == result.Ip);
            if (device != null && device.Version != result.VersionFromDevice)
            {
                device.Version = result.VersionFromDevice;
                await _context.SaveChangesAsync();
            }
        }

        private static string GetDeviceRequestErrorMessage(Exception exception, string timeoutMessage, string fallbackMessage)
        {
            return exception is TaskCanceledException or TimeoutException
                ? timeoutMessage
                : fallbackMessage;
        }

        private const string InvalidIpMessage = "Укажите IP приставки в формате 10.0.0.1 или 10.0.0.1:8080 (только адреса локальной сети, порт приложения — 8080).";

        /// <summary>Сколько приставок опрашивается одновременно: 176 разом — лишняя пиковая нагрузка на сеть и сервер.</summary>
        private const int MaxParallelDeviceChecks = 16;
        private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

        /// <summary>
        /// Проверяет запрос и приводит данные к виду, который понимает приставка:
        /// IP — "x.x.x.x:порт", время тишины — "ЧЧ:ММ" (другой формат приложение молча игнорирует).
        /// </summary>
        private async Task<(string? Error, string Ip)> ValidateDeviceRequest(SaveDeviceRequest request, Guid? currentDeviceGuid)
        {
            if (request.LocationGuid == Guid.Empty)
            {
                return ("Выберите ТТ.", string.Empty);
            }

            if (!VideoLibrary.TryNormalizeDeviceAddress(request.Ip, out var ip))
            {
                return (InvalidIpMessage, string.Empty);
            }

            // Приставка находит свои настройки по IP, поэтому два устройства с одним адресом недопустимы.
            var ipTaken = await _context.VideoDevices
                .AnyAsync(x => x.Ip.Trim() == ip && (currentDeviceGuid == null || x.Guid != currentDeviceGuid));
            if (ipTaken)
            {
                return ($"Приставка с IP {ip} уже добавлена.", string.Empty);
            }

            var muteStartTime = NormalizeOptionalValue(request.MuteStartTime);
            var muteEndTime = NormalizeOptionalValue(request.MuteEndTime);

            if ((muteStartTime == null) != (muteEndTime == null))
            {
                return ("Необходимо указать и время выключения, и время включения звука.", string.Empty);
            }

            if (muteStartTime != null)
            {
                if (!TryNormalizeMuteTime(muteStartTime, out var normalizedStart))
                {
                    return ("Некорректное время выключения звука.", string.Empty);
                }

                if (!TryNormalizeMuteTime(muteEndTime!, out var normalizedEnd))
                {
                    return ("Некорректное время включения звука.", string.Empty);
                }

                request.MuteStartTime = normalizedStart;
                request.MuteEndTime = normalizedEnd;
            }

            var customAds = NormalizeOptionalValue(request.CustomAds);
            if (customAds != null)
            {
                var allowedDirectories = new HashSet<string>(GetCustomAdsDirectoryNames(), StringComparer.OrdinalIgnoreCase);
                if (!allowedDirectories.Contains(customAds))
                {
                    return ("Выбранная папка рекламы не найдена.", string.Empty);
                }
            }

            // Смешанный режим (0) больше не поддерживается: только видео (null) или музыка (1).
            if (request.ContentType is not null and not 1)
            {
                return ("Некорректный тип контента.", string.Empty);
            }

            foreach (var name in request.VideoNames.Select(x => x.Trim()).Where(x => x.Length > 0))
            {
                var videoError = GetVideoNameError(name);
                if (videoError != null)
                {
                    return (videoError, string.Empty);
                }
            }

            return (null, ip);
        }

        private string? GetVideoNameError(string name)
        {
            if (!VideoLibrary.IsStorableVideoName(name))
            {
                return $"Имя видео «{name}» содержит недопустимые символы (запятая, скобки или кавычки). Переименуйте файл.";
            }

            if (!VideoLibrary.TryResolveVideoFile(VideoTvRootPath, name, out var fullPath) || !System.IO.File.Exists(fullPath))
            {
                return $"Видео «{name}» не найдено в папке ВидеоТВ.";
            }

            return null;
        }

        public static bool TryNormalizeMuteTime(string value, out string normalized)
        {
            normalized = string.Empty;
            var parts = value.Trim().Split(':');
            if (parts.Length is < 2 or > 3
                || !int.TryParse(parts[0], out var hours) || hours is < 0 or > 23
                || !int.TryParse(parts[1], out var minutes) || minutes is < 0 or > 59
                || (parts.Length == 3 && parts[2] != "00"))
            {
                return false;
            }

            normalized = $"{hours:00}:{minutes:00}";
            return true;
        }

        /// <summary>
        /// Команды на приставку (HTTP 8080, ADB 5555) отправляются только на адреса зарегистрированных устройств.
        /// Иначе через портал можно было обратиться к любому хосту внутренней сети.
        /// </summary>
        private async Task<(IActionResult? Error, string Ip)> ResolveRegisteredDeviceAsync(string? rawIp)
        {
            if (!VideoLibrary.TryNormalizeDeviceAddress(rawIp, out var ip))
            {
                return (BadRequest(new { message = InvalidIpMessage }), string.Empty);
            }

            var registered = await _context.VideoDevices.AnyAsync(x => x.Ip.Trim() == ip);
            return registered
                ? (null, ip)
                : (NotFound(new { message = $"Приставка {ip} не зарегистрирована." }), string.Empty);
        }

        private async Task<List<DeviceStatusBatchItem>> FilterRegisteredDevicesAsync(IEnumerable<DeviceStatusBatchItem> requested)
        {
            var normalized = requested
                .Select(x => VideoLibrary.TryNormalizeDeviceAddress(x.Ip, out var ip)
                    ? new DeviceStatusBatchItem { Guid = x.Guid, Ip = ip }
                    : null)
                .Where(x => x != null)
                .Select(x => x!)
                .ToList();
            if (normalized.Count == 0)
            {
                return [];
            }

            var ips = normalized.Select(x => x.Ip).Distinct().ToList();
            var registered = (await _context.VideoDevices
                    .Where(x => ips.Contains(x.Ip.Trim()))
                    .Select(x => x.Ip.Trim())
                    .ToListAsync())
                .ToHashSet(StringComparer.Ordinal);

            return normalized.Where(x => registered.Contains(x.Ip)).ToList();
        }

        private async Task<Guid?> GetDefaultOrientationGuid()
        {
            return await _context.VideoOrientation
                .Where(x => x.Number == 0)
                .Select(x => (Guid?)x.Guid)
                .FirstOrDefaultAsync();
        }

        private string? GetVideoTvRootAvailabilityError()
        {
            if (string.IsNullOrWhiteSpace(VideoTvRootPath))
            {
                const string message = "Не настроен путь к каталогу ВидеоТВ.";
                _logger.LogError(message);
                return message;
            }

            try
            {
                if (!Directory.Exists(VideoTvRootPath))
                {
                    var message = $"Каталог ВидеоТВ недоступен: '{VideoTvRootPath}'. Проверьте путь и права учетной записи приложения на сетевую шару.";
                    _logger.LogError("VideoTV root path is unavailable: {VideoTvRootPath}", VideoTvRootPath);
                    return message;
                }

                _ = Directory.EnumerateFileSystemEntries(VideoTvRootPath).FirstOrDefault();
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to access VideoTV root path: {VideoTvRootPath}", VideoTvRootPath);
                return $"Каталог ВидеоТВ недоступен: '{VideoTvRootPath}'. {ex.Message}";
            }
        }

        private void SyncVideoLibraryWithDisk()
        {
            lock (VideoLibrary.SyncLock)
            {
                SyncVideoLibraryWithDiskCore();
            }
        }

        private void SyncVideoLibraryWithDiskCore()
        {
            if (!Directory.Exists(VideoTvRootPath))
            {
                return;
            }

            var filesOnDisk = Directory
                .EnumerateFiles(VideoTvRootPath, "*.*", SearchOption.TopDirectoryOnly)
                .Where(path => VideoLibrary.VideoExtensions.Contains(Path.GetExtension(path)))
                .Select(path => new FileInfo(path))
                .ToList();

            var filesByName = filesOnDisk
                .GroupBy(file => file.Name, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

            var dbVideos = _context.VideoInfo
                .OrderBy(x => x.Position)
                .ThenBy(x => x.Name)
                .ToList();

            var dbVideoNames = new HashSet<string>(dbVideos.Select(x => x.Name), StringComparer.OrdinalIgnoreCase);
            var hasChanges = false;

            foreach (var dbVideo in dbVideos.ToList())
            {
                if (!filesByName.TryGetValue(dbVideo.Name, out var fileInfo))
                {
                    _context.VideoInfo.Remove(dbVideo);
                    hasChanges = true;
                    continue;
                }

                if (!string.Equals(dbVideo.Path, fileInfo.FullName, StringComparison.OrdinalIgnoreCase))
                {
                    dbVideo.Path = fileInfo.FullName;
                    hasChanges = true;
                }
            }

            var nextPosition = dbVideos.Count > 0 ? dbVideos.Max(x => x.Position) + 1 : 0;
            foreach (var fileInfo in filesOnDisk.OrderBy(x => x.Name))
            {
                if (dbVideoNames.Contains(fileInfo.Name))
                {
                    continue;
                }

                _context.VideoInfo.Add(new VideoInfo
                {
                    Guid = Guid.NewGuid(),
                    Name = fileInfo.Name,
                    Path = fileInfo.FullName,
                    Position = nextPosition++
                });
                hasChanges = true;
            }

            if (hasChanges)
            {
                _context.SaveChanges();
            }

            NormalizeVideoPositions();
        }

        private void NormalizeVideoPositions()
        {
            var videos = _context.VideoInfo
                .OrderBy(x => x.Position)
                .ThenBy(x => x.Name)
                .ToList();

            var hasChanges = false;
            for (var index = 0; index < videos.Count; index++)
            {
                if (videos[index].Position == index)
                {
                    continue;
                }

                videos[index].Position = index;
                hasChanges = true;
            }

            if (hasChanges)
            {
                _context.SaveChanges();
            }
        }

        private List<string> GetCustomAdsDirectoryNames()
        {
            if (!Directory.Exists(VideoTvRootPath))
            {
                return [];
            }

            return Directory
                .EnumerateDirectories(VideoTvRootPath, "*", SearchOption.TopDirectoryOnly)
                .Select(Path.GetFileName)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .OrderBy(name => name)
                .ToList()!;
        }

        private string GetActualVersion()
        {
            if (!Directory.Exists(VideoTvRootPath))
            {
                return "Error";
            }

            var latest = VideoLibrary.OrderApkFiles(Directory
                    .EnumerateFiles(VideoTvRootPath, "*.apk", SearchOption.TopDirectoryOnly)
                    .Select(path => new FileInfo(path)))
                .FirstOrDefault();
            return latest == null ? "Error" : Path.GetFileNameWithoutExtension(latest.Name);
        }

        private static string? NormalizeOptionalValue(string? value)
        {
            if (string.IsNullOrWhiteSpace(value) || string.Equals(value, "null", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            return value.Trim();
        }

        private static string? NormalizeSingleVideoName(string? value)
        {
            var list = VideoLibrary.ParseVideoList(value);
            return list.Count == 1 ? list[0] : null;
        }

        private static bool IsAdbConnectFailed(string output)
        {
            return output.Contains("failed", StringComparison.OrdinalIgnoreCase)
                || output.Contains("unable", StringComparison.OrdinalIgnoreCase)
                || output.Contains("cannot", StringComparison.OrdinalIgnoreCase)
                || output.Contains("refused", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsAdbStartFailed(string output)
        {
            return output.Contains("Error:", StringComparison.OrdinalIgnoreCase)
                || output.Contains("Exception", StringComparison.OrdinalIgnoreCase)
                || output.Contains("not found", StringComparison.OrdinalIgnoreCase)
                || output.Contains("does not exist", StringComparison.OrdinalIgnoreCase)
                || output.Contains("SecurityException", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsAdbInstallFailed(string output)
        {
            return output.Contains("Failure", StringComparison.OrdinalIgnoreCase)
                || output.Contains("failed", StringComparison.OrdinalIgnoreCase)
                || output.Contains("Exception", StringComparison.OrdinalIgnoreCase)
                || output.Contains("INSTALL_", StringComparison.OrdinalIgnoreCase);
        }

        private string GetAdbPath()
        {
            var configuredPath = _configuration["VideoDevices:AdbPath"];
            var adbPath = ResolveAdbPath(configuredPath);
            _logger.LogInformation("Resolved ADB path: {AdbPath}", adbPath);
            return adbPath;
        }

        private string ResolveAdbPath(string? configuredPath)
        {
            foreach (var candidate in GetAdbPathCandidates(configuredPath))
            {
                if (System.IO.File.Exists(candidate))
                {
                    return candidate;
                }
            }

            var configuredValue = string.IsNullOrWhiteSpace(configuredPath) ? "adb" : configuredPath.Trim();
            throw new InvalidOperationException(
                "Не найден adb.exe. " +
                "Укажите полный путь в настройке VideoDevices:AdbPath " +
                "(например, C:\\Android\\platform-tools\\adb.exe) " +
                "или установите Android Platform Tools на сервер и добавьте adb.exe в PATH. " +
                $"Текущее значение настройки: '{configuredValue}'.");
        }

        private static IEnumerable<string> GetAdbPathCandidates(string? configuredPath)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var candidate in GetConfiguredAdbCandidates(configuredPath))
            {
                if (seen.Add(candidate))
                {
                    yield return candidate;
                }
            }

            foreach (var candidate in GetPathExecutableCandidates("adb"))
            {
                if (seen.Add(candidate))
                {
                    yield return candidate;
                }
            }

            var baseDirectory = AppContext.BaseDirectory;
            foreach (var candidate in new[]
            {
                Path.Combine(baseDirectory, "adb.exe"),
                Path.Combine(baseDirectory, "platform-tools", "adb.exe"),
                BuildSdkAdbPath(Environment.GetEnvironmentVariable("ANDROID_SDK_ROOT")),
                BuildSdkAdbPath(Environment.GetEnvironmentVariable("ANDROID_HOME")),
                BuildSdkAdbPath(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Android", "Sdk"),
                BuildSdkAdbPath(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Android", "platform-tools"),
                BuildSdkAdbPath(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Android", "platform-tools")
            }.Where(x => !string.IsNullOrWhiteSpace(x)))
            {
                if (seen.Add(candidate!))
                {
                    yield return candidate!;
                }
            }
        }

        private static IEnumerable<string> GetConfiguredAdbCandidates(string? configuredPath)
        {
            var value = string.IsNullOrWhiteSpace(configuredPath) ? "adb" : configuredPath.Trim();

            if (Path.IsPathRooted(value))
            {
                yield return EnsureExeSuffix(value);
                yield break;
            }

            if (value.Contains(Path.DirectorySeparatorChar) || value.Contains(Path.AltDirectorySeparatorChar))
            {
                yield return Path.GetFullPath(EnsureExeSuffix(Path.Combine(AppContext.BaseDirectory, value)));
                yield break;
            }

            foreach (var candidate in GetPathExecutableCandidates(value))
            {
                yield return candidate;
            }
        }

        private static IEnumerable<string> GetPathExecutableCandidates(string executableName)
        {
            var fileName = EnsureExeSuffix(executableName);
            var pathValue = Environment.GetEnvironmentVariable("PATH");
            if (string.IsNullOrWhiteSpace(pathValue))
            {
                yield break;
            }

            foreach (var directory in pathValue
                .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                yield return Path.Combine(directory, fileName);
            }
        }

        private static string EnsureExeSuffix(string path)
        {
            return Path.HasExtension(path) ? path : $"{path}.exe";
        }

        private static string? BuildSdkAdbPath(string? rootPath, params string[] extraSegments)
        {
            if (string.IsNullOrWhiteSpace(rootPath))
            {
                return null;
            }

            return Path.Combine(new[] { rootPath }.Concat(extraSegments).Concat(["adb.exe"]).ToArray());
        }

        private AndroidAppSettings GetAndroidAppSettings()
        {
            var packageName = _configuration["VideoDevices:AndroidPackage"];
            if (string.IsNullOrWhiteSpace(packageName))
            {
                return new AndroidAppSettings(null, null, "Не указан пакет приложения в настройке VideoDevices:AndroidPackage.");
            }

            var activityName = _configuration["VideoDevices:AndroidActivity"];
            if (string.IsNullOrWhiteSpace(activityName))
            {
                return new AndroidAppSettings(null, null, "Не указана Activity приложения в настройке VideoDevices:AndroidActivity.");
            }

            var normalizedPackage = packageName.Trim();
            return new AndroidAppSettings(
                normalizedPackage,
                NormalizeAndroidActivityName(normalizedPackage, activityName),
                null);
        }

        private static string NormalizeAndroidActivityName(string packageName, string activityName)
        {
            var value = activityName.Trim();
            if (value.StartsWith('.'))
            {
                return packageName + value;
            }

            return value.StartsWith(packageName + ".", StringComparison.Ordinal)
                ? value
                : $"{packageName}.{value}";
        }

        private string? GetSafeApkPath(string apkName)
        {
            var fileName = Path.GetFileName(apkName.Trim());
            if (!fileName.EndsWith(".apk", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var rootPath = Path.GetFullPath(VideoTvRootPath);
            var apkPath = Path.GetFullPath(Path.Combine(rootPath, fileName));

            return apkPath.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase)
                ? apkPath
                : null;
        }

        private static string CopyApkToAdbSafeTempPath(string apkPath)
        {
            var tempDirectory = Path.Combine(Path.GetTempPath(), "OfficeVideoDevicesApk");
            Directory.CreateDirectory(tempDirectory);

            var tempPath = Path.Combine(tempDirectory, $"{Guid.NewGuid():N}.apk");
            System.IO.File.Copy(apkPath, tempPath, true);
            return tempPath;
        }

        private static void TryDeleteTempApk(string apkPath)
        {
            if (string.IsNullOrWhiteSpace(apkPath))
            {
                return;
            }

            try
            {
                if (System.IO.File.Exists(apkPath))
                {
                    System.IO.File.Delete(apkPath);
                }
            }
            catch
            {
                // temporary cleanup best effort
            }
        }

        private static Task<ProcessResult> StartAndroidApp(string adbPath, string adbTarget, string packageName, string activityName)
        {
            return RunProcessAsync(
                adbPath,
                [
                    "-s",
                    adbTarget,
                    "shell",
                    "am",
                    "start",
                    "-a",
                    "android.intent.action.MAIN",
                    "-c",
                    "android.intent.category.LAUNCHER",
                    "-n",
                    $"{packageName}/{activityName}"
                ],
                TimeSpan.FromMinutes(5));
        }

        private static async Task<ProcessResult> RunProcessAsync(string fileName, string[] arguments, TimeSpan timeout)
        {
            using var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                WorkingDirectory = AppContext.BaseDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            foreach (var argument in arguments)
            {
                process.StartInfo.ArgumentList.Add(argument);
            }

            process.Start();

            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();
            var exitTask = process.WaitForExitAsync();
            var timeoutTask = Task.Delay(timeout);

            if (await Task.WhenAny(exitTask, timeoutTask) == timeoutTask)
            {
                try
                {
                    process.Kill(true);
                }
                catch
                {
                    // process already exited
                }

                return new ProcessResult(false, "Истекло время ожидания ADB-команды.");
            }

            var output = await outputTask;
            var error = await errorTask;
            var fullOutput = string.Join(" ", new[] { output, error }.Where(x => !string.IsNullOrWhiteSpace(x))).Trim();

            return new ProcessResult(process.ExitCode == 0, fullOutput);
        }

        public class DeviceDto
        {
            public Guid Guid { get; set; }
            public Guid? LocationGuid { get; set; }
            public string LocationName { get; set; } = string.Empty;
            public Guid? LocationTypeGuid { get; set; }
            public string Ip { get; set; } = string.Empty;
            public string VideoList { get; set; } = "[]";
            public int? OnlyMusic { get; set; }
            public string? CustomAds { get; set; }
            public string? MuteStartTime { get; set; }
            public string? MuteEndTime { get; set; }
            public string? Version { get; set; }
            public Guid? OrientationGuid { get; set; }
            public string? OrientationName { get; set; }
            public bool IsTestLocation { get; set; }
            /// <summary>Статус по сигналам приставки; null — сигналов не было (старое приложение).</summary>
            public DevicePresence.PresenceDto? Presence { get; set; }
        }

        private sealed record ProcessResult(bool Success, string Output);

        public class VideoOptionDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
            public int Position { get; set; }
        }

        public class LocationOptionDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
        }

        public class VideoFileDto
        {
            public Guid Guid { get; set; }
            public int Position { get; set; }
            public string Name { get; set; } = string.Empty;
            public double SizeInMb { get; set; }
            /// <summary>Тикет для превью: GET api/VideoDevices/videos/preview/{ticket}.</summary>
            public string? PreviewTicket { get; set; }
        }

        public class ApkFileDto
        {
            public string Name { get; set; } = string.Empty;
            public string Version { get; set; } = string.Empty;
            public double SizeInMb { get; set; }
            public DateTime UpdatedAt { get; set; }
        }

        public class SaveDeviceRequest
        {
            public Guid LocationGuid { get; set; }
            public string Ip { get; set; } = string.Empty;
            public List<string> VideoNames { get; set; } = [];
            public int? ContentType { get; set; }
            public string? CustomAds { get; set; }
            public string? MuteStartTime { get; set; }
            public string? MuteEndTime { get; set; }
        }

        public class ReplaceVideoRequest
        {
            public string FromVideo { get; set; } = string.Empty;
            public string ToVideo { get; set; } = string.Empty;
        }

        public class SwapPositionRequest
        {
            public int NewPosition { get; set; }
        }

        public class DeviceIpRequest
        {
            public string Ip { get; set; } = string.Empty;
        }

        public class DeviceCommandRequest : DeviceIpRequest
        {
            /// <summary>"sync", "redownload", "reboot", "volume" или "update".</summary>
            public string Command { get; set; } = string.Empty;
            /// <summary>Для "redownload": имя файла на приставке (видео, музыка или реклама); для "update": имя APK.</summary>
            public string? FileName { get; set; }
            /// <summary>Для "volume": громкость 0–100.</summary>
            public int? Value { get; set; }
        }

        public class UpdateDeviceAppRequest : DeviceIpRequest
        {
            public string ApkName { get; set; } = string.Empty;
        }

        private sealed record AndroidAppSettings(string? PackageName, string? ActivityName, string? ErrorMessage);

        public class DeviceStatusBatchRequest
        {
            public List<DeviceStatusBatchItem> Devices { get; set; } = [];
        }

        public class DeviceStatusBatchItem
        {
            public Guid Guid { get; set; }
            public string Ip { get; set; } = string.Empty;
        }

        public class DeviceStatusResult
        {
            public Guid Guid { get; set; }
            public string Ip { get; set; } = string.Empty;
            public bool Ok { get; set; }
            public string Status { get; set; } = "offline";
            public string ServerVersion { get; set; } = string.Empty;
            public string? VersionFromDevice { get; set; }
            public string? ErrorMessage { get; set; }
        }
    }
}
