using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.PowerBi;
using Office.Server.DbContexts.PowerBi.Models;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Sensors")]
    public class SensorsController : ControllerBase
    {
        private static readonly HashSet<string> AllowedScheduleTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "daily",
            "weekly",
            "one_time",
        };

        private const string SensorRulesSchemaMessage =
            "Не найдены таблицы правил датчиков. Выполните скрипт Office.Server/Sql/SensorRulesSchema.sql в базе POWER_BI.";

        private const string SensorChatsSchemaMessage =
            "Не найдены таблицы чатов датчиков. Выполните скрипт Office.Server/Sql/SensorRulesSchema.sql в базе POWER_BI.";

        private readonly PowerBiContext _powerBiContext;

        public SensorsController(PowerBiContext powerBiContext)
        {
            _powerBiContext = powerBiContext;
        }

        public class SaveSensorRoomRequest
        {
            public string? Name { get; set; }
            public string? Ip { get; set; }
            public int? Actual { get; set; }
        }

        public class SaveSensorAlertSettingsRequest
        {
            public decimal? MinTemperature { get; set; }
            public decimal? MaxTemperature { get; set; }
            public int ViolationDelayMinutes { get; set; }
            public int RepeatDelayMinutes { get; set; }
            public int RecoveryDelayMinutes { get; set; }
            public bool IsEnabled { get; set; }
        }

        public class SaveSensorMaintenanceWindowRequest
        {
            public string? Name { get; set; }
            public string? ScheduleType { get; set; }
            public int? DaysOfWeekMask { get; set; }
            public TimeSpan? StartTime { get; set; }
            public TimeSpan? EndTime { get; set; }
            public DateTime? StartDate { get; set; }
            public DateTime? EndDate { get; set; }
            public bool IsEnabled { get; set; }
        }

        public class SaveSensorChatRequest
        {
            public string? Name { get; set; }
            public List<int>? RoomIds { get; set; }
            public List<string>? UserLogins { get; set; }
            public Dictionary<string, string>? UserDisplayNames { get; set; }
        }

        [HttpGet("rooms")]
        public async Task<IActionResult> GetRooms()
        {
            var settingsRoomIds = await _powerBiContext.SensorAlertSettings
                .AsNoTracking()
                .Select(x => x.RoomId)
                .ToListAsync();
            var settingsRoomIdSet = settingsRoomIds.ToHashSet();

            var rooms = await _powerBiContext.SensorRooms
                .AsNoTracking()
                .OrderBy(x => x.Name)
                .ToListAsync();

            return Ok(rooms.Select(x => new
            {
                id = x.Id,
                name = x.Name,
                ip = x.Ip,
                temp = x.Temp,
                actual = x.Actual,
                state = x.State,
                hasAlertSettings = settingsRoomIdSet.Contains(x.Id)
            }));
        }

        [HttpGet("{roomId:int}/history")]
        public async Task<IActionResult> GetRoomHistory(int roomId, [FromQuery] int hours = 24)
        {
            var normalizedHours = hours switch
            {
                24 => 24,
                72 => 72,
                168 => 168,
                720 => 720,
                _ => 24
            };

            var fromDate = DateTime.Now.AddHours(-normalizedHours);

            var points = await _powerBiContext.SensorData
                .AsNoTracking()
                .Where(x => x.RoomId == roomId && x.Date >= fromDate)
                .OrderBy(x => x.Date)
                .Select(x => new
                {
                    id = x.Id,
                    roomId = x.RoomId,
                    roomName = x.RoomName,
                    temperature = x.Temperature,
                    humidity = x.Humidity,
                    date = x.Date
                })
                .ToListAsync();

            return Ok(points);
        }

        [HttpGet("rules")]
        public async Task<IActionResult> GetRules()
        {
            try
            {
                var rooms = await _powerBiContext.SensorRooms
                    .AsNoTracking()
                    .Select(x => new
                    {
                        x.Id,
                        x.Name,
                        x.Ip
                    })
                    .ToListAsync();

                var settings = await _powerBiContext.SensorAlertSettings
                    .AsNoTracking()
                    .ToListAsync();

                var windows = await _powerBiContext.SensorMaintenanceWindows
                    .AsNoTracking()
                    .OrderBy(x => x.Name)
                    .ThenBy(x => x.StartTime)
                    .ToListAsync();

                var roomMap = rooms.ToDictionary(x => x.Id);
                var settingsByRoomId = settings.ToDictionary(x => x.RoomId);
                var windowsByRoomId = windows
                    .GroupBy(x => x.RoomId)
                    .ToDictionary(x => x.Key, x => x.ToList());

                var roomIds = settingsByRoomId.Keys
                    .Union(windowsByRoomId.Keys)
                    .OrderBy(x => x)
                    .ToList();

                var result = roomIds
                    .Where(roomMap.ContainsKey)
                    .Select(roomId =>
                    {
                        var room = roomMap[roomId];
                        var hasSettings = settingsByRoomId.TryGetValue(roomId, out var setting);
                        var roomWindows = windowsByRoomId.TryGetValue(roomId, out var roomWindowsValue)
                            ? roomWindowsValue
                            : new List<SensorMaintenanceWindow>();
                        var firstWindow = roomWindows.FirstOrDefault();

                        return new
                        {
                            id = roomId,
                            roomId,
                            sensorName = room.Name,
                            ip = room.Ip,
                            hasSettings,
                            minTemperature = setting?.MinTemperature,
                            maxTemperature = setting?.MaxTemperature,
                            violationDelayMinutes = setting?.ViolationDelayMinutes,
                            repeatDelayMinutes = setting?.RepeatDelayMinutes,
                            recoveryDelayMinutes = setting?.RecoveryDelayMinutes,
                            isEnabled = setting?.IsEnabled ?? true,
                            maintenanceWindowsCount = roomWindows.Count,
                            maintenanceSummary = firstWindow == null ? null : MapMaintenanceSummary(firstWindow),
                            hasMaintenanceWindows = roomWindows.Count > 0
                        };
                    })
                    .ToList();

                return Ok(result);
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return Ok(Array.Empty<object>());
            }
        }

        [HttpGet("{roomId:int}/settings")]
        public async Task<IActionResult> GetRoomSettings(int roomId)
        {
            var roomExists = await _powerBiContext.SensorRooms.AsNoTracking().AnyAsync(x => x.Id == roomId);
            if (!roomExists)
            {
                return NotFound(new { message = "Датчик не найден." });
            }

            try
            {
                var settings = await _powerBiContext.SensorAlertSettings
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.RoomId == roomId);

                if (settings == null)
                {
                    return Ok(new
                    {
                        roomId,
                        minTemperature = (decimal?)null,
                        maxTemperature = (decimal?)null,
                        violationDelayMinutes = 15,
                        repeatDelayMinutes = 60,
                        recoveryDelayMinutes = 5,
                        isEnabled = true,
                        schemaMissing = false
                    });
                }

                return Ok(MapAlertSettings(settings));
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return Ok(new
                {
                    roomId,
                    minTemperature = (decimal?)null,
                    maxTemperature = (decimal?)null,
                    violationDelayMinutes = 15,
                    repeatDelayMinutes = 60,
                    recoveryDelayMinutes = 5,
                    isEnabled = true,
                    schemaMissing = true,
                    schemaMessage = SensorRulesSchemaMessage
                });
            }
        }

        [HttpPut("{roomId:int}/settings")]
        public async Task<IActionResult> SaveRoomSettings(int roomId, [FromBody] SaveSensorAlertSettingsRequest request)
        {
            var roomExists = await _powerBiContext.SensorRooms.AsNoTracking().AnyAsync(x => x.Id == roomId);
            if (!roomExists)
            {
                return NotFound(new { message = "Датчик не найден." });
            }

            var validationError = ValidateAlertSettingsRequest(request);
            if (validationError != null)
            {
                return validationError;
            }

            SensorAlertSetting? settings;
            try
            {
                settings = await _powerBiContext.SensorAlertSettings.FirstOrDefaultAsync(x => x.RoomId == roomId);
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            if (settings == null)
            {
                settings = new SensorAlertSetting
                {
                    RoomId = roomId
                };
                _powerBiContext.SensorAlertSettings.Add(settings);
            }

            settings.MinTemperature = request.MinTemperature;
            settings.MaxTemperature = request.MaxTemperature;
            settings.ViolationDelayMinutes = request.ViolationDelayMinutes;
            settings.RepeatDelayMinutes = request.RepeatDelayMinutes;
            settings.RecoveryDelayMinutes = request.RecoveryDelayMinutes;
            settings.IsEnabled = request.IsEnabled;

            try
            {
                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            return Ok(MapAlertSettings(settings));
        }

        [HttpDelete("{roomId:int}/settings")]
        public async Task<IActionResult> DeleteRoomSettings(int roomId)
        {
            var roomExists = await _powerBiContext.SensorRooms.AsNoTracking().AnyAsync(x => x.Id == roomId);
            if (!roomExists)
            {
                return NotFound(new { message = "Датчик не найден." });
            }

            try
            {
                var settings = await _powerBiContext.SensorAlertSettings.FirstOrDefaultAsync(x => x.RoomId == roomId);
                var maintenanceWindows = await _powerBiContext.SensorMaintenanceWindows
                    .Where(x => x.RoomId == roomId)
                    .ToListAsync();

                if (settings == null && maintenanceWindows.Count == 0)
                {
                    return NotFound(new { message = "Правило для этого датчика не найдено." });
                }

                if (maintenanceWindows.Count > 0)
                {
                    _powerBiContext.SensorMaintenanceWindows.RemoveRange(maintenanceWindows);
                }

                if (settings != null)
                {
                    _powerBiContext.SensorAlertSettings.Remove(settings);
                }

                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            return NoContent();
        }

        [HttpGet("{roomId:int}/maintenance-windows")]
        public async Task<IActionResult> GetMaintenanceWindows(int roomId)
        {
            var roomExists = await _powerBiContext.SensorRooms.AsNoTracking().AnyAsync(x => x.Id == roomId);
            if (!roomExists)
            {
                return NotFound(new { message = "Датчик не найден." });
            }

            try
            {
                var windows = await _powerBiContext.SensorMaintenanceWindows
                    .AsNoTracking()
                    .Where(x => x.RoomId == roomId)
                    .OrderBy(x => x.Name)
                    .ThenBy(x => x.StartTime)
                    .ToListAsync();

                return Ok(windows.Select(MapMaintenanceWindow));
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return Ok(Array.Empty<object>());
            }
        }

        [HttpPost("{roomId:int}/maintenance-windows")]
        public async Task<IActionResult> CreateMaintenanceWindow(int roomId, [FromBody] SaveSensorMaintenanceWindowRequest request)
        {
            var roomExists = await _powerBiContext.SensorRooms.AsNoTracking().AnyAsync(x => x.Id == roomId);
            if (!roomExists)
            {
                return NotFound(new { message = "Датчик не найден." });
            }

            var validationError = ValidateMaintenanceWindowRequest(request);
            if (validationError != null)
            {
                return validationError;
            }

            var window = new SensorMaintenanceWindow
            {
                RoomId = roomId,
                Name = request.Name!.Trim(),
                ScheduleType = NormalizeScheduleType(request.ScheduleType!),
                DaysOfWeekMask = request.DaysOfWeekMask,
                StartTime = request.StartTime!.Value,
                EndTime = request.EndTime!.Value,
                StartDate = request.StartDate?.Date,
                EndDate = request.EndDate?.Date,
                IsEnabled = request.IsEnabled
            };

            _powerBiContext.SensorMaintenanceWindows.Add(window);

            try
            {
                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            return Ok(MapMaintenanceWindow(window));
        }

        [HttpPut("maintenance-windows/{windowId:int}")]
        public async Task<IActionResult> UpdateMaintenanceWindow(int windowId, [FromBody] SaveSensorMaintenanceWindowRequest request)
        {
            SensorMaintenanceWindow? window;
            try
            {
                window = await _powerBiContext.SensorMaintenanceWindows.FirstOrDefaultAsync(x => x.Id == windowId);
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            if (window == null)
            {
                return NotFound(new { message = "Окно техработ не найдено." });
            }

            var validationError = ValidateMaintenanceWindowRequest(request);
            if (validationError != null)
            {
                return validationError;
            }

            window.Name = request.Name!.Trim();
            window.ScheduleType = NormalizeScheduleType(request.ScheduleType!);
            window.DaysOfWeekMask = request.DaysOfWeekMask;
            window.StartTime = request.StartTime!.Value;
            window.EndTime = request.EndTime!.Value;
            window.StartDate = request.StartDate?.Date;
            window.EndDate = request.EndDate?.Date;
            window.IsEnabled = request.IsEnabled;

            try
            {
                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            return Ok(MapMaintenanceWindow(window));
        }

        [HttpDelete("maintenance-windows/{windowId:int}")]
        public async Task<IActionResult> DeleteMaintenanceWindow(int windowId)
        {
            SensorMaintenanceWindow? window;
            try
            {
                window = await _powerBiContext.SensorMaintenanceWindows.FirstOrDefaultAsync(x => x.Id == windowId);
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            if (window == null)
            {
                return NotFound(new { message = "Окно техработ не найдено." });
            }

            _powerBiContext.SensorMaintenanceWindows.Remove(window);

            try
            {
                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorRulesSchemaMessage });
            }

            return NoContent();
        }

        [HttpGet("chats")]
        public async Task<IActionResult> GetChats()
        {
            try
            {
                var chats = await _powerBiContext.SensorChats
                    .AsNoTracking()
                    .Where(x => x.Actual == 1)
                    .OrderBy(x => x.Name)
                    .ToListAsync();

                var chatRooms = await _powerBiContext.SensorChatRooms
                    .AsNoTracking()
                    .ToListAsync();

                var chatUsers = await _powerBiContext.SensorChatUsers
                    .AsNoTracking()
                    .ToListAsync();

                var roomNames = await _powerBiContext.SensorRooms
                    .AsNoTracking()
                    .Select(x => new { x.Id, x.Name })
                    .ToDictionaryAsync(x => x.Id, x => x.Name);

                var result = chats.Select(chat =>
                {
                    var roomIds = chatRooms
                        .Where(x => x.ChatId == chat.Id)
                        .Select(x => x.RoomId)
                        .Distinct()
                        .ToList();

                    var visibleRoomNames = roomIds
                        .Where(roomNames.ContainsKey)
                        .Select(roomId => roomNames[roomId])
                        .OrderBy(name => name)
                        .ToList();

                    var userCount = chatUsers
                        .Where(x => x.ChatId == chat.Id)
                        .Select(x => x.UserLogin)
                        .Distinct()
                        .Count();

                    return new
                    {
                        id = chat.Id,
                        name = chat.Name,
                        sensorsCount = roomIds.Count,
                        usersCount = userCount,
                        sensorsSummary = visibleRoomNames.Count == 0 ? null : string.Join(", ", visibleRoomNames.Take(3)),
                        hasMoreSensors = visibleRoomNames.Count > 3
                    };
                });

                return Ok(result);
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return Ok(Array.Empty<object>());
            }
        }

        [HttpGet("chats/{chatId:int}")]
        public async Task<IActionResult> GetChatById(int chatId)
        {
            try
            {
                var chat = await _powerBiContext.SensorChats
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == chatId && x.Actual == 1);

                if (chat == null)
                {
                    return NotFound(new { message = "Чат не найден." });
                }

                var roomIds = await _powerBiContext.SensorChatRooms
                    .AsNoTracking()
                    .Where(x => x.ChatId == chatId)
                    .Select(x => x.RoomId)
                    .ToListAsync();

                var userIds = await _powerBiContext.SensorChatUsers
                    .AsNoTracking()
                    .Where(x => x.ChatId == chatId)
                    .Select(x => x.UserLogin)
                    .ToListAsync();

                return Ok(new
                {
                    id = chat.Id,
                    name = chat.Name,
                    roomIds,
                    userLogins = userIds
                });
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorChatsSchemaMessage });
            }
        }

        [HttpPost("chats")]
        public async Task<IActionResult> CreateChat([FromBody] SaveSensorChatRequest request)
        {
            var validationError = await ValidateSensorChatRequest(request);
            if (validationError != null)
            {
                return validationError;
            }

            var roomIds = request.RoomIds!.Where(x => x > 0).Distinct().ToList();
            var userLogins = request.UserLogins!
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var chat = new SensorChat
            {
                Name = request.Name!.Trim(),
                Actual = 1
            };

            _powerBiContext.SensorChats.Add(chat);

            try
            {
                await _powerBiContext.SaveChangesAsync();

                _powerBiContext.SensorChatRooms.AddRange(roomIds.Select(roomId => new SensorChatRoom
                {
                    ChatId = chat.Id,
                    RoomId = roomId
                }));

                _powerBiContext.SensorChatUsers.AddRange(userLogins.Select(userLogin => new SensorChatUser
                {
                    ChatId = chat.Id,
                    UserLogin = userLogin,
                    DisplayName = request.UserDisplayNames?.GetValueOrDefault(userLogin)
                }));

                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorChatsSchemaMessage });
            }

            return Ok(new
            {
                id = chat.Id,
                name = chat.Name,
                roomIds,
                userLogins
            });
        }

        [HttpPut("chats/{chatId:int}")]
        public async Task<IActionResult> UpdateChat(int chatId, [FromBody] SaveSensorChatRequest request)
        {
            var validationError = await ValidateSensorChatRequest(request);
            if (validationError != null)
            {
                return validationError;
            }

            SensorChat? chat;
            try
            {
                chat = await _powerBiContext.SensorChats.FirstOrDefaultAsync(x => x.Id == chatId && x.Actual == 1);
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorChatsSchemaMessage });
            }

            if (chat == null)
            {
                return NotFound(new { message = "Чат не найден." });
            }

            var roomIds = request.RoomIds!.Where(x => x > 0).Distinct().ToList();
            var userLogins = request.UserLogins!
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            chat.Name = request.Name!.Trim();

            try
            {
                var currentRooms = await _powerBiContext.SensorChatRooms
                    .Where(x => x.ChatId == chatId)
                    .ToListAsync();

                var currentUsers = await _powerBiContext.SensorChatUsers
                    .Where(x => x.ChatId == chatId)
                    .ToListAsync();

                if (currentRooms.Count > 0)
                {
                    _powerBiContext.SensorChatRooms.RemoveRange(currentRooms);
                }

                if (currentUsers.Count > 0)
                {
                    _powerBiContext.SensorChatUsers.RemoveRange(currentUsers);
                }

                _powerBiContext.SensorChatRooms.AddRange(roomIds.Select(roomId => new SensorChatRoom
                {
                    ChatId = chatId,
                    RoomId = roomId
                }));

                _powerBiContext.SensorChatUsers.AddRange(userLogins.Select(userLogin => new SensorChatUser
                {
                    ChatId = chatId,
                    UserLogin = userLogin,
                    DisplayName = request.UserDisplayNames?.GetValueOrDefault(userLogin)
                }));

                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorChatsSchemaMessage });
            }

            return Ok(new
            {
                id = chat.Id,
                name = chat.Name,
                roomIds,
                userLogins
            });
        }

        [HttpDelete("chats/{chatId:int}")]
        public async Task<IActionResult> DeleteChat(int chatId)
        {
            SensorChat? chat;
            try
            {
                chat = await _powerBiContext.SensorChats.FirstOrDefaultAsync(x => x.Id == chatId && x.Actual == 1);
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorChatsSchemaMessage });
            }

            if (chat == null)
            {
                return NotFound(new { message = "Чат не найден." });
            }

            try
            {
                chat.Actual = 0;
                await _powerBiContext.SaveChangesAsync();
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorChatsSchemaMessage });
            }

            return NoContent();
        }

        [HttpPost]
        public async Task<IActionResult> CreateRoom([FromBody] SaveSensorRoomRequest request)
        {
            var validationError = ValidateSensorRoomRequest(request);
            if (validationError != null)
            {
                return validationError;
            }

            var room = new SensorRoom
            {
                Name = request.Name!.Trim(),
                Ip = request.Ip!.Trim(),
                Actual = request.Actual ?? 1,
                State = "OK"
            };

            _powerBiContext.SensorRooms.Add(room);
            await _powerBiContext.SaveChangesAsync();

            return Ok(MapRoom(room));
        }

        [HttpPut("{roomId:int}")]
        public async Task<IActionResult> UpdateRoom(int roomId, [FromBody] SaveSensorRoomRequest request)
        {
            var room = await _powerBiContext.SensorRooms.FirstOrDefaultAsync(x => x.Id == roomId);
            if (room == null)
            {
                return NotFound(new { message = "Датчик не найден." });
            }

            var validationError = ValidateSensorRoomRequest(request);
            if (validationError != null)
            {
                return validationError;
            }

            room.Name = request.Name!.Trim();
            room.Ip = request.Ip!.Trim();
            room.Actual = request.Actual ?? room.Actual;

            await _powerBiContext.SaveChangesAsync();

            return Ok(MapRoom(room));
        }

        private IActionResult? ValidateSensorRoomRequest(SaveSensorRoomRequest request)
        {
            var name = request.Name?.Trim();
            var ip = request.Ip?.Trim();

            if (string.IsNullOrWhiteSpace(name))
            {
                return BadRequest(new { message = "Название датчика обязательно." });
            }

            if (string.IsNullOrWhiteSpace(ip))
            {
                return BadRequest(new { message = "IP датчика обязателен." });
            }

            if (name.Length > 60)
            {
                return BadRequest(new { message = "Название датчика не должно превышать 60 символов." });
            }

            if (ip.Length > 20)
            {
                return BadRequest(new { message = "IP датчика не должен превышать 20 символов." });
            }

            if (request.Actual is not null && request.Actual is not (0 or 1))
            {
                return BadRequest(new { message = "Активность датчика может быть только 0 или 1." });
            }

            return null;
        }

        private IActionResult? ValidateAlertSettingsRequest(SaveSensorAlertSettingsRequest request)
        {
            if (request.MinTemperature.HasValue && request.MaxTemperature.HasValue && request.MinTemperature > request.MaxTemperature)
            {
                return BadRequest(new { message = "Минимальная температура не может быть больше максимальной." });
            }

            if (request.ViolationDelayMinutes < 1 || request.RepeatDelayMinutes < 1 || request.RecoveryDelayMinutes < 1)
            {
                return BadRequest(new { message = "Все интервалы уведомлений должны быть не меньше 1 минуты." });
            }

            return null;
        }

        private IActionResult? ValidateMaintenanceWindowRequest(SaveSensorMaintenanceWindowRequest request)
        {
            var name = request.Name?.Trim();
            var scheduleType = NormalizeScheduleType(request.ScheduleType);

            if (string.IsNullOrWhiteSpace(name))
            {
                return BadRequest(new { message = "Название окна техработ обязательно." });
            }

            if (name.Length > 120)
            {
                return BadRequest(new { message = "Название окна техработ не должно превышать 120 символов." });
            }

            if (!AllowedScheduleTypes.Contains(scheduleType))
            {
                return BadRequest(new { message = "Неизвестный тип расписания." });
            }

            if (request.StartTime == null || request.EndTime == null)
            {
                return BadRequest(new { message = "Для окна техработ нужно указать время начала и окончания." });
            }

            if (scheduleType == "weekly" && (!request.DaysOfWeekMask.HasValue || request.DaysOfWeekMask.Value < 1 || request.DaysOfWeekMask.Value > 127))
            {
                return BadRequest(new { message = "Для еженедельного расписания нужно выбрать хотя бы один день недели." });
            }

            if (scheduleType == "daily")
            {
                request.DaysOfWeekMask = null;
                request.StartDate = null;
                request.EndDate = null;
            }

            if (scheduleType == "weekly")
            {
                request.StartDate = null;
                request.EndDate = null;
            }

            if (scheduleType == "one_time")
            {
                if (!request.StartDate.HasValue || !request.EndDate.HasValue)
                {
                    return BadRequest(new { message = "Для разового окна техработ нужно указать даты начала и окончания." });
                }

                if (request.StartDate.Value.Date > request.EndDate.Value.Date)
                {
                    return BadRequest(new { message = "Дата начала не может быть позже даты окончания." });
                }

                request.DaysOfWeekMask = null;
            }

            return null;
        }

        private async Task<IActionResult?> ValidateSensorChatRequest(SaveSensorChatRequest request)
        {
            var name = request.Name?.Trim();

            if (string.IsNullOrWhiteSpace(name))
            {
                return BadRequest(new { message = "Название чата обязательно." });
            }

            if (name.Length > 120)
            {
                return BadRequest(new { message = "Название чата не должно превышать 120 символов." });
            }

            var roomIds = request.RoomIds?
                .Where(x => x > 0)
                .Distinct()
                .ToList() ?? new List<int>();

            if (roomIds.Count == 0)
            {
                return BadRequest(new { message = "Выберите хотя бы один датчик." });
            }

            var userLogins = request.UserLogins?
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? new List<string>();

            if (userLogins.Count == 0)
            {
                return BadRequest(new { message = "Выберите хотя бы одного пользователя." });
            }

            try
            {
                var existingRoomIds = await _powerBiContext.SensorRooms
                    .AsNoTracking()
                    .Where(x => roomIds.Contains(x.Id))
                    .Select(x => x.Id)
                    .ToListAsync();

                if (existingRoomIds.Count != roomIds.Count)
                {
                    return BadRequest(new { message = "Часть выбранных датчиков не найдена." });
                }
            }
            catch (SqlException ex) when (IsMissingObjectError(ex))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = SensorChatsSchemaMessage });
            }

            return null;
        }

        private static string NormalizeScheduleType(string? value) => value?.Trim().ToLowerInvariant() ?? string.Empty;

        private static object MapRoom(SensorRoom room) => new
        {
            id = room.Id,
            name = room.Name,
            ip = room.Ip,
            temp = room.Temp,
            actual = room.Actual,
            state = room.State,
            hasAlertSettings = false
        };

        private static object MapAlertSettings(SensorAlertSetting settings) => new
        {
            roomId = settings.RoomId,
            minTemperature = settings.MinTemperature,
            maxTemperature = settings.MaxTemperature,
            violationDelayMinutes = settings.ViolationDelayMinutes,
            repeatDelayMinutes = settings.RepeatDelayMinutes,
            recoveryDelayMinutes = settings.RecoveryDelayMinutes,
            isEnabled = settings.IsEnabled,
            schemaMissing = false
        };

        private static object MapMaintenanceWindow(SensorMaintenanceWindow window) => new
        {
            id = window.Id,
            roomId = window.RoomId,
            name = window.Name,
            scheduleType = window.ScheduleType,
            daysOfWeekMask = window.DaysOfWeekMask,
            startTime = window.StartTime.ToString(@"hh\:mm"),
            endTime = window.EndTime.ToString(@"hh\:mm"),
            startDate = window.StartDate?.ToString("yyyy-MM-dd"),
            endDate = window.EndDate?.ToString("yyyy-MM-dd"),
            isEnabled = window.IsEnabled
        };

        private static string MapMaintenanceSummary(SensorMaintenanceWindow window)
        {
            var timePart = $"{window.StartTime:hh\\:mm} - {window.EndTime:hh\\:mm}";

            return window.ScheduleType switch
            {
                "daily" => $"Каждый день, {timePart}",
                "weekly" => $"Еженедельно, {timePart}",
                "one_time" => $"{window.StartDate:yyyy-MM-dd} - {window.EndDate:yyyy-MM-dd}, {timePart}",
                _ => timePart
            };
        }

        private static bool IsMissingObjectError(SqlException ex) => ex.Number == 208;
    }
}
