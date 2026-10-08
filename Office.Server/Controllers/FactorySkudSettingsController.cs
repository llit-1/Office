using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading.Tasks;

namespace Office.Server.Controllers
{
    /// <summary>
    /// Настройка СКУД завода: контроллеры → считыватели → группы (FactorySKUDGroupReader).
    /// Сотруднику назначается группа, а группа определяет, через какие считыватели его пускают.
    /// </summary>
    [Route("api/FactorySkud")]
    [ApiController]
    [Authorize(Roles = "FactoryPerson")]
    public class FactorySkudSettingsController : ControllerBase
    {
        // Длины колонок в БД.
        private const int ControllerNameMaxLength = 50;
        private const int ReaderNameMaxLength = 60;
        private const int GroupNameMaxLength = 50;
        private const int SecurityMonitorMaxLength = 50;

        private readonly RKNETDBContext _context;

        public FactorySkudSettingsController(RKNETDBContext context)
        {
            _context = context;
        }

        public class ControllerRequest
        {
            public string? Name { get; set; }
            public string? Ip { get; set; }
            public int? Type { get; set; }

            /// <summary>При редактировании пустой пароль означает «не менять».</summary>
            public int? Pwd { get; set; }
        }

        public class ReaderRequest
        {
            public string? Name { get; set; }
            public string? Ip { get; set; }
            public int? ControllerId { get; set; }
            public int? Relay { get; set; }
            public int? CommandType { get; set; }
            public int? CommandTime { get; set; }
            public string? SecurityMonitor { get; set; }
        }

        public class GroupRequest
        {
            public string? Name { get; set; }
            public List<int> ReaderIds { get; set; } = new();
        }

        public class GroupCount
        {
            public int Id { get; set; }
            public int Count { get; set; }
        }

        // GET: api/FactorySkud
        [HttpGet]
        public async Task<ActionResult> Get()
        {
            var controllers = await _context.FactorySKUDController.AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new { x.Id, x.Name, x.Ip, x.Type })
                .ToListAsync();

            var readers = await _context.FactorySKUDReader.AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new
                {
                    x.Id,
                    x.Name,
                    x.Ip,
                    x.ControllerId,
                    x.Relay,
                    x.CommandType,
                    x.CommandTime,
                    x.SecurityMonitor
                })
                .ToListAsync();

            var groupReaders = await _context.FactorySKUDGroupReader.AsNoTracking().ToListAsync();

            var persons = await _context.FactoryPerson.AsNoTracking()
                .Where(p => p.SKUDGroupId != null)
                .GroupBy(p => p.SKUDGroupId!.Value)
                .Select(g => new { Id = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Id, x => x.Count);

            var history = await CountHistoryAsync(null);

            var groups = (await _context.FactorySKUDGroup.AsNoTracking().OrderBy(x => x.Name).ToListAsync())
                .Select(g => new
                {
                    g.Id,
                    g.Name,
                    ReaderIds = groupReaders.Where(x => x.GroupId == g.Id).Select(x => x.ReaderId).OrderBy(x => x).ToList(),
                    Persons = persons.GetValueOrDefault(g.Id),
                    HistoryRows = history.GetValueOrDefault(g.Id)
                })
                .ToList();

            var readerGroups = groupReaders.GroupBy(x => x.ReaderId).ToDictionary(g => g.Key, g => g.Count());

            return Ok(new
            {
                controllers = controllers.Select(c => new
                {
                    c.Id,
                    c.Name,
                    c.Ip,
                    c.Type,
                    Readers = readers.Count(r => r.ControllerId == c.Id)
                }),
                readers = readers.Select(r => new
                {
                    r.Id,
                    r.Name,
                    r.Ip,
                    r.ControllerId,
                    r.Relay,
                    r.CommandType,
                    r.CommandTime,
                    r.SecurityMonitor,
                    Groups = readerGroups.GetValueOrDefault(r.Id)
                }),
                groups
            });
        }

        // ===== Контроллеры =====

        // POST: api/FactorySkud/controllers
        [HttpPost("controllers")]
        public async Task<ActionResult> CreateController([FromBody] ControllerRequest request)
        {
            var error = ValidateController(request, isCreate: true);
            if (error != null) return BadRequest(new { message = error });

            var ip = request.Ip!.Trim();
            if (await _context.FactorySKUDController.AnyAsync(x => x.Ip == ip))
                return Conflict(new { message = $"Контроллер с IP {ip} уже есть." });

            var entity = new FactorySKUDController
            {
                Name = request.Name!.Trim(),
                Ip = ip,
                Type = request.Type!.Value,
                Pwd = request.Pwd!.Value
            };
            _context.FactorySKUDController.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(new { entity.Id });
        }

        // PUT: api/FactorySkud/controllers/{id}
        [HttpPut("controllers/{id:int}")]
        public async Task<ActionResult> UpdateController(int id, [FromBody] ControllerRequest request)
        {
            var error = ValidateController(request, isCreate: false);
            if (error != null) return BadRequest(new { message = error });

            var entity = await _context.FactorySKUDController.FindAsync(id);
            if (entity == null) return NotFound(new { message = "Контроллер не найден. Обновите страницу." });

            var ip = request.Ip!.Trim();
            if (await _context.FactorySKUDController.AnyAsync(x => x.Ip == ip && x.Id != id))
                return Conflict(new { message = $"Контроллер с IP {ip} уже есть." });

            entity.Name = request.Name!.Trim();
            entity.Ip = ip;
            entity.Type = request.Type!.Value;
            if (request.Pwd is int pwd) entity.Pwd = pwd;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/FactorySkud/controllers/{id}
        [HttpDelete("controllers/{id:int}")]
        public async Task<ActionResult> DeleteController(int id)
        {
            var readers = await _context.FactorySKUDReader.CountAsync(x => x.ControllerId == id);
            if (readers > 0)
                return Conflict(new { message = $"Контроллер нельзя удалить: к нему привязано считывателей — {readers}." });

            var entity = await _context.FactorySKUDController.FindAsync(id);
            if (entity == null) return NotFound(new { message = "Контроллер уже удалён." });

            _context.FactorySKUDController.Remove(entity);
            return await SaveDeletionAsync();
        }

        // ===== Считыватели =====

        // POST: api/FactorySkud/readers
        [HttpPost("readers")]
        public async Task<ActionResult> CreateReader([FromBody] ReaderRequest request)
        {
            var error = await ValidateReaderAsync(request);
            if (error != null) return BadRequest(new { message = error });

            var entity = new FactorySKUDReader();
            ApplyReader(entity, request);
            _context.FactorySKUDReader.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(new { entity.Id });
        }

        // PUT: api/FactorySkud/readers/{id}
        [HttpPut("readers/{id:int}")]
        public async Task<ActionResult> UpdateReader(int id, [FromBody] ReaderRequest request)
        {
            var error = await ValidateReaderAsync(request);
            if (error != null) return BadRequest(new { message = error });

            var entity = await _context.FactorySKUDReader.FindAsync(id);
            if (entity == null) return NotFound(new { message = "Считыватель не найден. Обновите страницу." });

            ApplyReader(entity, request);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/FactorySkud/readers/{id}
        [HttpDelete("readers/{id:int}")]
        public async Task<ActionResult> DeleteReader(int id)
        {
            var groups = await _context.FactorySKUDGroupReader.CountAsync(x => x.ReaderId == id);
            if (groups > 0)
                return Conflict(new { message = $"Считыватель нельзя удалить: он входит в группы СКУД — {groups}. Сначала уберите его из групп." });

            var passes = await _context.FactorySKUDWorkLog.CountAsync(x => x.ReaderId == id);
            if (passes > 0)
                return Conflict(new { message = $"Считыватель нельзя удалить: по нему есть проходы в журнале — {passes}." });

            var entity = await _context.FactorySKUDReader.FindAsync(id);
            if (entity == null) return NotFound(new { message = "Считыватель уже удалён." });

            _context.FactorySKUDReader.Remove(entity);
            return await SaveDeletionAsync();
        }

        // ===== Группы =====

        // POST: api/FactorySkud/groups
        [HttpPost("groups")]
        public Task<ActionResult> CreateGroup([FromBody] GroupRequest request) => SaveGroupAsync(null, request);

        // PUT: api/FactorySkud/groups/{id}
        [HttpPut("groups/{id:int}")]
        public Task<ActionResult> UpdateGroup(int id, [FromBody] GroupRequest request) => SaveGroupAsync(id, request);

        // DELETE: api/FactorySkud/groups/{id}
        [HttpDelete("groups/{id:int}")]
        public async Task<ActionResult> DeleteGroup(int id)
        {
            var persons = await _context.FactoryPerson.CountAsync(p => p.SKUDGroupId == id);
            if (persons > 0)
                return Conflict(new { message = $"Группу нельзя удалить: она назначена сотрудникам — {persons}." });

            // FactoryPersonLog (история изменений сотрудников) ссылается на группу внешним ключом.
            var history = (await CountHistoryAsync(id)).GetValueOrDefault(id);
            if (history > 0)
                return Conflict(new { message = "Группу нельзя удалить: она есть в истории изменений сотрудников." });

            var strategy = _context.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync<ActionResult>(async () =>
            {
                _context.ChangeTracker.Clear();
                await using var transaction = await _context.Database.BeginTransactionAsync();

                var entity = await _context.FactorySKUDGroup.FindAsync(id);
                if (entity == null)
                {
                    await transaction.RollbackAsync();
                    return NotFound(new { message = "Группа уже удалена." });
                }

                _context.FactorySKUDGroupReader.RemoveRange(
                    await _context.FactorySKUDGroupReader.Where(x => x.GroupId == id).ToListAsync());
                await _context.SaveChangesAsync();

                _context.FactorySKUDGroup.Remove(entity);
                var result = await SaveDeletionAsync();
                if (result is NoContentResult) await transaction.CommitAsync();
                else await transaction.RollbackAsync();
                return result;
            });
        }

        private async Task<ActionResult> SaveGroupAsync(int? id, GroupRequest request)
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0)
                return BadRequest(new { message = "Укажите название группы." });
            if (name.Length > GroupNameMaxLength)
                return BadRequest(new { message = $"Название не должно быть длиннее {GroupNameMaxLength} символов." });

            var readerIds = request.ReaderIds.Distinct().ToList();
            var knownReaders = await _context.FactorySKUDReader.CountAsync(x => readerIds.Contains(x.Id));
            if (knownReaders != readerIds.Count)
                return BadRequest(new { message = "Часть считывателей не найдена. Обновите страницу." });

            if (await _context.FactorySKUDGroup.AnyAsync(x => x.Name == name && x.Id != id))
                return Conflict(new { message = $"Группа «{name}» уже есть." });

            var strategy = _context.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync<ActionResult>(async () =>
            {
                _context.ChangeTracker.Clear();
                await using var transaction = await _context.Database.BeginTransactionAsync();

                FactorySKUDGroup? group;
                if (id is int groupId)
                {
                    group = await _context.FactorySKUDGroup.FindAsync(groupId);
                    if (group == null)
                    {
                        await transaction.RollbackAsync();
                        return NotFound(new { message = "Группа не найдена. Обновите страницу." });
                    }
                    group.Name = name;
                }
                else
                {
                    group = new FactorySKUDGroup { Name = name };
                    _context.FactorySKUDGroup.Add(group);
                }
                await _context.SaveChangesAsync();

                // Состав группы пересчитываем целиком: убираем лишние привязки, добавляем недостающие.
                var current = await _context.FactorySKUDGroupReader.Where(x => x.GroupId == group.Id).ToListAsync();
                _context.FactorySKUDGroupReader.RemoveRange(current.Where(x => !readerIds.Contains(x.ReaderId)));
                var existing = current.Select(x => x.ReaderId).ToHashSet();
                _context.FactorySKUDGroupReader.AddRange(readerIds
                    .Where(readerId => !existing.Contains(readerId))
                    .Select(readerId => new FactorySKUDGroupReader { GroupId = group.Id, ReaderId = readerId }));

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return Ok(new { group.Id });
            });
        }

        // ===== Вспомогательное =====

        /// <summary>Сколько строк истории FactoryPersonLog ссылается на группы (или на одну группу).</summary>
        private async Task<Dictionary<int, int>> CountHistoryAsync(int? groupId)
        {
            var rows = groupId is int id
                ? await _context.Database.SqlQuery<GroupCount>($@"
                    SELECT SKUDGroup AS Id, COUNT(*) AS Count FROM dbo.FactoryPersonLog
                    WHERE SKUDGroup = {id} GROUP BY SKUDGroup").ToListAsync()
                : await _context.Database.SqlQuery<GroupCount>($@"
                    SELECT SKUDGroup AS Id, COUNT(*) AS Count FROM dbo.FactoryPersonLog
                    WHERE SKUDGroup IS NOT NULL GROUP BY SKUDGroup").ToListAsync();
            return rows.ToDictionary(x => x.Id, x => x.Count);
        }

        private async Task<ActionResult> SaveDeletionAsync()
        {
            try
            {
                await _context.SaveChangesAsync();
                return NoContent();
            }
            catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 547 })
            {
                return Conflict(new { message = "Запись нельзя удалить: на неё ссылаются другие данные в базе." });
            }
        }

        private static string? ValidateController(ControllerRequest request, bool isCreate)
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0) return "Укажите название контроллера.";
            if (name.Length > ControllerNameMaxLength) return $"Название не должно быть длиннее {ControllerNameMaxLength} символов.";
            if (!IsIpv4(request.Ip)) return "Укажите IP-адрес в формате 192.168.0.1.";
            if (request.Type == null) return "Укажите тип контроллера.";
            if (isCreate && request.Pwd == null) return "Укажите пароль контроллера.";
            return null;
        }

        private async Task<string?> ValidateReaderAsync(ReaderRequest request)
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0) return "Укажите название считывателя.";
            if (name.Length > ReaderNameMaxLength) return $"Название не должно быть длиннее {ReaderNameMaxLength} символов.";
            if (!string.IsNullOrWhiteSpace(request.Ip) && !IsIpv4(request.Ip)) return "IP-адрес должен быть в формате 192.168.0.1.";
            if (request.Relay == null || request.CommandType == null || request.CommandTime == null)
                return "Укажите реле, тип и время команды.";
            if ((request.SecurityMonitor?.Trim().Length ?? 0) > SecurityMonitorMaxLength)
                return $"Адрес монитора охраны не должен быть длиннее {SecurityMonitorMaxLength} символов.";
            if (request.ControllerId is int controllerId && !await _context.FactorySKUDController.AnyAsync(x => x.Id == controllerId))
                return "Контроллер не найден. Обновите страницу.";
            return null;
        }

        private static void ApplyReader(FactorySKUDReader entity, ReaderRequest request)
        {
            entity.Name = request.Name!.Trim();
            entity.Ip = string.IsNullOrWhiteSpace(request.Ip) ? null : request.Ip.Trim();
            entity.ControllerId = request.ControllerId;
            entity.Relay = request.Relay!.Value;
            entity.CommandType = request.CommandType!.Value;
            entity.CommandTime = request.CommandTime!.Value;
            entity.SecurityMonitor = string.IsNullOrWhiteSpace(request.SecurityMonitor) ? null : request.SecurityMonitor.Trim();
        }

        private static bool IsIpv4(string? value)
        {
            var ip = value?.Trim();
            return !string.IsNullOrEmpty(ip)
                && ip.Split('.').Length == 4
                && IPAddress.TryParse(ip, out var parsed)
                && parsed.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork;
        }
    }
}
