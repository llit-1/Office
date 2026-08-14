using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

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

        private static readonly Guid[] FactoryTypeGuids =
        [
            Guid.Parse("80423E42-DC1E-4311-AD0B-08DCA4A09C33"),
            Guid.Parse("D3A0363D-2EC4-48E4-AD0C-08DCA4A09C33"),
        ];

        private static readonly Guid[] OfficeTypeGuids =
        [
            Guid.Parse("3810B715-2164-4524-F182-08DBF1A777FF"),
            Guid.Parse("8FE12BFC-1860-4B79-8763-81C984E2A643"),
        ];

        private readonly RKNETDBContext _context;

        public TTController(RKNETDBContext context)
        {
            _context = context;
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

            return Ok(items);
        }

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
                })
                .ToListAsync();

            return Ok(items);
        }

        [HttpGet("{guid:guid}")]
        public async Task<ActionResult<TTEditDto>> Get(Guid guid)
        {
            var locationVersion = await LoadActualLocationVersionAsync(guid);
            if (locationVersion == null)
            {
                return NotFound(new { message = "ТТ не найдена." });
            }

            var locationTypes = await _context.LocationTypes
                .AsNoTracking()
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
                Actual = locationVersion.Actual ?? 1,
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

            if (!request.LocationTypeGuid.HasValue || !TradePointTypeGuids.Contains(request.LocationTypeGuid.Value))
            {
                return BadRequest(new { message = "Укажите корректный тип ТТ." });
            }

            var locationVersion = await _context.LocationVersions
                .Include(x => x.Location)
                .FirstOrDefaultAsync(x => x.LocationGuid == guid && x.Actual == 1 && x.VersionEndDate == null);

            if (locationVersion == null || locationVersion.Location == null)
            {
                return NotFound(new { message = "ТТ не найдена." });
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
            public Guid? LocationTypeGuid { get; set; }
            public List<LocationTypeDto> LocationTypes { get; set; } = [];
        }

        public class EntityListItemDto
        {
            public Guid Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public int Owner { get; set; }
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
        }

        public class LocationTypeDto
        {
            public Guid Guid { get; set; }
            public string Name { get; set; } = string.Empty;
        }

        public class TTUpdateRequest
        {
            public string Name { get; set; } = string.Empty;
            public string? Address { get; set; }
            public int? RKCode { get; set; }
            public int? AggregatorsCode { get; set; }
            public int? OBD { get; set; }
            public DateTime? VersionStartDate { get; set; }
            public DateTime? VersionEndDate { get; set; }
            public Guid? LocationTypeGuid { get; set; }
        }
    }
}
