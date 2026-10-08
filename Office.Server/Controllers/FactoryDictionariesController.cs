using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Factory;
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;

namespace Office.Server.Controllers
{
    /// <summary>
    /// Справочники карточки сотрудника завода: юр. лица, типы документов, типы гражданства,
    /// гражданства и банки. Только добавление и удаление неиспользуемых значений.
    /// Группы СКУД сюда не входят: они связаны с настройками СКУД, и простой записи в справочник недостаточно.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "FactoryPerson")]
    public class FactoryDictionariesController : ControllerBase
    {
        private const string Entities = "entities";
        private const string DocumentTypes = "documentTypes";
        private const string CitizenshipTypes = "citizenshipTypes";
        private const string Citizenships = "citizenships";
        private const string Banks = "banks";

        private readonly RKNETDBContext _context;

        public FactoryDictionariesController(RKNETDBContext context)
        {
            _context = context;
        }

        public class DictionaryItemDto
        {
            public int Id { get; set; }
            public string Name { get; set; } = string.Empty;

            /// <summary>Сколько сотрудников (для типа гражданства — гражданств) ссылается на значение.</summary>
            public int Usage { get; set; }

            /// <summary>Только для гражданств: тип гражданства.</summary>
            public int? ParentId { get; set; }
            public string? ParentName { get; set; }
        }

        public class DictionaryCreateRequest
        {
            public string? Name { get; set; }

            /// <summary>Только для гражданств: тип гражданства.</summary>
            public int? ParentId { get; set; }
        }

        // GET: api/FactoryDictionaries/{kind}
        [HttpGet("{kind}")]
        public async Task<ActionResult> GetItems(string kind)
        {
            var persons = _context.FactoryPerson.AsNoTracking();

            List<DictionaryItemDto>? items = kind switch
            {
                Entities => await ListAsync(_context.FactoryEntity, persons.Select(p => (int?)p.FactoryEntity)),
                DocumentTypes => await ListAsync(_context.FactoryDocumentType, persons.Select(p => (int?)p.FactoryDocumentType)),
                CitizenshipTypes => await ListAsync(_context.FactoryCitizenshipType, _context.FactoryCitizenship.AsNoTracking().Select(c => c.CitizenshipTypeId)),
                Citizenships => await ListCitizenshipsAsync(),
                Banks => await ListAsync(_context.FactoryBanks, persons.Select(p => p.FactoryBanks)),
                _ => null
            };

            return items == null ? NotFound(new { message = "Неизвестный справочник." }) : Ok(items);
        }

        // POST: api/FactoryDictionaries/{kind}
        [HttpPost("{kind}")]
        public async Task<ActionResult> Create(string kind, [FromBody] DictionaryCreateRequest request)
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0)
                return BadRequest(new { message = "Укажите название." });

            return kind switch
            {
                Entities => await CreateAsync(name, () => new FactoryEntity { Name = name }),
                DocumentTypes => await CreateAsync(name, () => new FactoryDocumentType { Name = name }),
                CitizenshipTypes => await CreateAsync(name, () => new FactoryCitizenshipType { Name = name }),
                Citizenships => await CreateCitizenshipAsync(name, request.ParentId),
                Banks => await CreateAsync(name, () => new FactoryBanks { Name = name }),
                _ => NotFound(new { message = "Неизвестный справочник." })
            };
        }

        // DELETE: api/FactoryDictionaries/{kind}/{id}
        [HttpDelete("{kind}/{id:int}")]
        public async Task<ActionResult> Delete(string kind, int id)
        {
            var persons = _context.FactoryPerson.AsNoTracking();

            return kind switch
            {
                Entities => await DeleteAsync<FactoryEntity>(id,
                    persons.CountAsync(p => p.FactoryEntity == id), "сотрудников"),
                DocumentTypes => await DeleteAsync<FactoryDocumentType>(id,
                    persons.CountAsync(p => p.FactoryDocumentType == id), "сотрудников"),
                CitizenshipTypes => await DeleteAsync<FactoryCitizenshipType>(id,
                    _context.FactoryCitizenship.CountAsync(c => c.CitizenshipTypeId == id), "гражданств"),
                Citizenships => await DeleteAsync<FactoryCitizenship>(id,
                    persons.CountAsync(p => p.FactoryCitizenship == id), "сотрудников"),
                Banks => await DeleteAsync<FactoryBanks>(id,
                    persons.CountAsync(p => p.FactoryBanks == id), "сотрудников"),
                _ => NotFound(new { message = "Неизвестный справочник." })
            };
        }

        private static async Task<List<DictionaryItemDto>> ListAsync<T>(DbSet<T> set, IQueryable<int?> usageKeys)
            where T : class
        {
            var usage = await CountUsageAsync(usageKeys);

            var items = await set.AsNoTracking()
                .Select(x => new DictionaryItemDto
                {
                    Id = EF.Property<int>(x, "Id"),
                    Name = EF.Property<string>(x, "Name")
                })
                .ToListAsync();

            foreach (var item in items)
                item.Usage = usage.GetValueOrDefault(item.Id);

            return items.OrderBy(x => x.Name).ToList();
        }

        private async Task<List<DictionaryItemDto>> ListCitizenshipsAsync()
        {
            var usage = await CountUsageAsync(_context.FactoryPerson.AsNoTracking().Select(p => (int?)p.FactoryCitizenship));
            var typeNames = await _context.FactoryCitizenshipType.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name);

            var items = await _context.FactoryCitizenship.AsNoTracking()
                .Select(x => new DictionaryItemDto { Id = x.Id, Name = x.Name, ParentId = x.CitizenshipTypeId })
                .ToListAsync();

            foreach (var item in items)
            {
                item.Usage = usage.GetValueOrDefault(item.Id);
                item.ParentName = item.ParentId is int typeId ? typeNames.GetValueOrDefault(typeId) : null;
            }

            return items.OrderBy(x => x.ParentName).ThenBy(x => x.Name).ToList();
        }

        private static async Task<Dictionary<int, int>> CountUsageAsync(IQueryable<int?> keys) =>
            (await keys
                .Where(k => k != null)
                .GroupBy(k => k)
                .Select(g => new { Id = g.Key!.Value, Count = g.Count() })
                .ToListAsync())
            .ToDictionary(x => x.Id, x => x.Count);

        private async Task<ActionResult> CreateCitizenshipAsync(string name, int? citizenshipTypeId)
        {
            if (citizenshipTypeId is not int typeId)
                return BadRequest(new { message = "Выберите тип гражданства." });
            if (!await _context.FactoryCitizenshipType.AnyAsync(x => x.Id == typeId))
                return BadRequest(new { message = "Тип гражданства не найден. Обновите страницу." });

            return await CreateAsync(name, () => new FactoryCitizenship { Name = name, CitizenshipTypeId = typeId });
        }

        private async Task<ActionResult> CreateAsync<T>(string name, Func<T> create) where T : class
        {
            var lengthError = await FactoryDictionarySchema.ValidateNameLengthAsync<T>(_context, name);
            if (lengthError != null)
                return BadRequest(new { message = lengthError });

            var strategy = _context.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync<ActionResult>(async () =>
            {
                _context.ChangeTracker.Clear();
                // Serializable: если Id назначается как MAX(Id) + 1, диапазон блокируется до конца транзакции.
                await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

                var set = _context.Set<T>();
                if (await set.AnyAsync(x => EF.Property<string>(x, "Name") == name))
                {
                    await transaction.RollbackAsync();
                    return Conflict(new { message = $"Значение «{name}» уже есть в справочнике." });
                }

                var entity = create();
                await FactoryDictionarySchema.AssignIdIfNeededAsync(_context, entity);
                set.Add(entity);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new { id = _context.Entry(entity).Property<int>("Id").CurrentValue, name });
            });
        }

        private async Task<ActionResult> DeleteAsync<T>(int id, Task<int> usageCount, string usageWhat) where T : class
        {
            var usage = await usageCount;
            if (usage > 0)
                return Conflict(new { message = $"Значение нельзя удалить: оно используется у {usageWhat} — {usage}." });

            var set = _context.Set<T>();
            var entity = await set.FindAsync(id);
            if (entity == null)
                return NotFound(new { message = "Значение уже удалено." });

            set.Remove(entity);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 547 })
            {
                // На значение ссылаются другие таблицы БД, которых Office не знает.
                return Conflict(new { message = "Значение нельзя удалить: на него ссылаются другие данные в базе." });
            }

            return NoContent();
        }
    }
}
