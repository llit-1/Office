using System.Data.Common;
using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Calculator;
using Office.Server.DbContexts.Calculator;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Controllers
{
    /// <summary>
    /// Настройки калькулятора для аудитора — перенос вкладок «Настройки калькулятора» старого портала.
    /// Даты «по» в интерфейсе включительные; в базе Replacements.End и ItemBlocks.End — первый день, когда уже не действует.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = CalculatorRoles.Admin)]
    public class CalculatorSettingsController(
        RKNETDBContext db,
        CalculatorDbContext calc,
        ICalculatorDeferredJobs deferredJobs,
        ILogger<CalculatorSettingsController> logger) : ControllerBase
    {
        private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");
        private const double MaxCoefficient = 10;

        /// <summary>Текущее время сервера (местное); подменяется в тестах.</summary>
        public Func<DateTime> Now { get; set; } = () => DateTime.Now;

        /* ===== Справочники ===== */

        public sealed record CategoryDto(string Slug, string Title);
        public sealed record NamedGuidDto(Guid Guid, string Name);
        public sealed record PeriodDto(Guid Guid, string Name, string Category, int FirstHour, int LastHour);
        public sealed record TtDto(int Code, string Name);
        public sealed record GroupDto(int Id, string Name);

        public sealed class ItemDto
        {
            public int RkCode { get; set; }
            public string Name { get; set; } = "";
            public string Category { get; set; } = "";
            public double Coefficient { get; set; }
            public int? Sequence { get; set; }
            public int? DefrostMinutes { get; set; }
            public string? BakingMode { get; set; }
            public int MinShowCase { get; set; }
            public int? BunsPer { get; set; }
            public int? ReplacementGroupId { get; set; }
        }

        public sealed class ReferenceDto
        {
            public List<CategoryDto> Categories { get; set; } = [];
            public List<NamedGuidDto> DayGroups { get; set; } = [];
            public List<PeriodDto> Periods { get; set; } = [];
            public List<TtDto> Tts { get; set; } = [];
            public List<ItemDto> Items { get; set; } = [];
            public List<GroupDto> ReplacementGroups { get; set; } = [];
        }

        /// <summary>Всё, из чего выбирают в настройках: категории, периоды, точки, позиции, группы замен.</summary>
        [HttpGet("reference")]
        public async Task<ActionResult<ReferenceDto>> GetReference(CancellationToken ct)
        {
            var slugs = CalculatorCategories.All.ToDictionary(x => x.Group, x => x.Slug);
            var periods = await calc.TimeGroups.AsNoTracking().OrderBy(x => x.FirstHour).ToListAsync(ct);
            var items = await calc.Items.AsNoTracking().OrderBy(x => x.Sequence).ThenBy(x => x.Name).ToListAsync(ct);
            return Ok(new ReferenceDto
            {
                Categories = CalculatorCategories.All.Select(x => new CategoryDto(x.Slug, x.Title)).ToList(),
                DayGroups = (await calc.DayGroups.AsNoTracking().OrderBy(x => x.FirstDay).ToListAsync(ct))
                    .Select(x => new NamedGuidDto(x.Guid, x.Name.Trim())).ToList(),
                Periods = periods.Where(x => slugs.ContainsKey(x.ItemsGroup))
                    .Select(x => new PeriodDto(x.Guid, CalculatorPeriods.CleanName(x.Name), slugs[x.ItemsGroup], x.FirstHour, x.LastHour)).ToList(),
                Tts = (await calc.TTs.AsNoTracking().OrderBy(x => x.TTName).ToListAsync(ct))
                    .Select(x => new TtDto(x.TTCode, x.TTName.Trim())).ToList(),
                Items = items.Where(x => slugs.ContainsKey(x.ItemsGroup)).Select(x => ToDto(x, slugs[x.ItemsGroup])).ToList(),
                ReplacementGroups = (await calc.ReplacementGroups.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct))
                    .Select(x => new GroupDto(x.Id, x.Name.Trim())).ToList(),
            });
        }

        private static ItemDto ToDto(CalcItem item, string category) => new()
        {
            RkCode = item.RkCode,
            Name = item.Name.Trim(),
            Category = category,
            Coefficient = item.Coefficient,
            Sequence = item.Sequence,
            DefrostMinutes = int.TryParse(item.DefrostTime?.Trim(), out var minutes) && minutes > 0 ? minutes : null,
            BakingMode = string.IsNullOrWhiteSpace(item.BakingMode) ? null : item.BakingMode.Trim(),
            MinShowCase = item.MinShowCase ?? 0,
            BunsPer = item.SandwichOnBuns > 0 ? item.SandwichOnBuns : null,
            ReplacementGroupId = item.ReplacementGroupId,
        };

        /* ===== Коэффициенты ===== */

        public sealed class CoefficientColumnDto
        {
            public string Key { get; set; } = "";
            public string Title { get; set; } = "";
        }

        public sealed class CoefficientRowDto
        {
            public int Tt { get; set; }
            public string Name { get; set; } = "";
            /// <summary>Ключ столбца → коэффициент; нет ключа — у точки нет такой позиции/периода.</summary>
            public Dictionary<string, double> Values { get; set; } = [];
        }

        public sealed class CoefficientGridDto
        {
            public List<CoefficientColumnDto> Columns { get; set; } = [];
            public List<CoefficientRowDto> Rows { get; set; } = [];
        }

        public sealed class CoefficientCellDto
        {
            public int Tt { get; set; }
            public string Key { get; set; } = "";
        }

        public sealed class ApplyCoefficientsRequest
        {
            /// <summary>period — точка в период, item — позиция на точке, sku — позиция для всех точек (Tt в ячейке не нужен).</summary>
            public string Kind { get; set; } = "";
            public string Category { get; set; } = "";
            public List<CoefficientCellDto> Cells { get; set; } = [];
            /// <summary>set — сделать равным, add — прибавить, multiply — умножить.</summary>
            public string Op { get; set; } = "";
            public double Value { get; set; }
            /// <summary>Когда применить; пусто — сейчас.</summary>
            public DateTime? DeferredExecution { get; set; }
        }

        public sealed class CoefficientTaskDto
        {
            public string Task { get; set; } = "";
            public DateTime Creation { get; set; }
            public DateTime Execution { get; set; }
            public string Orderer { get; set; } = "";
            public int Count { get; set; }
            /// <summary>Срок прошёл, а задание не отработало.</summary>
            public bool Overdue { get; set; }
        }

        public sealed class CoefficientTaskRowDto
        {
            public string Name { get; set; } = "";
            /// <summary>K1, K2 или K3.</summary>
            public string Kind { get; set; } = "";
            public double? Value { get; set; }
        }

        /// <summary>Сетка коэффициентов категории: точки × периоды (kind=period) или точки × позиции (kind=item).</summary>
        [HttpGet("coefficients")]
        public async Task<ActionResult<CoefficientGridDto>> GetCoefficients(string kind, string category, CancellationToken ct)
        {
            if (CalculatorCategories.Find(category) is not { } cat)
                return NotFound(new { message = "Нет такой категории" });
            var tts = await calc.TTs.AsNoTracking().OrderBy(x => x.TTName).ToListAsync(ct);

            if (kind == "period")
            {
                var periods = await calc.TimeGroups.AsNoTracking().Where(x => x.ItemsGroup == cat.Group).OrderBy(x => x.FirstHour).ToListAsync(ct);
                var ids = periods.Select(x => x.Guid).ToList();
                var values = await calc.PeriodCoefficients.AsNoTracking().Where(x => ids.Contains(x.TimeGroupGuid)).ToListAsync(ct);
                var byTt = values.ToLookup(x => x.TTCode);
                return Ok(new CoefficientGridDto
                {
                    Columns = periods.Select(x => new CoefficientColumnDto
                    {
                        Key = x.Guid.ToString(),
                        Title = $"{CalculatorPeriods.CleanName(x.Name)} · {x.FirstHour}–{x.LastHour + 1}",
                    }).ToList(),
                    Rows = tts.Select(tt => new CoefficientRowDto
                    {
                        Tt = tt.TTCode,
                        Name = tt.TTName.Trim(),
                        Values = byTt[tt.TTCode].ToDictionary(x => x.TimeGroupGuid.ToString(), x => x.Coefficient),
                    }).ToList(),
                });
            }

            if (kind == "item")
            {
                var items = await calc.Items.AsNoTracking().Where(x => x.ItemsGroup == cat.Group).OrderBy(x => x.Sequence).ThenBy(x => x.Name).ToListAsync(ct);
                var codes = items.Select(x => x.RkCode).ToList();
                var values = await calc.ItemOnTT.AsNoTracking().Where(x => codes.Contains(x.ItemRkCode)).ToListAsync(ct);
                var byTt = values.ToLookup(x => x.TTCode);
                return Ok(new CoefficientGridDto
                {
                    Columns = items.Select(x => new CoefficientColumnDto { Key = x.RkCode.ToString(), Title = x.Name.Trim() }).ToList(),
                    Rows = tts.Select(tt => new CoefficientRowDto
                    {
                        Tt = tt.TTCode,
                        Name = tt.TTName.Trim(),
                        Values = byTt[tt.TTCode].GroupBy(x => x.ItemRkCode).ToDictionary(x => x.Key.ToString(), x => x.First().Coefficient),
                    }).ToList(),
                });
            }

            return BadRequest(new { message = "Неизвестный вид коэффициентов" });
        }

        /// <summary>
        /// Меняет коэффициенты выбранных ячеек и пишет журнал, как старый портал: сразу либо к указанному времени.
        /// Нет коэффициента точки на период — «равно» его создаёт, но только при изменении сразу;
        /// позиции на точке не создаются.
        /// </summary>
        [HttpPost("coefficients")]
        public async Task<IActionResult> ApplyCoefficients([FromBody] ApplyCoefficientsRequest request, CancellationToken ct)
        {
            if (CalculatorCategories.Find(request.Category) is not { } cat)
                return NotFound(new { message = "Нет такой категории" });
            if (request.Cells.Count == 0)
                return BadRequest(new { message = "Выберите, что менять" });
            Func<double, double>? apply = request.Op switch
            {
                "set" => _ => request.Value,
                "add" => value => value + request.Value,
                "multiply" => value => value * request.Value,
                _ => null,
            };
            if (apply is null || double.IsNaN(request.Value) || double.IsInfinity(request.Value))
                return BadRequest(new { message = "Неизвестное действие" });
            if (UserId() is not int userId)
                return Unauthorized();

            var now = Now();
            var deferred = request.DeferredExecution;
            if (deferred <= now)
                return BadRequest(new { message = "Время применения уже прошло" });
            var orderer = await CalculatorUsers.DisplayNameAsync(db, userId, ct);
            var tts = (await calc.TTs.AsNoTracking().ToListAsync(ct)).ToDictionary(x => x.TTCode, x => x.TTName.Trim());
            var cells = request.Cells.Where(x => request.Kind == "sku" || tts.ContainsKey(x.Tt)).ToList();
            var journal = new List<CalculatorCoefficientLog>();
            var conditions = new List<string>();
            var table = "";

            bool Valid(double value) => value is >= 0 and <= MaxCoefficient;

            if (request.Kind == "period")
            {
                table = "ItemsGroupTimeTT_COEFFICIENT";
                var periods = await calc.TimeGroups.Where(x => x.ItemsGroup == cat.Group).ToDictionaryAsync(x => x.Guid.ToString(), ct);
                cells = cells.Where(x => periods.ContainsKey(x.Key)).ToList();
                var ids = cells.Select(x => Guid.Parse(x.Key)).Distinct().ToList();
                var codes = cells.Select(x => x.Tt).Distinct().ToList();
                var existing = await calc.PeriodCoefficients
                    .Where(x => ids.Contains(x.TimeGroupGuid) && codes.Contains(x.TTCode))
                    .ToListAsync(ct);
                foreach (var cell in cells)
                {
                    var period = periods[cell.Key];
                    var row = existing.FirstOrDefault(x => x.TTCode == cell.Tt && x.TimeGroupGuid == period.Guid);
                    if (row is null)
                    {
                        if (request.Op != "set" || deferred is not null)
                            continue;
                        row = new CalcPeriodCoefficient { TTCode = cell.Tt, TimeGroupGuid = period.Guid, Name = $"{tts[cell.Tt]} {period.Name.Trim()}" };
                        calc.PeriodCoefficients.Add(row);
                        existing.Add(row);
                    }
                    var next = Math.Round(apply(row.Coefficient), 4);
                    if (!Valid(next))
                        return BadRequest(new { message = $"Коэффициент должен быть от 0 до {MaxCoefficient}: {tts[cell.Tt]}, {CalculatorPeriods.CleanName(period.Name)} — получилось {next.ToString(Ru)}" });
                    row.Coefficient = next;
                    journal.Add(new CalculatorCoefficientLog { K3 = next, TT = cell.Tt, TimeGroup = period.Guid, Name = row.Name ?? $"{tts[cell.Tt]} {period.Name.Trim()}" });
                    conditions.Add($"(TTCODE = {cell.Tt} and TIMEGROUPGUID = ''{period.Guid}'')");
                }
            }
            else if (request.Kind == "item")
            {
                table = "ItemOnTT";
                var groupCodes = await calc.Items.Where(x => x.ItemsGroup == cat.Group).Select(x => x.RkCode).ToListAsync(ct);
                cells = cells.Where(x => int.TryParse(x.Key, out var code) && groupCodes.Contains(code)).ToList();
                var codes = cells.Select(x => int.Parse(x.Key)).Distinct().ToList();
                var ttCodes = cells.Select(x => x.Tt).Distinct().ToList();
                var rows = await calc.ItemOnTT.Where(x => codes.Contains(x.ItemRkCode) && ttCodes.Contains(x.TTCode)).ToListAsync(ct);
                foreach (var cell in cells)
                {
                    var row = rows.FirstOrDefault(x => x.TTCode == cell.Tt && x.ItemRkCode == int.Parse(cell.Key));
                    if (row is null)
                        continue;
                    var next = Math.Round(apply(row.Coefficient), 4);
                    if (!Valid(next))
                        return BadRequest(new { message = $"Коэффициент должен быть от 0 до {MaxCoefficient}: {row.Name.Trim()} — получилось {next.ToString(Ru)}" });
                    row.Coefficient = next;
                    journal.Add(new CalculatorCoefficientLog { K1 = next, TT = cell.Tt, SKU = row.ItemRkCode, Name = row.Name });
                    conditions.Add($"(TTCODE = {cell.Tt} and ITEMRKCODE = {row.ItemRkCode})");
                }
            }
            else if (request.Kind == "sku")
            {
                table = "Items";
                var codes = request.Cells.Select(x => int.TryParse(x.Key, out var code) ? code : 0).Distinct().ToList();
                var items = await calc.Items.Where(x => x.ItemsGroup == cat.Group && codes.Contains(x.RkCode)).ToListAsync(ct);
                foreach (var item in items)
                {
                    var next = Math.Round(apply(item.Coefficient), 4);
                    if (!Valid(next))
                        return BadRequest(new { message = $"Коэффициент должен быть от 0 до {MaxCoefficient}: {item.Name.Trim()} — получилось {next.ToString(Ru)}" });
                    item.Coefficient = next;
                    journal.Add(new CalculatorCoefficientLog { K2 = next, SKU = item.RkCode, Name = item.Name.Trim() });
                    conditions.Add($"RKCODE = {item.RkCode}");
                }
            }
            else
            {
                return BadRequest(new { message = "Неизвестный вид коэффициентов" });
            }

            if (journal.Count == 0)
                return BadRequest(new { message = "У выбранных точек нет таких коэффициентов" });
            var task = deferred is null ? null : now.Ticks.ToString(CultureInfo.InvariantCulture);
            foreach (var entry in journal)
            {
                entry.TaskCreation = now;
                entry.TaskExecution = deferred ?? now;
                entry.Orderer = orderer;
                entry.Status = deferred is null ? 2 : 0;
                entry.Task = task;
            }

            if (deferred is DateTime when)
            {
                // значения поменяет задание SQL Agent, а журнал показывает, какими они станут
                calc.ChangeTracker.Clear();
                var value = request.Value.ToString(CultureInfo.InvariantCulture);
                var assign = request.Op switch
                {
                    "set" => value,
                    "add" => $"COEFFICIENT + ({value})",
                    _ => $"COEFFICIENT * ({value})",
                };
                try
                {
                    await deferredJobs.ScheduleAsync(task!, new DeferredChange(table, assign, conditions), when, ct);
                }
                catch (DbException exception)
                {
                    logger.LogWarning(exception, "Deferred coefficient job {Task} was not created.", task);
                    return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Не удалось создать задание на SQL Server" });
                }
            }
            else
            {
                await calc.SaveChangesAsync(ct);
            }

            db.CalculatorCoefficientLogs.AddRange(journal);
            await db.SaveChangesAsync(ct);
            return Ok(new { changed = journal.Count });
        }

        /// <summary>Отложенные изменения, которые ещё не выполнены.</summary>
        [HttpGet("coefficients/tasks")]
        public async Task<ActionResult<List<CoefficientTaskDto>>> GetCoefficientTasks(CancellationToken ct)
        {
            var now = Now();
            var pending = await db.CalculatorCoefficientLogs.AsNoTracking().Where(x => x.Status == 0 && x.Task != null).ToListAsync(ct);
            return Ok(pending
                .GroupBy(x => x.Task!)
                .Select(group => new CoefficientTaskDto
                {
                    Task = group.Key,
                    Creation = group.First().TaskCreation,
                    Execution = group.First().TaskExecution,
                    Orderer = group.First().Orderer,
                    Count = group.Count(),
                    Overdue = group.First().TaskExecution < now,
                })
                .OrderByDescending(x => x.Execution)
                .ToList());
        }

        /// <summary>Что поменяет отложенное задание.</summary>
        [HttpGet("coefficients/tasks/{task}")]
        public async Task<ActionResult<List<CoefficientTaskRowDto>>> GetCoefficientTask(string task, CancellationToken ct)
        {
            var rows = await db.CalculatorCoefficientLogs.AsNoTracking().Where(x => x.Task == task && x.Status == 0).OrderBy(x => x.Name).ToListAsync(ct);
            if (rows.Count == 0)
                return NotFound(new { message = "Задание не найдено" });
            return Ok(rows.Select(x => new CoefficientTaskRowDto
            {
                Name = x.Name.Trim(),
                Kind = x.K1 is not null ? "K1" : x.K2 is not null ? "K2" : "K3",
                Value = x.K1 ?? x.K2 ?? x.K3,
            }).ToList());
        }

        /// <summary>Отменить отложенное задание. Берём только задания из журнала, строка из запроса в SQL не попадает.</summary>
        [HttpDelete("coefficients/tasks/{task}")]
        public async Task<IActionResult> DeleteCoefficientTask(string task, CancellationToken ct)
        {
            var rows = await db.CalculatorCoefficientLogs.Where(x => x.Task == task && x.Status == 0).ToListAsync(ct);
            if (rows.Count == 0)
                return NotFound(new { message = "Задание не найдено" });
            try
            {
                await deferredJobs.DeleteAsync(rows[0].Task!, ct);
            }
            catch (DbException exception)
            {
                // просроченного задания в SQL Agent может уже не быть: запись из журнала всё равно убираем
                logger.LogWarning(exception, "Deferred coefficient job {Task} was not deleted.", task);
            }

            db.CalculatorCoefficientLogs.RemoveRange(rows);
            await db.SaveChangesAsync(ct);
            return NoContent();
        }

        /* ===== Позиции ===== */

        public sealed class SaveItemRequest
        {
            public int RkCode { get; set; }
            public string Name { get; set; } = "";
            public string Category { get; set; } = "";
            public double Coefficient { get; set; } = 1;
            public int? Sequence { get; set; }
            public int? DefrostMinutes { get; set; }
            public string? BakingMode { get; set; }
            public int MinShowCase { get; set; }
            public int? BunsPer { get; set; }
        }

        /// <summary>Создать позицию или изменить существующую (по коду R-Keeper).</summary>
        [HttpPut("items")]
        public async Task<ActionResult<ItemDto>> SaveItem([FromBody] SaveItemRequest request, CancellationToken ct)
        {
            if (CalculatorCategories.Find(request.Category) is not { } cat)
                return BadRequest(new { message = "Выберите категорию" });
            if (request.RkCode <= 0 || string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Нужны код и название позиции" });
            if (request.Coefficient is < 0 or > MaxCoefficient || request.MinShowCase < 0 || request.DefrostMinutes < 0 || request.BunsPer < 0)
                return BadRequest(new { message = "Проверьте числа: они не могут быть отрицательными, коэффициент — до " + MaxCoefficient });

            var item = await calc.Items.FirstOrDefaultAsync(x => x.RkCode == request.RkCode, ct);
            if (item is null)
            {
                item = new CalcItem { RkCode = request.RkCode, Actual = 1 };
                calc.Items.Add(item);
            }
            else if (item.ItemsGroup != cat.Group)
            {
                // группа замен живёт внутри категории
                item.ReplacementGroupId = null;
            }
            item.Name = request.Name.Trim();
            item.ItemsGroup = cat.Group;
            item.Coefficient = request.Coefficient;
            item.Sequence = request.Sequence;
            item.DefrostTime = request.DefrostMinutes > 0 ? request.DefrostMinutes.Value.ToString(CultureInfo.InvariantCulture) : null;
            item.BakingMode = string.IsNullOrWhiteSpace(request.BakingMode) ? null : request.BakingMode.Trim().ToUpperInvariant();
            item.MinShowCase = request.MinShowCase;
            item.SandwichOnBuns = request.BunsPer > 0 ? request.BunsPer : null;
            await calc.SaveChangesAsync(ct);
            return Ok(ToDto(item, cat.Slug));
        }

        [HttpDelete("items/{rkCode:int}")]
        public async Task<IActionResult> DeleteItem(int rkCode, CancellationToken ct)
        {
            var item = await calc.Items.FirstOrDefaultAsync(x => x.RkCode == rkCode, ct);
            if (item is null)
                return NotFound(new { message = "Позиция не найдена" });
            calc.Items.Remove(item);
            try
            {
                await calc.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                return Conflict(new { message = "Позиция используется на точках или в продажах — удалить её нельзя" });
            }
            return NoContent();
        }

        /* ===== Спецдни ===== */

        public sealed record SpecialDayDto(int Id, DateTime Date, Guid? DayGroup);

        public sealed class SaveSpecialDayRequest
        {
            public int? Id { get; set; }
            public DateTime Date { get; set; }
            public Guid DayGroup { get; set; }
        }

        [HttpGet("special-days")]
        public async Task<ActionResult<List<SpecialDayDto>>> GetSpecialDays(CancellationToken ct) =>
            Ok((await calc.SpecialDays.AsNoTracking().OrderByDescending(x => x.Date).ToListAsync(ct))
                .Select(x => new SpecialDayDto(x.Id, x.Date.Date, x.DayGroupsGuid)).ToList());

        /// <summary>Особый день: например, праздник в среду считаем как воскресенье.</summary>
        [HttpPut("special-days")]
        public async Task<ActionResult<SpecialDayDto>> SaveSpecialDay([FromBody] SaveSpecialDayRequest request, CancellationToken ct)
        {
            if (request.Date == default || !await calc.DayGroups.AnyAsync(x => x.Guid == request.DayGroup, ct))
                return BadRequest(new { message = "Нужны дата и группа дней" });
            var date = request.Date.Date;
            if (await calc.SpecialDays.AnyAsync(x => x.Date == date && x.Id != request.Id, ct))
                return Conflict(new { message = "На эту дату спецдень уже есть" });

            CalcSpecialDay? day;
            if (request.Id is int id)
            {
                day = await calc.SpecialDays.FirstOrDefaultAsync(x => x.Id == id, ct);
                if (day is null)
                    return NotFound(new { message = "Спецдень не найден" });
            }
            else
            {
                day = new CalcSpecialDay();
                calc.SpecialDays.Add(day);
            }
            day.Date = date;
            day.DayGroupsGuid = request.DayGroup;
            await calc.SaveChangesAsync(ct);
            return Ok(new SpecialDayDto(day.Id, day.Date, day.DayGroupsGuid));
        }

        [HttpDelete("special-days/{id:int}")]
        public async Task<IActionResult> DeleteSpecialDay(int id, CancellationToken ct)
        {
            var day = await calc.SpecialDays.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (day is null)
                return NotFound(new { message = "Спецдень не найден" });
            calc.SpecialDays.Remove(day);
            await calc.SaveChangesAsync(ct);
            return NoContent();
        }

        /* ===== Группы замен ===== */

        public sealed class SaveGroupRequest
        {
            public string Name { get; set; } = "";
        }

        public sealed class GroupItemsRequest
        {
            public List<int> Items { get; set; } = [];
        }

        [HttpPost("groups")]
        public async Task<ActionResult<GroupDto>> CreateGroup([FromBody] SaveGroupRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Нужно название группы" });
            var group = new CalcReplacementGroup { Name = request.Name.Trim() };
            calc.ReplacementGroups.Add(group);
            await calc.SaveChangesAsync(ct);
            return Ok(new GroupDto(group.Id, group.Name));
        }

        /// <summary>Состав группы замен. Все позиции — из одной категории: спрос переходит только между ними.</summary>
        [HttpPut("groups/{id:int}/items")]
        public async Task<IActionResult> SetGroupItems(int id, [FromBody] GroupItemsRequest request, CancellationToken ct)
        {
            if (!await calc.ReplacementGroups.AnyAsync(x => x.Id == id, ct))
                return NotFound(new { message = "Группа не найдена" });
            var codes = request.Items.Distinct().ToList();
            var selected = await calc.Items.Where(x => codes.Contains(x.RkCode)).ToListAsync(ct);
            if (selected.Count != codes.Count)
                return BadRequest(new { message = "Некоторых позиций нет в калькуляторе" });
            if (selected.Select(x => x.ItemsGroup).Distinct().Count() > 1)
                return BadRequest(new { message = "В группе замен позиции одной категории" });

            foreach (var item in await calc.Items.Where(x => x.ReplacementGroupId == id && !codes.Contains(x.RkCode)).ToListAsync(ct))
                item.ReplacementGroupId = null;
            foreach (var item in selected)
                item.ReplacementGroupId = id;
            await calc.SaveChangesAsync(ct);
            return NoContent();
        }

        [HttpPut("groups/{id:int}")]
        public async Task<IActionResult> RenameGroup(int id, [FromBody] SaveGroupRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Нужно название группы" });
            var group = await calc.ReplacementGroups.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (group is null)
                return NotFound(new { message = "Группа не найдена" });
            group.Name = request.Name.Trim();
            await calc.SaveChangesAsync(ct);
            return NoContent();
        }

        [HttpDelete("groups/{id:int}")]
        public async Task<IActionResult> DeleteGroup(int id, CancellationToken ct)
        {
            var group = await calc.ReplacementGroups.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (group is null)
                return NotFound(new { message = "Группа не найдена" });
            if (await calc.Items.AnyAsync(x => x.ReplacementGroupId == id, ct))
                return Conflict(new { message = "Сначала уберите из группы все позиции" });
            calc.ReplacementGroups.Remove(group);
            await calc.SaveChangesAsync(ct);
            return NoContent();
        }

        /* ===== Работа по аналогу ===== */

        public sealed record ReplacementDto(int Id, int? ItemCode, int? ReplacementItemCode, int? Tt, int? ReplacementTt, DateTime From, DateTime To);

        public sealed class SaveReplacementRequest
        {
            public int? Id { get; set; }
            public int? ItemCode { get; set; }
            public int? ReplacementItemCode { get; set; }
            public int? Tt { get; set; }
            public int? ReplacementTt { get; set; }
            public DateTime From { get; set; }
            /// <summary>Последний день действия, включительно.</summary>
            public DateTime To { get; set; }
        }

        [HttpGet("replacements")]
        public async Task<ActionResult<List<ReplacementDto>>> GetReplacements(CancellationToken ct) =>
            Ok((await calc.Replacements.AsNoTracking().OrderByDescending(x => x.End).ToListAsync(ct)).Select(ToDto).ToList());

        private static ReplacementDto ToDto(CalcReplacement x) =>
            new(x.Id, x.ItemCode, x.ReplacementItemCode, x.TTCode, x.ReplacementTTCode, x.Begin.Date, x.End.Date.AddDays(-1));

        /// <summary>Считать позицию по продажам другой позиции той же категории — или точку по другой точке.</summary>
        [HttpPut("replacements")]
        public async Task<ActionResult<ReplacementDto>> SaveReplacement([FromBody] SaveReplacementRequest request, CancellationToken ct)
        {
            if (request.From == default || request.To == default || request.From.Date > request.To.Date)
                return BadRequest(new { message = "Проверьте даты: «с» не позже «по»" });
            var byItem = request.ItemCode.HasValue || request.ReplacementItemCode.HasValue;
            var byTt = request.Tt.HasValue || request.ReplacementTt.HasValue;
            if (byItem == byTt)
                return BadRequest(new { message = "Заменяем либо позицию, либо точку" });
            if (byItem)
            {
                if (request.ItemCode is not int source || request.ReplacementItemCode is not int target || source == target)
                    return BadRequest(new { message = "Выберите позицию и другую позицию-аналог" });
                var items = await calc.Items.AsNoTracking().Where(x => x.RkCode == source || x.RkCode == target).ToListAsync(ct);
                if (items.Count != 2)
                    return NotFound(new { message = "Позиция не найдена" });
                if (items[0].ItemsGroup != items[1].ItemsGroup)
                    return BadRequest(new { message = "Аналог должен быть из той же категории" });
            }
            else
            {
                if (request.Tt is not int source || request.ReplacementTt is not int target || source == target)
                    return BadRequest(new { message = "Выберите точку и другую точку-аналог" });
                if (await calc.TTs.CountAsync(x => x.TTCode == source || x.TTCode == target, ct) != 2)
                    return NotFound(new { message = "Точка не найдена" });
            }

            CalcReplacement? replacement;
            if (request.Id is int id)
            {
                replacement = await calc.Replacements.FirstOrDefaultAsync(x => x.Id == id, ct);
                if (replacement is null)
                    return NotFound(new { message = "Замена не найдена" });
            }
            else
            {
                replacement = new CalcReplacement();
                calc.Replacements.Add(replacement);
            }
            replacement.ItemCode = byItem ? request.ItemCode : null;
            replacement.ReplacementItemCode = byItem ? request.ReplacementItemCode : null;
            replacement.TTCode = byTt ? request.Tt : null;
            replacement.ReplacementTTCode = byTt ? request.ReplacementTt : null;
            replacement.Begin = request.From.Date;
            replacement.End = request.To.Date.AddDays(1);
            await calc.SaveChangesAsync(ct);
            return Ok(ToDto(replacement));
        }

        [HttpDelete("replacements/{id:int}")]
        public async Task<IActionResult> DeleteReplacement(int id, CancellationToken ct)
        {
            var replacement = await calc.Replacements.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (replacement is null)
                return NotFound(new { message = "Замена не найдена" });
            calc.Replacements.Remove(replacement);
            await calc.SaveChangesAsync(ct);
            return NoContent();
        }

        /* ===== Окна захода ===== */

        public sealed record WindowDto(string Category, int? Tt, int Start, int End);

        public sealed class SaveWindowsRequest
        {
            public string Category { get; set; } = "";
            /// <summary>null — окна для всех точек; иначе — свои окна точки (пустой список — вернуть общие).</summary>
            public int? Tt { get; set; }
            public List<WindowRangeDto> Windows { get; set; } = [];
        }

        public sealed class WindowRangeDto
        {
            public int Start { get; set; }
            public int End { get; set; }
        }

        [HttpGet("windows")]
        public async Task<ActionResult<List<WindowDto>>> GetWindows(CancellationToken ct) =>
            Ok((await db.OfficeCalculatorEntryWindows.AsNoTracking().OrderBy(x => x.Category).ThenBy(x => x.TTCode).ThenBy(x => x.StartMinute).ToListAsync(ct))
                .Select(x => new WindowDto(x.Category, x.TTCode, x.StartMinute, x.EndMinute)).ToList());

        /// <summary>Заменяет окна категории для всех точек или для одной точки.</summary>
        [HttpPut("windows")]
        public async Task<IActionResult> SaveWindows([FromBody] SaveWindowsRequest request, CancellationToken ct)
        {
            if (CalculatorCategories.Find(request.Category) is not { } cat)
                return BadRequest(new { message = "Нет такой категории" });
            if (request.Tt is int tt && !await calc.TTs.AnyAsync(x => x.TTCode == tt, ct))
                return NotFound(new { message = "Точка не найдена" });
            if (request.Tt is null && request.Windows.Count == 0)
                return BadRequest(new { message = "Для всех точек нужно хотя бы одно окно" });
            var ordered = request.Windows.OrderBy(x => x.Start).ToList();
            if (ordered.Any(x => x.Start < 0 || x.End > 1440 || x.Start >= x.End))
                return BadRequest(new { message = "Окно должно начинаться раньше, чем заканчивается, в пределах суток" });
            for (var i = 1; i < ordered.Count; i++)
                if (ordered[i].Start < ordered[i - 1].End)
                    return BadRequest(new { message = $"Окна пересекаются: {EntryWindow.Format(ordered[i - 1].Start)}–{EntryWindow.Format(ordered[i - 1].End)} и {EntryWindow.Format(ordered[i].Start)}–{EntryWindow.Format(ordered[i].End)}" });

            var existing = await db.OfficeCalculatorEntryWindows.Where(x => x.Category == cat.Slug && x.TTCode == request.Tt).ToListAsync(ct);
            db.OfficeCalculatorEntryWindows.RemoveRange(existing);
            db.OfficeCalculatorEntryWindows.AddRange(ordered.Select(x => new OfficeCalculatorEntryWindow { Category = cat.Slug, TTCode = request.Tt, StartMinute = x.Start, EndMinute = x.End }));
            await db.SaveChangesAsync(ct);
            return NoContent();
        }

        /* ===== Блокировки ===== */

        public sealed record BlockDto(int Id, int RkCode, int? Tt, DateTime From, DateTime To, int Type, bool Enable, string? Info);

        public sealed class SaveBlockRequest
        {
            public int? Id { get; set; }
            public int RkCode { get; set; }
            /// <summary>null — для всех точек.</summary>
            public int? Tt { get; set; }
            public DateTime From { get; set; }
            /// <summary>Последний день блокировки, включительно.</summary>
            public DateTime To { get; set; }
            /// <summary>1 — точка может снять сама, 2 — только аудитор.</summary>
            public int Type { get; set; } = 2;
        }

        /// <summary>Блокировки, которые действуют или закончились не больше месяца назад.</summary>
        [HttpGet("blocks")]
        public async Task<ActionResult<List<BlockDto>>> GetBlocks(CancellationToken ct)
        {
            var since = Now().AddMonths(-1);
            return Ok((await calc.ItemBlocks.AsNoTracking().Where(x => x.End > since).OrderByDescending(x => x.Begin).ThenByDescending(x => x.Id).ToListAsync(ct))
                .Select(ToDto).ToList());
        }

        private static BlockDto ToDto(CalcItemBlock x) =>
            new(x.Id, x.ItemRkCode, x.TTCode, x.Begin.Date, x.End.Date.AddDays(-1), x.Type, x.Enable, x.Info);

        [HttpPut("blocks")]
        public async Task<ActionResult<BlockDto>> SaveBlock([FromBody] SaveBlockRequest request, CancellationToken ct)
        {
            if (request.From == default || request.To == default || request.From.Date > request.To.Date)
                return BadRequest(new { message = "Проверьте даты: «с» не позже «по»" });
            if (request.Type is < 1 or > 3)
                return BadRequest(new { message = "Неизвестный тип блокировки" });
            if (!await calc.Items.AnyAsync(x => x.RkCode == request.RkCode, ct))
                return NotFound(new { message = "Позиция не найдена" });
            if (request.Tt is int tt && !await calc.TTs.AnyAsync(x => x.TTCode == tt, ct))
                return NotFound(new { message = "Точка не найдена" });
            if (UserId() is not int userId)
                return Unauthorized();
            var who = await CalculatorUsers.DisplayNameAsync(db, userId, ct);
            var now = Now();

            CalcItemBlock? block;
            if (request.Id is int id)
            {
                block = await calc.ItemBlocks.FirstOrDefaultAsync(x => x.Id == id, ct);
                if (block is null)
                    return NotFound(new { message = "Блокировка не найдена" });
                block.Info += $" Изменил: {who} {now.ToString(Ru)}";
            }
            else
            {
                block = new CalcItemBlock { Info = $"Заполнил: {who} {now.ToString(Ru)}" };
                calc.ItemBlocks.Add(block);
            }
            block.ItemRkCode = request.RkCode;
            block.TTCode = request.Tt;
            block.Begin = request.From.Date;
            block.End = request.To.Date.AddDays(1);
            block.Type = request.Type;
            block.Enable = true;
            await calc.SaveChangesAsync(ct);
            return Ok(ToDto(block));
        }

        /// <summary>Снять блокировку: строка остаётся в истории выключенной.</summary>
        [HttpDelete("blocks/{id:int}")]
        public async Task<IActionResult> DeleteBlock(int id, CancellationToken ct)
        {
            var block = await calc.ItemBlocks.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (block is null)
                return NotFound(new { message = "Блокировка не найдена" });
            if (UserId() is not int userId)
                return Unauthorized();
            block.Enable = false;
            block.Info += $" Удалил: {await CalculatorUsers.DisplayNameAsync(db, userId, ct)} {Now().ToString(Ru)}";
            await calc.SaveChangesAsync(ct);
            return NoContent();
        }

        private int? UserId() => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    }
}
