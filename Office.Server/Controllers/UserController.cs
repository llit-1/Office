using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.DirectoryServices;
using System.DirectoryServices.AccountManagement;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Users")]
    public class UserController : ControllerBase
    {
        private readonly RKNETDBContext _context;

        public UserController(RKNETDBContext context)
        {
            _context = context;
        }

        // 1) Получение всех пользователей
        [HttpGet("users")]
        public async Task<ActionResult<IEnumerable<OfficeUser>>> GetAllUsers()
        {
            return await _context.OfficeUser.ToListAsync();
        }

        [HttpGet("ad-users")]
        public ActionResult<IEnumerable<AdDirectoryUserModel>> GetAdUsers()
        {
            using var context = new PrincipalContext(ContextType.Domain);
            using var queryFilter = new UserPrincipal(context)
            {
                Enabled = true
            };
            using var searcher = new PrincipalSearcher(queryFilter);

            var users = searcher.FindAll()
                .OfType<UserPrincipal>()
                .Select(user =>
                {
                    var entry = user.GetUnderlyingObject() as DirectoryEntry;
                    var login = user.SamAccountName?.Trim();
                    if (string.IsNullOrWhiteSpace(login))
                    {
                        return null;
                    }

                    var firstName = entry?.Properties["givenName"]?.Value?.ToString()?.Trim();
                    var lastName = entry?.Properties["sn"]?.Value?.ToString()?.Trim();
                    var middleName = entry?.Properties["middleName"]?.Value?.ToString()?.Trim();
                    var displayName = entry?.Properties["displayName"]?.Value?.ToString()?.Trim();
                    var position = entry?.Properties["title"]?.Value?.ToString()?.Trim();

                    if (string.IsNullOrWhiteSpace(displayName))
                    {
                        var nameParts = new[] { lastName, firstName, middleName }
                            .Where(value => !string.IsNullOrWhiteSpace(value));

                        displayName = string.Join(" ", nameParts);
                    }

                    return new AdDirectoryUserModel
                    {
                        Login = login,
                        FullName = string.IsNullOrWhiteSpace(displayName) ? login : displayName,
                        Position = position
                    };
                })
                .Where(user => user != null)
                .DistinctBy(user => user!.Login, StringComparer.OrdinalIgnoreCase)
                .OrderBy(user => user!.FullName, StringComparer.CurrentCultureIgnoreCase)
                .Select(user => user!)
                .ToList();

            return Ok(users);
        }

        // 2) Получение пользователя по Id (развёрнуто)
        [HttpGet("users/{id}")]
        public async Task<ActionResult<OfficeUserModel>> GetUserById(int id)
        {
            var user = await _context.OfficeUser
                .Include(u => u.Locations)
                .Include(u => u.OfficeGroup)
                .FirstOrDefaultAsync(u => u.Id == id);
            if (user == null)
                return NotFound();
            OfficeUserModel officeUserModel = new(user);
            officeUserModel.Locations = _context.Locations.Include(x => x.LocationType).ToList();
            officeUserModel.officeGroups = _context.OfficeGroup.Include(x => x.OfficeRole).ToList();
            officeUserModel.officeBids = _context.OfficeBids.Where(x => x.OfficeUser.Id == id && x.Status == 0).ToList();
            return officeUserModel;
        }

        // 3) Изменение пользователя
        [HttpPut("users")]
        public async Task<IActionResult> UpdateUser([FromBody] OfficeUserUpdateModel model)
        {
            var user = await _context.OfficeUser
                .Include(u => u.Locations)
                .Include(u => u.OfficeGroup)
                .FirstOrDefaultAsync(u => u.Id == model.Id);
            if (user == null)
                return NotFound();

            user.Login = model.Login;
            user.Name = model.Name;
            user.Surname = model.Surname;
            user.Patronymic = model.Patronymic;
            user.Position = model.Position;
            user.Actual = model.Actual;
            user.DefaultLocations = model.DefaultLocations;
            user.OfficeGroup.Clear();

            if (model.OfficeGroup != null && model.OfficeGroup.Count > 0)
            {
                var groups = await _context.OfficeGroup
                    .Where(g => model.OfficeGroup.Contains(g.ID))
                    .ToListAsync();

                foreach (var g in groups)
                    user.OfficeGroup.Add(g);
            }

            // ===== Locations (Guid IDs) =====
            user.Locations.Clear();

            if (model.Locations != null && model.Locations.Count > 0)
            {
                var locations = await _context.Locations
                    .Where(l => model.Locations.Contains(l.Guid))
                    .ToListAsync();

                foreach (var l in locations)
                    user.Locations.Add(l);
            }

            await _context.SaveChangesAsync();
            return Ok(user);
        }

        [HttpPost("users/bids/{bidId:int}/close")]
        public async Task<IActionResult> CloseUserBid(int bidId)
        {
            var officeBid = await _context.OfficeBids.FirstOrDefaultAsync(x => x.Id == bidId);
            if (officeBid == null)
                return NotFound();

            officeBid.Status = 1;
            await _context.SaveChangesAsync();

            return Ok();
        }

        // 4) Получение всех групп
        [HttpGet("groups")]
        public async Task<ActionResult<IEnumerable<OfficeGroup>>> GetAllGroups()
        {
            return await _context.OfficeGroup.Include(x => x.OfficeRole).ToListAsync();
        }

        // 5) Получение группы по Id
        [HttpGet("groups/{id}")]
        public async Task<ActionResult<OfficeGroup>> GetGroupById(int id)
        {
            var group = await _context.OfficeGroup
                .Include(g => g.OfficeRole)
                .FirstOrDefaultAsync(g => g.ID == id);
            if (group == null)
                return NotFound();
            OfficeGroupModel officeGroupModel = new OfficeGroupModel();
            officeGroupModel.OfficeGroup = group;
            officeGroupModel.OfficeRoles = _context.OfficeRole.ToList();
            return Ok(officeGroupModel);
        }


        // 6) Создание группы
        [HttpPost("groups")]
        public async Task<ActionResult<OfficeGroup>> CreateGroup([FromBody] OfficeGroup model)
        {
            var group = new OfficeGroup
            {
                Name = model.Name
            };

            if (model.OfficeRole != null)
            {
                foreach (var role in model.OfficeRole)
                {
                    var dbRole = await _context.OfficeRole.FindAsync(role.ID);
                    if (dbRole != null)
                        group.OfficeRole.Add(dbRole);
                }
            }

            _context.OfficeGroup.Add(group);
            await _context.SaveChangesAsync();

            return Ok(group);
        }

        // 7) Изменение группы
        [HttpPut("groups")]
        public async Task<IActionResult> UpdateGroup([FromBody] OfficeGroup model)
        {
            var group = await _context.OfficeGroup
                .Include(g => g.OfficeRole)
                .FirstOrDefaultAsync(g => g.ID == model.ID);

            if (group == null)
                return NotFound();

            group.Name = model.Name;
            group.OfficeRole.Clear();

            if (model.OfficeRole != null)
            {
                foreach (var role in model.OfficeRole)
                {
                    var dbRole = await _context.OfficeRole.FindAsync(role.ID);
                    if (dbRole != null)
                        group.OfficeRole.Add(dbRole);
                }
            }

            await _context.SaveChangesAsync();
            return Ok(group);
        }

        // 8) Удаление группы (если нет связей)
        [HttpDelete("groups/{id}")]
        public async Task<IActionResult> DeleteGroup(int id)
        {
            var group = await _context.OfficeGroup
                .FirstOrDefaultAsync(g => g.ID == id);

            if (group == null)
                return NotFound();
            var user = _context.OfficeUser.FirstOrDefault(r => r.OfficeGroup.Any(group => group.ID == id));
            if (user != null)
                return BadRequest("Группа имеет связанные записи");
            _context.OfficeGroup.Remove(group);
            await _context.SaveChangesAsync();
            return Ok();
        }

        // 9) Получение всех ролей
        [HttpGet("roles")]
        public async Task<ActionResult<IEnumerable<OfficeRole>>> GetAllRoles()
        {
            return await _context.OfficeRole
                .ToListAsync();
        }

        // 10) Получение роли по Id
        [HttpGet("roles/{id}")]
        public async Task<ActionResult<OfficeRole>> GetRoleById(int id)
        {
            var role = await _context.OfficeRole
                .FirstOrDefaultAsync(r => r.ID == id);

            if (role == null)
                return NotFound();

            return Ok(role);
        }

        // 11) Создание роли
        [HttpPost("roles")]
        public async Task<ActionResult<OfficeRole>> CreateRole([FromBody] OfficeRole model)
        {
            var role = new OfficeRole
            {
                Name = model.Name,
                Description = model.Description,
                Role = model.Role
            };

            _context.OfficeRole.Add(role);
            await _context.SaveChangesAsync();

            return Ok(role);
        }

        // 12) Изменение роли
        [HttpPut("roles")]
        public async Task<IActionResult> UpdateRole([FromBody] OfficeRole model)
        {
            var role = await _context.OfficeRole
                .FirstOrDefaultAsync(r => r.ID == model.ID);
            if (role == null)
                return NotFound();

            role.Name = model.Name;
            role.Description = model.Description;
            role.Role = model.Role;

            await _context.SaveChangesAsync();
            return Ok(role);
        }

        // 13) Удаление роли (если нет связей)
        [HttpDelete("roles/{id}")]
        public async Task<IActionResult> DeleteRole(int id)
        {
            OfficeRole? role = _context.OfficeRole.FirstOrDefault(r => r.ID == id);
            if (role == null)
                return NotFound();
            var group = _context.OfficeGroup.FirstOrDefault(r => r.OfficeRole.Any(role=> role.ID == id));           
            if (group != null)
                return BadRequest("Роль используется в группах");
            _context.OfficeRole.Remove(role);
            await _context.SaveChangesAsync();
            return Ok();
        }

        public class OfficeGroupModel
        {
            public OfficeGroup OfficeGroup { get; set; } = null!;
            public List<OfficeRole> OfficeRoles { get; set; } = new List<OfficeRole>();
        }

        public class OfficeUserModel
        {
            public OfficeUser OfficeUser { get; set; } = null!;
            public List<Location> Locations { get; set; } = new();
            public List<OfficeGroup> officeGroups { get; set; } = new();
            public List<OfficeBid> officeBids { get; set; } = new List<OfficeBid>();
            public OfficeUserModel(OfficeUser officeUser)
            {
                OfficeUser = officeUser;
            }

        }

        public class OfficeUserUpdateModel
        {
            public int Id { get; set; }
            public string Login { get; set; } = string.Empty;
            public string? Name { get; set; }
            public string? Surname { get; set; }
            public string? Patronymic { get; set; }
            public string? Position { get; set; }
            public int Actual { get; set; }
            public int? FactoryPerson { get; set; }
            public int? OfficePerson { get; set; }
            public List<int> OfficeGroup { get; set; } = new List<int>();
            public List<Guid> Locations { get; set; } = new List<Guid>();
            public int DefaultLocations { get; set; }
        }

        public class AdDirectoryUserModel
        {
            public string Login { get; set; } = string.Empty;
            public string FullName { get; set; } = string.Empty;
            public string? Position { get; set; }
        }

        // DefaultLocations: 0 - Ничего, 1 - Все ТТ.
    }
}
