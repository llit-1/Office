using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Calculator;

/// <summary>Что поменять в CALCULATOR: таблица, новое значение и условия, уже готовые для вставки в строку задания.</summary>
public sealed record DeferredChange(string Table, string Assign, IReadOnlyList<string> Conditions);

/// <summary>Отложенное изменение коэффициентов. Подменяется в тестах.</summary>
public interface ICalculatorDeferredJobs
{
    Task ScheduleAsync(string task, DeferredChange change, DateTime when, CancellationToken ct = default);
    Task DeleteAsync(string task, CancellationToken ct = default);
}

/// <summary>
/// Как старый портал: разовое задание SQL Agent меняет коэффициенты, отмечает журнал (Status = 1) и удаляет себя.
/// Строка собирается только из чисел и Guid, поэтому экранировать в ней нечего.
/// </summary>
public sealed class SqlAgentDeferredJobs(RKNETDBContext db) : ICalculatorDeferredJobs
{
    /// <summary>В имени таблицы журнала вторая «С» кириллическая.</summary>
    private const string JournalTable = "CalculatorСoefficientLogs";

    public Task ScheduleAsync(string task, DeferredChange change, DateTime when, CancellationToken ct = default) =>
        db.Database.ExecuteSqlRawAsync(BuildSql(task, change, when), ct);

    public Task DeleteAsync(string task, CancellationToken ct = default) =>
        db.Database.ExecuteSqlInterpolatedAsync($"EXEC msdb.dbo.sp_delete_job @job_name = {task}", ct);

    public static string BuildSql(string task, DeferredChange change, DateTime when)
    {
        var where = change.Conditions.Count == 0 ? "" : " Where " + string.Join(" or ", change.Conditions);
        var date = when.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        var time = when.ToString("HHmmss", CultureInfo.InvariantCulture);

        return $"""
            EXEC msdb.dbo.sp_add_job @job_name = N'{task}', @enabled = 1, @description = N'Change Calculator Cofficient';
            EXEC msdb.dbo.sp_add_jobstep @job_name = N'{task}', @step_name = N'step{task}', @subsystem = N'TSQL', @command = N'Use Calculator Update {change.Table} Set COEFFICIENT = {change.Assign}{where}; USE RKNET Update {JournalTable} Set Status = 1 where Task = ''{task}''; Exec msdb.dbo.sp_delete_job @job_name = N''{task}'';';
            EXEC msdb.dbo.sp_add_schedule @schedule_name = N'schedule{task}', @freq_type = 1, @freq_interval = 1, @active_start_date = {date}, @active_start_time = {time};
            EXEC msdb.dbo.sp_attach_schedule @job_name = N'{task}', @schedule_name = N'schedule{task}';
            EXEC msdb.dbo.sp_add_jobserver @job_name = N'{task}';
            """;
    }
}
