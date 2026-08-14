using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.Diagnostics;
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

        private static readonly HashSet<string> VideoLibraryExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".mp4",
            ".avi",
            ".mov",
            ".mpeg"
        };

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        private readonly RKNETDBContext _context;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<VideoDevicesController> _logger;

        public VideoDevicesController(
            RKNETDBContext context,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<VideoDevicesController> logger)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        private string VideoTvRootPath => _configuration["VideoDevices:RootPath"]
            ?? @"\\shzhleb.ru\shz\SHZWork\Обмен2\ВидеоТВ";

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
            var validationError = ValidateDeviceRequest(request);
            if (validationError != null)
            {
                return BadRequest(new { message = validationError });
            }

            var device = new VideoDevice
            {
                Guid = Guid.NewGuid(),
                LocationGuid = request.LocationGuid,
                Status = 1,
                Ip = request.Ip.Trim(),
                OrientationGuid = await GetDefaultOrientationGuid(),
                VideoList = SerializeVideoList(request.VideoNames),
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
            var validationError = ValidateDeviceRequest(request);
            if (validationError != null)
            {
                return BadRequest(new { message = validationError });
            }

            var device = await _context.VideoDevices.FirstOrDefaultAsync(x => x.Guid == guid);
            if (device == null)
            {
                return NotFound(new { message = "Устройство не найдено." });
            }

            device.LocationGuid = request.LocationGuid;
            device.Status = 1;
            device.Ip = request.Ip.Trim();
            device.VideoList = SerializeVideoList(request.VideoNames);
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
                    if (!fileInfo.Exists || !VideoLibraryExtensions.Contains(fileInfo.Extension))
                    {
                        return null;
                    }

                    return new VideoFileDto
                    {
                        Guid = x.Guid,
                        Position = x.Position,
                        Name = x.Name,
                        SizeInMb = Math.Round(fileInfo.Length / (1024.0 * 1024.0), 2),
                        Url = Url.Action(nameof(GetFile), "VideoDevices", new { path = EncodeFilePath(fileInfo.FullName) }, Request.Scheme)
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

            var files = Directory
                .EnumerateFiles(VideoTvRootPath, "*.apk", SearchOption.TopDirectoryOnly)
                .Select(path =>
                {
                    var fileInfo = new FileInfo(path);
                    return new ApkFileDto
                    {
                        Name = fileInfo.Name,
                        Version = Path.GetFileNameWithoutExtension(fileInfo.Name),
                        SizeInMb = Math.Round(fileInfo.Length / (1024.0 * 1024.0), 2),
                        UpdatedAt = fileInfo.LastWriteTime
                    };
                })
                .OrderByDescending(x => x.UpdatedAt)
                .ThenBy(x => x.Name)
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

        [HttpGet("files")]
        public IActionResult GetFile([FromQuery] string path)
        {
            try
            {
                var filePath = DecodeFilePath(path);
                var fileInfo = new FileInfo(filePath);
                if (!fileInfo.Exists)
                {
                    return NotFound(new { message = "Файл не найден." });
                }

                var stream = new FileStream(fileInfo.FullName, FileMode.Open, FileAccess.Read, FileShare.Read);
                var contentType = fileInfo.Extension.ToLowerInvariant() switch
                {
                    ".avi" => "video/avi",
                    ".mov" => "video/quicktime",
                    ".mp4" => "video/mp4",
                    ".mpeg" => "video/mpeg",
                    _ => "application/octet-stream"
                };

                return File(stream, contentType, fileInfo.Name);
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
            }
        }

        [HttpPost("devices/check")]
        public async Task<IActionResult> TryToConnectDevice([FromBody] DeviceIpRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Ip))
            {
                return BadRequest(new { message = "IP не указан." });
            }

            var ip = NormalizeDeviceIp(request.Ip);
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
            if (string.IsNullOrWhiteSpace(request.Ip))
            {
                return BadRequest(new { message = "IP не указан." });
            }

            var ip = NormalizeDeviceIp(request.Ip);
            var serverVersion = GetActualVersion();

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(15);

                using var response = await client.GetAsync($"http://{ip}/?action=getIP");
                if (response.IsSuccessStatusCode)
                {
                    var versionFromDevice = (await response.Content.ReadAsStringAsync()).Trim();
                    var device = await _context.VideoDevices.FirstOrDefaultAsync(x => x.Ip.Trim() == ip);
                    if (device != null && device.Version != versionFromDevice)
                    {
                        device.Version = versionFromDevice;
                        await _context.SaveChangesAsync();
                    }

                    return Ok(new
                    {
                        ok = true,
                        status = "online",
                        serverVersion,
                        versionFromDevice
                    });
                }
            }
            catch
            {
                // fall back to ICMP ping below
            }

            var host = ExtractHost(ip);
            if (!string.IsNullOrWhiteSpace(host))
            {
                try
                {
                    using var ping = new System.Net.NetworkInformation.Ping();
                    var reply = await ping.SendPingAsync(host, 2000);
                    if (reply.Status == System.Net.NetworkInformation.IPStatus.Success)
                    {
                        return Ok(new
                        {
                            ok = true,
                            status = "ping",
                            serverVersion
                        });
                    }
                }
                catch
                {
                    // unreachable
                }
            }

            return Ok(new
            {
                ok = false,
                status = "offline",
                serverVersion,
                errorMessage = "Приставка не отвечает, ping недоступен."
            });
        }

        [HttpPost("devices/status/batch")]
        public async Task<IActionResult> GetDevicesStatus([FromBody] DeviceStatusBatchRequest request)
        {
            var devices = request.Devices
                .Where(x => !string.IsNullOrWhiteSpace(x.Ip))
                .Select(x => new DeviceStatusBatchItem
                {
                    Guid = x.Guid,
                    Ip = NormalizeDeviceIp(x.Ip)
                })
                .ToList();

            if (devices.Count == 0)
            {
                return Ok(new { devices = Array.Empty<DeviceStatusResult>() });
            }

            var serverVersion = GetActualVersion();

            var tasks = devices.Select(async device =>
            {
                return await GetDeviceStatusResult(device.Guid, device.Ip, serverVersion);
            });

            var results = await Task.WhenAll(tasks);
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
                    var ip = NormalizeDeviceIp(device.Ip);
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
            var devices = request.Devices
                .Where(x => !string.IsNullOrWhiteSpace(x.Ip))
                .Select(x => new DeviceStatusBatchItem
                {
                    Guid = x.Guid,
                    Ip = NormalizeDeviceIp(x.Ip)
                })
                .ToList();

            Response.ContentType = "application/x-ndjson; charset=utf-8";

            if (devices.Count == 0)
            {
                return;
            }

            var serverVersion = GetActualVersion();
            var tasks = devices
                .Select(device => GetDeviceStatusResult(device.Guid, device.Ip, serverVersion))
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
            if (string.IsNullOrWhiteSpace(request.Ip))
            {
                return BadRequest(new { message = "IP не указан." });
            }

            try
            {
                var ip = NormalizeDeviceIp(request.Ip);
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

        [HttpPost("devices/start-app")]
        public async Task<IActionResult> StartDeviceApp([FromBody] DeviceIpRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Ip))
            {
                return BadRequest(new { message = "IP не указан." });
            }

            var appSettings = GetAndroidAppSettings();
            if (appSettings.ErrorMessage != null)
            {
                return Ok(new { ok = false, errorMessage = appSettings.ErrorMessage });
            }

            var adbPath = GetAdbPath();
            var ip = NormalizeDeviceIp(request.Ip);
            var host = ExtractHost(ip);
            if (string.IsNullOrWhiteSpace(host))
            {
                return BadRequest(new { message = "Некорректный IP устройства." });
            }

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
            if (string.IsNullOrWhiteSpace(request.Ip))
            {
                return BadRequest(new { message = "IP не указан." });
            }

            if (string.IsNullOrWhiteSpace(request.ApkName))
            {
                return BadRequest(new { message = "APK файл не выбран." });
            }

            var ip = NormalizeDeviceIp(request.Ip);
            var host = ExtractHost(ip);
            if (string.IsNullOrWhiteSpace(host))
            {
                return BadRequest(new { message = "Некорректный IP устройства." });
            }

            var adbTarget = $"{host}:5555";
            var installApkPath = string.Empty;

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

                await RunProcessAsync(adbPath, ["-s", adbTarget, "shell", "am", "force-stop", appSettings.PackageName!], TimeSpan.FromMinutes(5));

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
                if (device != null)
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
            }
        }

        [HttpGet("devices/screenshot")]
        public async Task<IActionResult> GetScreenshot([FromQuery] string ip)
        {
            if (string.IsNullOrWhiteSpace(ip))
            {
                return BadRequest(new { message = "IP не указан." });
            }

            try
            {
                var normalizedIp = NormalizeDeviceIp(ip);
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(30);

                using var response = await client.GetAsync($"http://{normalizedIp}?action=screen");
                if (!response.IsSuccessStatusCode)
                {
                    return Ok(new { ok = false, errorMessage = $"Не удалось получить скриншот: {response.StatusCode}" });
                }

                var content = await response.Content.ReadAsByteArrayAsync();
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

                using var response = await client.GetAsync($"http://{ip}/?action=getIP");
                if (response.IsSuccessStatusCode)
                {
                    return new DeviceStatusResult
                    {
                        Guid = guid,
                        Ip = ip,
                        Ok = true,
                        Status = "online",
                        ServerVersion = serverVersion,
                        VersionFromDevice = (await response.Content.ReadAsStringAsync()).Trim()
                    };
                }
            }
            catch
            {
                // fall back to ICMP ping below
            }

            var host = ExtractHost(ip);
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

        private async Task UpdateDeviceVersion(DeviceStatusResult result)
        {
            if (string.IsNullOrWhiteSpace(result.VersionFromDevice))
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

        private string? ValidateDeviceRequest(SaveDeviceRequest request)
        {
            if (request.LocationGuid == Guid.Empty)
            {
                return "Выберите ТТ.";
            }

            if (string.IsNullOrWhiteSpace(request.Ip))
            {
                return "Укажите IP.";
            }

            var muteStartTime = NormalizeOptionalValue(request.MuteStartTime);
            var muteEndTime = NormalizeOptionalValue(request.MuteEndTime);

            if ((muteStartTime == null) != (muteEndTime == null))
            {
                return "Необходимо указать и время выключения, и время включения звука.";
            }

            if (muteStartTime != null && !TimeSpan.TryParse(muteStartTime, out _))
            {
                return "Некорректное время выключения звука.";
            }

            if (muteEndTime != null && !TimeSpan.TryParse(muteEndTime, out _))
            {
                return "Некорректное время включения звука.";
            }

            var customAds = NormalizeOptionalValue(request.CustomAds);
            if (customAds != null)
            {
                var allowedDirectories = new HashSet<string>(GetCustomAdsDirectoryNames(), StringComparer.OrdinalIgnoreCase);
                if (!allowedDirectories.Contains(customAds))
                {
                    return "Выбранная папка рекламы не найдена.";
                }
            }

            if (request.ContentType is not null and not 1)
            {
                return "Некорректный тип контента.";
            }

            return null;
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
            if (!Directory.Exists(VideoTvRootPath))
            {
                return;
            }

            var filesOnDisk = Directory
                .EnumerateFiles(VideoTvRootPath, "*.*", SearchOption.TopDirectoryOnly)
                .Where(path => VideoLibraryExtensions.Contains(Path.GetExtension(path)))
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

            return Directory
                .EnumerateFiles(VideoTvRootPath, "*.apk", SearchOption.TopDirectoryOnly)
                .Select(Path.GetFileNameWithoutExtension)
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))
                ?? "Error";
        }

        private static string? NormalizeOptionalValue(string? value)
        {
            if (string.IsNullOrWhiteSpace(value) || string.Equals(value, "null", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            return value.Trim();
        }

        private static string SerializeVideoList(IEnumerable<string>? videoNames)
        {
            var values = videoNames?
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList() ?? [];

            return $"[{string.Join(",", values)}]";
        }

        private static List<string> ParseVideoList(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return [];
            }

            return value
                .Trim()
                .Trim('[', ']')
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(x => x.Trim('"'))
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();
        }

        private static string? NormalizeSingleVideoName(string? value)
        {
            var list = ParseVideoList(value);
            return list.Count == 1 ? list[0] : null;
        }

        private static string EncodeFilePath(string path)
        {
            return path.Replace("+", "plustoreplace").Replace(" ", "backspacetoreplace");
        }

        private static string DecodeFilePath(string path)
        {
            return path.Replace("plustoreplace", "+").Replace("backspacetoreplace", " ");
        }

        private static string NormalizeDeviceIp(string ip)
        {
            return ip.Trim().TrimEnd('\\', '/', ' ', '\t', '\r', '\n');
        }

        private static string ExtractHost(string ip)
        {
            var value = NormalizeDeviceIp(ip)
                .Replace("http://", "", StringComparison.OrdinalIgnoreCase)
                .Replace("https://", "", StringComparison.OrdinalIgnoreCase);

            var slashIndex = value.IndexOf('/');
            if (slashIndex >= 0)
            {
                value = value[..slashIndex];
            }

            var colonIndex = value.LastIndexOf(':');
            if (colonIndex > 0 && value.Count(x => x == ':') == 1)
            {
                value = value[..colonIndex];
            }

            return value;
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
            public string? Url { get; set; }
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
