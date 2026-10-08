using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Nx;

namespace Office.Server.Security;

/// <summary>Создаёт роль доступа к Nx Witness, если её ещё нет. Существующие назначения не меняются.</summary>
public sealed class NxRoleInitializer(RKNETDBContext db)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (await db.OfficeRole.AnyAsync(x => x.Role == NxUserSyncService.RoleCode, cancellationToken))
        {
            return;
        }

        db.OfficeRole.Add(new OfficeRole
        {
            Role = NxUserSyncService.RoleCode,
            Name = "NX - Видеонаблюдение",
            Description = "Доступ к камерам своих ТТ в Nx Witness",
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
