using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Text;
using System.Text.Json;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "MenuMarketing,Menu,MenuAdmin")]
    public class DeliveryMenuController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<DeliveryMenuController> _logger;

        public DeliveryMenuController(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<DeliveryMenuController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        private string ApiBaseUrl => (_configuration["DeliveryMenuApi:BaseUrl"]
            ?? "https://yeapi.ludilove.ru/itemmanager").TrimEnd('/');

        [HttpGet("groups")]
        public Task<IActionResult> GetGroups(CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Get, "getallgroups", null, "[]", cancellationToken);

        [HttpGet("source-menu")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> GetSourceMenu(CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Get, "getmenu", null, "{\"categories\":[]}", cancellationToken);

        [HttpGet("groups/{groupId:int}/items")]
        public Task<IActionResult> GetGroupItems(int groupId, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Get, $"groups/{groupId}/items", null, "[]", cancellationToken);

        [HttpGet("items/{id:int}")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> GetItem(int id, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Get, $"item/{id}", null, null, cancellationToken);

        [HttpPost("groups")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> CreateGroup([FromBody] JsonElement body, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Post, "group", body, null, cancellationToken);

        [HttpPut("groups/{id:int}")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> UpdateGroup(int id, [FromBody] JsonElement body, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Put, $"group/{id}", body, null, cancellationToken);

        [HttpDelete("groups/{id:int}")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> DeleteGroup(int id, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Put, $"groups/{id}", null, null, cancellationToken);

        [HttpPost("items")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> CreateItem([FromBody] JsonElement body, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Post, "item", body, null, cancellationToken);

        [HttpPut("items/{id:int}")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> UpdateItem(int id, [FromBody] JsonElement body, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Put, $"items/{id}", body, null, cancellationToken);

        [HttpPatch("items/{id:int}/actual")]
        [Authorize(Roles = "MenuMarketing,MenuAdmin")]
        public Task<IActionResult> SetItemActual(int id, [FromBody] SetActualRequest body, CancellationToken cancellationToken) =>
            ForwardAsync(HttpMethod.Put, $"items/{id}/{(body.Actual ? "actual" : "unactual")}", null, null, cancellationToken);

        private async Task<IActionResult> ForwardAsync(
            HttpMethod method,
            string relativeUrl,
            JsonElement? body,
            string? notFoundFallbackJson,
            CancellationToken cancellationToken)
        {
            try
            {
                var client = _httpClientFactory.CreateClient("DeliveryMenuApi");
                using var request = new HttpRequestMessage(method, $"{ApiBaseUrl}/{relativeUrl.TrimStart('/')}");

                if (body.HasValue)
                {
                    request.Content = new StringContent(body.Value.GetRawText(), Encoding.UTF8, "application/json");
                }

                using var response = await client.SendAsync(request, cancellationToken);
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

                if (response.StatusCode == HttpStatusCode.NotFound && notFoundFallbackJson != null)
                {
                    return Content(notFoundFallbackJson, "application/json", Encoding.UTF8);
                }

                var statusCode = MapUpstreamStatusCode((int)response.StatusCode);
                if (statusCode == StatusCodes.Status204NoContent)
                {
                    return NoContent();
                }

                if (statusCode == StatusCodes.Status502BadGateway)
                {
                    _logger.LogWarning(
                        "Delivery menu API returned {StatusCode} for {Method} {RelativeUrl}",
                        (int)response.StatusCode,
                        method,
                        relativeUrl);

                    return StatusCode(statusCode, new
                    {
                        message = "Сервис меню доставки временно недоступен."
                    });
                }

                var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";
                return new ContentResult
                {
                    StatusCode = statusCode,
                    Content = responseBody,
                    ContentType = contentType
                };
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return StatusCode(StatusCodes.Status504GatewayTimeout, new
                {
                    message = "Сервис меню доставки не ответил вовремя."
                });
            }
            catch (HttpRequestException exception)
            {
                _logger.LogError(exception, "Could not connect to delivery menu API");
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    message = "Не удалось подключиться к сервису меню доставки."
                });
            }
        }

        private static int MapUpstreamStatusCode(int statusCode)
        {
            if (statusCode is StatusCodes.Status401Unauthorized or StatusCodes.Status403Forbidden || statusCode >= 500)
            {
                return StatusCodes.Status502BadGateway;
            }

            return statusCode;
        }

        public sealed class SetActualRequest
        {
            public bool Actual { get; set; }
        }
    }
}
