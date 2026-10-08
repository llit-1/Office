using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Security;

public sealed class DeliveryCashRoleInitializer(RKNETDBContext db)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        // Preserve IDs and technical codes: group assignments, JWT claims and section grants stay valid.
        var definitions = new[]
        {
            (Code: "MenuMarketing", Name: "Доставка - Маркетинг", Description: "Управление категориями и позициями меню доставки"),
            (Code: "DeliveryRequests", Name: "Доставка - Запросы", Description: "Доступ к запросам доставки к Яндексу"),
            (Code: "MenuAdmin", Name: "Доставка - Админ", Description: "Управление меню доставки и доступ к запросам"),
            (Code: "MenuAuditor", Name: "Кассы - Аудитор", Description: "Стопы, глобальные блокировки и сообщения на кассы"),
            (Code: "CashUpdate", Name: "Кассы - Обновление", Description: "Версии кассового клиента: загрузка, установка, откат и удаление клиента с касс"),
            (Code: "Menu", Name: "Кассы - Сотрудник", Description: "Быстрые стопы позиций до конца дня для доступной торговой точки")
        };
        var roles = await db.OfficeRole.ToListAsync(cancellationToken);
        foreach (var definition in definitions)
        {
            var matches = roles.Where(x => x.Role == definition.Code).ToList();
            if (matches.Count == 0)
            {
                var role = new OfficeRole { Role = definition.Code };
                db.OfficeRole.Add(role);
                matches.Add(role);
            }
            foreach (var role in matches)
            {
                role.Name = definition.Name;
                role.Description = definition.Description;
            }
        }
        await db.SaveChangesAsync(cancellationToken);
    }
}
