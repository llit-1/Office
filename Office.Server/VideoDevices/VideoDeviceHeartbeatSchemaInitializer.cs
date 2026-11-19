using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.VideoDevices;

/// <summary>
/// Создаёт таблицу сигналов приставок, если её ещё нет. Таблица новая и отдельная:
/// VideoDevices общая со старым порталом, её схему не меняем.
/// </summary>
public sealed class VideoDeviceHeartbeatSchemaInitializer(RKNETDBContext db)
{
    private const string SchemaSql = """
IF OBJECT_ID(N'[dbo].[OfficeVideoDeviceHeartbeats]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeVideoDeviceHeartbeats](
        [DeviceGuid] uniqueidentifier NOT NULL CONSTRAINT [PK_OfficeVideoDeviceHeartbeats] PRIMARY KEY,
        [LastSeenUtc] datetime2 NOT NULL,
        [RemoteIp] nvarchar(64) NULL,
        [AppVersion] nvarchar(20) NULL,
        [Mode] nvarchar(10) NULL,
        [IsPlaying] bit NOT NULL,
        [Muted] bit NOT NULL,
        [CurrentFile] nvarchar(260) NULL,
        [LastConfigOkUtc] datetime2 NULL,
        [LastError] nvarchar(500) NULL,
        [ItemsReady] int NOT NULL,
        [ItemsTotal] int NOT NULL,
        [BrokenItems] int NOT NULL,
        [FreeSpaceMb] bigint NULL,
        [UptimeSeconds] bigint NULL
    );
END;

-- Диагностика (добавлено позже): колонки дописываются в уже созданную таблицу.
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'ClockSkewSeconds') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [ClockSkewSeconds] int NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'BootedAtUtc') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [BootedAtUtc] datetime2 NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'NetworkType') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [NetworkType] nvarchar(10) NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'WifiRssi') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [WifiRssi] int NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'DownloadKbps') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [DownloadKbps] bigint NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'PortalHost') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [PortalHost] nvarchar(100) NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'HdmiConnected') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [HdmiConnected] bit NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'RamFreeMb') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [RamFreeMb] bigint NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'CpuTempC') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [CpuTempC] int NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'LastOutageEndedUtc') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [LastOutageEndedUtc] datetime2 NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'LastOutageSeconds') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [LastOutageSeconds] bigint NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'LastOutagePlayingPercent') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [LastOutagePlayingPercent] int NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'VolumePercent') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [VolumePercent] int NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'SystemMuted') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [SystemMuted] bit NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'AudioOutput') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [AudioOutput] nvarchar(10) NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'StalledSeconds') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [StalledSeconds] bigint NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'FreezesLastHour') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [FreezesLastHour] int NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'HasRoot') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [HasRoot] bit NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'DeviceOwner') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [DeviceOwner] bit NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'RamTotalMb') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [RamTotalMb] bigint NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'IncompleteSinceUtc') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [IncompleteSinceUtc] datetime2 NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'RamPhysicalMb') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [RamPhysicalMb] bigint NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'NotEnoughSpaceItems') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [NotEnoughSpaceItems] int NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'LastAutoRebootUtc') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [LastAutoRebootUtc] datetime2 NULL;
IF COL_LENGTH(N'dbo.OfficeVideoDeviceHeartbeats', N'LastAutoRebootReason') IS NULL
    ALTER TABLE [dbo].[OfficeVideoDeviceHeartbeats] ADD [LastAutoRebootReason] nvarchar(20) NULL;

-- Публичные ключи ADB (сервер и инженеры). Приставки с root дописывают их в /data/misc/adb/adb_keys,
-- чтобы подключение по ADB не требовало нажимать «Разрешить» на месте. Ключи заносятся вручную в БД.
IF OBJECT_ID(N'[dbo].[OfficeAdbKeys]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeAdbKeys](
        [Id] int IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OfficeAdbKeys] PRIMARY KEY,
        [Name] nvarchar(100) NOT NULL,
        [PublicKey] nvarchar(1000) NOT NULL,
        [Enabled] bit NOT NULL CONSTRAINT [DF_OfficeAdbKeys_Enabled] DEFAULT (1),
        [CreatedUtc] datetime2 NOT NULL CONSTRAINT [DF_OfficeAdbKeys_CreatedUtc] DEFAULT (SYSUTCDATETIME())
    );
END;
""";

    public Task InitializeAsync(CancellationToken cancellationToken = default) =>
        db.Database.ExecuteSqlRawAsync(SchemaSql, cancellationToken);
}
