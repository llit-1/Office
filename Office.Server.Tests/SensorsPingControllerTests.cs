using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Controllers;
using Office.Server.DbContexts.PowerBi;
using Office.Server.DbContexts.PowerBi.Models;
using Xunit;

namespace Office.Server.Tests;

public class SensorsPingControllerTests
{
    [Fact]
    public async Task StreamRoomPings_IncludesDisabledRoomButOnlyRoomsVisibleToUser()
    {
        await using var db = new PowerBiContext(new DbContextOptionsBuilder<PowerBiContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.SensorRooms.AddRange(
            new SensorRoom { Id = 1, Name = "Доступный", Ip = "invalid-ip", Actual = 0 },
            new SensorRoom { Id = 2, Name = "Чужой", Ip = "invalid-ip", Actual = 1 });
        db.SensorChats.Add(new SensorChat { Id = 10, Name = "Мой чат", Actual = 1 });
        db.SensorChatUsers.Add(new SensorChatUser { ChatId = 10, UserLogin = "viewer" });
        db.SensorChatRooms.Add(new SensorChatRoom { ChatId = 10, RoomId = 1 });
        await db.SaveChangesAsync();

        await using var responseBody = new MemoryStream();
        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.Name, "viewer"), new Claim(ClaimTypes.Role, "SensorsView")], "test"))
        };
        httpContext.Response.Body = responseBody;
        var controller = new SensorsController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext }
        };

        await controller.StreamRoomPings();

        var output = Encoding.UTF8.GetString(responseBody.ToArray());
        Assert.Contains("\"id\":1,\"status\":\"unknown\"", output);
        Assert.DoesNotContain("\"id\":2", output);
        Assert.Equal("application/x-ndjson; charset=utf-8", httpContext.Response.ContentType);
    }
}
