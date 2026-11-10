using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi.Models;
using Office.Server.Controllers;
using Swashbuckle.AspNetCore.Swagger;
using Xunit;

namespace Office.Server.Tests;

public class SwaggerTests
{
    /// <summary>
    /// /swagger/v1/swagger.json отдаёт 500, если два DTO разных контроллеров называются одинаково:
    /// схема в Swagger именуется по имени класса. Тест строит документ так же, как Program.cs.
    /// </summary>
    [Fact]
    public void Document_BuildsWithoutSchemaConflicts()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddControllers().AddApplicationPart(typeof(CalculatorController).Assembly);
        builder.Services.AddSwaggerGen(options => options.SwaggerDoc("v1", new OpenApiInfo { Title = "Office API", Version = "v1" }));
        using var app = builder.Build();

        var document = app.Services.GetRequiredService<ISwaggerProvider>().GetSwagger("v1");

        Assert.Contains(document.Paths.Keys, path => path.StartsWith("/api/CalculatorPlanning", StringComparison.Ordinal));
    }
}
