using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Services;

/// <summary>Общие функции, которые нужны сразу нескольким разделам Office.</summary>
public sealed class GlobalService(RKNETDBContext db)
{
    /// <summary>
    /// Действующие (Actual = 1) локации пользователя: привязанные к нему, а при DefaultLocations = 1 — все.
    /// Для неизвестного пользователя список пустой.
    /// </summary>
    public async Task<List<Location>> GetUserLocationsAsync(int userId, CancellationToken cancellationToken = default)
    {
        var defaultLocations = await db.OfficeUser
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => (int?)x.DefaultLocations)
            .FirstOrDefaultAsync(cancellationToken);
        if (defaultLocations is null)
            return [];

        var locations = defaultLocations == 1
            ? db.Locations.AsNoTracking()
            : db.OfficeUser.AsNoTracking().Where(x => x.Id == userId).SelectMany(x => x.Locations);

        return await locations.Where(x => x.Actual == 1).OrderBy(x => x.Name).ToListAsync(cancellationToken);
    }
}
