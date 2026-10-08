using Office.Server.DbContexts.PowerBi.Models;

namespace Office.Server.Sensors;

/// <summary>
/// Текущий статус датчика по его показаниям и правилу.
/// Поле SensorRooms.State внешний сервис уведомлений не обновляет, поэтому статус считаем сами —
/// по той же логике, что и «Вне нормы» в графике: нарушение — показание вне min/max вне окна техработ.
/// </summary>
public static class SensorStatusCalculator
{
    public const string Ok = "OK";
    /// <summary>Нарушение есть, но длится меньше задержки до первого уведомления.</summary>
    public const string Pending = "Pending";
    /// <summary>Нарушение длится дольше задержки — уведомление уже должно было уйти.</summary>
    public const string Violation = "Violation";

    /// <summary>Сколько истории нужно, чтобы понять, длится ли нарушение дольше задержки.</summary>
    public static TimeSpan LookBack(SensorAlertSetting settings) =>
        TimeSpan.FromMinutes(Math.Max(settings.ViolationDelayMinutes, 0) + 30);

    /// <param name="points">Показания датчика за период <see cref="LookBack"/>, в любом порядке.</param>
    public static string Calculate(
        SensorAlertSetting? settings,
        IEnumerable<SensorDataPoint> points,
        IReadOnlyCollection<SensorMaintenanceWindow> maintenanceWindows,
        DateTime now)
    {
        if (settings is null || !settings.IsEnabled || (settings.MinTemperature is null && settings.MaxTemperature is null))
            return Ok;

        var ordered = points
            .Where(point => point.Temperature is not null)
            .OrderBy(point => point.Date)
            .ToList();
        if (ordered.Count == 0)
            return Ok;

        bool IsViolation(SensorDataPoint point) =>
            IsOutOfRange(point, settings) && !IsInMaintenance(point.Date, maintenanceWindows);

        if (!IsViolation(ordered[^1]))
            return Ok;

        // Начало текущего нарушения — первое показание после последнего нормального.
        // Если нормальных в окне нет, нарушение длится как минимум с начала окна.
        var violationStart = ordered[0].Date;
        for (var index = ordered.Count - 1; index >= 0; index--)
        {
            if (!IsViolation(ordered[index]))
            {
                violationStart = ordered[index + 1].Date;
                break;
            }
        }

        var duration = now - violationStart;
        return duration >= TimeSpan.FromMinutes(Math.Max(settings.ViolationDelayMinutes, 0)) ? Violation : Pending;
    }

    /// <summary>Температура в SensorData хранится в десятых долях градуса.</summary>
    private static bool IsOutOfRange(SensorDataPoint point, SensorAlertSetting settings)
    {
        var temperature = point.Temperature!.Value / 10m;
        return (settings.MinTemperature is decimal min && temperature < min)
            || (settings.MaxTemperature is decimal max && temperature > max);
    }

    /// <summary>Повторяет isPointInMaintenanceWindow из графика датчика.</summary>
    public static bool IsInMaintenance(DateTime moment, IEnumerable<SensorMaintenanceWindow> windows)
    {
        var minutesOfDay = moment.Hour * 60 + moment.Minute;
        // Маска дней недели: понедельник — 1, воскресенье — 64, как в форме окна техработ.
        var dayMask = 1 << (((int)moment.DayOfWeek + 6) % 7);

        foreach (var window in windows)
        {
            if (!window.IsEnabled)
                continue;

            var startMinutes = (int)window.StartTime.TotalMinutes;
            var endMinutes = (int)window.EndTime.TotalMinutes;
            var type = window.ScheduleType.Trim().ToLowerInvariant();

            if (type == "one_time")
            {
                if (window.StartDate is not DateTime startDate || window.EndDate is not DateTime endDate)
                    continue;

                var startsAt = startDate.Date.AddMinutes(startMinutes);
                var endsAt = endDate.Date.AddMinutes(endMinutes);
                if (endsAt >= startsAt && moment >= startsAt && moment <= endsAt)
                    return true;
                continue;
            }

            // Повторяющееся окно действует только в пределах жизни записи; даты создания и удаления хранятся в UTC.
            var createdAt = DateTime.SpecifyKind(window.CreatedAt, DateTimeKind.Utc).ToLocalTime();
            var deletedAt = window.DeletedAt is DateTime deleted ? DateTime.SpecifyKind(deleted, DateTimeKind.Utc).ToLocalTime() : (DateTime?)null;
            if (moment < createdAt || (deletedAt is not null && moment > deletedAt))
                continue;

            var timeMatches = endMinutes < startMinutes
                ? minutesOfDay >= startMinutes || minutesOfDay <= endMinutes
                : minutesOfDay >= startMinutes && minutesOfDay <= endMinutes;
            if (!timeMatches)
                continue;

            if (type == "daily" || (type == "weekly" && ((window.DaysOfWeekMask ?? 0) & dayMask) != 0))
                return true;
        }

        return false;
    }
}
