using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Office.Server.Security;
using Office.Server.KnowledgeLibrary;
using System.Security.Claims;
using System.Text;

// Windows-1251 и другие "старые" кодовые страницы недоступны в .NET Core без явной регистрации —
// нужны для индексации содержимого legacy .doc/.xls/.rtf в библиотеке знаний. Регистрируем один раз,
// максимально рано, чтобы порядок инициализации статических классов не имел значения.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);
var allowedCorsOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()?
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin.Trim().TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray()
    ?? ["https://localhost:5173"];

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddHttpClient();
builder.Services
    .AddHttpClient("DeliveryMenuApi")
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
    {
        UseProxy = false
    });
builder.Services.AddMemoryCache();

var dataProtectionKeysPath = builder.Configuration["DataProtection:KeysPath"];
if (string.IsNullOrWhiteSpace(dataProtectionKeysPath))
{
    dataProtectionKeysPath = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "DataProtection-Keys");
}
else if (!Path.IsPathRooted(dataProtectionKeysPath))
{
    dataProtectionKeysPath = Path.GetFullPath(dataProtectionKeysPath, builder.Environment.ContentRootPath);
}

Directory.CreateDirectory(dataProtectionKeysPath);
var dataProtection = builder.Services
    .AddDataProtection()
    .SetApplicationName(builder.Configuration["DataProtection:ApplicationName"] ?? "Office.Server")
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath));

if (OperatingSystem.IsWindows())
{
    dataProtection.ProtectKeysWithDpapi(protectToLocalMachine: true);
}

// ========== SWAGGER (ИСПРАВЛЕНО) ==========
builder.Services.AddEndpointsApiExplorer(); // ← ДОБАВИТЬ ЭТУ СТРОКУ!
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Office API",
        Version = "v1",
        Description = "API для приложения Office"
    });
});

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(Office.Server.Global.SecretKey)),
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        NameClaimType = ClaimTypes.Name,
        RoleClaimType = ClaimTypes.Role,
        ClockSkew = TimeSpan.Zero
    };
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            // Native media elements cannot attach an Authorization header.
            // Accept a query JWT only on protected knowledge-library media routes.
            var path = context.HttpContext.Request.Path;
            if (path.StartsWithSegments("/api/KnowledgeLibrary", StringComparison.OrdinalIgnoreCase)
                && (path.Value?.EndsWith("/cover", StringComparison.OrdinalIgnoreCase) == true
                    || path.Value?.EndsWith("/folder-icon", StringComparison.OrdinalIgnoreCase) == true))
            {
                var queryToken = context.Request.Query["access_token"].FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(queryToken))
                    context.Token = queryToken;
            }
            return Task.CompletedTask;
        },
        OnChallenge = context =>
        {
            context.Response.Headers[AuthConstants.AuthChallengeHeaderName] = "1";
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowConfiguredOrigins",
        policy =>
        {
            policy.WithOrigins(allowedCorsOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .WithExposedHeaders(AuthConstants.AuthChallengeHeaderName)
                  .AllowCredentials();
        });
});

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddScoped<AuthTokenService>();
builder.Services.AddSingleton<ClientInfoParser>();
builder.Services.AddScoped<KnowledgeLibrarySchemaInitializer>();
builder.Services.AddScoped<KnowledgeLibraryIndexer>();
builder.Services.AddSingleton<KnowledgeLibraryIndexQueue>();
builder.Services.AddSingleton<KnowledgeLibraryFileTickets>();
builder.Services.AddHostedService<KnowledgeLibraryIndexWorker>();

builder.Services.AddDbContext<Office.Server.DbContexts.RKNETDB.RKNETDBContext>(options =>
{
    options.UseSqlServer(Office.Server.Global.MSSqlConnectionString,
        sqlServerOptionsAction: mssqlOptions =>
        {
            mssqlOptions.EnableRetryOnFailure(maxRetryCount: 10, maxRetryDelay: TimeSpan.FromSeconds(30), errorNumbersToAdd: null);
        });
});

builder.Services.AddDbContext<Office.Server.DbContexts.PowerBi.PowerBiContext>(options =>
{
    options.UseSqlServer(Office.Server.Global.PowerBiMSSqlConnectionString,
        sqlServerOptionsAction: mssqlOptions =>
        {
            mssqlOptions.EnableRetryOnFailure(maxRetryCount: 10, maxRetryDelay: TimeSpan.FromSeconds(30), errorNumbersToAdd: null);
        });
});

var app = builder.Build();

try
{
    await using var knowledgeScope = app.Services.CreateAsyncScope();
    await knowledgeScope.ServiceProvider.GetRequiredService<KnowledgeLibrarySchemaInitializer>().InitializeAsync();
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Knowledge library schema initialization failed. The rest of Office will continue to start.");
}

app.UseCors("AllowConfiguredOrigins");

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    // Swagger ДО static files и fallback!
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Office API V1");
        options.RoutePrefix = "swagger"; // доступ по /swagger
    });
}

app.UseHttpsRedirection();

// The SPA shell and its generated assets must be available before a user has a JWT.
// Otherwise the global fallback authorization policy challenges every JS/CSS request,
// and even the anonymous login page cannot start.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html").AllowAnonymous();

app.Run();
