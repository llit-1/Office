using System.Data;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.KnowledgeLibrary;

public sealed class KnowledgeLibrarySchemaInitializer(
    RKNETDBContext db,
    IWebHostEnvironment environment,
    ILogger<KnowledgeLibrarySchemaInitializer> logger)
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        const string sql = """
IF OBJECT_ID(N'[dbo].[OfficeKnowledgeSections]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeKnowledgeSections](
        [Id] uniqueidentifier NOT NULL CONSTRAINT [PK_OfficeKnowledgeSections] PRIMARY KEY,
        [Title] nvarchar(160) NOT NULL,
        [Description] nvarchar(500) NOT NULL CONSTRAINT [DF_OfficeKnowledgeSections_Description] DEFAULT N'',
        [RootPath] nvarchar(1024) NOT NULL,
        [IsActive] bit NOT NULL CONSTRAINT [DF_OfficeKnowledgeSections_IsActive] DEFAULT 1,
        [AvailableToAll] bit NOT NULL CONSTRAINT [DF_OfficeKnowledgeSections_AvailableToAll] DEFAULT 0,
        [SortOrder] int NOT NULL CONSTRAINT [DF_OfficeKnowledgeSections_SortOrder] DEFAULT 0,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        [LastIndexedAtUtc] datetime2 NULL,
        [IndexStatus] nvarchar(24) NOT NULL CONSTRAINT [DF_OfficeKnowledgeSections_IndexStatus] DEFAULT N'Pending',
        [IndexError] nvarchar(1000) NULL
    );
END;

IF OBJECT_ID(N'[dbo].[OfficeKnowledgeSectionCovers]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeKnowledgeSectionCovers](
        [SectionId] uniqueidentifier NOT NULL CONSTRAINT [PK_OfficeKnowledgeSectionCovers] PRIMARY KEY,
        [ContentType] nvarchar(100) NOT NULL,
        [Data] varbinary(max) NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [FK_OfficeKnowledgeSectionCovers_Sections] FOREIGN KEY ([SectionId]) REFERENCES [dbo].[OfficeKnowledgeSections]([Id]) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'[dbo].[OfficeKnowledgeSectionRoles]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeKnowledgeSectionRoles](
        [SectionId] uniqueidentifier NOT NULL,
        [OfficeRoleId] int NOT NULL,
        CONSTRAINT [PK_OfficeKnowledgeSectionRoles] PRIMARY KEY ([SectionId], [OfficeRoleId]),
        CONSTRAINT [FK_OfficeKnowledgeSectionRoles_Sections] FOREIGN KEY ([SectionId]) REFERENCES [dbo].[OfficeKnowledgeSections]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_OfficeKnowledgeSectionRoles_Roles] FOREIGN KEY ([OfficeRoleId]) REFERENCES [dbo].[OfficeRole]([ID]) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'[dbo].[OfficeKnowledgeDocuments]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeKnowledgeDocuments](
        [Id] uniqueidentifier NOT NULL CONSTRAINT [PK_OfficeKnowledgeDocuments] PRIMARY KEY,
        [SectionId] uniqueidentifier NOT NULL,
        [RelativePath] nvarchar(1024) NOT NULL,
        [Name] nvarchar(260) NOT NULL,
        [Extension] nvarchar(24) NOT NULL CONSTRAINT [DF_OfficeKnowledgeDocuments_Extension] DEFAULT N'',
        [IsDirectory] bit NOT NULL,
        [Size] bigint NOT NULL,
        [LastWriteTimeUtc] datetime2 NOT NULL,
        [IndexedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [FK_OfficeKnowledgeDocuments_Sections] FOREIGN KEY ([SectionId]) REFERENCES [dbo].[OfficeKnowledgeSections]([Id]) ON DELETE CASCADE
    );
END;

IF COL_LENGTH(N'[dbo].[OfficeKnowledgeDocuments]', N'Content') IS NULL
BEGIN
    ALTER TABLE [dbo].[OfficeKnowledgeDocuments] ADD [Content] nvarchar(max) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_OfficeKnowledgeDocuments_Section' AND [object_id] = OBJECT_ID(N'[dbo].[OfficeKnowledgeDocuments]'))
    CREATE INDEX [IX_OfficeKnowledgeDocuments_Section] ON [dbo].[OfficeKnowledgeDocuments]([SectionId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_OfficeKnowledgeDocuments_Section_Name' AND [object_id] = OBJECT_ID(N'[dbo].[OfficeKnowledgeDocuments]'))
    CREATE INDEX [IX_OfficeKnowledgeDocuments_Section_Name] ON [dbo].[OfficeKnowledgeDocuments]([SectionId], [Name]);

IF OBJECT_ID(N'[dbo].[OfficeKnowledgeFavorites]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeKnowledgeFavorites](
        [OfficeUserId] int NOT NULL,
        [DocumentId] uniqueidentifier NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_OfficeKnowledgeFavorites] PRIMARY KEY ([OfficeUserId], [DocumentId]),
        CONSTRAINT [FK_OfficeKnowledgeFavorites_Users] FOREIGN KEY ([OfficeUserId]) REFERENCES [dbo].[OfficeUser]([Id]),
        CONSTRAINT [FK_OfficeKnowledgeFavorites_Documents] FOREIGN KEY ([DocumentId]) REFERENCES [dbo].[OfficeKnowledgeDocuments]([Id]) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'[dbo].[OfficeKnowledgeHistory]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeKnowledgeHistory](
        [Id] bigint IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OfficeKnowledgeHistory] PRIMARY KEY,
        [OfficeUserId] int NOT NULL,
        [DocumentId] uniqueidentifier NOT NULL,
        [OpenedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [FK_OfficeKnowledgeHistory_Users] FOREIGN KEY ([OfficeUserId]) REFERENCES [dbo].[OfficeUser]([Id]),
        CONSTRAINT [FK_OfficeKnowledgeHistory_Documents] FOREIGN KEY ([DocumentId]) REFERENCES [dbo].[OfficeKnowledgeDocuments]([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_OfficeKnowledgeHistory_User_Date] ON [dbo].[OfficeKnowledgeHistory]([OfficeUserId], [OpenedAtUtc] DESC);
END;

IF OBJECT_ID(N'[dbo].[OfficeKnowledgeIndexErrors]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeKnowledgeIndexErrors](
        [Id] bigint IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OfficeKnowledgeIndexErrors] PRIMARY KEY,
        [SectionId] uniqueidentifier NOT NULL,
        [Path] nvarchar(1024) NOT NULL,
        [Message] nvarchar(1000) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [FK_OfficeKnowledgeIndexErrors_Sections] FOREIGN KEY ([SectionId]) REFERENCES [dbo].[OfficeKnowledgeSections]([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM [dbo].[OfficeRole] WHERE [Role] = N'KnowledgeLibrary')
    INSERT INTO [dbo].[OfficeRole] ([Name], [Description], [Role]) VALUES (N'Библиотека знаний', N'Просмотр доступных разделов библиотеки знаний', N'KnowledgeLibrary');

IF NOT EXISTS (SELECT 1 FROM [dbo].[OfficeRole] WHERE [Role] = N'KnowledgeLibraryAdmin')
    INSERT INTO [dbo].[OfficeRole] ([Name], [Description], [Role]) VALUES (N'Администратор библиотеки знаний', N'Управление разделами и доступом библиотеки знаний', N'KnowledgeLibraryAdmin');
""";

        await db.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        await MigrateLegacyCoversAsync(cancellationToken);
        logger.LogInformation("Knowledge library database schema is ready.");
    }

    private async Task MigrateLegacyCoversAsync(CancellationToken cancellationToken)
    {
        var legacyCovers = await ReadLegacyCoverRowsAsync(cancellationToken);
        if (legacyCovers.Count == 0)
            return;

        var sectionIds = legacyCovers.Select(x => x.SectionId).ToArray();
        var existingCoverIds = (await db.OfficeKnowledgeSectionCovers
            .AsNoTracking()
            .Where(x => sectionIds.Contains(x.SectionId))
            .Select(x => x.SectionId)
            .ToListAsync(cancellationToken))
            .ToHashSet();
        var directory = Path.Combine(environment.ContentRootPath, "App_Data", "KnowledgeLibrary", "Covers");
        var migratedCount = 0;

        foreach (var legacy in legacyCovers)
        {
            try
            {
                var safeName = Path.GetFileName(legacy.FileName);
                if (!safeName.Equals(legacy.FileName, StringComparison.Ordinal) || !KnowledgeLibraryFilePolicy.IsAllowedCover(safeName))
                    continue;

                var path = Path.Combine(directory, safeName);
                if (!existingCoverIds.Contains(legacy.SectionId))
                {
                    if (!File.Exists(path))
                        continue;

                    var fileInfo = new FileInfo(path);
                    if (fileInfo.Length is <= 0 or > 5 * 1024 * 1024)
                    {
                        logger.LogWarning("Legacy knowledge cover {CoverFileName} has an invalid size and was not migrated.", safeName);
                        continue;
                    }

                    var data = await File.ReadAllBytesAsync(path, cancellationToken);
                    db.OfficeKnowledgeSectionCovers.Add(new OfficeKnowledgeSectionCover
                    {
                        SectionId = legacy.SectionId,
                        ContentType = GetCoverContentType(safeName),
                        Data = data,
                        UpdatedAtUtc = DateTime.UtcNow
                    });
                    await db.SaveChangesAsync(cancellationToken);
                    existingCoverIds.Add(legacy.SectionId);
                }

                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE [dbo].[OfficeKnowledgeSections] SET [CoverFileName] = NULL WHERE [Id] = {legacy.SectionId}",
                    cancellationToken);
                if (File.Exists(path))
                    File.Delete(path);
                migratedCount++;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or DbUpdateException)
            {
                logger.LogWarning(ex, "Legacy knowledge cover for section {SectionId} could not be migrated.", legacy.SectionId);
            }
        }

        if (migratedCount > 0)
            logger.LogInformation("Migrated {Count} knowledge library covers from App_Data to SQL Server.", migratedCount);
    }

    private async Task<List<LegacyCoverRow>> ReadLegacyCoverRowsAsync(CancellationToken cancellationToken)
    {
        var result = new List<LegacyCoverRow>();
        var connection = db.Database.GetDbConnection();
        var shouldClose = connection.State != ConnectionState.Open;
        if (shouldClose)
            await connection.OpenAsync(cancellationToken);

        try
        {
            await using (var columnCommand = connection.CreateCommand())
            {
                columnCommand.CommandText = "SELECT CASE WHEN COL_LENGTH(N'[dbo].[OfficeKnowledgeSections]', N'CoverFileName') IS NULL THEN 0 ELSE 1 END";
                var exists = Convert.ToInt32(await columnCommand.ExecuteScalarAsync(cancellationToken)) == 1;
                if (!exists)
                    return result;
            }

            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT [Id], [CoverFileName] FROM [dbo].[OfficeKnowledgeSections] WHERE [CoverFileName] IS NOT NULL AND [CoverFileName] <> N''";
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                result.Add(new LegacyCoverRow(reader.GetGuid(0), reader.GetString(1)));
        }
        finally
        {
            if (shouldClose)
                await connection.CloseAsync();
        }

        return result;
    }

    private static string GetCoverContentType(string fileName)
    {
        if (Path.GetExtension(fileName).Equals(".svg", StringComparison.OrdinalIgnoreCase))
            return "image/svg+xml";
        return ContentTypes.TryGetContentType(fileName, out var contentType) ? contentType : "application/octet-stream";
    }

    private sealed record LegacyCoverRow(Guid SectionId, string FileName);
}
