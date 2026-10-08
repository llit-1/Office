using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Factory;
using System;
using System.Data;
using System.Linq;
using System.Threading.Tasks;

namespace Office.Server.Controllers
{
    /// <summary>
    /// Структура завода: комбинации «Отдел + Участок + Должность».
    /// Тройка (FactoryDepartmentWorkshopJobTitle) ссылается на пары «Отдел + Участок»
    /// и «Должность + Участок», поэтому пары создаются и удаляются вместе с тройками.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "FactoryPerson")]
    public class FactoryStructureController : ControllerBase
    {
        private readonly RKNETDBContext _context;

        public FactoryStructureController(RKNETDBContext context)
        {
            _context = context;
        }

        public class DictionaryItemRef
        {
            /// <summary>Существующая запись справочника.</summary>
            public int? Id { get; set; }

            /// <summary>Название новой записи; используется, если Id не задан.</summary>
            public string? Name { get; set; }
        }

        public class CombinationCreateRequest
        {
            public DictionaryItemRef? Department { get; set; }
            public DictionaryItemRef? Workshop { get; set; }
            public DictionaryItemRef? JobTitle { get; set; }
        }

        // GET: api/FactoryStructure
        [HttpGet]
        public async Task<ActionResult> Get()
        {
            var today = DateTime.Today;

            var departments = await _context.FactoryDepartment.AsNoTracking()
                .OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).ToListAsync();
            var workshops = await _context.FactoryWorkshop.AsNoTracking()
                .OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).ToListAsync();
            var jobTitles = await _context.FactoryJobTitle.AsNoTracking()
                .OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).ToListAsync();

            var activeCounts = await _context.FactoryPerson.AsNoTracking()
                .Where(p => p.DismissedDate == null || p.DismissedDate > today)
                .Where(p => p.FactoryDepartment != null && p.FactoryWorkshop != null && p.FactoryJobTitle != null)
                .GroupBy(p => new { p.FactoryDepartment, p.FactoryWorkshop, p.FactoryJobTitle })
                .Select(g => new
                {
                    DepartmentId = g.Key.FactoryDepartment!.Value,
                    WorkshopId = g.Key.FactoryWorkshop!.Value,
                    JobTitleId = g.Key.FactoryJobTitle!.Value,
                    Count = g.Count()
                })
                .ToListAsync();

            var countByKey = activeCounts.ToDictionary(x => (x.DepartmentId, x.WorkshopId, x.JobTitleId), x => x.Count);

            var links = await _context.FactoryDepartmentWorkshopJobTitle.AsNoTracking()
                .Select(x => new { x.FactoryDepartmentId, x.FactoryWorkshopId, x.FactoryJobTitleId })
                .ToListAsync();

            var departmentNames = departments.ToDictionary(x => x.Id, x => x.Name);
            var workshopNames = workshops.ToDictionary(x => x.Id, x => x.Name);
            var jobTitleNames = jobTitles.ToDictionary(x => x.Id, x => x.Name);

            var combinations = links
                .Select(x => new
                {
                    DepartmentId = x.FactoryDepartmentId,
                    DepartmentName = departmentNames.GetValueOrDefault(x.FactoryDepartmentId, string.Empty),
                    WorkshopId = x.FactoryWorkshopId,
                    WorkshopName = workshopNames.GetValueOrDefault(x.FactoryWorkshopId, string.Empty),
                    JobTitleId = x.FactoryJobTitleId,
                    JobTitleName = jobTitleNames.GetValueOrDefault(x.FactoryJobTitleId, string.Empty),
                    ActivePersons = countByKey.GetValueOrDefault((x.FactoryDepartmentId, x.FactoryWorkshopId, x.FactoryJobTitleId), 0)
                })
                .OrderBy(x => x.DepartmentName)
                .ThenBy(x => x.WorkshopName)
                .ThenBy(x => x.JobTitleName)
                .ToList();

            return Ok(new { departments, workshops, jobTitles, combinations });
        }

        // POST: api/FactoryStructure/combinations
        [HttpPost("combinations")]
        public async Task<ActionResult> CreateCombination([FromBody] CombinationCreateRequest request)
        {
            var validationError =
                ValidateRef(request.Department, "отдел")
                ?? ValidateRef(request.Workshop, "участок")
                ?? ValidateRef(request.JobTitle, "должность");
            validationError ??=
                await ValidateNameLengthAsync<FactoryDepartment>(request.Department!)
                ?? await ValidateNameLengthAsync<FactoryWorkshop>(request.Workshop!)
                ?? await ValidateNameLengthAsync<FactoryJobTitle>(request.JobTitle!);
            if (validationError != null)
                return BadRequest(new { message = validationError });

            if (request.Department!.Id is int departmentId && !await _context.FactoryDepartment.AnyAsync(x => x.Id == departmentId))
                return BadRequest(new { message = "Выбранный отдел не найден. Обновите страницу." });
            if (request.Workshop!.Id is int workshopId && !await _context.FactoryWorkshop.AnyAsync(x => x.Id == workshopId))
                return BadRequest(new { message = "Выбранный участок не найден. Обновите страницу." });
            if (request.JobTitle!.Id is int jobTitleId && !await _context.FactoryJobTitle.AnyAsync(x => x.Id == jobTitleId))
                return BadRequest(new { message = "Выбранная должность не найдена. Обновите страницу." });

            var strategy = _context.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync<ActionResult>(async () =>
            {
                _context.ChangeTracker.Clear();
                // Serializable: если Id назначается как MAX(Id) + 1, диапазон блокируется до конца транзакции,
                // поэтому параллельные запросы не получат одинаковый Id.
                await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

                var department = await ResolveAsync(request.Department, name => new FactoryDepartment { Name = name });
                var workshop = await ResolveAsync(request.Workshop, name => new FactoryWorkshop { Name = name });
                var jobTitle = await ResolveAsync(request.JobTitle, name => new FactoryJobTitle { Name = name });
                await _context.SaveChangesAsync();

                var exists = await _context.FactoryDepartmentWorkshopJobTitle.AnyAsync(x =>
                    x.FactoryDepartmentId == department.Id
                    && x.FactoryWorkshopId == workshop.Id
                    && x.FactoryJobTitleId == jobTitle.Id);
                if (exists)
                {
                    await transaction.RollbackAsync();
                    return Conflict(new { message = $"Комбинация «{department.Name} / {workshop.Name} / {jobTitle.Name}» уже существует." });
                }

                if (!await _context.FactoryDepartmentFactoryWorkshop.AnyAsync(x =>
                        x.FactoryDepartmentId == department.Id && x.FactoryWorkshopId == workshop.Id))
                {
                    _context.FactoryDepartmentFactoryWorkshop.Add(new FactoryDepartmentFactoryWorkshop
                    {
                        FactoryDepartmentId = department.Id,
                        FactoryWorkshopId = workshop.Id
                    });
                }

                if (!await _context.FactoryJobTitleFactoryWorkshop.AnyAsync(x =>
                        x.FactoryJobTitleId == jobTitle.Id && x.FactoryWorkshopId == workshop.Id))
                {
                    _context.FactoryJobTitleFactoryWorkshop.Add(new FactoryJobTitleFactoryWorkshop
                    {
                        FactoryJobTitleId = jobTitle.Id,
                        FactoryWorkshopId = workshop.Id
                    });
                }

                // Пары сохраняются первыми: на них ссылаются составные внешние ключи тройки.
                await _context.SaveChangesAsync();

                _context.FactoryDepartmentWorkshopJobTitle.Add(new FactoryDepartmentWorkshopJobTitle
                {
                    FactoryDepartmentId = department.Id,
                    FactoryWorkshopId = workshop.Id,
                    FactoryJobTitleId = jobTitle.Id
                });
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    DepartmentId = department.Id,
                    WorkshopId = workshop.Id,
                    JobTitleId = jobTitle.Id
                });
            });
        }

        // DELETE: api/FactoryStructure/combinations?department={d}&workshop={w}&jobTitle={j}
        [HttpDelete("combinations")]
        public async Task<ActionResult> DeleteCombination(int department, int workshop, int jobTitle)
        {
            var today = DateTime.Today;
            var activePersons = await _context.FactoryPerson.AsNoTracking().CountAsync(p =>
                p.FactoryDepartment == department
                && p.FactoryWorkshop == workshop
                && p.FactoryJobTitle == jobTitle
                && (p.DismissedDate == null || p.DismissedDate > today));
            if (activePersons > 0)
                return Conflict(new { message = $"Комбинацию нельзя удалить: на ней числится активных сотрудников — {activePersons}. Сначала переведите их на другую должность." });

            var strategy = _context.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync<ActionResult>(async () =>
            {
                _context.ChangeTracker.Clear();
                await using var transaction = await _context.Database.BeginTransactionAsync();

                var link = await _context.FactoryDepartmentWorkshopJobTitle.FirstOrDefaultAsync(x =>
                    x.FactoryDepartmentId == department
                    && x.FactoryWorkshopId == workshop
                    && x.FactoryJobTitleId == jobTitle);
                if (link == null)
                {
                    await transaction.RollbackAsync();
                    return NotFound(new { message = "Комбинация уже удалена." });
                }

                _context.FactoryDepartmentWorkshopJobTitle.Remove(link);
                await _context.SaveChangesAsync();

                // Пары без троек убираем, иначе участок останется в списках карточки сотрудника без должностей.
                var departmentWorkshopUsed = await _context.FactoryDepartmentWorkshopJobTitle.AnyAsync(x =>
                    x.FactoryDepartmentId == department && x.FactoryWorkshopId == workshop);
                if (!departmentWorkshopUsed)
                {
                    var pair = await _context.FactoryDepartmentFactoryWorkshop.FirstOrDefaultAsync(x =>
                        x.FactoryDepartmentId == department && x.FactoryWorkshopId == workshop);
                    if (pair != null) _context.FactoryDepartmentFactoryWorkshop.Remove(pair);
                }

                var jobTitleWorkshopUsed = await _context.FactoryDepartmentWorkshopJobTitle.AnyAsync(x =>
                    x.FactoryJobTitleId == jobTitle && x.FactoryWorkshopId == workshop);
                if (!jobTitleWorkshopUsed)
                {
                    var pair = await _context.FactoryJobTitleFactoryWorkshop.FirstOrDefaultAsync(x =>
                        x.FactoryJobTitleId == jobTitle && x.FactoryWorkshopId == workshop);
                    if (pair != null) _context.FactoryJobTitleFactoryWorkshop.Remove(pair);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return NoContent();
            });
        }

        private static string? ValidateRef(DictionaryItemRef? item, string what)
        {
            if (item == null || (item.Id == null && string.IsNullOrWhiteSpace(item.Name)))
                return $"Укажите {what}.";
            return null;
        }

        private Task<string?> ValidateNameLengthAsync<T>(DictionaryItemRef item) where T : class =>
            item.Id == null
                ? FactoryDictionarySchema.ValidateNameLengthAsync<T>(_context, item.Name!.Trim())
                : Task.FromResult<string?>(null);

        /// <summary>
        /// Возвращает существующую запись справочника или добавляет новую.
        /// Если запись с таким названием уже есть, она переиспользуется вместо создания дубля.
        /// </summary>
        private async Task<T> ResolveAsync<T>(DictionaryItemRef item, Func<string, T> create)
            where T : class
        {
            var set = _context.Set<T>();
            if (item.Id is int id)
                return await set.FindAsync(id) ?? throw new InvalidOperationException($"{typeof(T).Name} {id} not found");

            var name = item.Name!.Trim();
            var existing = await set.FirstOrDefaultAsync(x => EF.Property<string>(x, "Name") == name);
            if (existing != null) return existing;

            var created = create(name);
            await FactoryDictionarySchema.AssignIdIfNeededAsync(_context, created);
            set.Add(created);
            return created;
        }
    }
}
