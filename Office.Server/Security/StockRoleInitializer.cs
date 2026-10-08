using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Stock;

namespace Office.Server.Security;

/// <summary>Создаёт роль администратора склада, если её ещё нет. Существующие назначения не меняются.</summary>
public sealed class StockRoleInitializer(RKNETDBContext db)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (await db.OfficeRole.AnyAsync(x => x.Role == StockRoles.Admin, cancellationToken))
        {
            return;
        }

        db.OfficeRole.Add(new OfficeRole
        {
            Role = StockRoles.Admin,
            Name = "Склад - Администратор",
            Description = "Структура склада и списание объектов",
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
