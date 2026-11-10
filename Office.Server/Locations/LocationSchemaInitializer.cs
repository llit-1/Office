using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Locations;

/// <summary>
/// Добавляет Locations.AltName и таблицу реквизитов (OBD и юрлицо по периодам).
/// Локации без реквизитов получают первую версию из своей актуальной версии LocationVersions;
/// если даты открытия нет, версия начинается 01.01.2020.
/// </summary>
public sealed class LocationSchemaInitializer(RKNETDBContext db)
{
    // Столбцы, которых может ещё не быть на момент компиляции пакета, трогаются только через EXEC.
    private const string SchemaSql = """
IF COL_LENGTH(N'[dbo].[Locations]', N'AltName') IS NULL
BEGIN
    ALTER TABLE [dbo].[Locations] ADD [AltName] nvarchar(50) NULL;
END;

-- первая сборка держала одни коды OBD в OfficeOBDVersions
IF OBJECT_ID(N'[dbo].[OfficeOBDVersions]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[OfficeLocationRequisites]', N'U') IS NULL
BEGIN
    EXEC sp_rename N'dbo.OfficeOBDVersions', N'OfficeLocationRequisites';
    EXEC sp_rename N'dbo.PK_OfficeOBDVersions', N'PK_OfficeLocationRequisites', N'OBJECT';
    EXEC sp_rename N'dbo.FK_OfficeOBDVersions_Locations', N'FK_OfficeLocationRequisites_Locations', N'OBJECT';
    EXEC sp_rename N'dbo.CK_OfficeOBDVersions_Period', N'CK_OfficeLocationRequisites_Period', N'OBJECT';
    EXEC sp_rename N'dbo.OfficeLocationRequisites.IX_OfficeOBDVersions_Location', N'IX_OfficeLocationRequisites_Location', N'INDEX';
END;

IF OBJECT_ID(N'[dbo].[OfficeLocationRequisites]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeLocationRequisites](
        [Id] int IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OfficeLocationRequisites] PRIMARY KEY,
        [OBD] int NULL,
        [EntityGuid] uniqueidentifier NULL
            CONSTRAINT [FK_OfficeLocationRequisites_Entity] FOREIGN KEY REFERENCES [dbo].[Entity]([GUID]),
        [Begin] date NOT NULL,
        [End] date NULL,
        [Location] uniqueidentifier NOT NULL
            CONSTRAINT [FK_OfficeLocationRequisites_Locations] FOREIGN KEY REFERENCES [dbo].[Locations]([GUID]),
        CONSTRAINT [CK_OfficeLocationRequisites_Period] CHECK ([End] IS NULL OR [End] >= [Begin])
    );
    CREATE INDEX [IX_OfficeLocationRequisites_Location] ON [dbo].[OfficeLocationRequisites]([Location], [Begin]);
END
ELSE
BEGIN
    IF COL_LENGTH(N'[dbo].[OfficeLocationRequisites]', N'EntityGuid') IS NULL
        EXEC(N'ALTER TABLE [dbo].[OfficeLocationRequisites] ADD [EntityGuid] uniqueidentifier NULL
            CONSTRAINT [FK_OfficeLocationRequisites_Entity] FOREIGN KEY REFERENCES [dbo].[Entity]([GUID]);');
    IF EXISTS (SELECT 1 FROM sys.columns WHERE [object_id] = OBJECT_ID(N'[dbo].[OfficeLocationRequisites]') AND [name] = N'OBD' AND is_nullable = 0)
        EXEC(N'ALTER TABLE [dbo].[OfficeLocationRequisites] ALTER COLUMN [OBD] int NULL;');
END;

-- промежуточная сборка хранила юрлицо в Locations.ENTITYGUID: переносим его в реквизиты и убираем колонку
DECLARE @hasLocationEntity bit = CASE WHEN COL_LENGTH(N'[dbo].[Locations]', N'ENTITYGUID') IS NULL THEN 0 ELSE 1 END;
IF @hasLocationEntity = 1
    EXEC(N'UPDATE r SET r.[EntityGuid] = l.[ENTITYGUID]
        FROM [dbo].[OfficeLocationRequisites] r
        JOIN [dbo].[Locations] l ON l.[GUID] = r.[Location]
        WHERE r.[EntityGuid] IS NULL AND l.[ENTITYGUID] IS NOT NULL;');

DECLARE @seed nvarchar(max) = N'
INSERT INTO [dbo].[OfficeLocationRequisites]([OBD], [EntityGuid], [Begin], [End], [Location])
SELECT s.[OBD], s.[EntityGuid], s.[Begin], NULL, s.[Location]
FROM (
    SELECT NULLIF(v.[OBD], 0) AS [OBD],
           ' + CASE WHEN @hasLocationEntity = 1 THEN N'COALESCE(l.[ENTITYGUID], v.[ENTITYGUID])' ELSE N'v.[ENTITYGUID]' END + N' AS [EntityGuid],
           CAST(COALESCE(v.[VERSIONSTARTDATE], ''20200101'') AS date) AS [Begin],
           l.[GUID] AS [Location]
    FROM [dbo].[Locations] l
    CROSS APPLY (
        SELECT TOP (1) x.[OBD], x.[ENTITYGUID], x.[VERSIONSTARTDATE]
        FROM [dbo].[LocationVersions] x
        WHERE x.[LOCATIONGUID] = l.[GUID]
        ORDER BY CASE WHEN x.[ACTUAL] = 1 AND x.[VERSIONENDDATE] IS NULL THEN 0 ELSE 1 END,
                 x.[VERSIONSTARTDATE] DESC, x.[GUID] DESC
    ) v
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[OfficeLocationRequisites] r WHERE r.[Location] = l.[GUID])
) s
WHERE s.[OBD] IS NOT NULL OR s.[EntityGuid] IS NOT NULL;';
EXEC(@seed);

IF @hasLocationEntity = 1
BEGIN
    IF OBJECT_ID(N'[dbo].[FK_Locations_Entity]', N'F') IS NOT NULL
        ALTER TABLE [dbo].[Locations] DROP CONSTRAINT [FK_Locations_Entity];
    EXEC(N'ALTER TABLE [dbo].[Locations] DROP COLUMN [ENTITYGUID];');
END;
""";

    public Task InitializeAsync(CancellationToken cancellationToken = default) =>
        db.Database.ExecuteSqlRawAsync(SchemaSql, cancellationToken);
}
