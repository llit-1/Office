using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "FactoryPerson")]
    public class PersonalityFactoryController : ControllerBase
    {
        private readonly RKNETDBContext _context;

        public PersonalityFactoryController(RKNETDBContext context)
        {
            _context = context;
        }

        // GET: api/PersonalityFactory/persons
        [HttpGet("persons")]
        public async Task<ActionResult> GetPersons()
        {
            var persons = await (
                from p in _context.FactoryPerson.AsNoTracking()
                where p.Fake == null
                join bankItem in _context.FactoryBanks.AsNoTracking() on p.FactoryBanks equals (int?)bankItem.Id into bankJoin
                from bank in bankJoin.DefaultIfEmpty()
                join citizenshipItem in _context.FactoryCitizenship.AsNoTracking() on p.FactoryCitizenship equals citizenshipItem.Id into citizenshipJoin
                from citizenship in citizenshipJoin.DefaultIfEmpty()
                join entityItem in _context.FactoryEntity.AsNoTracking() on p.FactoryEntity equals entityItem.Id into entityJoin
                from entity in entityJoin.DefaultIfEmpty()
                join documentTypeItem in _context.FactoryDocumentType.AsNoTracking() on p.FactoryDocumentType equals documentTypeItem.Id into documentTypeJoin
                from documentType in documentTypeJoin.DefaultIfEmpty()
                join departmentItem in _context.FactoryDepartment.AsNoTracking() on p.FactoryDepartment equals (int?)departmentItem.Id into departmentJoin
                from department in departmentJoin.DefaultIfEmpty()
                join workshopItem in _context.FactoryWorkshop.AsNoTracking() on p.FactoryWorkshop equals (int?)workshopItem.Id into workshopJoin
                from workshop in workshopJoin.DefaultIfEmpty()
                join jobTitleItem in _context.FactoryJobTitle.AsNoTracking() on p.FactoryJobTitle equals (int?)jobTitleItem.Id into jobTitleJoin
                from jobTitle in jobTitleJoin.DefaultIfEmpty()
                orderby p.Surname, p.Name, p.Patronymic
                select new
                {
                    p.Id,
                    p.Surname,
                    p.Name,
                    p.Patronymic,
                    p.Birthdate,
                    p.Passport,
                    p.PassportDate,
                    p.FactoryCitizenship,
                    p.FactoryEntity,
                    p.FactoryDocumentType,
                    p.FactoryDepartment,
                    p.FactoryWorkshop,
                    p.FactoryJobTitle,
                    p.Phone,
                    p.CardNumber,
                    p.FactoryBanks,
                    p.HostelChekin,
                    p.HostelCheckOut,
                    p.HiringDate,
                    p.DismissedDate,
                    p.PassCardNumber,
                    SKUDGroupId = p.SKUDGroupId,
                    p.Fake,
                    Bank = bank == null ? null : new { bank.Id, bank.Name },
                    Citizenship = citizenship == null ? null : new { citizenship.Id, citizenship.Name },
                    Entity = entity == null ? null : new { entity.Id, entity.Name },
                    DocumentType = documentType == null ? null : new { documentType.Id, documentType.Name },
                    FactoryDepartmentName = department != null ? department.Name : null,
                    FactoryWorkshopName = workshop != null ? workshop.Name : null,
                    FactoryJobTitleName = jobTitle != null ? jobTitle.Name : null
                })
                .ToListAsync();

            return Ok(persons);
        }

        // GET: api/PersonalityFactory/addmodel
        [HttpGet("addmodel")]
        public ActionResult<PersonalityFactoryAddModel> GetAddModel()
        {
            var model = new PersonalityFactoryAddModel
            {
                FactoryDepartments = _context.FactoryDepartment.ToList(),
                FactoryEntities = _context.FactoryEntity.ToList(),
                FactoryCitizenshipTypes = _context.FactoryCitizenshipType.ToList(),
                FactoryDocumentTypes = _context.FactoryDocumentType.ToList(),
                FactoryBanks = _context.FactoryBanks.ToList(),
                FactorySKUDGroups = _context.FactorySKUDGroup.ToList()
            };

            return Ok(model);
        }

        // GET: api/PersonalityFactory/workshops/{departmentId}
        [HttpGet("workshops/{departmentId}")]
        public ActionResult GetWorkshops(int departmentId)
        {
            var factoryWorkshops = _context.FactoryDepartmentFactoryWorkshop
                .Include(x => x.FactoryWorkshop)
                .Where(x => x.FactoryDepartmentId == departmentId)
                .Select(x => x.FactoryWorkshop)
                .OrderBy(x => x.Name)
                .ToList();

            return Ok(factoryWorkshops);
        }

        // GET: api/PersonalityFactory/jobtitles?department={d}&workshop={w}
        [HttpGet("jobtitles")]
        public ActionResult GetJobTitles(int department, int workshop)
        {
            var factoryJobTitles = _context.FactoryDepartmentWorkshopJobTitle
                .AsNoTracking()
                .Where(link => link.FactoryDepartmentId == department && link.FactoryWorkshopId == workshop)
                .Join(
                    _context.FactoryJobTitle.AsNoTracking(),
                    link => link.FactoryJobTitleId,
                    jobTitle => jobTitle.Id,
                    (_, jobTitle) => jobTitle)
                .OrderBy(x => x.Name)
                .ToList();

            return Ok(factoryJobTitles);
        }

        // GET: api/PersonalityFactory/citizenships/{citizenshipTypeId}
        [HttpGet("citizenships/{citizenshipTypeId}")]
        public ActionResult GetCitizenships(int citizenshipTypeId)
        {
            var factoryCitizenships = _context.FactoryCitizenship
                .Where(x => x.CitizenshipTypeId == citizenshipTypeId)
                .OrderBy(x => x.Name)
                .ToList();

            return Ok(factoryCitizenships);
        }

        // POST: api/PersonalityFactory/persons
        [HttpPost("persons")]
        public async Task<IActionResult> SaveNewPerson([FromBody] FactoryPerson person)
        {
            if (person == null)
                return BadRequest(new { Message = "person is null" });

            if (_context.FactoryPerson.Any(x => x.Passport == person.Passport))
                return BadRequest(new { Message = "Пользователь с таким паспортом уже зарегистрирован" });

            if (string.IsNullOrEmpty(person.Photo)) person.Photo = null;
            if (person.PassCardNumber != null && person.PassCardNumber.Length != 6)
                return BadRequest(new { Message = "Неверный код карты" });

            _context.FactoryPerson.Add(person);
            await _context.SaveChangesAsync();
            return Ok(person);
        }

        // GET: api/PersonalityFactory/lastnxdata
        [HttpGet("lastnxdata")]
        public ActionResult GetLastNxData()
        {
            var lastLog = _context.FactorySKUDWorkLog
                .Where(x => x.ReaderId == 2)
                .OrderByDescending(x => x.DateTime)
                .FirstOrDefault();

            if (lastLog == null)
                return NotFound();

            // Nx API not available here — return available data only
            return Ok(new { hex = lastLog.HexStr });
        }

        // GET: api/PersonalityFactory/persons/{id}
        [HttpGet("persons/{id}")]
        public ActionResult GetPersonEditModel(int id)
        {
            var person = _context.FactoryPerson
                .Include(x => x.Citizenship)
                .FirstOrDefault(x => x.Id == id);

            if (person == null) return NotFound();

            var model = new PersonalityFactoryEditModel
            {
                FactoryPerson = person,
                FactoryDepartments = _context.FactoryDepartment.ToList(),
                FactoryWorkshops = person.FactoryDepartment.HasValue
                    ? _context.FactoryDepartmentFactoryWorkshop
                        .Include(x => x.FactoryWorkshop)
                        .Where(x => x.FactoryDepartmentId == person.FactoryDepartment.Value)
                        .Select(x => x.FactoryWorkshop)
                        .ToList()
                    : new List<FactoryWorkshop>(),
                FactoryJobTitles = (person.FactoryDepartment.HasValue && person.FactoryWorkshop.HasValue)
                    ? _context.FactoryDepartmentWorkshopJobTitle
                        .AsNoTracking()
                        .Where(link =>
                            link.FactoryDepartmentId == person.FactoryDepartment.Value
                            && link.FactoryWorkshopId == person.FactoryWorkshop.Value)
                        .Join(
                            _context.FactoryJobTitle.AsNoTracking(),
                            link => link.FactoryJobTitleId,
                            jobTitle => jobTitle.Id,
                            (_, jobTitle) => jobTitle)
                        .ToList()
                    : new List<FactoryJobTitle>(),
                FactoryCitizenshipType = person.Citizenship != null
                    ? _context.FactoryCitizenshipType.FirstOrDefault(x => x.Id == person.Citizenship.CitizenshipTypeId)
                    : null,
                FactoryCitizenships = person.Citizenship != null
                    ? _context.FactoryCitizenship.Where(x => x.CitizenshipTypeId == person.Citizenship.CitizenshipTypeId).ToList()
                    : new List<FactoryCitizenship>(),
                FactoryEntities = _context.FactoryEntity.ToList(),
                FactoryDocumentTypes = _context.FactoryDocumentType.ToList(),
                FactoryBanks = _context.FactoryBanks.ToList(),
                FactoryCitizenshipTypes = _context.FactoryCitizenshipType.ToList(),
                FactorySKUDGroups = _context.FactorySKUDGroup.ToList()
            };

            return Ok(model);
        }

        // PUT: api/PersonalityFactory/persons
        [HttpPut("persons")]
        public IActionResult EditPerson([FromBody] FactoryPerson person)
        {
            if (person == null) return BadRequest(new { Message = "person is null" });
            if (!_context.FactoryPerson.Any(x => x.Id == person.Id)) return BadRequest(new { Message = "invalid person id" });
            if (_context.FactoryPerson.Any(x => x.Passport == person.Passport && x.Id != person.Id)) return BadRequest(new { Message = "Паспорт уже зарегистрирован у другого человека" });
            if (person.PassCardNumber != null && person.PassCardNumber.Length != 6) return BadRequest(new { Message = "Неверный код карты" });

            _context.Entry(person).State = EntityState.Modified;
            _context.SaveChanges();
            return Ok(person);
        }

        public class PersonalityFactoryAddModel
        {
            public List<FactoryDepartment> FactoryDepartments { get; set; } = new List<FactoryDepartment>();
            public List<FactoryEntity> FactoryEntities { get; set; } = new List<FactoryEntity>();
            public List<FactoryCitizenshipType> FactoryCitizenshipTypes { get; set; } = new List<FactoryCitizenshipType>();
            public List<FactoryDocumentType> FactoryDocumentTypes { get; set; } = new List<FactoryDocumentType>();
            public List<FactoryBanks> FactoryBanks { get; set; } = new List<FactoryBanks>();
            public List<FactorySKUDGroup> FactorySKUDGroups { get; set; } = new List<FactorySKUDGroup>();
        }

        public class PersonalityFactoryEditModel
        {
            public FactoryPerson? FactoryPerson { get; set; }
            public List<FactoryDepartment> FactoryDepartments { get; set; } = new List<FactoryDepartment>();
            public List<FactoryWorkshop> FactoryWorkshops { get; set; } = new List<FactoryWorkshop>();
            public List<FactoryJobTitle> FactoryJobTitles { get; set; } = new List<FactoryJobTitle>();
            public List<FactoryCitizenshipType> FactoryCitizenshipTypes { get; set; } = new List<FactoryCitizenshipType>();
            public FactoryCitizenshipType? FactoryCitizenshipType { get; set; }
            public List<FactoryEntity> FactoryEntities { get; set; } = new List<FactoryEntity>();
            public List<FactoryCitizenship> FactoryCitizenships { get; set; } = new List<FactoryCitizenship>();
            public List<FactoryDocumentType> FactoryDocumentTypes { get; set; } = new List<FactoryDocumentType>();
            public List<FactoryBanks> FactoryBanks { get; set; } = new List<FactoryBanks>();
            public List<FactorySKUDGroup> FactorySKUDGroups { get; set; } = new List<FactorySKUDGroup>();
        }
    }
}
