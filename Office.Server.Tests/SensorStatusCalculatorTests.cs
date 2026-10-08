using Office.Server.DbContexts.PowerBi.Models;
using Office.Server.Sensors;
using Xunit;

namespace Office.Server.Tests;

public class SensorStatusCalculatorTests
{
    private static readonly DateTime Now = new(2026, 9, 23, 15, 30, 0);

    /// <summary>Камера -18: норма не выше -12°, уведомление через 60 минут нарушения.</summary>
    private static SensorAlertSetting Rule(int delayMinutes = 60) => new()
    {
        RoomId = 8,
        MaxTemperature = -12.0m,
        ViolationDelayMinutes = delayMinutes,
        IsEnabled = true,
    };

    /// <summary>Показания раз в 2 минуты за последние <paramref name="minutes"/> минут; температура в градусах.</summary>
    private static List<SensorDataPoint> Points(int minutes, Func<int, double> temperatureAtMinutesAgo) =>
        Enumerable.Range(0, minutes / 2 + 1)
            .Select(step => step * 2)
            .Select(ago => new SensorDataPoint
            {
                RoomId = 8,
                Date = Now.AddMinutes(-ago),
                Temperature = (int)Math.Round(temperatureAtMinutesAgo(ago) * 10),
            })
            .ToList();

    [Fact]
    public void IsOkWhenTheLatestReadingIsWithinTheRule()
    {
        var points = Points(90, ago => ago < 10 ? -15 : -5);

        Assert.Equal(SensorStatusCalculator.Ok, SensorStatusCalculator.Calculate(Rule(), points, [], Now));
    }

    [Fact]
    public void IsPendingWhileTheViolationIsShorterThanTheNotificationDelay()
    {
        var points = Points(90, ago => ago <= 20 ? -9.6 : -15);

        Assert.Equal(SensorStatusCalculator.Pending, SensorStatusCalculator.Calculate(Rule(), points, [], Now));
    }

    [Fact]
    public void IsViolationWhenTheReadingHasBeenOutOfRangeLongerThanTheDelay()
    {
        // Как на камере сборки кондитерки: несколько часов выше -12°.
        var points = Points(90, _ => -9.6);

        Assert.Equal(SensorStatusCalculator.Violation, SensorStatusCalculator.Calculate(Rule(), points, [], Now));
    }

    [Fact]
    public void IgnoresReadingsInsideAMaintenanceWindow()
    {
        var points = Points(90, _ => -9.6);
        var window = new SensorMaintenanceWindow
        {
            RoomId = 8,
            ScheduleType = "daily",
            StartTime = new TimeSpan(14, 0, 0),
            EndTime = new TimeSpan(16, 0, 0),
            IsEnabled = true,
            CreatedAt = Now.AddDays(-10).ToUniversalTime(),
        };

        Assert.Equal(SensorStatusCalculator.Ok, SensorStatusCalculator.Calculate(Rule(), points, [window], Now));
    }

    [Fact]
    public void IsOkWithoutAnEnabledRule()
    {
        var points = Points(90, _ => -9.6);
        var disabled = Rule();
        disabled.IsEnabled = false;

        Assert.Equal(SensorStatusCalculator.Ok, SensorStatusCalculator.Calculate(null, points, [], Now));
        Assert.Equal(SensorStatusCalculator.Ok, SensorStatusCalculator.Calculate(disabled, points, [], Now));
    }

    [Fact]
    public void ReportsViolationImmediatelyWhenTheDelayIsZero()
    {
        var points = Points(30, ago => ago == 0 ? -9 : -15);

        Assert.Equal(SensorStatusCalculator.Violation, SensorStatusCalculator.Calculate(Rule(0), points, [], Now));
    }
}
