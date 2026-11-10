using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;

namespace Office.Server.Calculator;

/// <summary>
/// Строка ввода калькулятора для журнала RKNET.CalculatorLogsTest.
/// Колонки nchar: UserName — до 50 символов, ItemName и TTName — до 60.
/// </summary>
public sealed class CalculatorLogRecord
{
    public string UserName { get; set; } = "";
    public int ItemCode { get; set; }
    public string ItemName { get; set; } = "";
    public int TTCode { get; set; }
    public string TTName { get; set; } = "";
    public int Rest { get; set; }
    /// <summary>План; -1 — позицию заблокировали.</summary>
    public int Result { get; set; }
    public int? Fact { get; set; }
    public DateTime Date { get; set; }
    /// <summary>
    /// Триггер CalculatorLogsTest_UpdatesActualDatas оставляет по сессии + позиции + точке только последнюю строку.
    /// Старый портал пишет сюда сессию входа, она живёт не дольше часа. Сессии входа у нас нет, поэтому сессия — час.
    /// Buffer подставляет значение в SQL как есть: пустая сессия ломает всю пачку.
    /// </summary>
    public Guid SessionId { get; set; }

    /// <summary>Строка без лишних пробелов и не длиннее колонки.</summary>
    public static string Text(string? value, int length)
    {
        var text = (value ?? "").Trim();
        return text.Length <= length ? text : text[..length];
    }

    /// <summary>Устойчивый Guid пользователя на текущий час.</summary>
    public static Guid SessionFor(int userId, DateTime now) =>
        new(MD5.HashData(Encoding.UTF8.GetBytes($"office:{userId}:{now:yyyy-MM-ddTHH}")));
}

public interface ICalculatorLogSink
{
    Task SendAsync(CalculatorLogRecord entry, CancellationToken ct = default);
}

/// <summary>
/// Отправка ввода в сервис Buffer (адрес — Calculator:BufferUrl), он пишет в RKNET.CalculatorLogsTest.
/// Как старый портал: по одной записи на весь сервер, начатую отправку не отменяем,
/// даже если пользователь ушёл со страницы.
/// </summary>
public sealed class HttpCalculatorLogSink(IHttpClientFactory httpClientFactory, IConfiguration configuration) : ICalculatorLogSink
{
    public const string HttpClientName = "CalculatorBuffer";
    private const string DefaultUrl = "http://rknet-server:45732/Buffer";
    private static readonly SemaphoreSlim OneAtATime = new(1, 1);

    public async Task SendAsync(CalculatorLogRecord entry, CancellationToken ct = default)
    {
        var client = httpClientFactory.CreateClient(HttpClientName);
        var url = configuration["Calculator:BufferUrl"] ?? DefaultUrl;

        await OneAtATime.WaitAsync(ct);
        try
        {
            using var response = await client.PostAsJsonAsync(url, entry, CancellationToken.None);
            response.EnsureSuccessStatusCode();
        }
        finally
        {
            OneAtATime.Release();
        }
    }
}
