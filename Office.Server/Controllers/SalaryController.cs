using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.Net.Http.Json;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class SalaryController : ControllerBase
    {
        private static readonly Guid FactoryLocationTypeGuid = Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84");
        private static readonly Guid OfficeLocationTypeGuid = Guid.Parse("B0E427F9-8996-4C03-33C1-08DBDF713401");

        private readonly RKNETDBContext _context;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;

        public SalaryController(
            RKNETDBContext context,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
        }

        [HttpGet("filters")]
        public async Task<IActionResult> GetFilters()
        {
            var locations = await _context.Locations.AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new SalaryLocationDto
                {
                    Guid = x.Guid,
                    Name = x.Name,
                    Actual = x.Actual,
                    RkCode = x.RKCode
                })
                .ToListAsync();

            return Ok(new SalaryFiltersDto
            {
                Locations = locations
            });
        }

        [HttpGet("personality-search")]
        public async Task<IActionResult> GetPersonalityList([FromQuery] string fio)
        {
            fio = (fio ?? string.Empty).Trim();
            if (fio.Length < 2)
            {
                return Ok(Array.Empty<PersonalitySearchItemDto>());
            }

            var personalities = await _context.PersonalityVersions
                .AsNoTracking()
                .Where(p => p.Actual == 1 &&
                    (((p.Surname ?? string.Empty) + " " + (p.Name ?? string.Empty) + " " + (p.Patronymic ?? string.Empty)).Contains(fio)))
                .OrderBy(p => p.Surname)
                .ThenBy(p => p.Name)
                .ThenBy(p => p.Patronymic)
                .Take(30)
                .Select(p => new PersonalitySearchItemDto
                {
                    PersonalityVersionGuid = p.Guid,
                    PersonalityGuid = p.PersonalityGuid,
                    Fio = ((p.Surname ?? string.Empty) + " " + (p.Name ?? string.Empty) + " " + (p.Patronymic ?? string.Empty)).Trim()
                })
                .ToListAsync();

            return Ok(personalities);
        }

        [HttpGet("timesheets")]
        public async Task<IActionResult> GetTimeSheets(
            [FromQuery] Guid? locationGuid = null,
            [FromQuery] Guid? personGuid = null,
            [FromQuery] DateTime? start = null,
            [FromQuery] DateTime? end = null,
            [FromQuery] int? month = null,
            [FromQuery] int? year = null)
        {
            if (start == null && end == null && month == null)
            {
                end = DateTime.Now;
                start = DateTime.Now.AddDays(-155);
            }

            DateTime? rangeStart = start?.Date;
            DateTime? rangeEndExclusive = end?.Date.AddDays(1);

            if (month.HasValue)
            {
                var effectiveYear = year ?? start?.Year ?? end?.Year ?? DateTime.Now.Year;
                var monthStart = new DateTime(effectiveYear, month.Value, 1);
                rangeStart = monthStart;
                rangeEndExclusive = monthStart.AddMonths(1);
            }

            IQueryable<TimeSheet> query = _context.TimeSheets
                .AsNoTracking()
                .Include(x => x.Location)
                .Include(x => x.JobTitle)
                .Include(x => x.Personalities)
                .Where(x => x.Personalities != null && x.Location != null);

            if (personGuid.HasValue)
            {
                query = query.Where(x => x.PersonalityGuid == personGuid.Value);
            }

            if (locationGuid.HasValue)
            {
                query = query.Where(x => x.LocationGuid == locationGuid.Value);
            }

            if (rangeStart.HasValue)
            {
                query = query.Where(x => x.Begin >= rangeStart.Value);
            }

            if (rangeEndExclusive.HasValue)
            {
                query = query.Where(x => x.End < rangeEndExclusive.Value);
            }

            var rows = await query
                .OrderByDescending(x => x.Begin)
                .Select(x => new SalaryTimeSheetDto
                {
                    Guid = x.Guid,
                    PersonalityGuid = x.PersonalityGuid,
                    Fio = _context.PersonalityVersions
                        .AsNoTracking()
                        .Where(p => p.Actual == 1 && p.PersonalityGuid == x.PersonalityGuid)
                        .Select(p => ((p.Surname ?? string.Empty) + " " + (p.Name ?? string.Empty) + " " + (p.Patronymic ?? string.Empty)).Trim())
                        .FirstOrDefault() ?? (x.Personalities != null ? x.Personalities.Name : string.Empty),
                    Location = x.Location != null ? x.Location.Name : string.Empty,
                    Position = x.JobTitle != null ? x.JobTitle.Name : string.Empty,
                    LocationGuid = x.LocationGuid,
                    Begin = x.Begin,
                    End = x.End,
                    Absence = x.Absence,
                    BaseRate = x.BaseRate,
                    LocationCashBonus = x.LocationCashBonus,
                    ExperienceCashBonus = x.ExperienceCashBonus,
                    PersonalCashBonus = x.PersonalCashBonus,
                    TotalSalary = x.TotalSalary
                })
                .ToListAsync();

            return Ok(rows);
        }

        [HttpPost("timesheets/{guid:guid}/recalculate")]
        public async Task<IActionResult> RecalculateTimeSheet(Guid guid)
        {
            var recalculateResponse = await SendSalaryServiceRequestAsync(
                HttpMethod.Get,
                BuildSalaryApiUrl($"CalculateSalary/settimesheetsalary?guid={Uri.EscapeDataString(guid.ToString())}"));

            if (!recalculateResponse.IsSuccess)
            {
                return StatusCode(recalculateResponse.StatusCode, new { message = recalculateResponse.Message });
            }

            var timeSheet = await _context.TimeSheets
                .AsNoTracking()
                .Where(x => x.Guid == guid)
                .Select(x => new SalaryTimeSheetRefreshDto
                {
                    Guid = x.Guid,
                    Begin = x.Begin,
                    End = x.End,
                    BaseRate = x.BaseRate,
                    LocationCashBonus = x.LocationCashBonus,
                    ExperienceCashBonus = x.ExperienceCashBonus,
                    PersonalCashBonus = x.PersonalCashBonus,
                    TotalSalary = x.TotalSalary
                })
                .FirstOrDefaultAsync();

            if (timeSheet == null)
            {
                return NotFound(new { message = "Табель не найден." });
            }

            return Ok(timeSheet);
        }

        [HttpPost("calculate")]
        public async Task<IActionResult> CalculateSalaries([FromBody] List<Guid>? guids)
        {
            var distinctGuids = (guids ?? new List<Guid>())
                .Where(x => x != Guid.Empty)
                .Distinct()
                .ToList();

            if (distinctGuids.Count == 0)
            {
                return BadRequest(new { message = "Список табелей для расчета пуст." });
            }

            var response = await SendSalaryServiceRequestAsync(
                HttpMethod.Post,
                BuildSalaryApiUrl("CalculateSalary/SetTimeSheetSalaries"),
                distinctGuids);

            if (!response.IsSuccess)
            {
                return StatusCode(response.StatusCode, new { message = response.Message });
            }

            return Ok(new { calculated = distinctGuids.Count });
        }

        [HttpGet("settings/base")]
        public async Task<IActionResult> GetBaseSettings()
        {
            var baseRules = await LoadSalarySettingsItemsAsync<BaseRuleItemDto>("Edit/GetBaseTable");
            var jobTitles = await _context.JobTitles.AsNoTracking()
                .OrderBy(x => x.Sequence)
                .ThenBy(x => x.Name)
                .Select(x => new JobTitleDto
                {
                    Guid = x.Guid,
                    Name = x.Name,
                    Sequence = x.Sequence
                })
                .ToListAsync();

            var locations = await _context.Locations.AsNoTracking()
                .Include(x => x.LocationType)
                .Where(x => x.LocationTypeGuid == FactoryLocationTypeGuid || x.LocationTypeGuid == OfficeLocationTypeGuid)
                .OrderBy(x => x.Name)
                .Select(x => new SalaryLocationDto
                {
                    Guid = x.Guid,
                    Name = x.Name,
                    Actual = x.Actual,
                    RkCode = x.RKCode
                })
                .ToListAsync();

            return Ok(new SalarySettingsBaseResponseDto
            {
                BaseRules = baseRules.Items,
                LoadError = baseRules.LoadError,
                JobTitles = jobTitles,
                Locations = locations
            });
        }

        [HttpGet("settings/location-rules")]
        public async Task<IActionResult> GetLocationRules()
        {
            var result = await LoadSalarySettingsItemsAsync<LocationRuleItemDto>("Edit/GetLocationTable");
            return Ok(result);
        }

        [HttpGet("settings/experience-rules")]
        public async Task<IActionResult> GetExperienceRules()
        {
            var result = await LoadSalarySettingsItemsAsync<ExperienceRuleItemDto>("Edit/GetExperienceTable");
            return Ok(result);
        }

        [HttpGet("settings/production-rules")]
        public IActionResult GetProductionRules()
        {
            return Ok(new ProductionSettingsResponseDto
            {
                Items = new List<ProductionRuleItemDto>(),
                Message = "В исходном проекте вкладка выработки пока не подключена к данным."
            });
        }

        [HttpPost("settings/base-rules")]
        public async Task<IActionResult> CreateBaseRule([FromBody] BaseRuleItemDto rule)
        {
            return await ProxySalaryPostAsync("Edit/SetBaseTableItem", rule);
        }

        [HttpPut("settings/base-rules/{ruleId:int}")]
        public async Task<IActionResult> UpdateBaseRule(int ruleId, [FromBody] BaseRuleItemDto rule)
        {
            rule.RuleId = ruleId;
            return await ProxySalaryPostAsync("Edit/UpdateBaseTableItem", rule);
        }

        [HttpDelete("settings/base-rules/{ruleId:int}")]
        public async Task<IActionResult> DeleteBaseRule(int ruleId)
        {
            return await DeleteSalaryRuleAsync(ruleId);
        }

        [HttpPost("settings/location-rules")]
        public async Task<IActionResult> CreateLocationRule([FromBody] LocationRuleItemDto rule)
        {
            return await ProxySalaryPostAsync("Edit/SetLocationTableItem", rule);
        }

        [HttpPut("settings/location-rules/{ruleId:int}")]
        public async Task<IActionResult> UpdateLocationRule(int ruleId, [FromBody] LocationRuleItemDto rule)
        {
            rule.RuleId = ruleId;
            return await ProxySalaryPostAsync("Edit/UpdateLocationTableItem", rule);
        }

        [HttpDelete("settings/location-rules/{ruleId:int}")]
        public async Task<IActionResult> DeleteLocationRule(int ruleId)
        {
            return await DeleteSalaryRuleAsync(ruleId);
        }

        [HttpPost("settings/experience-rules")]
        public async Task<IActionResult> CreateExperienceRule([FromBody] ExperienceRuleItemDto rule)
        {
            return await ProxySalaryPostAsync("Edit/SetExperienceTableItem", rule);
        }

        [HttpPut("settings/experience-rules/{ruleId:int}")]
        public async Task<IActionResult> UpdateExperienceRule(int ruleId, [FromBody] ExperienceRuleItemDto rule)
        {
            rule.RuleId = ruleId;
            return await ProxySalaryPostAsync("Edit/UpdateExperienceTableItem", rule);
        }

        [HttpDelete("settings/experience-rules/{ruleId:int}")]
        public async Task<IActionResult> DeleteExperienceRule(int ruleId)
        {
            return await DeleteSalaryRuleAsync(ruleId);
        }

        private async Task<IActionResult> DeleteSalaryRuleAsync(int ruleId)
        {
            var response = await SendSalaryServiceRequestAsync(
                HttpMethod.Delete,
                BuildSalaryApiUrl($"Edit/DeleteItem?id={ruleId}"));

            if (!response.IsSuccess)
            {
                return StatusCode(response.StatusCode, new { message = response.Message });
            }

            return NoContent();
        }

        private async Task<IActionResult> ProxySalaryPostAsync<T>(string relativePath, T payload)
        {
            if (payload == null)
            {
                return BadRequest(new { message = "Тело запроса пустое." });
            }

            var response = await SendSalaryServiceRequestAsync(HttpMethod.Post, BuildSalaryApiUrl(relativePath), payload);
            if (!response.IsSuccess)
            {
                return StatusCode(response.StatusCode, new { message = response.Message });
            }

            return Ok();
        }

        private async Task<SalarySettingsListResponseDto<T>> LoadSalarySettingsItemsAsync<T>(string relativePath)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                using var response = await client.GetAsync(BuildSalaryApiUrl(relativePath));
                if (!response.IsSuccessStatusCode)
                {
                    return new SalarySettingsListResponseDto<T>
                    {
                        Items = new List<T>(),
                        LoadError = $"Не удалось загрузить данные (HTTP {(int)response.StatusCode})."
                    };
                }

                var items = await response.Content.ReadFromJsonAsync<List<T>>();
                return new SalarySettingsListResponseDto<T>
                {
                    Items = items ?? new List<T>()
                };
            }
            catch
            {
                return new SalarySettingsListResponseDto<T>
                {
                    Items = new List<T>(),
                    LoadError = "Ошибка обращения к сервису данных."
                };
            }
        }

        private async Task<SalaryServiceResponse> SendSalaryServiceRequestAsync<T>(HttpMethod method, string url, T payload)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                using var request = new HttpRequestMessage(method, url)
                {
                    Content = JsonContent.Create(payload)
                };
                using var response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    return SalaryServiceResponse.Success();
                }

                var raw = await response.Content.ReadAsStringAsync();
                return SalaryServiceResponse.Fail((int)response.StatusCode, string.IsNullOrWhiteSpace(raw) ? null : raw);
            }
            catch
            {
                return SalaryServiceResponse.Fail(StatusCodes.Status502BadGateway, "Ошибка обращения к сервису расчета зарплаты.");
            }
        }

        private async Task<SalaryServiceResponse> SendSalaryServiceRequestAsync(HttpMethod method, string url)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                using var request = new HttpRequestMessage(method, url);
                using var response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    return SalaryServiceResponse.Success();
                }

                var raw = await response.Content.ReadAsStringAsync();
                return SalaryServiceResponse.Fail((int)response.StatusCode, string.IsNullOrWhiteSpace(raw) ? null : raw);
            }
            catch
            {
                return SalaryServiceResponse.Fail(StatusCodes.Status502BadGateway, "Ошибка обращения к сервису расчета зарплаты.");
            }
        }

        private string BuildSalaryApiUrl(string relativePath)
        {
            var baseUrl = _configuration["SalaryApi:BaseUrl"] ?? "http://rknet-server:1571/api";
            return $"{baseUrl.TrimEnd('/')}/{relativePath.TrimStart('/')}";
        }

        public class SalaryFiltersDto
        {
            public List<SalaryLocationDto> Locations { get; set; } = new();
        }

        public class SalaryLocationDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
            public int Actual { get; set; }
            public int? RkCode { get; set; }
        }

        public class JobTitleDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
            public int? Sequence { get; set; }
        }

        public class PersonalitySearchItemDto
        {
            public Guid PersonalityVersionGuid { get; set; }
            public Guid? PersonalityGuid { get; set; }
            public string Fio { get; set; } = string.Empty;
        }

        public class SalaryTimeSheetDto
        {
            public Guid Guid { get; set; }
            public Guid PersonalityGuid { get; set; }
            public string Fio { get; set; } = string.Empty;
            public string Location { get; set; } = string.Empty;
            public string Position { get; set; } = string.Empty;
            public Guid LocationGuid { get; set; }
            public DateTime Begin { get; set; }
            public DateTime End { get; set; }
            public int? Absence { get; set; }
            public decimal? BaseRate { get; set; }
            public decimal? LocationCashBonus { get; set; }
            public decimal? ExperienceCashBonus { get; set; }
            public decimal? PersonalCashBonus { get; set; }
            public decimal? TotalSalary { get; set; }
        }

        public class SalaryTimeSheetRefreshDto
        {
            public Guid Guid { get; set; }
            public DateTime Begin { get; set; }
            public DateTime End { get; set; }
            public decimal? BaseRate { get; set; }
            public decimal? LocationCashBonus { get; set; }
            public decimal? ExperienceCashBonus { get; set; }
            public decimal? PersonalCashBonus { get; set; }
            public decimal? TotalSalary { get; set; }
        }

        public class SalarySettingsBaseResponseDto
        {
            public List<BaseRuleItemDto> BaseRules { get; set; } = new();
            public string? LoadError { get; set; }
            public List<JobTitleDto> JobTitles { get; set; } = new();
            public List<SalaryLocationDto> Locations { get; set; } = new();
        }

        public class SalarySettingsListResponseDto<T>
        {
            public List<T> Items { get; set; } = new();
            public string? LoadError { get; set; }
        }

        public class ProductionSettingsResponseDto
        {
            public List<ProductionRuleItemDto> Items { get; set; } = new();
            public string Message { get; set; } = string.Empty;
        }

        public class ProductionRuleItemDto
        {
            public string Category { get; set; } = string.Empty;
            public string Duration { get; set; } = string.Empty;
            public int Shifts { get; set; }
            public decimal Bonus { get; set; }
            public DateTime? Begin { get; set; }
            public DateTime? End { get; set; }
        }

        public class BaseRuleItemDto
        {
            public int? RuleId { get; set; }
            public JobReferenceDto? MainJob { get; set; }
            public JobReferenceDto? RealJob { get; set; }
            public string BSM { get; set; } = string.Empty;
            public string BAK { get; set; } = "0";
            public string EXK { get; set; } = "0";
            public DateTime Begin { get; set; }
            public DateTime End { get; set; }
            public bool PartTimer { get; set; }
        }

        public class JobReferenceDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
        }

        public class LocationRuleItemDto
        {
            public int RuleId { get; set; }
            public LocationReferenceDto? Location { get; set; }
            public int BAM { get; set; }
            public DateTime Begin { get; set; }
            public DateTime End { get; set; }
        }

        public class LocationReferenceDto
        {
            public int? RKCode { get; set; }
            public string Name { get; set; } = string.Empty;
        }

        public class ExperienceRuleItemDto
        {
            public int RuleId { get; set; }
            public int? EXPmin { get; set; }
            public int? EXPmax { get; set; }
            public int EXM { get; set; }
            public DateTime Begin { get; set; }
            public DateTime End { get; set; }
        }

        private class SalaryServiceResponse
        {
            public bool IsSuccess { get; private set; }
            public int StatusCode { get; private set; }
            public string? Message { get; private set; }

            public static SalaryServiceResponse Success()
            {
                return new SalaryServiceResponse
                {
                    IsSuccess = true,
                    StatusCode = StatusCodes.Status200OK
                };
            }

            public static SalaryServiceResponse Fail(int statusCode, string? message)
            {
                return new SalaryServiceResponse
                {
                    IsSuccess = false,
                    StatusCode = statusCode,
                    Message = string.IsNullOrWhiteSpace(message) ? "Ошибка сервиса зарплаты." : message
                };
            }
        }
    }
}
