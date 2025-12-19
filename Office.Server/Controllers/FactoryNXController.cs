using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.IdentityModel.Tokens.Jwt;
using System;
using System.DirectoryServices;
using System.Text;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class FactoryNXController : ControllerBase
    {
        private readonly RKNETDBContext _rKNETDBContext;
        public FactoryNXController(RKNETDBContext rKNETDBContext)
        {
            _rKNETDBContext = rKNETDBContext;
        }

        [HttpGet("getreports")]
        public IActionResult GetReportsGroups()
        {
            var factoryNXBuffer = _rKNETDBContext.FactoryNXBuffer.Where(x => x.Error == 1)
                                                                 .GroupBy(x => x.PersonID)
                                                                 .Select(g => new
                                                                 {
                                                                    PersonID = g.Key,
                                                                    Count = g.Count()
                                                                 })
                                                                 .Where(x => x.Count > 3)
                                                                 .OrderByDescending(x => x.Count)
                                                                 .ToList();



            return Ok(factoryNXBuffer);
        }

        [HttpGet("getuserreport")]
        public IActionResult GetUserReports(int personID)
        {
            var userReports = _rKNETDBContext.FactoryNXBuffer
                .Where(x => x.PersonID == personID)
                .OrderByDescending(x => x.Error)
                .ToList();

            var person = _rKNETDBContext.FactoryPerson
                .FirstOrDefault(x => x.Id == personID);


            var userMainPhoto = person?.Photo;

            var userData = new
            {
                UserReports = userReports,
                UserMainPhoto = userMainPhoto
            };

            return Ok(userData);
        }
    }
}
