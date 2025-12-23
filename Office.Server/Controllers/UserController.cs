using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
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

        // 2) Получение пользователя по Id (развёрнуто)
        [HttpGet("users/{id}")]
        public async Task<ActionResult<OfficeUser>> GetUserById(int id)
        {
            var user = await _context.OfficeUser
                .Include(u => u.OfficeGroup)
                    .ThenInclude(g => g.OfficeRole)
                .FirstOrDefaultAsync(u => u.Id == id);
            if (user == null)
                return NotFound();

            return user;
        }

        // 3) Изменение пользователя
        [HttpPut("users")]
        public async Task<IActionResult> UpdateUser([FromBody] OfficeUser model)
        {
            var user = await _context.OfficeUser
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
            user.OfficeGroup.Clear();
            if (model.OfficeGroup != null)
            {
                foreach (var group in model.OfficeGroup)
                {
                    var dbGroup = await _context.OfficeGroup.FindAsync(group.ID);
                    if (dbGroup != null)
                        user.OfficeGroup.Add(dbGroup);
                }
            }

            await _context.SaveChangesAsync();
            return Ok(user);
        }

        // 4) Получение всех групп
        [HttpGet("groups")]
        public async Task<ActionResult<IEnumerable<OfficeGroup>>> GetAllGroups()
        {
            return await _context.OfficeGroup.ToListAsync();
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
            return group;
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
                .Include(g => g.OfficeUser)
                .Include(g => g.OfficeRole)
                .FirstOrDefaultAsync(g => g.ID == id);

            if (group == null)
                return NotFound();

            if (group.OfficeUser.Any() || group.OfficeRole.Any())
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
                .Include(r => r.OfficeGroup)
                .ToListAsync();
        }

        // 10) Получение роли по Id
        [HttpGet("roles/{id}")]
        public async Task<ActionResult<OfficeRole>> GetRoleById(int id)
        {
            var role = await _context.OfficeRole
                .Include(r => r.OfficeGroup)
                .FirstOrDefaultAsync(r => r.ID == id);

            if (role == null)
                return NotFound();

            return role;
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
            var role = await _context.OfficeRole
                .Include(r => r.OfficeGroup)
                .FirstOrDefaultAsync(r => r.ID == id);

            if (role == null)
                return NotFound();

            if (role.OfficeGroup.Any())
                return BadRequest("Роль используется в группах");

            _context.OfficeRole.Remove(role);
            await _context.SaveChangesAsync();
            return Ok();
        }
    }
}
