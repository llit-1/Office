using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Reports;

/// <summary>Создаёт таблицу настроек отчётов и недостающие роли раздела. Существующие данные не меняются.</summary>
public sealed class ReportsInitializer(RKNETDBContext db)
{
    private const string SchemaSql = """
IF OBJECT_ID(N'[dbo].[OfficeReportSettings]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeReportSettings](
        [Id] int IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OfficeReportSettings] PRIMARY KEY,
        [ReportCode] nvarchar(40) NOT NULL,
        [OfficeUserId] int NULL,
        [Value] nvarchar(2000) NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        [UpdatedBy] nvarchar(50) NULL,
        CONSTRAINT [FK_OfficeReportSettings_OfficeUser] FOREIGN KEY ([OfficeUserId]) REFERENCES [dbo].[OfficeUser]([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'UX_OfficeReportSettings_Common' AND [object_id] = OBJECT_ID(N'[dbo].[OfficeReportSettings]'))
BEGIN
    CREATE UNIQUE INDEX [UX_OfficeReportSettings_Common] ON [dbo].[OfficeReportSettings]([ReportCode]) WHERE [OfficeUserId] IS NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'UX_OfficeReportSettings_Personal' AND [object_id] = OBJECT_ID(N'[dbo].[OfficeReportSettings]'))
BEGIN
    CREATE UNIQUE INDEX [UX_OfficeReportSettings_Personal] ON [dbo].[OfficeReportSettings]([ReportCode], [OfficeUserId]) WHERE [OfficeUserId] IS NOT NULL;
END;
""";

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await db.Database.ExecuteSqlRawAsync(SchemaSql, cancellationToken);

        var existingRoles = await db.OfficeRole
            .Select(role => role.Role)
            .ToListAsync(cancellationToken);

        foreach (var definition in ReportRoles.Definitions.Where(x => !existingRoles.Contains(x.Code)))
        {
            db.OfficeRole.Add(new OfficeRole
            {
                Role = definition.Code,
                Name = definition.Name,
                Description = definition.Description,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
