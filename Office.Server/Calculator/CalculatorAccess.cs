using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Calculator;

public static class CalculatorRoles
{
    /// <summary>Расчёт на своей точке.</summary>
    public const string User = "Calculator";
    /// <summary>Аудитор: позиции, коэффициенты, спецдни, замены и блокировки.</summary>
    public const string Admin = "CalculatorAdmin";
}

public static class CalculatorUsers
{
    /// <summary>Имя для логов и журналов калькулятора: ФИО, а без него логин.</summary>
    public static async Task<string> DisplayNameAsync(RKNETDBContext db, int userId, CancellationToken ct = default)
    {
        var user = await db.OfficeUser.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId, ct);
        if (user is null)
            return "";
        var name = string.Join(" ", new[] { user.Surname, user.Name, user.Patronymic }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim()));
        return string.IsNullOrWhiteSpace(name) ? user.Login : name;
    }
}

/// <summary>Создаёт роль аудитора калькулятора или обновляет её название. Существующие назначения не меняются.</summary>
public sealed class CalculatorRoleInitializer(RKNETDBContext db)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var role = await db.OfficeRole.FirstOrDefaultAsync(x => x.Role == CalculatorRoles.Admin, cancellationToken);
        if (role is not null)
        {
            if (role.Name != "Калькулятор - Аудитор")
            {
                role.Name = "Калькулятор - Аудитор";
                await db.SaveChangesAsync(cancellationToken);
            }
            return;
        }

        db.OfficeRole.Add(new OfficeRole
        {
            Role = CalculatorRoles.Admin,
            Name = "Калькулятор - Аудитор",
            Description = "Настройки калькулятора: позиции, коэффициенты, спецдни, замены и блокировки",
            Section = "Калькулятор",
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
