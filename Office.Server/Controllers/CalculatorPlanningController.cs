using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Calculator;
using Office.Server.DbContexts.Calculator;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Controllers
{
    /// <summary>
    /// Новый расчёт калькулятора — настройки технолога (пока в памяти сервера, см. <see cref="CalculatorPlanningStore"/>): на каких точках он включён, запас по категориям,
    /// время до витрины, календарь праздников и мероприятий, погода, отчёт по срочным заходам и проверка прогноза.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = CalculatorRoles.Admin)]
    public class CalculatorPlanningController(RKNETDBContext db, CalculatorDbContext calc, CalculatorPlanningStore planning, CalculatorForecastService forecast) : ControllerBase
    {
        private static readonly string[] ModifierKinds = ["holiday", "event", "promo", "closure"];

        /// <summary>Текущее время сервера (местное); подменяется в тестах.</summary>
        public Func<DateTime> Now { get; set; } = () => DateTime.Now;

        public sealed class PlanningCategoryDto
        {
            public string Category { get; set; } = "";
            public double Availability { get; set; }
            public bool UseCoefficients { get; set; }
            public int LeadMinutes { get; set; }
            public double HeatEffect { get; set; }
            public double ColdEffect { get; set; }
        }

        public sealed class PlanningStoreDto
        {
            public int Tt { get; set; }
            public string Name { get; set; } = "";
            public bool Forecast { get; set; }
            public int? OvenTrays { get; set; }
            public double? RainEffect { get; set; }
        }

        public sealed class PlanningItemDto
        {
            public int RkCode { get; set; }
            public string Name { get; set; } = "";
            public string Category { get; set; } = "";
            /// <summary>Время дефроста из старых настроек позиции — подсказка.</summary>
            public string? DefrostTime { get; set; }
            public int? LeadMinutes { get; set; }
            public int? TrayCapacity { get; set; }
            public string? Program { get; set; }
        }

        public sealed class PlanningDto
        {
            public Dictionary<string, double> Settings { get; set; } = [];
            public List<PlanningCategoryDto> Categories { get; set; } = [];
            public List<PlanningStoreDto> Stores { get; set; } = [];
            public List<PlanningItemDto> Items { get; set; } = [];
        }

        [HttpGet]
        public async Task<ActionResult<PlanningDto>> Get(CancellationToken ct)
        {
            var settings = planning.Settings();
            var stores = planning.Stores();
            var own = planning.Items();
            var bySlug = CalculatorCategories.All.ToDictionary(x => x.Group, x => x.Slug);
            var items = await calc.Items.AsNoTracking().OrderBy(x => x.Sequence).ThenBy(x => x.RkCode).ToListAsync(ct);
            var tts = await calc.TTs.AsNoTracking().OrderBy(x => x.TTName).ToListAsync(ct);

            return Ok(new PlanningDto
            {
                Settings = ForecastSettings.Defaults.Keys.ToDictionary(x => x, x => settings[x]),
                Categories = CalculatorCategories.All.Select(x => ToDto(planning.Category(x.Slug))).ToList(),
                Stores = tts.Select(x => new PlanningStoreDto
                {
                    Tt = x.TTCode,
                    Name = x.TTName.Trim(),
                    Forecast = stores.GetValueOrDefault(x.TTCode)?.Forecast ?? false,
                    OvenTrays = stores.GetValueOrDefault(x.TTCode)?.OvenTrays,
                    RainEffect = stores.GetValueOrDefault(x.TTCode)?.RainEffect,
                }).ToList(),
                Items = items.Where(x => bySlug.ContainsKey(x.ItemsGroup)).Select(x => new PlanningItemDto
                {
                    RkCode = x.RkCode,
                    Name = x.Name.Trim(),
                    Category = bySlug[x.ItemsGroup],
                    DefrostTime = string.IsNullOrWhiteSpace(x.DefrostTime) ? null : x.DefrostTime.Trim(),
                    LeadMinutes = own.GetValueOrDefault(x.RkCode)?.LeadMinutes,
                    TrayCapacity = own.GetValueOrDefault(x.RkCode)?.TrayCapacity,
                    Program = own.GetValueOrDefault(x.RkCode)?.Program,
                }).ToList(),
            });
        }

        private static PlanningCategoryDto ToDto(PlanningCategory x) => new()
        {
            Category = x.Category,
            Availability = x.Availability,
            UseCoefficients = x.UseCoefficients,
            LeadMinutes = x.LeadMinutes,
            HeatEffect = x.HeatEffect,
            ColdEffect = x.ColdEffect,
        };

        /// <summary>Общие числа: пороги и эффекты погоды, координаты, длина срочного захода.</summary>
        [HttpPut("settings")]
        public IActionResult SaveSettings([FromBody] Dictionary<string, double> values)
        {
            foreach (var (key, value) in values)
            {
                if (!ForecastSettings.Defaults.ContainsKey(key))
                    return BadRequest(new { message = $"Неизвестная настройка «{key}»" });
                if (SettingProblem(key, value) is { } problem)
                    return BadRequest(new { message = problem });
            }
            planning.SaveSettings(values);
            return NoContent();
        }

        private static string? SettingProblem(string key, double value) => key switch
        {
            "rain_effect" or "snow_effect" or "heat_effect" when value is < -0.5 or > 0.5 => "Эффект погоды — от −50% до +50%",
            "rain_mm" or "snow_cm" when value is < 0 or > 100 => "Порог осадков — от 0 до 100",
            "heat_c" or "mix_heat_c" or "mix_cold_c" when value is < -50 or > 50 => "Температура — от −50 до 50 °C",
            "urgent_minutes" when value is < 10 or > 240 => "Срочный заход — от 10 до 240 минут",
            "latitude" when value is < -90 or > 90 => "Широта — от −90 до 90",
            "longitude" when value is < -180 or > 180 => "Долгота — от −180 до 180",
            _ => null,
        };

        [HttpPut("categories/{slug}")]
        public ActionResult<PlanningCategoryDto> SaveCategory(string slug, [FromBody] PlanningCategoryDto request)
        {
            if (CalculatorCategories.Find(slug) is not { } category)
                return NotFound(new { message = "Нет такой категории" });
            if (request.Availability is < 0.5 or > 0.99)
                return BadRequest(new { message = "Наличие — от 50% до 99%" });
            if (request.LeadMinutes is < 0 or > 1440)
                return BadRequest(new { message = "Время до витрины — от 0 до 1440 минут" });
            if (request.HeatEffect is < -0.5 or > 0.5 || request.ColdEffect is < -0.5 or > 0.5)
                return BadRequest(new { message = "Сдвиг в жару и мороз — от −50% до +50%" });

            var row = new PlanningCategory(category.Slug, request.Availability, request.UseCoefficients, request.LeadMinutes, request.HeatEffect, request.ColdEffect);
            planning.SaveCategory(row);
            return Ok(ToDto(row));
        }

        public sealed class SavePlanningStoreRequest
        {
            public bool Forecast { get; set; }
            public int? OvenTrays { get; set; }
            public double? RainEffect { get; set; }
        }

        [HttpPut("stores/{tt:int}")]
        public async Task<IActionResult> SaveStore(int tt, [FromBody] SavePlanningStoreRequest request, CancellationToken ct)
        {
            if (!await calc.TTs.AnyAsync(x => x.TTCode == tt, ct))
                return NotFound(new { message = "Нет такой точки в калькуляторе" });
            if (request.OvenTrays is < 1 or > 40)
                return BadRequest(new { message = "Противней в печи — от 1 до 40" });
            if (request.RainEffect is < -0.5 or > 0.5)
                return BadRequest(new { message = "Реакция на дождь — от −50% до +50%" });

            planning.SaveStore(new PlanningStore(tt, request.Forecast, request.OvenTrays, request.RainEffect));
            return NoContent();
        }

        public sealed class SavePlanningItemRequest
        {
            public int? LeadMinutes { get; set; }
            public int? TrayCapacity { get; set; }
            public string? Program { get; set; }
        }

        [HttpPut("items/{rkCode:int}")]
        public async Task<IActionResult> SaveItem(int rkCode, [FromBody] SavePlanningItemRequest request, CancellationToken ct)
        {
            if (!await calc.Items.AnyAsync(x => x.RkCode == rkCode, ct))
                return NotFound(new { message = "Нет такой позиции" });
            if (request.LeadMinutes is < 0 or > 1440)
                return BadRequest(new { message = "Время до витрины — от 0 до 1440 минут" });
            if (request.TrayCapacity is < 1 or > 100)
                return BadRequest(new { message = "На противне — от 1 до 100 штук" });
            var program = string.IsNullOrWhiteSpace(request.Program) ? null : request.Program.Trim();
            if (program?.Length > 16)
                return BadRequest(new { message = "Программа печи — до 16 символов" });

            planning.SaveItem(new PlanningItem(rkCode, request.LeadMinutes, request.TrayCapacity, program));
            return NoContent();
        }

        public sealed class PlanningModifierDto
        {
            public int? Id { get; set; }
            public string Kind { get; set; } = "holiday";
            public string Title { get; set; } = "";
            /// <summary>Даты включительно, «yyyy-mm-dd».</summary>
            public DateTime From { get; set; }
            public DateTime To { get; set; }
            public int? Tt { get; set; }
            public string? Category { get; set; }
            public int? RkCode { get; set; }
            public double Factor { get; set; }
        }

        private static PlanningModifierDto ToDto(PlanningModifier x) => new()
        {
            Id = x.Id,
            Kind = x.Kind,
            Title = x.Title,
            From = x.DateFrom,
            To = x.DateTo,
            Tt = x.TTCode,
            Category = x.Category,
            RkCode = x.RkCode,
            Factor = x.Factor,
        };

        /// <summary>Календарь: всё, что ещё не закончилось или закончилось не раньше двух месяцев назад.</summary>
        [HttpGet("modifiers")]
        public ActionResult<List<PlanningModifierDto>> GetModifiers()
        {
            var since = Now().Date.AddDays(-60);
            return Ok(planning.Modifiers().Where(x => x.DateTo >= since).OrderBy(x => x.DateFrom).ThenBy(x => x.Id).Select(ToDto).ToList());
        }

        [HttpPut("modifiers")]
        public async Task<ActionResult<PlanningModifierDto>> SaveModifier([FromBody] PlanningModifierDto request, CancellationToken ct)
        {
            var title = request.Title?.Trim() ?? "";
            if (!ModifierKinds.Contains(request.Kind))
                return BadRequest(new { message = "Неизвестный вид: праздник, мероприятие, акция или закрытие" });
            if (title.Length is 0 or > 120)
                return BadRequest(new { message = "Название — от 1 до 120 символов" });
            if (request.From.Date > request.To.Date)
                return BadRequest(new { message = "Дата начала позже даты конца" });
            if (request.Factor is < 0.1 or > 5)
                return BadRequest(new { message = "Множитель — от 0,1 до 5" });
            if (request.Category is not null && CalculatorCategories.Find(request.Category) is null)
                return BadRequest(new { message = "Нет такой категории" });
            if (request.Tt is int tt && !await calc.TTs.AnyAsync(x => x.TTCode == tt, ct))
                return BadRequest(new { message = "Нет такой точки в калькуляторе" });
            if (request.RkCode is int code && !await calc.Items.AnyAsync(x => x.RkCode == code, ct))
                return BadRequest(new { message = "Нет такой позиции" });

            var row = planning.SaveModifier(new PlanningModifier(
                request.Id ?? 0, request.Kind, title, request.From.Date, request.To.Date,
                request.Tt, request.Category?.ToLowerInvariant(), request.RkCode, request.Factor));
            return row is null ? NotFound(new { message = "Запись календаря не найдена" }) : Ok(ToDto(row));
        }

        [HttpDelete("modifiers/{id:int}")]
        public IActionResult DeleteModifier(int id) =>
            planning.DeleteModifier(id) ? NoContent() : NotFound(new { message = "Запись календаря не найдена" });

        public sealed class PlanningUrgentVisitDto
        {
            public int Id { get; set; }
            public int Tt { get; set; }
            public string Store { get; set; } = "";
            public string Category { get; set; } = "";
            public DateTime StartedAt { get; set; }
            public string Reason { get; set; } = "";
            public string UserName { get; set; } = "";
        }

        /// <summary>Срочные заходы за последние дни — чтобы видеть, где категория кончается раньше времени или заходами злоупотребляют.</summary>
        [HttpGet("urgent")]
        public async Task<ActionResult<List<PlanningUrgentVisitDto>>> GetUrgent(int days = 30, CancellationToken ct = default)
        {
            var since = Now().Date.AddDays(-Math.Clamp(days, 1, 366));
            var visits = planning.Urgent().Where(x => x.StartedAt >= since).OrderByDescending(x => x.StartedAt).ToList();
            var names = await calc.TTs.AsNoTracking().ToDictionaryAsync(x => x.TTCode, x => x.TTName.Trim(), ct);
            return Ok(visits.Select(x => new PlanningUrgentVisitDto
            {
                Id = x.Id,
                Tt = x.TTCode,
                Store = names.GetValueOrDefault(x.TTCode) ?? $"#{x.TTCode}",
                Category = x.Category,
                StartedAt = x.StartedAt,
                Reason = x.Reason,
                UserName = x.UserName,
            }).ToList());
        }

        public sealed class ForecastPreviewItemDto
        {
            public int RkCode { get; set; }
            public string Name { get; set; } = "";
            public bool Blocked { get; set; }
            public double Expected { get; set; }
            public double Target { get; set; }
            public DateTime HorizonEnd { get; set; }
            public List<string> AddFrom { get; set; } = [];
        }

        public sealed class ForecastPreviewDto
        {
            public DateTime Now { get; set; }
            public DateTime? NextStart { get; set; }
            public bool Enabled { get; set; }
            public bool WeatherKnown { get; set; }
            public double Availability { get; set; }
            public bool UseCoefficients { get; set; }
            public List<string> Notes { get; set; } = [];
            public List<ForecastPreviewItemDto> Items { get; set; } = [];
        }

        /// <summary>Проверка прогноза: что новый расчёт скажет точке прямо сейчас, даже если на ней он ещё не включён.</summary>
        [HttpGet("preview")]
        public async Task<ActionResult<ForecastPreviewDto>> Preview(int tt, string category, CancellationToken ct)
        {
            if (CalculatorCategories.Find(category) is not { } found)
                return NotFound(new { message = "Нет такой категории" });
            if (!await calc.TTs.AnyAsync(x => x.TTCode == tt, ct))
                return NotFound(new { message = "Нет такой точки в калькуляторе" });
            var now = Now();
            var windows = CalculatorWindows.Resolve(CalculatorWindows.For(await CalculatorWindows.LoadAsync(db, tt, ct), found.Slug, tt), now);
            var sheet = await forecast.BuildAsync(found, tt, now, windows.NextStart, ct);
            if (sheet is null)
                return Conflict(new { message = "Категория не настроена в базе калькулятора" });
            var codes = sheet.Items.Keys.ToList();
            var names = await calc.Items.AsNoTracking().Where(x => codes.Contains(x.RkCode)).ToDictionaryAsync(x => x.RkCode, x => x.Name.Trim(), ct);
            var blocked = (await calc.ItemBlocks.AsNoTracking()
                .Where(x => x.Enable && x.Begin <= now && x.End >= now && (x.TTCode == null || x.TTCode == tt) && codes.Contains(x.ItemRkCode))
                .Select(x => x.ItemRkCode).ToListAsync(ct)).ToHashSet();
            return Ok(new ForecastPreviewDto
            {
                Now = now,
                NextStart = windows.NextStart,
                Enabled = forecast.Enabled(tt),
                WeatherKnown = sheet.WeatherKnown,
                Availability = sheet.Availability,
                UseCoefficients = sheet.UseCoefficients,
                Notes = sheet.Days.Select(CalculatorForecastService.Describe).ToList(),
                Items = sheet.Items.Values.Select(x => new ForecastPreviewItemDto
                {
                    RkCode = x.RkCode,
                    Name = names.GetValueOrDefault(x.RkCode) ?? x.RkCode.ToString(),
                    Blocked = blocked.Contains(x.RkCode),
                    Expected = x.Expected,
                    Target = x.Target,
                    HorizonEnd = x.HorizonEnd,
                    AddFrom = [.. x.AddFrom],
                }).ToList(),
            });
        }
    }
}
