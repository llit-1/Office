using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System;
using System.DirectoryServices;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Calculator")]
    public class CalculatorController : ControllerBase
    {
        private readonly RKNETDBContext _rKNETDBContext;
        public CalculatorController(RKNETDBContext rKNETDBContext)
        {
            _rKNETDBContext = rKNETDBContext;
        }

        [HttpGet("ttList")]
        public IActionResult TtList()
        {
            List<Location> locations = _rKNETDBContext.Locations.Where(x => x.Actual == 1 && x.RKCode != null && x.AggregatorsCode != null).ToList();

            return Ok(locations);
        }

        [HttpGet("vipechka")]
        public IActionResult Vipechka(string id)
        {
            return Ok();
        }

    }
}
