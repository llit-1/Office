using System.ComponentModel.DataAnnotations;
using System.Data.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RK7;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Locations;
using Office.Server.Nx;

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
        private readonly Rk7Context _rk7;
        private readonly EntityFolderService _folders;
        private readonly NxRestClient _nx;
        private readonly NxUserSyncService _nxUserSync;
        private readonly ILogger<TTController> _logger;

        public TTController(RKNETDBContext context, Rk7Context rk7, EntityFolderService folders, NxRestClient nx, NxUserSyncService nxUserSync, ILogger<TTController> logger)
        {
            _context = context;
            _rk7 = rk7;
            _folders = folders;
            _nx = nx;
            _nxUserSync = nxUserSync;
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
                    AltName = x.Location != null ? x.Location.AltName : null,
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
                })
                .ToListAsync();

            // Считаются актуальные локации, у которых юрлицо действует сегодня.
            var today = DateTime.Today;
            var counts = (await _context.OfficeLocationRequisites
                    .AsNoTracking()
                    .Where(x => x.EntityGuid != null
                        && x.Begin <= today
                        && (x.End == null || x.End > today)
                        && x.Location != null
                        && x.Location.Actual == 1)
                    .Select(x => new { Entity = x.EntityGuid!.Value, x.LocationGuid })
                    .ToListAsync())
                .GroupBy(x => x.Entity)
                .ToDictionary(x => x.Key, x => x.Select(row => row.LocationGuid).Distinct().Count());
            foreach (var item in items)
            {
                item.LocationsCount = counts.GetValueOrDefault(item.Id);
            }

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

            var requisites = await RequisitesAsync(version.LocationGuid);
            return Ok(new LocationEditDto
            {
                LocationGuid = version.LocationGuid,
                VersionGuid = version.Guid,
                Name = version.Name,
                Address = version.Address,
                LocationTypeGuid = typeGuid,
                EntityGuid = CurrentRequisite(requisites)?.EntityGuid,
                Requisites = requisites,
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
            _context.OfficeLocationRequisites.Add(new OfficeLocationRequisite
            {
                EntityGuid = request.EntityGuid,
                Begin = (request.VersionStartDate ?? DateTime.Today).Date,
                LocationGuid = location.Guid,
            });
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
            if (request.NewRequisites is RequisitesVersionRequest next
                && await ApplyNewRequisitesAsync(guid, version, next, withObd: false) is IActionResult invalidRequisites)
            {
                return invalidRequisites;
            }

            var name = request.Name.Trim();

            version.Name = name;
            version.Address = NormalizeOptionalString(request.Address);
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
            // Юрлицо задаётся при создании; дальше меняется новой версией реквизитов.
            if (self == null && (request.EntityGuid is not Guid entity || !await _context.Entity.AnyAsync(x => x.Guid == entity))) return "Выберите юридическое лицо.";

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

            var locationTypes = await TradePointTypesAsync(locationVersion.Location?.LocationTypeGuid);
            var entities = await EntityLookupAsync();
            var requisites = await RequisitesAsync(locationVersion.LocationGuid);
            var rk7Name = await TryLoadRk7NameAsync(locationVersion.Location?.RKCode);

            return Ok(new TTEditDto
            {
                LocationGuid = locationVersion.LocationGuid,
                VersionGuid = locationVersion.Guid,
                Name = locationVersion.Name,
                Rk7Name = rk7Name,
                NameOutdated = rk7Name != null && !SameName(rk7Name, locationVersion.Name),
                AltName = locationVersion.Location?.AltName,
                Entities = entities,
                Requisites = requisites,
                NxLayout = locationVersion.Location?.NXLayout,
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

        /// <summary>Группы пользователей NX и ТТ, к которым они уже привязаны. NX опрашивается отдельно от карточки ТТ.</summary>
        [HttpGet("nx-groups")]
        public async Task<ActionResult<List<NxGroupDto>>> GetNxGroups([FromQuery] Guid? self = null)
        {
            List<NxRestClient.NxItemInfo> groups;
            try
            {
                groups = await _nx.GetUserGroupsAsync();
            }
            catch (Exception exception) when (IsNxFailure(exception))
            {
                _logger.LogWarning(exception, "NX user groups could not be loaded.");
                return NxUnavailable("Группы NX сейчас недоступны.");
            }

            var linked = await _context.Locations
                .AsNoTracking()
                .Where(x => x.NXLayout != null && x.Guid != self)
                .Select(x => new { Layout = x.NXLayout!.Value, x.Name })
                .ToListAsync();

            return Ok(groups
                .Where(x => Guid.TryParse(x.Id, out _))
                .Select(x => new NxGroupDto
                {
                    Id = Guid.Parse(x.Id!),
                    Name = x.Name ?? x.Id!,
                    TakenBy = linked.FirstOrDefault(link => link.Layout == Guid.Parse(x.Id!))?.Name,
                })
                .ToList());
        }

        /// <summary>Рестораны R-Keeper, которых ещё нет среди локаций, типы и юрлица для формы новой ТТ.</summary>
        [HttpGet("new")]
        public async Task<ActionResult<TTCreateLookupsDto>> GetCreateLookups()
        {
            List<Rk7Restaurant> restaurants;
            try
            {
                restaurants = await _rk7.Restaurants.AsNoTracking().ToListAsync();
            }
            catch (Exception exception) when (exception is DbException or InvalidOperationException)
            {
                _logger.LogWarning(exception, "RK7 restaurants could not be loaded.");
                return Rk7Unavailable();
            }

            var usedCodes = (await _context.Locations
                    .Where(x => x.RKCode != null)
                    .Select(x => x.RKCode!.Value)
                    .ToListAsync())
                .ToHashSet();

            return Ok(new TTCreateLookupsDto
            {
                Restaurants = restaurants
                    .Where(x => !usedCodes.Contains(x.Sifr) && Rk7Name(x) != null)
                    .Select(x => new RestaurantOptionDto
                    {
                        RKCode = x.Sifr,
                        Code = x.Code,
                        Name = Rk7Name(x)!,
                        Status = x.Status,
                    })
                    .OrderBy(x => x.Status == 3 ? 0 : 1)
                    .ThenBy(x => x.Name)
                    .ToList(),
                LocationTypes = await TradePointTypesAsync(null),
                Entities = await EntityLookupAsync(),
            });
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] TTCreateRequest request)
        {
            if (request.RKCode is not int rkCode)
            {
                return BadRequest(new { message = "Выберите ТТ из R-Keeper." });
            }

            if (request.Obd is not int obd)
            {
                return BadRequest(new { message = "Укажите код OBD." });
            }

            if (request.EntityGuid is not Guid entityGuid || !await _context.Entity.AnyAsync(x => x.Guid == entityGuid))
            {
                return BadRequest(new { message = "Выберите юридическое лицо." });
            }

            if (await ValidateTradePointAsync(request, null) is string error)
            {
                return BadRequest(new { message = error });
            }

            Rk7Restaurant? restaurant;
            try
            {
                restaurant = await _rk7.Restaurants.AsNoTracking().FirstOrDefaultAsync(x => x.Sifr == rkCode);
            }
            catch (Exception exception) when (exception is DbException or InvalidOperationException)
            {
                _logger.LogWarning(exception, "RK7 restaurant {RKCode} could not be loaded.", rkCode);
                return Rk7Unavailable();
            }

            if (restaurant == null || string.IsNullOrWhiteSpace(restaurant.Name))
            {
                return BadRequest(new { message = "Этой ТТ нет в R-Keeper. Обновите страницу и выберите заново." });
            }

            if (await _context.Locations.AnyAsync(x => x.RKCode == rkCode))
            {
                return Conflict(new { message = $"ТТ с кодом RK {rkCode} уже добавлена." });
            }

            if (await ObdTakenAsync(obd, null) is string taken)
            {
                return Conflict(new { message = taken });
            }

            // Название из R-Keeper без «Люди Любят, »; калькулятор связывается с точкой по коду RK.
            var name = Rk7Name(restaurant)!;

            if (await NxLayoutTakenAsync(request.NxLayout, null) is string layoutTaken)
            {
                return Conflict(new { message = layoutTaken });
            }

            // Группа NX ищется последней: созданная зря группа подхватится при повторе по имени.
            var nxLayout = request.NxLayout;
            if (nxLayout == null)
            {
                try
                {
                    var resolved = await ResolveNxGroupAsync(name);
                    if (resolved.Error != null)
                    {
                        return Conflict(new { message = resolved.Error });
                    }

                    nxLayout = resolved.Layout;
                }
                catch (Exception exception) when (IsNxFailure(exception))
                {
                    _logger.LogWarning(exception, "NX group for new TT {Name} could not be resolved.", name);
                    return NxUnavailable("Не удалось получить группу NX, ТТ не создана. Попробуйте позже.");
                }
            }

            var location = new Location
            {
                Guid = Guid.NewGuid(),
                Name = name,
                AltName = NormalizeOptionalString(request.AltName),
                RKCode = rkCode,
                AggregatorsCode = request.AggregatorsCode,
                LocationTypeGuid = request.LocationTypeGuid,
                NXLayout = nxLayout,
                Latitude = request.Latitude,
                Longitude = request.Longitude,
                Phone = NormalizeOptionalString(request.Phone),
                Actual = request.Actual ?? 1,
                Delivery = request.Delivery ?? 0,
            };
            _context.Locations.Add(location);
            _context.LocationVersions.Add(new LocationVersion
            {
                Guid = Guid.NewGuid(),
                Name = name,
                LocationGuid = location.Guid,
                OBD = obd,
                EntityGuid = entityGuid,
                Actual = 1,
                VersionStartDate = request.VersionStartDate,
                VersionEndDate = request.VersionEndDate,
                Address = NormalizeOptionalString(request.Address),
            });
            _context.OfficeLocationRequisites.Add(new OfficeLocationRequisite
            {
                Obd = obd,
                EntityGuid = entityGuid,
                Begin = (request.VersionStartDate ?? DateTime.Today).Date,
                LocationGuid = location.Guid,
            });

            await _context.SaveChangesAsync();
            return Ok(new { locationGuid = location.Guid });
        }

        /// <summary>Подтягивает название ТТ из R-Keeper: в локацию, её актуальную версию и точку калькулятора.</summary>
        [HttpPost("{guid:guid}/sync-name")]
        public async Task<IActionResult> SyncName(Guid guid)
        {
            var location = await _context.Locations.FirstOrDefaultAsync(x => x.Guid == guid);
            if (location?.RKCode is not int rkCode || rkCode <= 0)
            {
                return NotFound(new { message = "ТТ с кодом R-Keeper не найдена." });
            }

            Rk7Restaurant? restaurant;
            try
            {
                restaurant = await _rk7.Restaurants.AsNoTracking().FirstOrDefaultAsync(x => x.Sifr == rkCode);
            }
            catch (Exception exception) when (exception is DbException or InvalidOperationException)
            {
                _logger.LogWarning(exception, "RK7 restaurant {RKCode} could not be loaded.", rkCode);
                return Rk7Unavailable();
            }

            if (Rk7Name(restaurant) is not string name)
            {
                return NotFound(new { message = $"Ресторана с кодом {rkCode} нет в R-Keeper." });
            }

            if (SameName(location.Name, name))
            {
                return Ok(new TTNameSyncDto { Name = location.Name, Changed = false });
            }

            location.Name = name;
            if (await LoadActualLocationVersionAsync(guid) is LocationVersion actual)
            {
                var version = await _context.LocationVersions.FirstAsync(x => x.Guid == actual.Guid);
                version.Name = name;
            }

            await _context.SaveChangesAsync();

            // Название точки калькулятора — только для людей; у TT триггеры лишь на вставку.
            if (_context.Database.IsRelational())
            {
                try
                {
                    await _context.Database.ExecuteSqlInterpolatedAsync(
                        $"UPDATE [CALCULATOR].[dbo].[TT] SET [TTName] = {name} WHERE [TTCode] = {rkCode}");
                }
                catch (DbException exception)
                {
                    _logger.LogWarning(exception, "Calculator TT {RKCode} name was not updated.", rkCode);
                }
            }

            return Ok(new TTNameSyncDto { Name = name, Changed = true });
        }

        [HttpPut("{guid:guid}")]
        public async Task<IActionResult> Update(Guid guid, [FromBody] TTUpdateRequest request)
        {
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

            if (await ValidateTradePointAsync(request, locationVersion.Location.LocationTypeGuid) is string error)
            {
                return BadRequest(new { message = error });
            }

            if (await NxLayoutTakenAsync(request.NxLayout, guid) is string layoutTaken)
            {
                return Conflict(new { message = layoutTaken });
            }

            if (request.NewRequisites is RequisitesVersionRequest next
                && await ApplyNewRequisitesAsync(guid, locationVersion, next, withObd: true) is IActionResult invalidRequisites)
            {
                return invalidRequisites;
            }

            // Группа NX определяет доступ к камерам: пользователей переводим до сохранения, чтобы при сбое ТТ осталась со старой.
            var nxWarnings = new List<string>();
            var previousLayout = locationVersion.Location.NXLayout;
            if (previousLayout != request.NxLayout)
            {
                try
                {
                    nxWarnings = await _nxUserSync.MoveLocationUsersAsync(guid, previousLayout, request.NxLayout);
                }
                catch (Exception exception) when (IsNxFailure(exception))
                {
                    _logger.LogWarning(exception, "Users of TT {Guid} could not be moved to another NX group.", guid);
                    return NxUnavailable("Не удалось перевести пользователей в другую группу NX, ТТ не сохранена. Попробуйте позже.");
                }
            }

            // Name и RKCode приходят из R-Keeper и здесь не меняются.
            locationVersion.Address = NormalizeOptionalString(request.Address);
            locationVersion.VersionStartDate = request.VersionStartDate;
            locationVersion.VersionEndDate = request.VersionEndDate;

            locationVersion.Location.AltName = NormalizeOptionalString(request.AltName);
            locationVersion.Location.NXLayout = request.NxLayout;
            locationVersion.Location.AggregatorsCode = request.AggregatorsCode;
            locationVersion.Location.LocationTypeGuid = request.LocationTypeGuid;
            locationVersion.Location.Latitude = request.Latitude;
            locationVersion.Location.Longitude = request.Longitude;
            locationVersion.Location.Phone = NormalizeOptionalString(request.Phone);
            if (request.Actual.HasValue) locationVersion.Location.Actual = request.Actual.Value;
            if (request.Delivery.HasValue) locationVersion.Location.Delivery = request.Delivery.Value;

            await _context.SaveChangesAsync();
            return nxWarnings.Count > 0 ? Ok(new { nxWarnings }) : NoContent();
        }

        private Task<List<LocationTypeDto>> TradePointTypesAsync(Guid? currentTypeGuid) =>
            _context.LocationTypes
                .AsNoTracking()
                .Where(x => TradePointTypeGuids.Contains(x.Guid) || x.Guid == currentTypeGuid)
                .OrderBy(x => x.Name)
                .Select(x => new LocationTypeDto { Guid = x.Guid, Name = x.Name })
                .ToListAsync();

        /// <summary>Общие поля новой и существующей ТТ. У существующей допускается её прежний тип вне списка ТТ.</summary>
        private async Task<string?> ValidateTradePointAsync(TTFieldsRequest request, Guid? currentTypeGuid)
        {
            if (request.LocationTypeGuid is not Guid type
                || !(TradePointTypeGuids.Contains(type) || type == currentTypeGuid)
                || !await _context.LocationTypes.AnyAsync(x => x.Guid == type))
            {
                return "Укажите корректный тип ТТ.";
            }

            if (request.VersionStartDate < FirstSqlDate || request.VersionEndDate < FirstSqlDate) return "Дата должна быть не раньше 01.01.1753.";
            if (request.VersionStartDate.HasValue && request.VersionEndDate < request.VersionStartDate) return "Дата закрытия не может быть раньше даты открытия.";
            return null;
        }

        private Task<List<LookupItemDto>> EntityLookupAsync() =>
            _context.Entity.AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new LookupItemDto { Guid = x.Guid, Name = x.Name })
                .ToListAsync();

        private Task<List<RequisiteVersionDto>> RequisitesAsync(Guid locationGuid) =>
            _context.OfficeLocationRequisites
                .AsNoTracking()
                .Where(x => x.LocationGuid == locationGuid)
                .OrderByDescending(x => x.Begin)
                .ThenByDescending(x => x.Id)
                .Select(x => new RequisiteVersionDto
                {
                    Id = x.Id,
                    Obd = x.Obd,
                    EntityGuid = x.EntityGuid,
                    EntityName = x.Entity != null ? x.Entity.Name : null,
                    Begin = x.Begin,
                    End = x.End,
                })
                .ToListAsync();

        /// <summary>Версия, действующая сегодня; если все ещё впереди — самая поздняя.</summary>
        private static RequisiteVersionDto? CurrentRequisite(List<RequisiteVersionDto> versions)
        {
            var today = DateTime.Today;
            return versions.FirstOrDefault(x => x.Begin <= today && (x.End == null || x.End > today)) ?? versions.FirstOrDefault();
        }

        /// <summary>
        /// Новая версия OBD и юрлица: действующая закрывается днём её начала,
        /// актуальная LocationVersions получает новые значения для старого портала и отчётов.
        /// </summary>
        private async Task<IActionResult?> ApplyNewRequisitesAsync(Guid locationGuid, LocationVersion version, RequisitesVersionRequest next, bool withObd)
        {
            if (withObd && next.Obd is null)
            {
                return BadRequest(new { message = "Укажите код OBD новой версии." });
            }

            if (next.EntityGuid is not Guid entity || !await _context.Entity.AnyAsync(x => x.Guid == entity))
            {
                return BadRequest(new { message = "Выберите юридическое лицо новой версии." });
            }

            if (next.Begin is not DateTime beginValue || beginValue.Date < FirstSqlDate)
            {
                return BadRequest(new { message = "Укажите дату начала новой версии." });
            }

            var begin = beginValue.Date;
            var history = await _context.OfficeLocationRequisites.Where(x => x.LocationGuid == locationGuid).ToListAsync();
            if (history.Select(x => (DateTime?)x.Begin).Max() is DateTime lastBegin && begin <= lastBegin)
            {
                return BadRequest(new { message = $"Новая версия должна начинаться позже {lastBegin:dd.MM.yyyy} — начала текущей." });
            }

            var obd = withObd ? next.Obd : null;
            if (obd is int code && await ObdTakenAsync(code, locationGuid) is string taken)
            {
                return Conflict(new { message = taken });
            }

            foreach (var open in history.Where(x => x.End == null))
            {
                open.End = begin;
            }

            _context.OfficeLocationRequisites.Add(new OfficeLocationRequisite
            {
                Obd = obd,
                EntityGuid = entity,
                Begin = begin,
                LocationGuid = locationGuid,
            });
            if (withObd) version.OBD = obd;
            version.EntityGuid = entity;
            return null;
        }

        private static bool IsNxFailure(Exception exception) =>
            exception is NxException or HttpRequestException or TaskCanceledException;

        private ObjectResult NxUnavailable(string message) =>
            StatusCode(StatusCodes.Status503ServiceUnavailable, new { message });

        /// <summary>Одна группа NX — одна локация, иначе доступ к камерам уйдёт не той точке.</summary>
        private async Task<string?> NxLayoutTakenAsync(Guid? layout, Guid? self)
        {
            if (layout is not Guid value) return null;
            var owner = await _context.Locations
                .Where(x => x.NXLayout == value && x.Guid != self)
                .Select(x => new { x.Name })
                .FirstOrDefaultAsync();
            return owner == null ? null : $"Группа NX уже привязана к ТТ «{owner.Name}».";
        }

        /// <summary>Как в старом портале: группа с именем ТТ, а если её нет — новая.</summary>
        private async Task<(Guid? Layout, string? Error)> ResolveNxGroupAsync(string name)
        {
            var existing = (await _nx.GetUserGroupsAsync())
                .FirstOrDefault(x => string.Equals(x.Name?.Trim(), name, StringComparison.OrdinalIgnoreCase));
            var group = existing ?? await _nx.CreateUserGroupAsync(name);
            if (!Guid.TryParse(group.Id, out var layout))
            {
                throw new NxException($"NX вернул некорректный id группы «{name}».");
            }

            return await NxLayoutTakenAsync(layout, null) is string
                ? (null, $"Группа NX «{name}» уже привязана к другой ТТ. Выберите группу вручную.")
                : (layout, null);
        }

        /// <summary>Один действующий код OBD — одна точка.</summary>
        private async Task<string?> ObdTakenAsync(int obd, Guid? self)
        {
            var owner = await _context.OfficeLocationRequisites
                .Where(x => x.Obd == obd && x.End == null && x.LocationGuid != self)
                .Select(x => new { Name = x.Location != null ? x.Location.Name : string.Empty })
                .FirstOrDefaultAsync();
            return owner == null ? null : $"Код OBD {obd} уже действует у ТТ «{owner.Name}».";
        }

        /// <summary>Название ресторана для портала: без «Люди Любят, » и её вариантов, с одиночными пробелами.</summary>
        private static string? Rk7Name(Rk7Restaurant? restaurant)
        {
            var name = CollapseSpaces(BrandPrefix.Replace(restaurant?.Name ?? string.Empty, string.Empty));
            if (name.Length == 0) return null;
            return name.Length > LocationNameMaxLength ? name[..LocationNameMaxLength] : name;
        }

        private static readonly System.Text.RegularExpressions.Regex BrandPrefix = new(
            @"^\s*(Люди\s*Любят|Люли\s*Любят)\s*,\s*",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        private static string CollapseSpaces(string value) =>
            System.Text.RegularExpressions.Regex.Replace(value.Trim(), @"\s+", " ");

        /// <summary>Сравнение с R-Keeper без приставки бренда и без лишних пробелов.</summary>
        private static bool SameName(string? left, string? right) =>
            string.Equals(
                CollapseSpaces(BrandPrefix.Replace(left ?? string.Empty, string.Empty)),
                CollapseSpaces(BrandPrefix.Replace(right ?? string.Empty, string.Empty)),
                StringComparison.OrdinalIgnoreCase);

        /// <summary>Название в R-Keeper для подсказки на форме; недоступный RK7 форму не ломает.</summary>
        private async Task<string?> TryLoadRk7NameAsync(int? rkCode)
        {
            if (rkCode is not int code || code <= 0) return null;
            try
            {
                return Rk7Name(await _rk7.Restaurants.AsNoTracking().FirstOrDefaultAsync(x => x.Sifr == code));
            }
            catch (Exception exception) when (exception is DbException or InvalidOperationException)
            {
                _logger.LogWarning(exception, "RK7 restaurant {RKCode} could not be loaded.", code);
                return null;
            }
        }

        private ObjectResult Rk7Unavailable() => StatusCode(StatusCodes.Status503ServiceUnavailable, new
        {
            message = "Справочник ресторанов R-Keeper сейчас недоступен. Попробуйте позже.",
        });

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
            public string? AltName { get; set; }
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

            /// <summary>Название в R-Keeper без «Люди Любят, »; null, если R-Keeper недоступен или точки там нет.</summary>
            public string? Rk7Name { get; set; }

            /// <summary>Название в R-Keeper отличается от нашего (без приставки бренда и лишних пробелов).</summary>
            public bool NameOutdated { get; set; }
            public string? AltName { get; set; }
            public List<LookupItemDto> Entities { get; set; } = [];
            public string? Address { get; set; }
            public int? RKCode { get; set; }
            public int? AggregatorsCode { get; set; }
            public int? OBD { get; set; }
            public List<RequisiteVersionDto> Requisites { get; set; } = [];
            public Guid? NxLayout { get; set; }
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
            public List<RequisiteVersionDto> Requisites { get; set; } = [];
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

            /// <summary>Юрлицо новой локации; у существующей меняется через <see cref="NewRequisites"/>.</summary>
            public Guid? EntityGuid { get; set; }
            public Guid? ParentGuid { get; set; }
            public string? Address { get; set; }
            public double? Latitude { get; set; }
            public double? Longitude { get; set; }
            public DateTime? VersionStartDate { get; set; }
            public DateTime? VersionEndDate { get; set; }

            /// <summary>Новая версия юрлица; текущая закроется датой её начала.</summary>
            public RequisitesVersionRequest? NewRequisites { get; set; }
        }

        public class NxGroupDto
        {
            public Guid Id { get; set; }
            public string Name { get; set; } = string.Empty;

            /// <summary>Другая локация, к которой группа уже привязана.</summary>
            public string? TakenBy { get; set; }
        }

        public class TTNameSyncDto
        {
            public string Name { get; set; } = string.Empty;
            public bool Changed { get; set; }
        }

        public class RequisiteVersionDto
        {
            public int Id { get; set; }
            public int? Obd { get; set; }
            public Guid? EntityGuid { get; set; }
            public string? EntityName { get; set; }
            public DateTime Begin { get; set; }
            public DateTime? End { get; set; }
        }

        public class RestaurantOptionDto
        {
            public int RKCode { get; set; }
            public int? Code { get; set; }
            public string Name { get; set; } = string.Empty;

            /// <summary>Статус в R-Keeper: 0 — удалён, 1 — черновик, 2 — неактивен, 3 — активен.</summary>
            public short? Status { get; set; }
        }

        public class TTCreateLookupsDto
        {
            public List<RestaurantOptionDto> Restaurants { get; set; } = [];
            public List<LocationTypeDto> LocationTypes { get; set; } = [];
            public List<LookupItemDto> Entities { get; set; } = [];
        }

        public class TTCreateRequest : TTFieldsRequest
        {
            /// <summary>SIFR ресторана из RK7new.Restaurants.</summary>
            [Range(1, int.MaxValue)]
            public int? RKCode { get; set; }
            [Range(1, int.MaxValue)]
            public int? Obd { get; set; }
            public Guid? EntityGuid { get; set; }
        }

        public class TTUpdateRequest : TTFieldsRequest
        {
            public Guid? VersionGuid { get; set; }

            /// <summary>Новая версия OBD и юрлица; текущая закроется датой её начала.</summary>
            public RequisitesVersionRequest? NewRequisites { get; set; }
        }

        public class RequisitesVersionRequest
        {
            [Range(1, int.MaxValue)]
            public int? Obd { get; set; }
            public Guid? EntityGuid { get; set; }
            public DateTime? Begin { get; set; }
        }

        public class TTFieldsRequest
        {
            [StringLength(50)]
            public string? AltName { get; set; }

            /// <summary>Группа NX. У новой ТТ пусто — найти по имени или создать, у существующей пусто — отвязать.</summary>
            public Guid? NxLayout { get; set; }
            [StringLength(100)]
            public string? Address { get; set; }
            [Range(0, int.MaxValue)]
            public int? AggregatorsCode { get; set; }
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
