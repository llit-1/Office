using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Calculator;

/// <summary>
/// Сессия работы с калькулятором — то, что уходит в журнал как SessionId.
/// Как старый портал: ровно час, без продлений, после — новая сессия. Старый портал отсчитывал час от входа,
/// у нас вход живёт две недели, поэтому час идёт от первого действия в калькуляторе.
/// </summary>
public sealed record CalculatorSession(Guid Id, DateTime Start, DateTime End)
{
    public static readonly TimeSpan Length = TimeSpan.FromMinutes(60);

    /// <summary>Сессия после действия в момент <paramref name="now"/>: прежняя или новая.</summary>
    public static CalculatorSession After(CalculatorSession? current, DateTime now)
    {
        // now < Start — часы сервера перевели назад; такую сессию не продолжаем
        if (current is null || now >= current.End || now < current.Start)
            return new CalculatorSession(Guid.NewGuid(), now, now + Length);
        return current;
    }
}

public static class CalculatorSessions
{
    /// <summary>Запросы одного пользователя идут параллельно (ввод в нескольких строках) — без очереди каждый завёл бы свою сессию.</summary>
    private static readonly SemaphoreSlim OneAtATime = new(1, 1);

    /// <summary>
    /// Отмечает действие пользователя и возвращает его сессию.
    /// Пользователя нет в базе — сессия на календарный час: пустой Id ломает пачку в Buffer.
    /// </summary>
    public static async Task<CalculatorSession> TouchAsync(RKNETDBContext db, int userId, DateTime now, CancellationToken ct = default)
    {
        await OneAtATime.WaitAsync(ct);
        try
        {
            var user = await db.OfficeUser.FirstOrDefaultAsync(x => x.Id == userId, ct);
            if (user is null)
            {
                var hour = now.Date.AddHours(now.Hour);
                return new CalculatorSession(CalculatorLogRecord.SessionFor(userId, now), hour, hour.AddHours(1));
            }

            var current = user is { CalculatorSessionId: Guid id, CalculatorSessionStart: DateTime start, CalculatorSessionEnd: DateTime end }
                ? new CalculatorSession(id, start, end)
                : null;
            var next = CalculatorSession.After(current, now);
            if (next != current)
            {
                user.CalculatorSessionId = next.Id;
                user.CalculatorSessionStart = next.Start;
                user.CalculatorSessionEnd = next.End;
                await db.SaveChangesAsync(ct);
            }
            return next;
        }
        finally
        {
            OneAtATime.Release();
        }
    }
}

/// <summary>Колонки сессии калькулятора в OfficeUser.</summary>
public sealed class CalculatorSessionSchemaInitializer(RKNETDBContext db)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (!db.Database.IsRelational())
            return;
        await db.Database.ExecuteSqlRawAsync("""
IF COL_LENGTH(N'[dbo].[OfficeUser]', N'CalculatorSessionId') IS NULL
    ALTER TABLE [dbo].[OfficeUser] ADD [CalculatorSessionId] uniqueidentifier NULL;
IF COL_LENGTH(N'[dbo].[OfficeUser]', N'CalculatorSessionStart') IS NULL
    ALTER TABLE [dbo].[OfficeUser] ADD [CalculatorSessionStart] datetime2(0) NULL;
IF COL_LENGTH(N'[dbo].[OfficeUser]', N'CalculatorSessionEnd') IS NULL
    ALTER TABLE [dbo].[OfficeUser] ADD [CalculatorSessionEnd] datetime2(0) NULL;
""", cancellationToken);
    }
}
