using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.VideoDevices;
using Xunit;

namespace Office.Server.Tests;

public sealed class VideoDevicesTests : IDisposable
{
    private const string DeviceKey = "test-device-key-0123456789abcdef0123456789";
    private readonly string _root;

    public VideoDevicesTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "VideoDevicesTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(_root, VideoLibrary.MusicDirectoryName, "Sub"));
        Directory.CreateDirectory(Path.Combine(_root, VideoLibrary.DefaultAdsDirectoryName));
        Directory.CreateDirectory(Path.Combine(_root, "Своя реклама"));
        File.WriteAllText(Path.Combine(_root, "Новое видео.mp4"), "video");
        File.WriteAllText(Path.Combine(_root, VideoLibrary.MusicDirectoryName, "a.mp3"), "a");
        File.WriteAllText(Path.Combine(_root, VideoLibrary.MusicDirectoryName, "Sub", "a.mp3"), "dup");
        File.WriteAllText(Path.Combine(_root, VideoLibrary.MusicDirectoryName, "Sub", "b.mp3"), "b");
        File.WriteAllText(Path.Combine(_root, "Своя реклама", "ad.mp3"), "ad");
        File.WriteAllText(Path.Combine(_root, VideoLibrary.DefaultAdsDirectoryName, "common.mp3"), "c");
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, true); } catch { /* temp cleanup */ }
    }

    // ---------- VideoLibrary ----------

    [Theory]
    [InlineData("Новое видео.mp4", true)]
    [InlineData("..\\secret.mp4", false)]
    [InlineData("../secret.mp4", false)]
    [InlineData("sub/a.mp4", false)]
    [InlineData("C:\\Windows\\a.mp4", false)]
    [InlineData("appsettings.json", false)]
    [InlineData("", false)]
    public void TryResolveVideoFile_AcceptsOnlyPlainVideoNamesInRoot(string name, bool expected)
    {
        var ok = VideoLibrary.TryResolveVideoFile(_root, name, out var fullPath);

        Assert.Equal(expected, ok);
        if (ok)
        {
            Assert.Equal(Path.Combine(_root, name), fullPath);
        }
    }

    [Theory]
    [InlineData("Музыка/Sub/b.mp3", true)]
    [InlineData("Музыка/../../outside.mp3", false)]
    [InlineData("../outside.mp3", false)]
    [InlineData("C:/outside.mp3", false)]
    [InlineData("\\\\evil-host\\share\\a.mp3", false)]
    [InlineData("Музыка/notes.txt", false)]
    public void TryResolveAudioFile_StaysInsideRoot(string path, bool expected)
    {
        Assert.Equal(expected, VideoLibrary.TryResolveAudioFile(_root, path, out _));
    }

    [Theory]
    [InlineData("10.140.54.60:8080", "10.140.54.60:8080")]
    [InlineData(" 10.140.54.60 ", "10.140.54.60:8080")]
    [InlineData("192.168.1.5:8080", "192.168.1.5:8080")]
    [InlineData("172.16.0.1", "172.16.0.1:8080")]
    [InlineData("192.168.1.5:9000", null)] // только порт приложения
    [InlineData("10.0.0.1:9200", null)]
    [InlineData("8.8.8.8:8080", null)]
    [InlineData("127.0.0.1:8080", null)]
    [InlineData("172.32.0.1", null)]
    [InlineData("evil.com", null)]
    [InlineData("10.0.0.1/admin", null)]
    [InlineData("10.0.0.1:8080@evil.com", null)]
    [InlineData("10.0.0.1:70000", null)]
    [InlineData("", null)]
    public void TryNormalizeDeviceAddress_AllowsOnlyPrivateIpv4(string input, string? expected)
    {
        var ok = VideoLibrary.TryNormalizeDeviceAddress(input, out var normalized);

        Assert.Equal(expected != null, ok);
        if (expected != null)
        {
            Assert.Equal(expected, normalized);
        }
    }

    [Fact]
    public void OrderApkFiles_PicksHighestVersionNotFirstFile()
    {
        var dir = Path.Combine(_root, "apk");
        Directory.CreateDirectory(dir);
        foreach (var name in new[] { "1.9.apk", "1.10.apk", "1.2.apk" })
        {
            File.WriteAllText(Path.Combine(dir, name), "x");
        }

        var ordered = VideoLibrary.OrderApkFiles(new DirectoryInfo(dir).GetFiles("*.apk")).Select(x => x.Name).ToList();

        Assert.Equal(["1.10.apk", "1.9.apk", "1.2.apk"], ordered);
    }

    [Theory]
    [InlineData("1.9", true)]
    [InlineData("2.0", true)]
    [InlineData("1.10.3", true)]
    [InlineData("2.0-test", false)]
    [InlineData("<html>", false)]
    [InlineData("{\"cluster_name\":\"x\"}", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsValidAppVersion_AcceptsOnlyVersionNumbers(string? value, bool expected)
    {
        Assert.Equal(expected, VideoLibrary.IsValidAppVersion(value));
    }

    [Fact]
    public void IsFileStable_RejectsRecentAndBeingWrittenFiles()
    {
        var path = Path.Combine(_root, "Новое видео.mp4");

        Assert.False(VideoLibrary.IsFileStable(path, TimeSpan.FromMinutes(5))); // только что создан
        Assert.True(VideoLibrary.IsFileStable(path, TimeSpan.Zero));
        using (new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.ReadWrite))
        {
            Assert.False(VideoLibrary.IsFileStable(path, TimeSpan.Zero)); // идёт запись
        }
    }

    [Fact]
    public void VideoList_RoundTripsLegacyFormat()
    {
        Assert.Equal("[a.mp4,b c.mp4]", VideoLibrary.SerializeVideoList([" a.mp4 ", "b c.mp4", ""]));
        Assert.Equal(["a.mp4", "b c.mp4"], VideoLibrary.ParseVideoList("[a.mp4, \"b c.mp4\"]"));
        Assert.False(VideoLibrary.IsStorableVideoName("a,b.mp4"));
    }

    // ---------- Device API key ----------

    [Theory]
    [InlineData(null, StatusCodes.Status503ServiceUnavailable)]
    [InlineData("short", StatusCodes.Status503ServiceUnavailable)]
    public async Task DeviceApiKey_FailsClosedWhenNotConfigured(string? configuredKey, int expectedStatus)
    {
        var context = CreateAuthorizationContext(configuredKey, providedKey: DeviceKey);

        await new DeviceApiKeyAttribute().OnAuthorizationAsync(context);

        Assert.Equal(expectedStatus, Assert.IsType<ObjectResult>(context.Result).StatusCode);
    }

    [Fact]
    public async Task DeviceApiKey_RejectsWrongKeyAndAcceptsRightOne()
    {
        var wrong = CreateAuthorizationContext(DeviceKey, providedKey: "nope");
        await new DeviceApiKeyAttribute().OnAuthorizationAsync(wrong);
        Assert.IsType<UnauthorizedObjectResult>(wrong.Result);

        var right = CreateAuthorizationContext(DeviceKey, providedKey: DeviceKey);
        await new DeviceApiKeyAttribute().OnAuthorizationAsync(right);
        Assert.Null(right.Result);
    }

    // ---------- Device API ----------

    [Fact]
    public async Task GetConfig_ReturnsVideosWithUrlsAndReportsMissing()
    {
        await using var db = CreateDb();
        db.VideoDevices.Add(new VideoDevice
        {
            Guid = Guid.NewGuid(),
            Ip = "10.140.54.60:8080   ", // в БД поле дополнено пробелами
            VideoList = "[Новое видео.mp4,Удалённое.mp4]",
            MuteStartTime = "23:10",
            MuteEndTime = "07:50"
        });
        await db.SaveChangesAsync();
        var controller = CreateDeviceApi(db);

        var result = await controller.GetConfig("10.140.54.60", CancellationToken.None);

        var config = Assert.IsType<VideoDeviceApiController.DeviceConfigDto>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal("video", config.Mode);
        // Порядок из настроек сохраняется, отсутствующий файл остаётся в списке с Available = false
        Assert.Equal(["Новое видео.mp4", "Удалённое.mp4"], config.Videos.Select(x => x.Name));
        var video = config.Videos[0];
        Assert.True(video.Available);
        Assert.Equal(5, video.SizeBytes);
        Assert.Equal("/api/video-device/videos/%D0%9D%D0%BE%D0%B2%D0%BE%D0%B5%20%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE.mp4", video.Url);
        Assert.False(config.Videos[1].Available);
        Assert.Equal(["Удалённое.mp4"], config.MissingVideos);
        Assert.Equal("23:10", config.MuteStartTime);
    }

    [Fact]
    public async Task GetConfig_UnknownDeviceIs404WithCodeAndBadIpIs400()
    {
        await using var db = CreateDb();
        var controller = CreateDeviceApi(db);

        var notFound = Assert.IsType<NotFoundObjectResult>(await controller.GetConfig("10.1.1.1:8080", CancellationToken.None));
        Assert.Contains(VideoDeviceApiController.DeviceNotRegisteredCode, System.Text.Json.JsonSerializer.Serialize(notFound.Value));
        Assert.IsType<BadRequestObjectResult>(await controller.GetConfig("null:8080", CancellationToken.None));
    }

    [Fact]
    public async Task ShareOutage_Returns503InsteadOfEmptyLists()
    {
        await using var db = CreateDb();
        db.VideoDevices.Add(new VideoDevice { Guid = Guid.NewGuid(), Ip = "10.0.0.1:8080", VideoList = "[Новое видео.mp4]" });
        await db.SaveChangesAsync();
        Directory.Delete(_root, true); // шара «упала»
        var controller = CreateDeviceApi(db);

        Assert.Equal(503, Assert.IsType<ObjectResult>(await controller.GetConfig("10.0.0.1", CancellationToken.None)).StatusCode);
        Assert.Equal(503, Assert.IsType<ObjectResult>(controller.GetMusic()).StatusCode);
        Assert.Equal(503, Assert.IsType<ObjectResult>(await controller.GetAds("10.0.0.1", CancellationToken.None)).StatusCode);
    }

    [Fact]
    public async Task GetConfig_MusicDeviceAndLegacyMixedModeIsVideo()
    {
        await using var db = CreateDb();
        db.VideoDevices.AddRange(
            new VideoDevice { Guid = Guid.NewGuid(), Ip = "10.0.0.1:8080", OnlyMusic = 1 },
            new VideoDevice { Guid = Guid.NewGuid(), Ip = "10.0.0.2:8080", OnlyMusic = 0 });
        await db.SaveChangesAsync();
        var controller = CreateDeviceApi(db);

        var music = (VideoDeviceApiController.DeviceConfigDto)((OkObjectResult)await controller.GetConfig("10.0.0.1", CancellationToken.None)).Value!;
        var legacy = (VideoDeviceApiController.DeviceConfigDto)((OkObjectResult)await controller.GetConfig("10.0.0.2", CancellationToken.None)).Value!;

        Assert.Equal("music", music.Mode);
        Assert.Equal("video", legacy.Mode);
    }

    [Fact]
    public async Task GetMusic_ListsRecursivelyWithoutDuplicateFileNames()
    {
        await using var db = CreateDb();
        var result = CreateDeviceApi(db).GetMusic();

        var items = Assert.IsType<List<VideoDeviceApiController.DeviceAudioDto>>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal(["a.mp3", "b.mp3"], items.Select(x => x.FileName).OrderBy(x => x));
        Assert.All(items, x => Assert.StartsWith("/api/video-device/audio?path=", x.Url));
    }

    [Fact]
    public async Task GetAds_UsesCustomFolderOrDefault()
    {
        await using var db = CreateDb();
        db.VideoDevices.Add(new VideoDevice { Guid = Guid.NewGuid(), Ip = "10.0.0.1:8080", CustomAds = "Своя реклама" });
        db.VideoDevices.Add(new VideoDevice { Guid = Guid.NewGuid(), Ip = "10.0.0.2:8080", CustomAds = "..\\..\\Windows" });
        await db.SaveChangesAsync();
        var controller = CreateDeviceApi(db);

        var custom = (List<VideoDeviceApiController.DeviceAudioDto>)((OkObjectResult)await controller.GetAds("10.0.0.1", CancellationToken.None)).Value!;
        var fallback = (List<VideoDeviceApiController.DeviceAudioDto>)((OkObjectResult)await controller.GetAds("10.0.0.2", CancellationToken.None)).Value!;

        Assert.Equal("ad.mp3", Assert.Single(custom).FileName);
        Assert.Equal("common.mp3", Assert.Single(fallback).FileName);
    }

    [Fact]
    public async Task FileEndpoints_RejectTraversal()
    {
        await using var db = CreateDb();
        var controller = CreateDeviceApi(db);

        Assert.IsType<BadRequestObjectResult>(controller.GetVideo("..\\appsettings.json"));
        Assert.IsType<BadRequestObjectResult>(controller.GetAudio("../../Windows/win.ini"));
        Assert.IsType<NotFoundObjectResult>(controller.GetVideo("нет такого.mp4"));
        var file = Assert.IsType<FileStreamResult>(controller.GetVideo("Новое видео.mp4"));
        Assert.True(file.EnableRangeProcessing);
        await file.FileStream.DisposeAsync();
    }

    [Fact]
    public async Task FilesStillBeingCopiedAreNotOfferedOrServed()
    {
        await using var db = CreateDb();
        db.VideoDevices.Add(new VideoDevice { Guid = Guid.NewGuid(), Ip = "10.0.0.1:8080", VideoList = "[Новое видео.mp4]" });
        await db.SaveChangesAsync();

        // Свежий файл (только что скопирован) при пороге 60 с — ещё не готов
        var fresh = CreateDeviceApi(db, stableFileAgeSeconds: 60);
        var config = (VideoDeviceApiController.DeviceConfigDto)((OkObjectResult)await fresh.GetConfig("10.0.0.1", CancellationToken.None)).Value!;
        Assert.False(Assert.Single(config.Videos).Available);
        Assert.Empty((List<VideoDeviceApiController.DeviceAudioDto>)((OkObjectResult)fresh.GetMusic()).Value!);

        // Файл открыт на запись (идёт копирование) — не отдаём, просим повторить
        var controller = CreateDeviceApi(db);
        using (new FileStream(Path.Combine(_root, "Новое видео.mp4"), FileMode.Open, FileAccess.Write, FileShare.ReadWrite))
        {
            var busy = Assert.IsType<ObjectResult>(controller.GetVideo("Новое видео.mp4"));
            Assert.Equal(503, busy.StatusCode);
            Assert.Equal("60", controller.Response.Headers.RetryAfter.ToString());
        }
    }

    [Fact]
    public async Task FileResponsesCarryETagForResume()
    {
        await using var db = CreateDb();
        var file = Assert.IsType<FileStreamResult>(CreateDeviceApi(db).GetVideo("Новое видео.mp4"));

        Assert.NotNull(file.EntityTag);
        Assert.False(file.EntityTag!.IsWeak); // If-Range работает только с сильным ETag
        Assert.NotNull(file.LastModified);
        Assert.True(file.EnableRangeProcessing);
        await file.FileStream.DisposeAsync();
    }

    // ---------- Heartbeat ----------

    [Fact]
    public async Task Heartbeat_UnknownDeviceGetsNotRegisteredCode()
    {
        await using var db = CreateDb();
        var result = await CreateDeviceApi(db).Heartbeat(new() { Ip = "10.9.9.9" }, CancellationToken.None);

        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Contains(VideoDeviceApiController.DeviceNotRegisteredCode, System.Text.Json.JsonSerializer.Serialize(notFound.Value));
        Assert.Empty(db.VideoDeviceHeartbeats);
    }

    [Fact]
    public async Task Heartbeat_StoresStateByServerClockAndUpdatesVersion()
    {
        await using var db = CreateDb();
        var deviceGuid = Guid.NewGuid();
        db.VideoDevices.Add(new VideoDevice { Guid = deviceGuid, Ip = "10.0.0.1:8080   ", Version = "1.9" });
        await db.SaveChangesAsync();
        var controller = CreateDeviceApi(db);

        var result = await controller.Heartbeat(new()
        {
            Ip = "10.0.0.1",
            AppVersion = "2.0",
            Mode = "video",
            IsPlaying = true,
            CurrentFile = new string('x', 400),
            LastConfigOkSecondsAgo = 120,
            ItemsReady = 1,
            ItemsTotal = 1,
            FreeSpaceMb = 2048,
            UptimeSeconds = 3600
        }, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        var heartbeat = await db.VideoDeviceHeartbeats.SingleAsync();
        Assert.Equal(deviceGuid, heartbeat.DeviceGuid);
        Assert.True(DateTime.UtcNow - heartbeat.LastSeenUtc < TimeSpan.FromMinutes(1));
        Assert.InRange((heartbeat.LastSeenUtc - heartbeat.LastConfigOkUtc!.Value).TotalSeconds, 119, 121);
        Assert.Equal(260, heartbeat.CurrentFile!.Length);
        Assert.Equal("2.0", (await db.VideoDevices.SingleAsync()).Version);

        // Второй сигнал обновляет ту же запись; мусор вместо версии и режима не сохраняется
        await controller.Heartbeat(new() { Ip = "10.0.0.1:8080", AppVersion = "<html>", Mode = "mixed" }, CancellationToken.None);
        heartbeat = await db.VideoDeviceHeartbeats.SingleAsync();
        Assert.Null(heartbeat.AppVersion);
        Assert.Null(heartbeat.Mode);
        Assert.False(heartbeat.IsPlaying);
        Assert.Equal("2.0", (await db.VideoDevices.SingleAsync()).Version);
    }

    [Fact]
    public void Presence_PlayingProblemOffline()
    {
        var now = new DateTime(2026, 11, 16, 12, 0, 0, DateTimeKind.Utc);
        var healthy = new VideoDeviceHeartbeat
        {
            LastSeenUtc = now.AddMinutes(-1),
            IsPlaying = true,
            LastConfigOkUtc = now.AddMinutes(-30),
            ItemsReady = 1,
            ItemsTotal = 1
        };

        Assert.Equal(DevicePresence.Playing, DevicePresence.Describe(healthy, now, DevicePresence.DefaultOfflineAfter)!.Status);

        var blank = new VideoDeviceHeartbeat { LastSeenUtc = now.AddMinutes(-1), IsPlaying = false, LastConfigOkUtc = now };
        var blankPresence = DevicePresence.Describe(blank, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(DevicePresence.Problem, blankPresence.Status);
        Assert.Contains("Экран не показывает контент", blankPresence.Problems);

        // Музыка: экран пустой штатно, проблема — тишина. 3 битых трека из 623 не считаются ещё и недокачкой.
        var music = new VideoDeviceHeartbeat
        {
            LastSeenUtc = now.AddMinutes(-1),
            Mode = "music",
            IsPlaying = false,
            LastConfigOkUtc = now,
            ItemsReady = 620,
            ItemsTotal = 623,
            BrokenItems = 3
        };
        var musicPresence = DevicePresence.Describe(music, now, DevicePresence.DefaultOfflineAfter)!;
        // 3 битых трека из 623 — замечание, не проблема: приставка их пропускает
        Assert.Equal(["Музыка не играет"], musicPresence.Problems);
        Assert.Equal(DevicePresence.SeverityCritical, musicPresence.Severity);
        Assert.Contains("Битых треков: 3 — приставка их пропускает", musicPresence.Notices);

        // Недокачка: первые 2 часа — обычная загрузка (замечание), дольше — проблема
        music.IsPlaying = true;
        music.ItemsReady = 600;
        music.IncompleteSinceUtc = now.AddMinutes(-30);
        var downloading = DevicePresence.Describe(music, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(DevicePresence.Playing, downloading.Status);
        Assert.Contains("Скачано 600 из 623 — идёт загрузка", downloading.Notices);
        music.IncompleteSinceUtc = now.AddHours(-3);
        var stuck = DevicePresence.Describe(music, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(["Скачано 600 из 623 — уже 3 ч"], stuck.Problems);
        Assert.Equal(DevicePresence.SeverityWarning, stuck.Severity);

        // 10 битых треков — уже проблема
        music.ItemsReady = 613;
        music.BrokenItems = 10;
        music.IncompleteSinceUtc = null;
        Assert.Contains("Сломанных файлов: 10", DevicePresence.Describe(music, now, DevicePresence.DefaultOfflineAfter)!.Problems);

        var noConfig = new VideoDeviceHeartbeat
        {
            LastSeenUtc = now.AddMinutes(-1),
            IsPlaying = true,
            LastConfigOkUtc = now.AddHours(-5),
            LastError = "Неверный ключ приставки."
        };
        Assert.Contains(DevicePresence.Describe(noConfig, now, DevicePresence.DefaultOfflineAfter)!.Problems,
            p => p.Contains("Неверный ключ приставки."));

        // Порог 5 минут: 4:59 — ещё на связи, 5:01 — уже нет
        healthy.LastSeenUtc = now.AddSeconds(-299);
        Assert.Equal(DevicePresence.Playing, DevicePresence.Describe(healthy, now, DevicePresence.DefaultOfflineAfter)!.Status);
        healthy.LastSeenUtc = now.AddSeconds(-301);
        Assert.Equal(DevicePresence.Offline, DevicePresence.Describe(healthy, now, DevicePresence.DefaultOfflineAfter)!.Status);

        Assert.Null(DevicePresence.Describe(null, now, DevicePresence.DefaultOfflineAfter));
    }

    [Fact]
    public void Presence_DiagnosticsProblemsAndNotices()
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        VideoDeviceHeartbeat Healthy() => new()
        {
            LastSeenUtc = now.AddMinutes(-1),
            Mode = "video",
            IsPlaying = true,
            LastConfigOkUtc = now,
            ItemsReady = 1,
            ItemsTotal = 1,
            FreeSpaceMb = 9000,
            HdmiConnected = true,
            ClockSkewSeconds = 2,
            NetworkType = "ethernet",
            CpuTempC = 55,
            BootedAtUtc = now.AddDays(-3)
        };

        var ok = DevicePresence.Describe(Healthy(), now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(DevicePresence.Playing, ok.Status);
        Assert.Empty(ok.Notices);
        Assert.Equal("ethernet", ok.NetworkType);

        var broken = Healthy();
        broken.HdmiConnected = false;
        broken.ClockSkewSeconds = -2 * 3600;
        broken.FreeSpaceMb = 120;
        var brokenPresence = DevicePresence.Describe(broken, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(DevicePresence.Problem, brokenPresence.Status);
        // Красные первыми: экран не подключён и места меньше 300 МБ; часы — жёлтая
        Assert.Equal(["Экран не подключён (HDMI)", "Мало места: 120 МБ", "Часы приставки отстают на 2 ч"], brokenPresence.Problems);
        Assert.Equal(DevicePresence.SeverityCritical, brokenPresence.Severity);

        // Только жёлтое: места 800 МБ — скоро не влезет новый ролик
        var low = Healthy();
        low.FreeSpaceMb = 800;
        var lowPresence = DevicePresence.Describe(low, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(["Мало места: 800 МБ"], lowPresence.Problems);
        Assert.Equal(DevicePresence.SeverityWarning, lowPresence.Severity);

        // Перегрев 90 °C и 3 зависания за час — жёлтые проблемы
        var hot = Healthy();
        hot.CpuTempC = 92;
        hot.FreezesLastHour = 3;
        var hotPresence = DevicePresence.Describe(hot, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(2, hotPresence.Problems.Count);
        Assert.Equal(DevicePresence.SeverityWarning, hotPresence.Severity);

        // Замечания статус не портят
        var notices = Healthy();
        notices.Mode = "music";
        notices.HdmiConnected = false;
        notices.CpuTempC = 85;
        notices.NetworkType = "wifi";
        notices.WifiRssi = -82;
        notices.BootedAtUtc = now.AddMinutes(-12);
        var noticesPresence = DevicePresence.Describe(notices, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(DevicePresence.Playing, noticesPresence.Status);
        // Отключённый HDMI в режиме музыки — даже не замечание
        Assert.Equal(3, noticesPresence.Notices.Count);
        Assert.DoesNotContain(noticesPresence.Notices, n => n.Contains("HDMI"));
        Assert.Contains("Включилась 12 мин назад", noticesPresence.Notices);
        Assert.Contains("Слабый Wi-Fi: -82 дБм", noticesPresence.Notices);
    }

    [Fact]
    public void Presence_OfflineIsNotAFaultUnlessLongOrAlreadyBroken()
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        var day = TimeSpan.FromHours(24);
        VideoDeviceHeartbeat LastSeen(TimeSpan ago) => new()
        {
            LastSeenUtc = now - ago,
            Mode = "video",
            IsPlaying = true,
            // Последний раз настройки получены за 20 минут до пропажи связи
            LastConfigOkUtc = now - ago - TimeSpan.FromMinutes(20),
            ItemsReady = 1,
            ItemsTotal = 1
        };

        // 6 часов без интернета, до этого всё было хорошо — не неисправность, и «давно не получала настройки»
        // не появляется, хотя с последних настроек прошло больше 3 часов
        var quiet = DevicePresence.Describe(LastSeen(TimeSpan.FromHours(6)), now, DevicePresence.DefaultOfflineAfter, day)!;
        Assert.Equal(DevicePresence.Offline, quiet.Status);
        Assert.False(quiet.Attention);
        Assert.Empty(quiet.Problems);

        // Больше суток без связи — уже повод разобраться
        Assert.True(DevicePresence.Describe(LastSeen(TimeSpan.FromHours(25)), now, DevicePresence.DefaultOfflineAfter, day)!.Attention);

        // Пропала связь, а перед этим экран был пустой — выделяем сразу, проблема видна как «последняя известная»
        var broken = LastSeen(TimeSpan.FromMinutes(20));
        broken.IsPlaying = false;
        var brokenPresence = DevicePresence.Describe(broken, now, DevicePresence.DefaultOfflineAfter, day)!;
        Assert.Equal(DevicePresence.Offline, brokenPresence.Status);
        Assert.True(brokenPresence.Attention);
        Assert.Equal(["Экран не показывает контент"], brokenPresence.Problems);

        // Проблема на связи — всегда внимание
        broken.LastSeenUtc = now;
        Assert.True(DevicePresence.Describe(broken, now, DevicePresence.DefaultOfflineAfter, day)!.Attention);
    }

    [Fact]
    public void Presence_ReportsOutageAfterReconnect()
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        var heartbeat = new VideoDeviceHeartbeat
        {
            LastSeenUtc = now,
            Mode = "video",
            IsPlaying = true,
            LastConfigOkUtc = now,
            LastOutageEndedUtc = now.AddMinutes(-30),
            LastOutageSeconds = 3 * 3600,
            LastOutagePlayingPercent = 100
        };

        // 11:30 UTC = 14:30 МСК
        Assert.Equal("Была без связи 3 ч (до 14:30) — контент шёл всё время", DevicePresence.DescribeOutage(heartbeat, now));
        var presence = DevicePresence.Describe(heartbeat, now, DevicePresence.DefaultOfflineAfter)!;
        Assert.Equal(DevicePresence.Playing, presence.Status);
        Assert.Contains(presence.Notices, n => n.StartsWith("Была без связи"));

        heartbeat.LastOutagePlayingPercent = 40;
        Assert.EndsWith("контент шёл 40% времени", DevicePresence.DescribeOutage(heartbeat, now));

        // Через сутки замечание уходит
        Assert.Null(DevicePresence.DescribeOutage(heartbeat, now.AddHours(25)));
    }

    [Fact]
    public void Presence_NotEnoughSpaceIsOneClearWarning()
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        // 10.140.117.60: раздел 3 ГБ, библиотека 2,5 ГБ — 136 треков не помещаются, свободно 450 МБ
        var presence = DevicePresence.Describe(new VideoDeviceHeartbeat
        {
            LastSeenUtc = now,
            Mode = "music",
            IsPlaying = true,
            LastConfigOkUtc = now,
            ItemsReady = 487,
            ItemsTotal = 623,
            IncompleteSinceUtc = now.AddHours(-5),
            FreeSpaceMb = 450,
            NotEnoughSpaceItems = 136
        }, now, DevicePresence.DefaultOfflineAfter)!;

        // Одна строка вместо «мало места» + «скачано не всё»; музыка играет — жёлтый, не красный
        Assert.Equal(["Не хватает места: скачано 487 из 623 (свободно 450 МБ)"], presence.Problems);
        Assert.Equal(DevicePresence.SeverityWarning, presence.Severity);
    }

    [Theory]
    // 2.0/2.0.1 не сообщают NotEnoughSpaceItems: «мало места» + «скачано не всё» — тоже одна проблема
    [InlineData(400L, "warning")]
    [InlineData(250L, "critical")]
    public void Presence_LowSpaceWithIncompleteDownload_IsSingleProblem(long freeMb, string severity)
    {
        var now = new DateTime(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);
        var presence = DevicePresence.Describe(new VideoDeviceHeartbeat
        {
            LastSeenUtc = now,
            Mode = "music",
            IsPlaying = true,
            LastConfigOkUtc = now,
            ItemsReady = 422,
            ItemsTotal = 623,
            IncompleteSinceUtc = now.AddHours(-20),
            FreeSpaceMb = freeMb
        }, now, DevicePresence.DefaultOfflineAfter)!;

        Assert.Equal([$"Не хватает места: скачано 422 из 623 (свободно {freeMb} МБ)"], presence.Problems);
        Assert.Equal(severity == "critical" ? DevicePresence.SeverityCritical : DevicePresence.SeverityWarning, presence.Severity);
    }

    [Theory]
    // X96Q-подделка: заявлено 2 ГБ, физически 1 ГБ
    [InlineData(2048L, 1024L, true)]
    // Честная приставка: заявлено чуть меньше физического (ядро забирает себе)
    [InlineData(1977L, 2048L, false)]
    [InlineData(2048L, null, false)]
    public void Presence_FakeRamNotice(long total, long? physical, bool expectNotice)
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        var presence = DevicePresence.Describe(new VideoDeviceHeartbeat
        {
            LastSeenUtc = now,
            Mode = "video",
            IsPlaying = true,
            LastConfigOkUtc = now,
            RamTotalMb = total,
            RamPhysicalMb = physical
        }, now, DevicePresence.DefaultOfflineAfter)!;

        var notice = presence.Notices.FirstOrDefault(n => n.StartsWith("Прошивка завышает"));
        Assert.Equal(expectNotice, notice != null);
        if (expectNotice)
        {
            Assert.Equal("Прошивка завышает объём памяти: заявлено 2 ГБ, на самом деле 1 ГБ — приставка слабее, чем выглядит", notice);
        }
    }

    [Theory]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    [InlineData(false, false, true)]
    [InlineData(null, null, false)]
    public void Presence_NoRightsNotice(bool? hasRoot, bool? deviceOwner, bool expectNotice)
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        var presence = DevicePresence.Describe(new VideoDeviceHeartbeat
        {
            LastSeenUtc = now,
            Mode = "video",
            IsPlaying = true,
            LastConfigOkUtc = now,
            HasRoot = hasRoot,
            DeviceOwner = deviceOwner
        }, now, DevicePresence.DefaultOfflineAfter)!;

        Assert.Equal(expectNotice, presence.Notices.Any(n => n.StartsWith("Нет root")));
        Assert.Equal(hasRoot, presence.HasRoot);
        // Нет прав — это не поломка: контент идёт, статус зелёный
        Assert.Equal(DevicePresence.Playing, presence.Status);
    }

    [Fact]
    public void Df_FreeSpaceFromDifferentFirmwares()
    {
        // X96mini Plus (10.140.117.60): память забита
        Assert.Equal(48L, VideoLibrary.ParseDfFreeMb(
            "Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/block/data   3080192 3031000     49192  99% /data\n"));
        // Длинное имя устройства на отдельной строке — столбцы сдвинуты
        Assert.Equal(6362L, VideoLibrary.ParseDfFreeMb(
            "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/by-name/userdata\n 12189640 5674264 6515376 47% /data"));
        Assert.Null(VideoLibrary.ParseDfFreeMb("df: /data: Permission denied"));
        Assert.Null(VideoLibrary.ParseDfFreeMb(""));
    }

    [Theory]
    [InlineData("2.0-test.apk", true)]
    [InlineData("1.9.APK", true)]
    [InlineData("../2.0.apk", false)]
    [InlineData("sub/2.0.apk", false)]
    [InlineData(".hidden.apk", false)]
    [InlineData("video.mp4", false)]
    [InlineData("", false)]
    public void ApkFile_OnlyPlainApkNamesInRoot(string name, bool expected)
    {
        var root = Path.Combine(Path.GetTempPath(), "tvid-root");
        Assert.Equal(expected, VideoLibrary.TryResolveApkFile(root, name, out var fullPath));
        if (expected)
        {
            Assert.Equal(Path.Combine(root, name.Trim()), fullPath, ignoreCase: true);
        }
    }

    [Theory]
    [InlineData("office.ludilove.ru", true)]
    [InlineData("portal.ludilove.ru", true)]
    [InlineData("", false)]
    [InlineData("evil.ru/<script>", false)]
    [InlineData("a..b", false)]
    [InlineData("-bad.ru", false)]
    public void PortalHost_OnlyPlainHostNames(string value, bool expected) =>
        Assert.Equal(expected, VideoDeviceApiController.IsHostName(value));

    [Fact]
    public void Presence_SoundAndFreezes()
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        VideoDeviceHeartbeat Music() => new()
        {
            LastSeenUtc = now,
            Mode = "music",
            IsPlaying = true,
            LastConfigOkUtc = now,
            VolumePercent = 70,
            SystemMuted = false,
            AudioOutput = "line",
            HdmiConnected = true
        };
        Assert.Empty(PresenceDtoOf(Music()).Problems);

        // Громкость 0 — тишина в зале, хотя плеер «играет»
        var silent = Music();
        silent.VolumePercent = 0;
        Assert.Contains("Звук выключен на приставке (громкость 0%)", PresenceDtoOf(silent).Problems);

        // Тишина по расписанию — не проблема
        silent.Muted = true;
        Assert.Empty(PresenceDtoOf(silent).Problems);

        // Звук идёт в HDMI, а телевизора нет
        var hdmi = Music();
        hdmi.AudioOutput = "hdmi";
        hdmi.HdmiConnected = false;
        Assert.Contains("Звук идёт в HDMI, а телевизор не подключён", PresenceDtoOf(hdmi).Problems);
        Assert.DoesNotContain(PresenceDtoOf(hdmi).Notices, n => n.StartsWith("Экран не подключён"));

        var quiet = Music();
        quiet.VolumePercent = 10;
        Assert.Contains("Тихо: громкость на приставке 10%", PresenceDtoOf(quiet).Notices);

        // Видео: громкость не важна (ролики без звука), а зависание — проблема
        var video = Music();
        video.Mode = "video";
        video.VolumePercent = 0;
        video.StalledSeconds = 50;
        video.FreezesLastHour = 2;
        var videoPresence = PresenceDtoOf(video);
        Assert.Equal(["Изображение зависло: стоит 50 с"], videoPresence.Problems);
        Assert.Contains(videoPresence.Notices, n => n.StartsWith("Плеер зависал за последний час: 2"));
    }

    private static DevicePresence.PresenceDto PresenceDtoOf(VideoDeviceHeartbeat heartbeat) =>
        DevicePresence.Describe(heartbeat, heartbeat.LastSeenUtc, DevicePresence.DefaultOfflineAfter)!;

    [Fact]
    public void ClockSkew_FromDeviceTime()
    {
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        var nowMs = new DateTimeOffset(now).ToUnixTimeMilliseconds();
        Assert.Equal(90, VideoDeviceApiController.ClockSkewSeconds(nowMs + 90_000, now));
        Assert.Equal(-600, VideoDeviceApiController.ClockSkewSeconds(nowMs - 600_000, now));
        Assert.Null(VideoDeviceApiController.ClockSkewSeconds(null, now));
        // Часы сброшены на 1970 год — ограничиваем, а не переполняем int
        Assert.Equal(-10 * 365 * 24 * 3600, VideoDeviceApiController.ClockSkewSeconds(1, now));
    }

    [Theory]
    [InlineData("TV1_06112026.mp4", true)]
    [InlineData("Chris & Bella - Merry Memories [11113].mp3", true)]
    [InlineData("../secret", false)]
    [InlineData("a/b.mp4", false)]
    [InlineData("a\\b.mp4", false)]
    [InlineData("..", false)]
    [InlineData("", false)]
    public void DeviceCommand_FileNameIsPlainName(string name, bool expected) =>
        Assert.Equal(expected, VideoDevicesController.IsSafeDeviceFileName(name));

    [Fact]
    public async Task AdminDeviceList_IncludesPresenceFromHeartbeats()
    {
        await using var db = CreateDb();
        var withSignal = Guid.NewGuid();
        var oldApp = Guid.NewGuid();
        db.VideoDevices.AddRange(
            new VideoDevice { Guid = withSignal, Ip = "10.0.0.1:8080" },
            new VideoDevice { Guid = oldApp, Ip = "10.0.0.2:8080" });
        db.VideoDeviceHeartbeats.Add(new VideoDeviceHeartbeat
        {
            DeviceGuid = withSignal,
            LastSeenUtc = DateTime.UtcNow.AddMinutes(-20),
            IsPlaying = true
        });
        await db.SaveChangesAsync();

        var result = Assert.IsType<OkObjectResult>(await CreateAdmin(db).GetDevicesPresence());
        var json = System.Text.Json.JsonSerializer.Serialize(result.Value);

        Assert.Contains(withSignal.ToString(), json);
        Assert.Contains("\"Status\":\"offline\"", json);
        Assert.DoesNotContain(oldApp.ToString(), json);
    }

    // ---------- Admin API ----------

    [Fact]
    public async Task AdminDeviceCommands_RefuseUnregisteredOrInvalidAddresses()
    {
        await using var db = CreateDb();
        var controller = CreateAdmin(db);

        Assert.IsType<NotFoundObjectResult>(await controller.ReloadDevice(new() { Ip = "10.9.9.9:8080" }));
        Assert.IsType<BadRequestObjectResult>(await controller.GetScreenshot("internal-host/secret#"));
        Assert.IsType<BadRequestObjectResult>(await controller.TryToConnectDevice(new() { Ip = "8.8.8.8" }));
    }

    [Fact]
    public async Task CreateDevice_ValidatesAndNormalizes()
    {
        await using var db = CreateDb();
        db.VideoDevices.Add(new VideoDevice { Guid = Guid.NewGuid(), Ip = "10.0.0.1:8080" });
        await db.SaveChangesAsync();
        var controller = CreateAdmin(db);
        var location = Guid.NewGuid();

        Assert.IsType<BadRequestObjectResult>(await controller.CreateDevice(new() { LocationGuid = location, Ip = "10.0.0.1" }));
        Assert.IsType<BadRequestObjectResult>(await controller.CreateDevice(new() { LocationGuid = location, Ip = "10.0.0.2:9200" }));
        Assert.IsType<BadRequestObjectResult>(await controller.CreateDevice(new() { LocationGuid = location, Ip = "10.0.0.2", ContentType = 0 }));
        Assert.IsType<BadRequestObjectResult>(await controller.CreateDevice(new() { LocationGuid = location, Ip = "10.0.0.2", VideoNames = ["нет.mp4"] }));
        Assert.IsType<BadRequestObjectResult>(await controller.CreateDevice(new() { LocationGuid = location, Ip = "10.0.0.2", MuteStartTime = "1.02:00", MuteEndTime = "07:50" }));

        var ok = await controller.CreateDevice(new()
        {
            LocationGuid = location,
            Ip = "10.0.0.2",
            VideoNames = ["Новое видео.mp4"],
            MuteStartTime = "7:05:00",
            MuteEndTime = "23:10"
        });

        Assert.IsType<OkObjectResult>(ok);
        var saved = await db.VideoDevices.SingleAsync(x => x.Ip == "10.0.0.2:8080");
        Assert.Equal("[Новое видео.mp4]", saved.VideoList);
        Assert.Equal("07:05", saved.MuteStartTime);
    }

    [Theory]
    [InlineData("23:10", "23:10")]
    [InlineData("7:5", "07:05")]
    [InlineData("07:50:00", "07:50")]
    [InlineData("24:00", null)]
    [InlineData("1.02:00", null)]
    [InlineData("07:50:30", null)]
    public void TryNormalizeMuteTime_ProducesClientFormat(string input, string? expected)
    {
        var ok = VideoDevicesController.TryNormalizeMuteTime(input, out var normalized);

        Assert.Equal(expected != null, ok);
        if (expected != null)
        {
            Assert.Equal(expected, normalized);
        }
    }

    // ---------- helpers ----------

    private static RKNETDBContext CreateDb() =>
        new(new DbContextOptionsBuilder<RKNETDBContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private IConfiguration CreateConfiguration(string? deviceKey = DeviceKey, int stableFileAgeSeconds = 0) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["VideoDevices:RootPath"] = _root,
                ["VideoDevices:StableFileAgeSeconds"] = stableFileAgeSeconds.ToString(),
                [DeviceApiKeyAttribute.ConfigKey] = deviceKey
            })
            .Build();

    private VideoDeviceApiController CreateDeviceApi(RKNETDBContext db, int stableFileAgeSeconds = 0) =>
        new(db, CreateConfiguration(stableFileAgeSeconds: stableFileAgeSeconds), new MemoryCache(new MemoryCacheOptions()),
            NullLogger<VideoDeviceApiController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

    private VideoDevicesController CreateAdmin(RKNETDBContext db) =>
        new(db, new ThrowingHttpClientFactory(), CreateConfiguration(), NullLogger<VideoDevicesController>.Instance, new VideoPreviewTickets())
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

    private AuthorizationFilterContext CreateAuthorizationContext(string? configuredKey, string? providedKey)
    {
        var services = new ServiceCollection()
            .AddSingleton(CreateConfiguration(configuredKey))
            .AddLogging()
            .BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        if (providedKey != null)
        {
            httpContext.Request.Headers[DeviceApiKeyAttribute.HeaderName] = providedKey;
        }

        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        return new AuthorizationFilterContext(actionContext, []);
    }

    /// <summary>Тесты не должны ходить в сеть: любой исходящий запрос — ошибка теста.</summary>
    private sealed class ThrowingHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("Outgoing HTTP is not expected in this test.");
    }
}
