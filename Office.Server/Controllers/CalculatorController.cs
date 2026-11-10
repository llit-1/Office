using System.Globalization;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Calculator;
using Office.Server.DbContexts.Calculator;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Services;

namespace Office.Server.Controllers
{
    /// <summary>
    /// Калькулятор розницы: сколько выпечь/достать/собрать по остатку на витрине.
    /// Как старый портал: считать можно в любое время, ввод сохраняется сразу и уходит через Buffer
    /// в журнал RKNET.CalculatorLogsTest. Справочники и продажи — база CALCULATOR.
    /// Пользователь и его точки — только из токена.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Calculator")]
    public partial class CalculatorController(
        RKNETDBContext db,
        CalculatorDbContext calc,
        GlobalService globalService,
        CalculatorService calculator,
        ICalculatorLogSink logSink,
        ILogger<CalculatorController> logger) : ControllerBase
    {
        private static readonly string[] HiddenLocationTypes = ["УЦ", "Офис"];
        private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");
        private const int MaxQuantity = 9999;

        /// <summary>Сколько минут последний ввод показывается при открытии, как в старом портале.</summary>
        private const int LastInputMinutes = 30;

        /// <summary>Текущее время сервера (местное); подменяется в тестах.</summary>
        public Func<DateTime> Now { get; set; } = () => DateTime.Now;

        public sealed class CalculatorLocationDto
        {
            public int Code { get; set; }
            public string Name { get; set; } = "";
        }

        public sealed class CalculatorBlockDto
        {
            /// <summary>soft — снимает точка, hard — только аудитор.</summary>
            public string Kind { get; set; } = "soft";
            public bool CanUnlock { get; set; }
            public string Text { get; set; } = "";
        }

        public sealed class CalculatorLastDto
        {
            public int? Rest { get; set; }
            public int? Result { get; set; }
            public int? Fact { get; set; }
            public DateTime At { get; set; }
        }

        public sealed class CalculatorItemDto
        {
            public int RkCode { get; set; }
            public string Name { get; set; } = "";
            public int? DefrostMinutes { get; set; }
            public string? BakingMode { get; set; }
            public int MinShowCase { get; set; }
            /// <summary>Сэндвичей из одной булки; только у сэндвичей.</summary>
            public int? BunsPer { get; set; }
            /// <summary>Коэффициент позиции × коэффициент позиции на точке.</summary>
            public double ItemCoefficient { get; set; }
            public double AvgRest { get; set; }
            public double AvgProduction { get; set; }
            public double AvgNext { get; set; }
            public double AvgSecond { get; set; }
            public double AddThis { get; set; }
            public double AddNext { get; set; }
            public double AddSecond { get; set; }
            public List<string> AddFrom { get; set; } = [];
            public CalculatorBlockDto? Block { get; set; }
            /// <summary>Последний ввод за полчаса: остаток, план и факт, как их сохранили.</summary>
            public CalculatorLastDto? Last { get; set; }
        }

        public sealed class CalculatorSheetDto
        {
            public string Slug { get; set; } = "";
            public string Title { get; set; } = "";
            public int TtCode { get; set; }
            public string TtName { get; set; } = "";
            public DateTime Now { get; set; }
            public int Reaction { get; set; }
            public string Period { get; set; } = "";
            public int PeriodFrom { get; set; }
            public int PeriodTo { get; set; }
            /// <summary>До какого часа (не включая) считаем продажи; null — сейчас не считаем.</summary>
            public int? HorizonHour { get; set; }
            public double ThisCoefficient { get; set; }
            public double NextCoefficient { get; set; }
            public double SecondCoefficient { get; set; }
            public List<CalculatorItemDto> Items { get; set; } = [];
        }

        public sealed class CalculatorEntryRequest
        {
            public int Tt { get; set; }
            public int RkCode { get; set; }
            public int? Rest { get; set; }
            public int Result { get; set; }
            public int? Fact { get; set; }
        }

        public sealed class CalculatorBlockRequest
        {
            public int Tt { get; set; }
            public int RkCode { get; set; }
            /// <summary>Что было введено в строке на момент блокировки, для журнала.</summary>
            public int? Rest { get; set; }
        }

        public sealed class CalculatorSavedDto
        {
            public DateTime SavedAt { get; set; }
        }

        /// <summary>Точки пользователя, которые есть в калькуляторе; без учебных центров и офисов.</summary>
        [HttpGet("locations")]
        public async Task<ActionResult<List<CalculatorLocationDto>>> GetLocations(CancellationToken ct)
        {
            if (UserId() is not int userId)
                return Unauthorized();
            return Ok(await LocationsAsync(userId, ct));
        }

        /// <summary>Расчёт категории на точке.</summary>
        [HttpGet("{slug}")]
        public async Task<ActionResult<CalculatorSheetDto>> GetSheet(string slug, int tt, CancellationToken ct)
        {
            if (CalculatorCategories.Find(slug) is not { } category)
                return NotFound(new { message = "Нет такого калькулятора" });
            if (await FindLocationAsync(tt, ct) is not { } location)
                return NotFound(new { message = "Точка недоступна" });

            var now = Now();
            var sheet = await calculator.BuildAsync(category, tt, now, ct);
            if (sheet is null)
                return Conflict(new { message = "Для текущего времени в калькуляторе не настроен период — сообщите аудитору" });

            // последний ввод за полчаса показываем как есть, без пересчёта
            var last = (await calculator.LogsSinceAsync(tt, now.AddMinutes(-LastInputMinutes), ct))
                .Where(x => x.Result >= 0)
                .GroupBy(x => x.ItemCode)
                .ToDictionary(x => x.Key, x => x.Last());
            await LogBlockedAsync(category.Slug, location, sheet.Result.Rows.Where(x => x.Block is not null).Select(x => x.Item), now, ct);
            var horizon = sheet.Reaction switch
            {
                1 => sheet.Periods.This.TimeGroup.LastHour + 1,
                2 => sheet.Periods.Next.TimeGroup.LastHour + 1,
                3 => sheet.Periods.Second.TimeGroup.LastHour + 1,
                _ => (int?)null,
            };
            var isSandwich = category.Slug == "sandwiches";

            return Ok(new CalculatorSheetDto
            {
                Slug = category.Slug,
                Title = category.Title,
                TtCode = tt,
                TtName = location.Name,
                Now = now,
                Reaction = sheet.Reaction,
                Period = CalculatorPeriods.CleanName(sheet.Periods.This.TimeGroup.Name),
                PeriodFrom = sheet.Periods.This.TimeGroup.FirstHour,
                PeriodTo = sheet.Periods.This.TimeGroup.LastHour,
                HorizonHour = horizon,
                ThisCoefficient = sheet.Result.ThisCoefficient,
                NextCoefficient = sheet.Result.NextCoefficient,
                SecondCoefficient = sheet.Result.SecondCoefficient,
                Items = sheet.Result.Rows.Select(row => new CalculatorItemDto
                {
                    RkCode = row.Item.RkCode,
                    Name = row.Item.Name.Trim(),
                    DefrostMinutes = int.TryParse(row.Item.DefrostTime?.Trim(), out var minutes) && minutes > 0 ? minutes : null,
                    BakingMode = string.IsNullOrWhiteSpace(row.Item.BakingMode) ? null : row.Item.BakingMode.Trim(),
                    MinShowCase = row.Item.MinShowCase ?? 0,
                    BunsPer = isSandwich && row.Item.SandwichOnBuns > 0 ? row.Item.SandwichOnBuns : null,
                    ItemCoefficient = row.Item.Coefficient * row.OnTT.Coefficient,
                    AvgRest = row.AvgRest,
                    AvgProduction = row.AvgProduction,
                    AvgNext = row.AvgNext,
                    AvgSecond = row.AvgSecond,
                    AddThis = row.AddThis,
                    AddNext = row.AddNext,
                    AddSecond = row.AddSecond,
                    AddFrom = row.AddFrom,
                    Block = row.Block is null ? null : DescribeBlock(row.Block, tt),
                    Last = last.TryGetValue(row.Item.RkCode, out var entry)
                        ? new CalculatorLastDto { Rest = entry.Rest, Result = entry.Result, Fact = entry.Fact, At = entry.Date }
                        : null,
                }).ToList(),
            });
        }

        /// <summary>Остаток, план и факт по позиции — сохраняется сразу после ввода.</summary>
        [HttpPost("{slug}/entries")]
        public async Task<ActionResult<CalculatorSavedDto>> SaveEntry(string slug, [FromBody] CalculatorEntryRequest request, CancellationToken ct)
        {
            if (request.Rest is not (>= 0 and <= MaxQuantity) || request.Result is < 0 or > MaxQuantity || request.Fact is < 0 or > MaxQuantity)
                return BadRequest(new { message = "Количество должно быть от 0 до " + MaxQuantity });
            var context = await ItemContextAsync(slug, request.Tt, request.RkCode, ct);
            if (context.Error is { } error)
                return error;

            var now = Now();
            var sent = await SendAsync(context, request.Rest!.Value, request.Result, request.Fact, now, ct);
            return sent ?? Ok(new CalculatorSavedDto { SavedAt = now });
        }

        /// <summary>«Не печём сегодня»: блокировка позиции на точке до конца дня.</summary>
        [HttpPost("{slug}/blocks")]
        public async Task<ActionResult<CalculatorBlockDto>> Block(string slug, [FromBody] CalculatorBlockRequest request, CancellationToken ct)
        {
            var context = await ItemContextAsync(slug, request.Tt, request.RkCode, ct);
            if (context.Error is { } error)
                return error;

            var now = Now();
            var existing = await ActiveBlocks(request.Tt, request.RkCode, now).Where(x => x.TTCode == request.Tt && x.Type == 1).FirstOrDefaultAsync(ct);
            if (existing is not null)
                return Ok(DescribeBlock(existing, request.Tt));

            var block = new CalcItemBlock
            {
                ItemRkCode = request.RkCode,
                TTCode = request.Tt,
                Type = 1,
                Enable = true,
                Begin = now.Date,
                End = now.Date.AddDays(1),
                Info = $"Заполнил: {context.UserName} {now.ToString(Ru)}",
            };
            calc.ItemBlocks.Add(block);
            await calc.SaveChangesAsync(ct);
            // как старый портал: блокировка видна и в логе ввода (план -1), ошибка журнала её не отменяет
            await SendAsync(context, request.Rest ?? 0, -1, null, now, ct);
            return Ok(DescribeBlock(block, request.Tt));
        }

        /// <summary>Снять свою блокировку. Блокировки аудитора и блокировки для всех точек не снимаются.</summary>
        [HttpDelete("{slug}/blocks")]
        public async Task<IActionResult> Unblock(string slug, int tt, int rkCode, CancellationToken ct)
        {
            var context = await ItemContextAsync(slug, tt, rkCode, ct);
            if (context.Error is { } error)
                return error;

            var now = Now();
            var blocks = await ActiveBlocks(tt, rkCode, now).Where(x => x.TTCode == tt && x.Type == 1).ToListAsync(ct);
            if (blocks.Count == 0)
                return NotFound(new { message = "Эту блокировку может снять только аудитор" });
            foreach (var block in blocks)
            {
                block.Enable = false;
                block.Info += $" Удалил: {context.UserName} {now.ToString(Ru)}";
            }
            await calc.SaveChangesAsync(ct);
            return NoContent();
        }

        private IQueryable<CalcItemBlock> ActiveBlocks(int tt, int rkCode, DateTime now) =>
            calc.ItemBlocks.Where(x => x.ItemRkCode == rkCode && x.Enable && x.Begin <= now && x.End >= now
                && (x.TTCode == null || x.TTCode == tt));

        private sealed record ItemContext(ActionResult? Error, CalcItem? Item = null, CalculatorLocationDto? Location = null, string UserName = "");

        /// <summary>Проверки для записи: категория, точка пользователя, позиция этой категории.</summary>
        private async Task<ItemContext> ItemContextAsync(string slug, int tt, int rkCode, CancellationToken ct)
        {
            if (UserId() is not int userId)
                return new(Unauthorized());
            if (CalculatorCategories.Find(slug) is not { } category)
                return new(NotFound(new { message = "Нет такого калькулятора" }));
            var location = (await LocationsAsync(userId, ct)).FirstOrDefault(x => x.Code == tt);
            if (location is null)
                return new(NotFound(new { message = "Точка недоступна" }));
            var item = await calc.Items.AsNoTracking().FirstOrDefaultAsync(x => x.RkCode == rkCode && x.ItemsGroup == category.Group, ct);
            if (item is null)
                return new(NotFound(new { message = "Позиции нет в этом калькуляторе" }));
            return new(null, item, location, await CalculatorUsers.DisplayNameAsync(db, userId, ct));
        }

        /// <summary>Как старый портал: при каждом открытии заблокированные позиции попадают в журнал (план -1).</summary>
        private async Task LogBlockedAsync(string slug, CalculatorLocationDto location, IEnumerable<CalcItem> items, DateTime now, CancellationToken ct)
        {
            var userName = UserId() is int userId ? await CalculatorUsers.DisplayNameAsync(db, userId, ct) : "";
            foreach (var item in items)
            {
                // Buffer лежит — остальные попытки только задержат открытие
                if (await SendAsync(new ItemContext(null, item, location, userName), 0, -1, null, now, ct) is not null)
                    return;
            }
        }

        private async Task<ActionResult?> SendAsync(ItemContext context, int rest, int result, int? fact, DateTime now, CancellationToken ct)
        {
            try
            {
                await logSink.SendAsync(new CalculatorLogRecord
                {
                    UserName = CalculatorLogRecord.Text(context.UserName, 50),
                    ItemCode = context.Item!.RkCode,
                    ItemName = CalculatorLogRecord.Text(context.Item.Name, 60),
                    TTCode = context.Location!.Code,
                    TTName = CalculatorLogRecord.Text(context.Location.Name, 60),
                    Rest = rest,
                    Result = result,
                    Fact = fact,
                    Date = now,
                    SessionId = CalculatorLogRecord.SessionFor(UserId() ?? 0, now),
                }, ct);
                return null;
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning(ex, "Calculator entry was not sent to Buffer.");
                return StatusCode(StatusCodes.Status502BadGateway, new { message = "Не удалось сохранить: сервис Buffer недоступен" });
            }
        }

        private async Task<List<CalculatorLocationDto>> LocationsAsync(int userId, CancellationToken ct)
        {
            var locations = await globalService.GetUserLocationsAsync(userId, ct);
            // у администраторов в списке все локации портала — оставляем только точки калькулятора
            var calculatorCodes = (await calc.TTs.AsNoTracking().Select(x => x.TTCode).ToListAsync(ct)).ToHashSet();
            var hiddenTypes = await db.LocationTypes.AsNoTracking()
                .Where(x => HiddenLocationTypes.Contains(x.Name))
                .Select(x => x.Guid)
                .ToListAsync(ct);
            return locations
                .Where(x => x.RKCode is int code && calculatorCodes.Contains(code) && (x.LocationTypeGuid is null || !hiddenTypes.Contains(x.LocationTypeGuid.Value)))
                .Select(x => new CalculatorLocationDto { Code = x.RKCode!.Value, Name = x.Name.Trim() })
                .ToList();
        }

        private async Task<CalculatorLocationDto?> FindLocationAsync(int tt, CancellationToken ct) =>
            UserId() is int userId ? (await LocationsAsync(userId, ct)).FirstOrDefault(x => x.Code == tt) : null;

        private int? UserId() => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;


        private static string Cut(string value, int length) => value.Length <= length ? value : value[..length];

        [GeneratedRegex(@"Заполнил:\s*(?<who>.+?)\s+\d{1,2}\.\d{2}\.\d{4}\s+(?<time>\d{1,2}:\d{2})")]
        private static partial Regex FilledBy();

        /// <summary>Понятная подпись блокировки и можно ли её снять с этой точки.</summary>
        public static CalculatorBlockDto DescribeBlock(CalcItemBlock block, int tt)
        {
            if (block.Type != 1)
            {
                var days = (block.End.Date - block.Begin.Date).TotalDays;
                return new CalculatorBlockDto
                {
                    Kind = "hard",
                    Text = days > 1
                        ? $"Аудитор снял с продажи до {block.End.Date.AddDays(-1).ToString("d MMMM", Ru)}"
                        : "Аудитор снял с продажи на сегодня",
                };
            }
            if (block.TTCode is null)
                return new CalculatorBlockDto { Kind = "hard", Text = "Заблокировано для всех точек" };
            var match = FilledBy().Match(block.Info ?? "");
            return new CalculatorBlockDto
            {
                Kind = "soft",
                CanUnlock = block.TTCode == tt,
                Text = match.Success
                    ? $"Заблокировал(а) {match.Groups["who"].Value.Trim()} в {match.Groups["time"].Value}"
                    : "Не печём сегодня",
            };
        }
    }
}
