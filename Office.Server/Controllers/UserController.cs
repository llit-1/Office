using Microsoft.AspNetCore.Authorization;
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
        private readonly RKNETDBContext _rKNETDBContext;
        public UserController(RKNETDBContext rKNETDBContext)
        {
            _rKNETDBContext = rKNETDBContext;
        }
        [HttpPost("SetUser")]
        public IActionResult SetUser(OfficeUser userModel)
        {
            _rKNETDBContext.OfficeUser.Add(userModel);
            _rKNETDBContext.SaveChanges();
            return Ok();
        }

        [HttpPost("SetGroup")]
        [Authorize]
        public IActionResult SetGroup(OfficeGroup groupModel)
        {
            if (groupModel is null)
            {
                return BadRequest(new { message = "groupModel is null" });
            }
            if (groupModel.ID != 0)
            {
                return BadRequest(new { message = "Для изменения существующей группы используйте запрос PUT" });
            }
            List<int> roles = groupModel.OfficeRole.Select(x => x.ID).ToList();
            List<OfficeRole> officeRoles = _rKNETDBContext.OfficeRole.Where(x => roles.Contains(x.ID)).ToList();
            groupModel.OfficeRole = officeRoles;
            _rKNETDBContext.OfficeGroup.Add(groupModel);
            _rKNETDBContext.SaveChanges();
            return Ok();
        }


        [HttpPut("UpdateGroup")]
        // [Authorize]
        public IActionResult UpdateGroup(OfficeGroup groupModel)
        {
            if (groupModel is null)
            {
                return BadRequest(new { message = "groupModel is null" });
            }
            if (groupModel.ID == 0)
            {
                return BadRequest(new { message = "Для создания новой группы используйте запрос Post" });
            }
            OfficeGroup officeGroup = _rKNETDBContext.OfficeGroup
                                      .Include(x => x.OfficeRole)
                                      .FirstOrDefault(x => x.ID == groupModel.ID);
            if (officeGroup is null)
            {
                return BadRequest(new { message = "Группа отсутствует в БД" });
            }
            List<int> roles = groupModel.OfficeRole.Select(x => x.ID).ToList();
            List<OfficeRole> officeRoles = _rKNETDBContext.OfficeRole.Where(x => roles.Contains(x.ID)).ToList();
            groupModel.OfficeRole = officeRoles;
            officeGroup = groupModel;
            _rKNETDBContext.SaveChanges();
            return Ok();
        }

        [HttpGet("GetAllUsers")]
        [Authorize]
        public IActionResult GetAllUsers()
        {
            List<OfficeUser> officeUsers = _rKNETDBContext.OfficeUser.ToList();
            return Ok(officeUsers);
        }




        [HttpPost("SetRole")]
        public IActionResult SetRole(OfficeRole roleModel)
        {
            _rKNETDBContext.OfficeRole.Add(roleModel);
            _rKNETDBContext.SaveChanges();
            return Ok();
        }


    }

}
