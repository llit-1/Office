using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Stock")]
    public class StockController : ControllerBase
    {
        private readonly RKNETDBContext _context;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IMemoryCache _memoryCache;
        private readonly IConfiguration _configuration;
        private const string ExternalWarehouseTokenCacheKey = "warehouse_api_token";

        public StockController(
            RKNETDBContext context,
            IHttpClientFactory httpClientFactory,
            IMemoryCache memoryCache,
            IConfiguration configuration)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
            _memoryCache = memoryCache;
            _configuration = configuration;
        }

        [HttpGet("external/token")]
        public async Task<IActionResult> GetExternalWarehouseToken([FromQuery] bool forceRefresh = false)
        {
            if (!forceRefresh && _memoryCache.TryGetValue<ExternalTokenCache>(ExternalWarehouseTokenCacheKey, out var cachedToken))
            {
                if (cachedToken != null && cachedToken.ExpiresAtUtc > DateTimeOffset.UtcNow.AddMinutes(1))
                {
                    return Ok(new { token = cachedToken.Token });
                }
            }

            var login = _configuration["WarehouseApi:Login"];
            var password = _configuration["WarehouseApi:Password"];
            var baseUrl = _configuration["WarehouseApi:BaseUrl"] ?? "https://warehouseapi.ludilove.ru/api";

            if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(password))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    message = "Не настроены WarehouseApi:Login/WarehouseApi:Password."
                });
            }

            var client = _httpClientFactory.CreateClient();
            var payload = JsonSerializer.Serialize(new { login, password });
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var response = await client.PostAsync($"{baseUrl.TrimEnd('/')}/Authorization/login", content);
            var rawToken = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                return StatusCode(MapUpstreamStatusCode((int)response.StatusCode), new
                {
                    message = "Не удалось получить токен внешней складской API.",
                    details = rawToken
                });
            }

            var token = rawToken.Trim().Trim('"');
            if (string.IsNullOrWhiteSpace(token))
            {
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    message = "Внешняя складская API вернула пустой токен."
                });
            }

            var tokenCache = new ExternalTokenCache
            {
                Token = token,
                ExpiresAtUtc = DateTimeOffset.UtcNow.AddHours(6)
            };
            _memoryCache.Set(ExternalWarehouseTokenCacheKey, tokenCache, tokenCache.ExpiresAtUtc);

            return Ok(new { token });
        }

        private static int MapUpstreamStatusCode(int statusCode)
        {
            return statusCode is StatusCodes.Status401Unauthorized or StatusCodes.Status403Forbidden
                ? StatusCodes.Status502BadGateway
                : statusCode;
        }

        // Получить все категории (опционально только актуальные)
        [HttpGet("categories")]
        public async Task<ActionResult<IEnumerable<WarehouseCategories>>> GetCategories([FromQuery] int actual = 0)
        {
            var query = _context.WarehouseCategories.AsNoTracking();

            if (actual == 1)
            {
                query = query.Where(x => x.Actual == 1);
            }

            return await query.ToListAsync();
        }

        // Получить категорию по ID
        [HttpGet("categories/{id:int}")]
        public async Task<IActionResult> GetCategory(int id)
        {
            var category = await _context.WarehouseCategories.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            return Ok(category);
        }

        // Получить подкатегории
        [HttpGet("categories/{id:int}/children")]
        public async Task<ActionResult<IEnumerable<WarehouseCategories>>> GetChildCategories(int id)
        {
            var children = await _context.WarehouseCategories.AsNoTracking()
                .Where(x => x.Parent == id)
                .ToListAsync();

            return Ok(children);
        }

        // Создать категорию (JSON)
        [HttpPost("categories")]
        public async Task<IActionResult> CreateCategory([FromBody] CategoryUpsertDto category)
        {
            if (string.IsNullOrWhiteSpace(category.Name))
            {
                return BadRequest(new { message = "Название категории обязательно" });
            }

            var entity = new WarehouseCategories
            {
                Name = category.Name.Trim(),
                Parent = category.Parent,
                Actual = category.Actual ?? 1,
                Img = category.Img
            };

            _context.WarehouseCategories.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new { id = entity.Id, message = "Категория создана успешно" });
        }

        // Создать категорию (multipart/form-data) — для загрузки картинки
        [HttpPost("categories/form")]
        public async Task<IActionResult> CreateCategoryForm([FromForm] CategoryFormDto category)
        {
            if (string.IsNullOrWhiteSpace(category.Name) || string.IsNullOrWhiteSpace(category.Actual))
            {
                return BadRequest(new { message = "Обязательные поля не заполнены" });
            }

            if (!int.TryParse(category.Actual, out var actualValue))
            {
                return BadRequest(new { message = "Некорректное значение Actual" });
            }

            var entity = new WarehouseCategories
            {
                Name = category.Name.Trim(),
                Parent = category.Parent,
                Actual = actualValue
            };

            if (category.Img != null)
            {
                using var memoryStream = new MemoryStream();
                await category.Img.CopyToAsync(memoryStream);
                entity.Img = memoryStream.ToArray();
            }

            _context.WarehouseCategories.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new { id = entity.Id, message = "Категория создана успешно" });
        }

        // Обновить категорию (JSON)
        [HttpPut("categories/{id:int}")]
        public async Task<IActionResult> UpdateCategory(int id, [FromBody] CategoryUpsertDto categoryData)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            if (string.IsNullOrWhiteSpace(categoryData.Name))
            {
                return BadRequest(new { message = "Название категории обязательно" });
            }

            category.Name = categoryData.Name.Trim();
            category.Parent = categoryData.Parent;
            category.Actual = categoryData.Actual ?? category.Actual;

            if (categoryData.Img != null)
            {
                category.Img = categoryData.Img;
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Категория обновлена успешно" });
        }

        // Обновить категорию (multipart/form-data)
        [HttpPatch("categories/{id:int}/form")]
        public async Task<IActionResult> UpdateCategoryForm(int id, [FromForm] CategoryFormDto categoryData)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            if (string.IsNullOrWhiteSpace(categoryData.Name) || string.IsNullOrWhiteSpace(categoryData.Actual))
            {
                return BadRequest(new { message = "Обязательные поля не заполнены" });
            }

            if (!int.TryParse(categoryData.Actual, out var actualValue))
            {
                return BadRequest(new { message = "Некорректное значение Actual" });
            }

            category.Name = categoryData.Name.Trim();
            category.Parent = categoryData.Parent;
            category.Actual = actualValue;

            if (categoryData.Img != null)
            {
                using var memoryStream = new MemoryStream();
                await categoryData.Img.CopyToAsync(memoryStream);
                category.Img = memoryStream.ToArray();
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Категория обновлена успешно" });
        }

        // Удалить категорию
        [HttpDelete("categories/{id:int}")]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            _context.WarehouseCategories.Remove(category);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Категория удалена успешно" });
        }

        // Переключить статус Actual
        [HttpPatch("categories/{id:int}/toggle-actual")]
        public async Task<IActionResult> ToggleActual(int id)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            category.Actual = category.Actual == 1 ? 0 : 1;
            await _context.SaveChangesAsync();

            return Ok(new { actual = category.Actual, message = "Статус обновлен" });
        }

        // Поиск категорий
        [HttpGet("search")]
        public async Task<IActionResult> SearchCategories([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return BadRequest(new { message = "Параметр поиска обязателен" });
            }

            var q = query.Trim();
            var results = await _context.WarehouseCategories.AsNoTracking()
                .Where(x => x.Name != null && x.Name.Contains(q))
                .ToListAsync();

            if (results.Count == 0)
            {
                return Ok(new { message = "Результаты не найдены", data = new List<WarehouseCategories>() });
            }

            return Ok(results);
        }

        // Поиск для выпадающего списка: возвращает [id, "Путь / К / Категории"]
        [HttpGet("search-items")]
        public async Task<IActionResult> SearchItems([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return BadRequest(new { message = "Параметр поиска обязателен" });
            }

            var allCategories = await _context.WarehouseCategories.AsNoTracking().ToListAsync();
            var dict = allCategories.Where(x => x.Id.HasValue)
                .ToDictionary(x => x.Id!.Value, x => x);

            var results = allCategories
                .Where(x => !string.IsNullOrWhiteSpace(x.Name) && x.Name.Contains(query.Trim(), System.StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (results.Count == 0)
            {
                return Ok(new { message = "Результаты не найдены" });
            }

            var items = new List<CategorySearchItem>();

            foreach (var category in results)
            {
                var path = BuildCategoryPath(category, dict, out var rootId);
                items.Add(new CategorySearchItem { Id = rootId, Text = path });
            }

            return Ok(items);
        }

        // Данные для страницы поиска склада
        [HttpGet("search-data")]
        public async Task<ActionResult<DataStockSearch>> GetSearchData()
        {
            var holders = await _context.WarehouseHolders.AsNoTracking().ToListAsync();
            var locations = await _context.Locations.AsNoTracking().OrderBy(x => x.Name).ToListAsync();
            var mainCategories = await _context.WarehouseCategories.AsNoTracking()
                .Where(x => x.Parent == null)
                .ToListAsync();
            var categories = await _context.WarehouseCategories.AsNoTracking()
                .Select(x => new CategoryLookupItem
                {
                    Id = x.Id,
                    Name = x.Name,
                    Parent = x.Parent,
                    Actual = x.Actual
                })
                .ToListAsync();

            return new DataStockSearch
            {
                Holders = holders,
                Locations = locations,
                MainCategories = mainCategories,
                Categories = categories
            };
        }

        // Дерево категорий (как StockTable в MVC)
        [HttpGet("categories/{id:int}/tree")]
        public async Task<ActionResult<CategoriesHierarchyWithCategoryID>> GetCategoryTree(int id)
        {
            var allCategories = await _context.WarehouseCategories.AsNoTracking().ToListAsync();
            var dict = allCategories.Where(x => x.Id.HasValue)
                .ToDictionary(x => x.Id!.Value, x => x);

            var children = allCategories.Where(x => x.Parent == id).ToList();

            var tree = new List<CategoriesHierarchy>();
            foreach (var child in children)
            {
                tree.Add(BuildTree(child, dict));
            }

            return new CategoriesHierarchyWithCategoryID
            {
                CategoryID = id,
                Categories = tree
            };
        }

        private static CategoriesHierarchy BuildTree(WarehouseCategories category, Dictionary<int, WarehouseCategories> all)
        {
            var node = new CategoriesHierarchy
            {
                Id = category.Id ?? 0,
                Name = category.Name ?? string.Empty,
                Actual = category.Actual
            };

            if (category.Id.HasValue)
            {
                var children = all.Values.Where(x => x.Parent == category.Id).ToList();
                foreach (var child in children)
                {
                    node.Categories.Add(BuildTree(child, all));
                }
            }

            return node;
        }

        private static string BuildCategoryPath(WarehouseCategories category, Dictionary<int, WarehouseCategories> all, out int rootId)
        {
            var names = new List<string>();
            var current = category;
            var guard = 0;
            rootId = current.Id ?? 0;

            while (current != null && guard++ < 100)
            {
                if (!string.IsNullOrWhiteSpace(current.Name))
                {
                    names.Add(current.Name);
                }

                if (current.Parent == null || !all.TryGetValue(current.Parent.Value, out var parent))
                {
                    if (current.Id.HasValue)
                    {
                        rootId = current.Id.Value;
                    }
                    break;
                }

                current = parent;
            }

            names.Reverse();
            return string.Join(" / ", names);
        }

        public class CategoryUpsertDto
        {
            public string Name { get; set; } = string.Empty;
            public int? Parent { get; set; }
            public int? Actual { get; set; }
            public byte[]? Img { get; set; }
        }

        public class CategoryFormDto
        {
            public string Name { get; set; } = string.Empty;
            public int? Parent { get; set; }
            public string? Actual { get; set; }
            public IFormFile? Img { get; set; }
        }

        public class DataStockSearch
        {
            public List<WarehouseHolder> Holders { get; set; } = new();
            public List<Location> Locations { get; set; } = new();
            public List<WarehouseCategories> MainCategories { get; set; } = new();
            public List<CategoryLookupItem> Categories { get; set; } = new();
        }

        public class CategoryLookupItem
        {
            public int? Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public int? Parent { get; set; }
            public int Actual { get; set; }
        }

        public class CategoriesHierarchyWithCategoryID
        {
            public int CategoryID { get; set; }
            public List<CategoriesHierarchy> Categories { get; set; } = new();
        }

        public class CategoriesHierarchy
        {
            public int Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public List<CategoriesHierarchy> Categories { get; set; } = new();
            public int Actual { get; set; }
        }

        public class CategorySearchItem
        {
            public int Id { get; set; }
            public string Text { get; set; } = string.Empty;
        }

        private class ExternalTokenCache
        {
            public string Token { get; set; } = string.Empty;
            public DateTimeOffset ExpiresAtUtc { get; set; }
        }
    }
}


