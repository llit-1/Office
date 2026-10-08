using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Locations;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Location")]
    public class TTController : ControllerBase
    {
        private static readonly Guid[] TradePointTypeGuids =
        [
            Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84"),
            Guid.Parse("B0E427F9-8996-4C03-33C1-08DBDF713401"),
            Guid.Parse("5E66963A-7767-4E51-84F9-8C320C6CE214"),
            Guid.Parse("3DC24D14-FAE6-4993-A403-C4142755409A"),
        ];

        // Завод и цех.
        private static readonly Guid[] FactoryTypeGuids =
        [
            Guid.Parse("80423E42-DC1E-4311-AD0B-08DCA4A09C33"),
            Guid.Parse("D3A0363D-2EC4-48E4-AD0C-08DCA4A09C33"),
        ];

        // Офис и кабинет.
        private static readonly Guid[] OfficeTypeGuids =
        [
            Guid.Parse("3810B715-2164-4524-F182-08DBF1A777FF"),
            Guid.Parse("8FE12BFC-1860-4B79-8763-81C984E2A643"),
        ];

        private const int LocationNameMaxLength = 50;
        private const int AddressMaxLength = 100;
        private const int EntityNameMaxLength = 200;
        private const int JobTitleNameMaxLength = 100;
        private const int LocationTypeNameMaxLength = 50;
        private static readonly DateTime FirstSqlDate = new(1753, 1, 1);

        private readonly RKNETDBContext _context;
        private readonly EntityFolderService _folders;
        private readonly ILogger<TTController> _logger;

        public TTController(RKNETDBContext context, EntityFolderService folders, ILogger<TTController> logger)
        {
            _context = context;
            _folders = folders;
            _logger = logger;
        }

        [HttpGet("list")]
        public async Task<ActionResult<List<TTListItemDto>>> GetList([FromQuery] string? group = null)
        {
            var typeGuids = ResolveTypeGuids(group);
            var items = await _context.LocationVersions
                .AsNoTracking()
                .Include(x => x.Location)
                .ThenInclude(x => x!.LocationType)
                .Where(x =>
                    x.Actual == 1 &&
                    x.VersionEndDate == null &&
                    x.Location != null &&
                    x.Location.LocationTypeGuid.HasValue &&
                    typeGuids.Contains(x.Location.LocationTypeGuid.Value))
                .OrderBy(x => x.Name)
                .Select(x => new TTListItemDto
                {
                    Id = x.LocationGuid,
                    Name = x.Name,
                    Type = x.Location != null && x.Location.LocationType != null ? x.Location.LocationType.Name : string.Empty,
                    RKCode = x.Location != null ? x.Location.RKCode : null,
                    AggregatorsCode = x.Location != null ? x.Location.AggregatorsCode : null,
                    OBD = x.OBD,
                    Address = x.Address,
                    OpenDate = x.VersionStartDate,
                    CloseDate = x.VersionEndDate,
                    IsClosed = x.VersionEndDate.HasValue,
                })
                .ToListAsync();

            return Ok(items);
        }

        // ===================== Организации =====================

        [HttpGet("entities")]
        public async Task<ActionResult<List<EntityListItemDto>>> GetEntities()
        {
            var items = await _context.Entity
                .AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new EntityListItemDto
                {
                    Id = x.Guid,
                    Name = x.Name,
                    Owner = x.Owner,
                    LocationsCount = _context.LocationVersions.Count(v => v.EntityGuid == x.Guid && v.Actual == 1),
                })
                .ToListAsync();

            return Ok(items);
        }

        [HttpGet("entities/{guid:guid}")]
        public async Task<ActionResult<EntityEditDto>> GetEntity(Guid guid)
        {
            var entity = await _context.Entity.AsNoTracking().FirstOrDefaultAsync(x => x.Guid == guid);
            if (entity == null)
            {
                return NotFound(new { message = "Организация не найдена." });
            }

            var folder = _folders.GetState(entity.Name);
            return Ok(new EntityEditDto
            {
                Id = entity.Guid,
                Name = entity.Name,
                Owner = entity.Owner,
                FolderExists = folder.Exists,
                FolderAvailable = folder.Available,
                FolderFileCount = folder.FileCount,
                FolderPath = folder.Path,
            });
        }

        [HttpPost("entities")]
        public async Task<IActionResult> CreateEntity([FromBody] EntitySaveRequest request)
        {
            if (await ValidateEntityAsync(request, null) is IActionResult invalid)
            {
                return invalid;
            }

            var entity = new Entity { Guid = Guid.NewGuid(), Name = request.Name.Trim(), Owner = request.Owner };

            if (request.Folder)
            {
                var folder = _folders.GetState(entity.Name);
                if (!folder.Available)
                {
                    return FolderUnavailable();
                }

                if (!folder.Exists && TryChangeFolder(() => _folders.Create(entity.Name)) is IActionResult folderError)
                {
                    return folderError;
                }
            }

            _context.Entity.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(new { id = entity.Guid });
        }

        [HttpPut("entities/{guid:guid}")]
        public async Task<IActionResult> UpdateEntity(Guid guid, [FromBody] EntitySaveRequest request)
        {
            var entity = await _context.Entity.FirstOrDefaultAsync(x => x.Guid == guid);
            if (entity == null)
            {
                return NotFound(new { message = "Организация не найдена." });
            }

            if (await ValidateEntityAsync(request, guid) is IActionResult invalid)
            {
                return invalid;
            }

            var newName = request.Name.Trim();
            var current = _folders.GetState(entity.Name);
            var folderRenamed = !string.Equals(EntityFolderService.FolderName(entity.Name), EntityFolderService.FolderName(newName), StringComparison.Ordinal);

            if (request.Folder)
            {
                if (!current.Available)
                {
                    return FolderUnavailable();
                }

                var target = _folders.GetState(newName);
                if (current.Exists && folderRenamed)
                {
                    // Папка переименовывается вместе с организацией, документы остаются на месте.
                    if (target.Exists && !string.Equals(current.Path, target.Path, StringComparison.OrdinalIgnoreCase))
                    {
                        return Conflict(new { message = $"Папка «{EntityFolderService.FolderName(newName)}» уже существует. Переименуйте организацию иначе или разберите папки вручную." });
                    }

                    if (TryChangeFolder(() => _folders.Rename(entity.Name, newName)) is IActionResult renameError)
                    {
                        return renameError;
                    }
                }
                else if (!current.Exists && !target.Exists && TryChangeFolder(() => _folders.Create(newName)) is IActionResult createError)
                {
                    return createError;
                }
            }
            else if (current.Exists)
            {
                if (current.FileCount > 0 && !request.ConfirmFolderDeletion)
                {
                    return Conflict(new
                    {
                        code = "folder-not-empty",
                        fileCount = current.FileCount,
                        message = $"В папке «{EntityFolderService.FolderName(entity.Name)}» есть файлы ({current.FileCount}). Подтвердите удаление папки вместе с ними.",
                    });
                }

                if (TryChangeFolder(() => _folders.Delete(entity.Name)) is IActionResult deleteError)
                {
                    return deleteError;
                }
            }

            entity.Name = newName;
            entity.Owner = request.Owner;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private async Task<IActionResult?> ValidateEntityAsync(EntitySaveRequest request, Guid? self)
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0)
            {
                return BadRequest(new { message = "Укажите название организации." });
            }

            if (name.Length > EntityNameMaxLength)
            {
                return BadRequest(new { message = $"Название не должно быть длиннее {EntityNameMaxLength} символов." });
            }

            if (request.Owner is not (0 or 1))
            {
                return BadRequest(new { message = "Укажите принадлежность организации к ЛЛ." });
            }

            if (request.Folder && EntityFolderService.FolderName(name) == null)
            {
                return BadRequest(new { message = "Из названия нельзя получить имя папки. Используйте буквы или цифры." });
            }

            var normalized = name.ToLower();
            if (await _context.Entity.AnyAsync(x => x.Guid != self && x.Name.ToLower() == normalized))
            {
                return Conflict(new { message = "Организация с таким названием уже есть." });
            }

            return null;
        }

        private IActionResult? TryChangeFolder(Action change)
        {
            try
            {
                change();
                return null;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                _logger.LogWarning(exception, "Entity folder change failed in {Root}.", _folders.Root);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = "Не удалось изменить папку организации: сетевой диск недоступен или папка занята. Изменения не сохранены.",
                });
            }
        }

        private ObjectResult FolderUnavailable() => StatusCode(StatusCodes.Status503ServiceUnavailable, new
        {
            message = "Сетевая папка «Розница. Документы» сейчас недоступна. Изменения не сохранены.",
        });

        // ===================== Должности =====================

        [HttpGet("jobtitles")]
        public async Task<ActionResult<List<JobTitleListItemDto>>> GetJobTitles()
        {
            var items = await _context.JobTitles
                .AsNoTracking()
                .OrderBy(x => x.Sequence)
                .ThenBy(x => x.Name)
                .Select(x => new JobTitleListItemDto
                {
                    Id = x.Guid,
                    Name = x.Name,
                    Sequence = x.Sequence,
                })
                .ToListAsync();

            return Ok(items);
        }

        [HttpPost("jobtitles")]
        public async Task<IActionResult> CreateJobTitle([FromBody] NamedItemSaveRequest request)
        {
            if (await ValidateNameAsync(request.Name, JobTitleNameMaxLength, "должности", "Такая должность уже есть.",
                    normalized => _context.JobTitles.AnyAsync(x => x.Name.ToLower() == normalized)) is IActionResult invalid)
            {
                return invalid;
            }

            var jobTitle = new JobTitle { Guid = Guid.NewGuid(), Name = request.Name.Trim() };
            _context.JobTitles.Add(jobTitle);
            await _context.SaveChangesAsync();
            return Ok(new { id = jobTitle.Guid });
        }

        [HttpPut("jobtitles/{guid:guid}")]
        public async Task<IActionResult> UpdateJobTitle(Guid guid, [FromBody] NamedItemSaveRequest request)
        {
            var jobTitle = await _context.JobTitles.FirstOrDefaultAsync(x => x.Guid == guid);
            if (jobTitle == null)
            {
                return NotFound(new { message = "Должность не найдена." });
            }

            if (await ValidateNameAsync(request.Name, JobTitleNameMaxLength, "должности", "Такая должность уже есть.",
                    normalized => _context.JobTitles.AnyAsync(x => x.Guid != guid && x.Name.ToLower() == normalized)) is IActionResult invalid)
            {
                return invalid;
            }

            jobTitle.Name = request.Name.Trim();
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // ===================== Типы =====================

        [HttpGet("types")]
        public async Task<ActionResult<List<LocationTypeListItemDto>>> GetTypes()
        {
            var items = await _context.LocationTypes
                .AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new LocationTypeListItemDto
                {
                    Id = x.Guid,
                    Name = x.Name,
                    LocationsCount = _context.Locations.Count(l => l.LocationTypeGuid == x.Guid),
                })
                .ToListAsync();

            return Ok(items);
        }

        [HttpPost("types")]
        public async Task<IActionResult> CreateLocationType([FromBody] NamedItemSaveRequest request)
        {
            if (await ValidateNameAsync(request.Name, LocationTypeNameMaxLength, "типа", "Тип с таким названием уже есть.",
                    normalized => _context.LocationTypes.AnyAsync(x => x.Name.ToLower() == normalized)) is IActionResult invalid)
            {
                return invalid;
            }

            var type = new LocationType { Guid = Guid.NewGuid(), Name = request.Name.Trim() };
            _context.LocationTypes.Add(type);
            await _context.SaveChangesAsync();
            return Ok(new { id = type.Guid });
        }

        [HttpPut("types/{guid:guid}")]
        public async Task<IActionResult> UpdateLocationType(Guid guid, [FromBody] NamedItemSaveRequest request)
        {
            var type = await _context.LocationTypes.FirstOrDefaultAsync(x => x.Guid == guid);
            if (type == null)
            {
                return NotFound(new { message = "Тип не найден." });
            }

            if (await ValidateNameAsync(request.Name, LocationTypeNameMaxLength, "типа", "Тип с таким названием уже есть.",
                    normalized => _context.LocationTypes.AnyAsync(x => x.Guid != guid && x.Name.ToLower() == normalized)) is IActionResult invalid)
            {
                return invalid;
            }

            type.Name = request.Name.Trim();
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private async Task<IActionResult?> ValidateNameAsync(
            string? value,
            int maxLength,
            string subject,
            string duplicateMessage,
            Func<string, Task<bool>> exists)
        {
            var name = value?.Trim() ?? string.Empty;
            if (name.Length == 0)
            {
                return BadRequest(new { message = $"Укажите название {subject}." });
            }

            if (name.Length > maxLength)
            {
                return BadRequest(new { message = $"Название не должно быть длиннее {maxLength} символов." });
            }

            return await exists(name.ToLower()) ? Conflict(new { message = duplicateMessage }) : null;
        }

        // ===================== Завод и офис =====================

        [HttpGet("locations/{group}/lookups")]
        public async Task<ActionResult<LocationLookupsDto>> GetLocationLookups(string group, [FromQuery] Guid? exclude = null)
        {
            if (ResolveLocationGroup(group) is not Guid[] typeGuids)
            {
                return NotFound(new { message = "Раздел не найден." });
            }

            var types = await _context.LocationTypes.AsNoTracking()
                .Where(x => typeGuids.Contains(x.Guid))
                .OrderBy(x => x.Name)
                .Select(x => new LocationTypeDto { Guid = x.Guid, Name = x.Name })
                .ToListAsync();

            var entities = await _context.Entity.AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new LookupItemDto { Guid = x.Guid, Name = x.Name })
                .ToListAsync();

            // Родителем бывает только локация той же группы: цех принадлежит заводу, кабинет — офису.
            var parents = await _context.LocationVersions.AsNoTracking()
                .Where(x =>
                    x.Actual == 1 &&
                    x.VersionEndDate == null &&
                    x.LocationGuid != exclude &&
                    x.Location != null &&
                    x.Location.LocationTypeGuid.HasValue &&
                    typeGuids.Contains(x.Location.LocationTypeGuid.Value))
                .OrderBy(x => x.Name)
                .Select(x => new LookupItemDto { Guid = x.LocationGuid, Name = x.Name })
                .ToListAsync();

            return Ok(new LocationLookupsDto { Types = types, Entities = entities, Parents = parents });
        }

        [HttpGet("locations/{group}/{guid:guid}")]
        public async Task<ActionResult<LocationEditDto>> GetLocation(string group, Guid guid)
        {
            if (ResolveLocationGroup(group) is not Guid[] typeGuids)
            {
                return NotFound(new { message = "Раздел не найден." });
            }

            var version = await LoadActualLocationVersionAsync(guid);
            if (version?.Location?.LocationTypeGuid is not Guid typeGuid || !typeGuids.Contains(typeGuid))
            {
                return NotFound(new { message = "Локация не найдена." });
            }

            return Ok(new LocationEditDto
            {
                LocationGuid = version.LocationGuid,
                VersionGuid = version.Guid,
                Name = version.Name,
                Address = version.Address,
                LocationTypeGuid = typeGuid,
                EntityGuid = version.EntityGuid,
                ParentGuid = version.Location.ParentGuid,
                Latitude = version.Location.Latitude,
                Longitude = version.Location.Longitude,
                VersionStartDate = version.VersionStartDate,
                VersionEndDate = version.VersionEndDate,
            });
        }

        [HttpPost("locations/{group}")]
        public async Task<IActionResult> CreateLocation(string group, [FromBody] LocationSaveRequest request)
        {
            if (ResolveLocationGroup(group) is not Guid[] typeGuids)
            {
                return NotFound(new { message = "Раздел не найден." });
            }

            if (await ValidateLocationAsync(typeGuids, request, null) is string error)
            {
                return BadRequest(new { message = error });
            }

            var name = request.Name.Trim();
            // Как в старом портале: у завода и офиса нет кодов R-Keeper и OBD, новая локация сразу актуальна.
            var location = new Location
            {
                Guid = Guid.NewGuid(),
                Name = name,
                LocationTypeGuid = request.LocationTypeGuid,
                RKCode = 0,
                AggregatorsCode = null,
                ParentGuid = request.ParentGuid,
                Latitude = request.Latitude,
                Longitude = request.Longitude,
                Actual = 1,
                Delivery = 0,
            };
            var version = new LocationVersion
            {
                Guid = Guid.NewGuid(),
                Name = name,
                LocationGuid = location.Guid,
                OBD = null,
                EntityGuid = request.EntityGuid,
                Actual = 1,
                VersionStartDate = request.VersionStartDate,
                VersionEndDate = request.VersionEndDate,
                Address = NormalizeOptionalString(request.Address),
            };

            _context.Locations.Add(location);
            _context.LocationVersions.Add(version);
            await _context.SaveChangesAsync();
            return Ok(new { locationGuid = location.Guid });
        }

        [HttpPut("locations/{group}/{guid:guid}")]
        public async Task<IActionResult> UpdateLocation(string group, Guid guid, [FromBody] LocationSaveRequest request)
        {
            if (ResolveLocationGroup(group) is not Guid[] typeGuids)
            {
                return NotFound(new { message = "Раздел не найден." });
            }

            var actual = await LoadActualLocationVersionAsync(guid);
            if (actual?.Location?.LocationTypeGuid is not Guid currentType || !typeGuids.Contains(currentType))
            {
                return NotFound(new { message = "Локация не найдена." });
            }

            if (request.VersionGuid.HasValue && actual.Guid != request.VersionGuid)
            {
                return Conflict(new { message = "Данные локации изменились. Обновите страницу перед сохранением." });
            }

            if (await ValidateLocationAsync(typeGuids, request, guid) is string error)
            {
                return BadRequest(new { message = error });
            }

            var version = await _context.LocationVersions.Include(x => x.Location).FirstAsync(x => x.Guid == actual.Guid);
            var name = request.Name.Trim();

            version.Name = name;
            version.Address = NormalizeOptionalString(request.Address);
            version.EntityGuid = request.EntityGuid;
            version.VersionStartDate = request.VersionStartDate;
            version.VersionEndDate = request.VersionEndDate;

            version.Location!.Name = name;
            version.Location.LocationTypeGuid = request.LocationTypeGuid;
            version.Location.ParentGuid = request.ParentGuid;
            version.Location.Latitude = request.Latitude;
            version.Location.Longitude = request.Longitude;

            await _context.SaveChangesAsync();
            return NoContent();
        }

        private async Task<string?> ValidateLocationAsync(Guid[] typeGuids, LocationSaveRequest request, Guid? self)
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0) return "Укажите название.";
            if (name.Length > LocationNameMaxLength) return $"Название не должно быть длиннее {LocationNameMaxLength} символов.";
            if (request.LocationTypeGuid is not Guid type || !typeGuids.Contains(type)) return "Выберите тип.";
            if (request.EntityGuid is not Guid entity || !await _context.Entity.AnyAsync(x => x.Guid == entity)) return "Выберите юридическое лицо.";

            if (request.ParentGuid is Guid parent)
            {
                if (parent == self) return "Локация не может принадлежать сама себе.";
                if (!await _context.Locations.AnyAsync(x => x.Guid == parent && x.LocationTypeGuid.HasValue && typeGuids.Contains(x.LocationTypeGuid.Value)))
                {
                    return "Выберите корректную локацию, которой принадлежит эта.";
                }
            }

            if (request.Address?.Trim().Length > AddressMaxLength) return $"Адрес не должен быть длиннее {AddressMaxLength} символов.";
            if (request.Latitude is < -90 or > 90) return "Широта должна быть от −90 до 90.";
            if (request.Longitude is < -180 or > 180) return "Долгота должна быть от −180 до 180.";
            if (request.VersionStartDate < FirstSqlDate || request.VersionEndDate < FirstSqlDate) return "Дата должна быть не раньше 01.01.1753.";
            if (request.VersionStartDate.HasValue && request.VersionEndDate < request.VersionStartDate) return "Дата закрытия не может быть раньше даты открытия.";
            return null;
        }

        private static Guid[]? ResolveLocationGroup(string? group) => group?.Trim().ToLowerInvariant() switch
        {
            "factory" => FactoryTypeGuids,
            "office" => OfficeTypeGuids,
            _ => null,
        };

        // ===================== Торговые точки =====================

        [HttpGet("{guid:guid}")]
        public async Task<ActionResult<TTEditDto>> Get(Guid guid)
        {
            var locationVersion = await LoadActualLocationVersionAsync(guid);
            if (locationVersion == null)
            {
                return NotFound(new { message = "ТТ не найдена." });
            }

            var currentTypeGuid = locationVersion.Location?.LocationTypeGuid;
            var locationTypes = await _context.LocationTypes
                .AsNoTracking()
                .Where(x => TradePointTypeGuids.Contains(x.Guid) || x.Guid == currentTypeGuid)
                .OrderBy(x => x.Name)
                .Select(x => new LocationTypeDto
                {
                    Guid = x.Guid,
                    Name = x.Name,
                })
                .ToListAsync();

            return Ok(new TTEditDto
            {
                LocationGuid = locationVersion.LocationGuid,
                VersionGuid = locationVersion.Guid,
                Name = locationVersion.Name,
                Address = locationVersion.Address,
                RKCode = locationVersion.Location?.RKCode,
                AggregatorsCode = locationVersion.Location?.AggregatorsCode,
                OBD = locationVersion.OBD,
                VersionStartDate = locationVersion.VersionStartDate,
                VersionEndDate = locationVersion.VersionEndDate,
                Actual = locationVersion.Location?.Actual ?? 0,
                Latitude = locationVersion.Location?.Latitude,
                Longitude = locationVersion.Location?.Longitude,
                Phone = locationVersion.Location?.Phone,
                Delivery = locationVersion.Location?.Delivery ?? 0,
                LocationTypeGuid = locationVersion.Location?.LocationTypeGuid,
                LocationTypes = locationTypes,
            });
        }

        [HttpPut("{guid:guid}")]
        public async Task<IActionResult> Update(Guid guid, [FromBody] TTUpdateRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { message = "Укажите название ТТ." });
            }

            if (!request.LocationTypeGuid.HasValue || !await _context.LocationTypes.AnyAsync(x => x.Guid == request.LocationTypeGuid))
            {
                return BadRequest(new { message = "Укажите корректный тип ТТ." });
            }

            if (request.VersionStartDate.HasValue && request.VersionEndDate.HasValue && request.VersionEndDate < request.VersionStartDate)
            {
                return BadRequest(new { message = "Дата закрытия не может быть раньше даты открытия." });
            }

            if (request.VersionStartDate < FirstSqlDate || request.VersionEndDate < FirstSqlDate)
            {
                return BadRequest(new { message = "Дата должна быть не раньше 01.01.1753." });
            }

            var version = await LoadActualLocationVersionAsync(guid);
            if (version != null && request.VersionGuid.HasValue && version.Guid != request.VersionGuid)
            {
                return Conflict(new { message = "Версия торговой точки изменилась. Обновите страницу перед сохранением." });
            }
            var locationVersion = version == null ? null : await _context.LocationVersions
                .Include(x => x.Location)
                .FirstOrDefaultAsync(x => x.Guid == version.Guid);

            if (locationVersion == null || locationVersion.Location == null)
            {
                return NotFound(new { message = "ТТ не найдена." });
            }

            if (!TradePointTypeGuids.Contains(request.LocationTypeGuid.Value)
                && request.LocationTypeGuid != locationVersion.Location.LocationTypeGuid)
            {
                return BadRequest(new { message = "Укажите корректный тип ТТ." });
            }

            var normalizedName = request.Name.Trim();

            locationVersion.Name = normalizedName;
            locationVersion.Address = NormalizeOptionalString(request.Address);
            locationVersion.OBD = request.OBD;
            locationVersion.VersionStartDate = request.VersionStartDate;
            locationVersion.VersionEndDate = request.VersionEndDate;

            locationVersion.Location.Name = normalizedName;
            locationVersion.Location.RKCode = request.RKCode;
            locationVersion.Location.AggregatorsCode = request.AggregatorsCode;
            locationVersion.Location.LocationTypeGuid = request.LocationTypeGuid;
            locationVersion.Location.Latitude = request.Latitude;
            locationVersion.Location.Longitude = request.Longitude;
            locationVersion.Location.Phone = NormalizeOptionalString(request.Phone);
            if (request.Actual.HasValue) locationVersion.Location.Actual = request.Actual.Value;
            if (request.Delivery.HasValue) locationVersion.Location.Delivery = request.Delivery.Value;

            await _context.SaveChangesAsync();
            return NoContent();
        }

        private async Task<LocationVersion?> LoadActualLocationVersionAsync(Guid locationGuid)
        {
            var actual = await _context.LocationVersions
                .AsNoTracking()
                .Include(x => x.Location)
                .ThenInclude(x => x!.LocationType)
                .FirstOrDefaultAsync(x => x.LocationGuid == locationGuid && x.Actual == 1 && x.VersionEndDate == null);

            if (actual != null)
            {
                return actual;
            }

            return await _context.LocationVersions
                .AsNoTracking()
                .Include(x => x.Location)
                .ThenInclude(x => x!.LocationType)
                .Where(x => x.LocationGuid == locationGuid)
                .OrderByDescending(x => x.VersionStartDate)
                .ThenByDescending(x => x.Guid)
                .FirstOrDefaultAsync();
        }

        private static string? NormalizeOptionalString(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static Guid[] ResolveTypeGuids(string? group)
        {
            return group?.Trim().ToLowerInvariant() switch
            {
                "factory" => FactoryTypeGuids,
                "office" => OfficeTypeGuids,
                _ => TradePointTypeGuids,
            };
        }

        public class TTListItemDto
        {
            public Guid Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public string Type { get; set; } = string.Empty;
            public int? RKCode { get; set; }
            public int? AggregatorsCode { get; set; }
            public int? OBD { get; set; }
            public string? Address { get; set; }
            public DateTime? OpenDate { get; set; }
            public DateTime? CloseDate { get; set; }
            public bool IsClosed { get; set; }
        }

        public class TTEditDto
        {
            public Guid LocationGuid { get; set; }
            public Guid VersionGuid { get; set; }
            public string Name { get; set; } = string.Empty;
            public string? Address { get; set; }
            public int? RKCode { get; set; }
            public int? AggregatorsCode { get; set; }
            public int? OBD { get; set; }
            public DateTime? VersionStartDate { get; set; }
            public DateTime? VersionEndDate { get; set; }
            public int Actual { get; set; }
            public double? Latitude { get; set; }
            public double? Longitude { get; set; }
            public string? Phone { get; set; }
            public int Delivery { get; set; }
            public Guid? LocationTypeGuid { get; set; }
            public List<LocationTypeDto> LocationTypes { get; set; } = [];
        }

        public class EntityListItemDto
        {
            public Guid Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public int Owner { get; set; }
            public int LocationsCount { get; set; }
        }

        public class EntityEditDto
        {
            public Guid Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public int Owner { get; set; }
            public bool FolderExists { get; set; }
            public bool FolderAvailable { get; set; }
            public int FolderFileCount { get; set; }
            public string? FolderPath { get; set; }
        }

        public class EntitySaveRequest
        {
            public string Name { get; set; } = string.Empty;
            public int Owner { get; set; }

            /// <summary>Нужна ли папка документов организации на сетевом диске.</summary>
            public bool Folder { get; set; }

            /// <summary>Пользователь подтвердил удаление папки вместе с файлами.</summary>
            public bool ConfirmFolderDeletion { get; set; }
        }

        public class NamedItemSaveRequest
        {
            public string Name { get; set; } = string.Empty;
        }

        public class JobTitleListItemDto
        {
            public Guid Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public int? Sequence { get; set; }
        }

        public class LocationTypeListItemDto
        {
            public Guid Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public int LocationsCount { get; set; }
        }

        public class LocationTypeDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
        }

        public class LookupItemDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
        }

        public class LocationLookupsDto
        {
            public List<LocationTypeDto> Types { get; set; } = [];
            public List<LookupItemDto> Entities { get; set; } = [];
            public List<LookupItemDto> Parents { get; set; } = [];
        }

        public class LocationEditDto
        {
            public Guid LocationGuid { get; set; }
            public Guid VersionGuid { get; set; }
            public string Name { get; set; } = string.Empty;
            public string? Address { get; set; }
            public Guid? LocationTypeGuid { get; set; }
            public Guid? EntityGuid { get; set; }
            public Guid? ParentGuid { get; set; }
            public double? Latitude { get; set; }
            public double? Longitude { get; set; }
            public DateTime? VersionStartDate { get; set; }
            public DateTime? VersionEndDate { get; set; }
        }

        public class LocationSaveRequest
        {
            public Guid? VersionGuid { get; set; }
            public string Name { get; set; } = string.Empty;
            public Guid? LocationTypeGuid { get; set; }
            public Guid? EntityGuid { get; set; }
            public Guid? ParentGuid { get; set; }
            public string? Address { get; set; }
            public double? Latitude { get; set; }
            public double? Longitude { get; set; }
            public DateTime? VersionStartDate { get; set; }
            public DateTime? VersionEndDate { get; set; }
        }

        public class TTUpdateRequest
        {
            public Guid? VersionGuid { get; set; }
            [Required, StringLength(50)]
            public string Name { get; set; } = string.Empty;
            [StringLength(100)]
            public string? Address { get; set; }
            [Range(0, int.MaxValue)]
            public int? RKCode { get; set; }
            [Range(0, int.MaxValue)]
            public int? AggregatorsCode { get; set; }
            [Range(0, int.MaxValue)]
            public int? OBD { get; set; }
            [Range(-90d, 90d)]
            public double? Latitude { get; set; }
            [Range(-180d, 180d)]
            public double? Longitude { get; set; }
            [RegularExpression(@"^9[0-9]{9}$", ErrorMessage = "Телефон должен содержать 10 цифр, начиная с 9.")]
            public string? Phone { get; set; }
            [Range(0, 1)]
            public int? Actual { get; set; }
            [Range(0, 1)]
            public int? Delivery { get; set; }
            public DateTime? VersionStartDate { get; set; }
            public DateTime? VersionEndDate { get; set; }
            public Guid? LocationTypeGuid { get; set; }
        }
    }
}
