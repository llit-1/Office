using System.Security.Claims;
using System.Linq.Expressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.KnowledgeLibrary;

namespace Office.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "KnowledgeLibrary,KnowledgeLibraryAdmin")]
public sealed class KnowledgeLibraryController(
    RKNETDBContext db,
    KnowledgeLibraryIndexQueue indexQueue,
    KnowledgeLibraryFileTickets fileTickets,
    ILogger<KnowledgeLibraryController> logger) : ControllerBase
{
    private const string AdminRole = "KnowledgeLibraryAdmin";
    private const string CommonDocumentsFolder = "Общие документы";
    private static readonly Guid ReferenceDocumentsSectionId = Guid.Parse("3EFDA7C2-591C-4DC8-AA54-302E95CB1DA8");
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    [HttpGet("sections")]
    public async Task<ActionResult<IReadOnlyList<KnowledgeSectionDto>>> GetSections(CancellationToken cancellationToken)
    {
        var sections = await db.OfficeKnowledgeSections
            .AsNoTracking()
            .Include(x => x.Roles)
                .ThenInclude(x => x.OfficeRole)
            .Where(x => x.IsActive)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Title)
            .ToListAsync(cancellationToken);

        var accessibleSections = sections.Where(CanAccess).ToList();
        var coverIds = await GetCoverIdsAsync(accessibleSections.Select(x => x.Id), cancellationToken);
        return Ok(accessibleSections.Select(x => ToSectionDto(x, coverIds.Contains(x.Id))));
    }

    [HttpGet("sections/{sectionId:guid}/entries")]
    public async Task<ActionResult<KnowledgeBrowseDto>> Browse(
        Guid sectionId,
        [FromQuery] string? path,
        CancellationToken cancellationToken)
    {
        var section = await GetAccessibleSection(sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        var currentPath = NormalizeRelativePath(path);
        if (!KnowledgeLibraryFilePolicy.TryResolvePath(section.RootPath, currentPath, out _))
            return BadRequest(new { message = "Некорректный путь внутри раздела." });

        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(sectionId, cancellationToken);
        if (!CanAccessRelativePath(currentPath, authorizedTopLevelPaths))
            return NotFound();

        var prefix = string.IsNullOrEmpty(currentPath) ? string.Empty : currentPath + "/";
        var candidates = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .Where(x => x.SectionId == sectionId && x.RelativePath.StartsWith(prefix))
            .OrderByDescending(x => x.IsDirectory)
            .ThenBy(x => x.Name)
            .ToListAsync(cancellationToken);

        var direct = candidates
            .Where(x => !x.RelativePath[prefix.Length..].Contains('/'))
            .ToList();

        // Каждая папка может содержать ровно один SVG — он используется как иконка этой папки
        // (см. GetFolderIcon). Ищем SVG-файлы прямо внутри текущей папки за один запрос,
        // а не по каждой подпапке отдельно.
        var directoryNames = direct.Where(x => x.IsDirectory).Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var iconFolderNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (directoryNames.Count > 0)
        {
            var childSvgPaths = await db.OfficeKnowledgeDocuments
                .AsNoTracking()
                .Where(x => x.SectionId == sectionId && !x.IsDirectory && x.Extension == ".svg" && x.RelativePath.StartsWith(prefix))
                .Select(x => x.RelativePath)
                .ToListAsync(cancellationToken);
            foreach (var svgPath in childSvgPaths)
            {
                var rest = svgPath[prefix.Length..];
                var slash = rest.IndexOf('/');
                if (slash > 0) iconFolderNames.Add(rest[..slash]);
            }
        }

        var entries = direct
            .Where(x => CanAccessRelativePath(x.RelativePath, authorizedTopLevelPaths))
            .Select(x => ToEntryDto(x) with { HasIcon = x.IsDirectory && iconFolderNames.Contains(x.Name) })
            .ToList();

        var hasCover = await db.OfficeKnowledgeSectionCovers.AsNoTracking()
            .AnyAsync(x => x.SectionId == section.Id, cancellationToken);
        return Ok(new KnowledgeBrowseDto(ToSectionDto(section, hasCover), currentPath, entries));
    }

    [HttpGet("sections/{sectionId:guid}/search")]
    public async Task<ActionResult<KnowledgeSearchResultDto>> Search(
        Guid sectionId,
        [FromQuery] string? query,
        CancellationToken cancellationToken)
    {
        var section = await GetAccessibleSection(sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        var term = query?.Trim();
        if (string.IsNullOrWhiteSpace(term) || term.Length < 2)
            return Ok(new KnowledgeSearchResultDto([], []));

        term = term[..Math.Min(term.Length, 100)];

        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(sectionId, cancellationToken);
        var searchableDocuments = ApplyDocumentAccess(
            db.OfficeKnowledgeDocuments.AsNoTracking().Where(x => x.SectionId == sectionId),
            authorizedTopLevelPaths);

        // Совпадения по имени файла — основной результат.
        var nameMatches = await searchableDocuments
            .Where(x => !x.IsDirectory && x.Name.Contains(term))
            .OrderBy(x => x.Name)
            .Take(100)
            .Select(x => new KnowledgeEntryDto(
                x.Id, x.Name, x.RelativePath, x.Extension, false, x.Size, x.LastWriteTimeUtc, false, null))
            .ToListAsync(cancellationToken);

        // Совпадения по содержимому — отдельным списком, без дублирования уже найденного по имени.
        // Сортируем по числу вхождений термина в тексте (документы, где слово встречается чаще, —
        // выше): (длина текста - длина текста без термина) / длина термина, без полнотекстового
        // индекса. Считается на стороне SQL Server (LEN/REPLACE), содержимое на сервер не грузим.
        var contentMatches = await searchableDocuments
            .Where(x => !x.IsDirectory
                && !x.Name.Contains(term)
                && x.Content != null && x.Content.Contains(term))
            .OrderByDescending(x => (x.Content!.Length - x.Content!.Replace(term, "").Length) / term.Length)
            .ThenBy(x => x.Name)
            .Take(100)
            .Select(x => new KnowledgeEntryDto(
                x.Id, x.Name, x.RelativePath, x.Extension, false, x.Size, x.LastWriteTimeUtc, false,
                (x.Content!.Length - x.Content!.Replace(term, "").Length) / term.Length))
            .ToListAsync(cancellationToken);

        return Ok(new KnowledgeSearchResultDto(nameMatches, contentMatches));
    }

    [HttpGet("personal/recent")]
    public async Task<ActionResult<IReadOnlyList<KnowledgePersonalEntryDto>>> GetRecent(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var accessibleSectionIds = await GetAccessibleSectionIdsAsync(cancellationToken);
        if (accessibleSectionIds.Length == 0)
            return Ok(Array.Empty<KnowledgePersonalEntryDto>());

        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(ReferenceDocumentsSectionId, cancellationToken);
        var authorizedReferenceDocumentIds = ApplyDocumentAccess(
                db.OfficeKnowledgeDocuments.AsNoTracking().Where(x => x.SectionId == ReferenceDocumentsSectionId),
                authorizedTopLevelPaths)
            .Select(x => x.Id);

        var history = await db.OfficeKnowledgeHistory
            .AsNoTracking()
            .Where(x => x.OfficeUserId == userId.Value
                && !x.Document.IsDirectory
                && accessibleSectionIds.Contains(x.Document.SectionId)
                && (x.Document.SectionId != ReferenceDocumentsSectionId
                    || authorizedReferenceDocumentIds.Contains(x.DocumentId)))
            .OrderByDescending(x => x.OpenedAtUtc)
            .Take(200)
            .Select(x => new KnowledgePersonalEntryDto(
                x.Document.Id,
                x.Document.SectionId,
                x.Document.Section.Title,
                x.Document.Name,
                x.Document.RelativePath,
                x.Document.Extension,
                x.Document.Size,
                x.Document.LastWriteTimeUtc,
                x.OpenedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(history
            .GroupBy(x => x.Id)
            .Select(x => x.First())
            .Take(24)
            .ToList());
    }

    [HttpGet("personal/favorites")]
    public async Task<ActionResult<IReadOnlyList<KnowledgePersonalEntryDto>>> GetFavorites(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var accessibleSectionIds = await GetAccessibleSectionIdsAsync(cancellationToken);
        if (accessibleSectionIds.Length == 0)
            return Ok(Array.Empty<KnowledgePersonalEntryDto>());

        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(ReferenceDocumentsSectionId, cancellationToken);
        var authorizedReferenceDocumentIds = ApplyDocumentAccess(
                db.OfficeKnowledgeDocuments.AsNoTracking().Where(x => x.SectionId == ReferenceDocumentsSectionId),
                authorizedTopLevelPaths)
            .Select(x => x.Id);

        var favorites = await db.OfficeKnowledgeFavorites
            .AsNoTracking()
            .Where(x => x.OfficeUserId == userId.Value
                && !x.Document.IsDirectory
                && accessibleSectionIds.Contains(x.Document.SectionId)
                && (x.Document.SectionId != ReferenceDocumentsSectionId
                    || authorizedReferenceDocumentIds.Contains(x.DocumentId)))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => new KnowledgePersonalEntryDto(
                x.Document.Id,
                x.Document.SectionId,
                x.Document.Section.Title,
                x.Document.Name,
                x.Document.RelativePath,
                x.Document.Extension,
                x.Document.Size,
                x.Document.LastWriteTimeUtc,
                x.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(favorites);
    }

    [HttpPost("sections/{sectionId:guid}/documents/{documentId:guid}/favorite")]
    public async Task<IActionResult> AddFavorite(Guid sectionId, Guid documentId, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (!userId.HasValue)
            return Unauthorized();
        if (await GetAccessibleSection(sectionId, cancellationToken) is null)
            return NotFound();

        var document = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == documentId && x.SectionId == sectionId && !x.IsDirectory, cancellationToken);
        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(sectionId, cancellationToken);
        if (document is null || !CanAccessRelativePath(document.RelativePath, authorizedTopLevelPaths))
            return NotFound();

        var alreadyExists = await db.OfficeKnowledgeFavorites
            .AnyAsync(x => x.OfficeUserId == userId.Value && x.DocumentId == documentId, cancellationToken);
        if (!alreadyExists)
        {
            db.OfficeKnowledgeFavorites.Add(new OfficeKnowledgeFavorite
            {
                OfficeUserId = userId.Value,
                DocumentId = documentId,
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }

    [HttpDelete("sections/{sectionId:guid}/documents/{documentId:guid}/favorite")]
    public async Task<IActionResult> RemoveFavorite(Guid sectionId, Guid documentId, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var favorite = await db.OfficeKnowledgeFavorites
            .FirstOrDefaultAsync(x => x.OfficeUserId == userId.Value
                && x.DocumentId == documentId
                && x.Document.SectionId == sectionId, cancellationToken);
        if (favorite is not null)
        {
            db.OfficeKnowledgeFavorites.Remove(favorite);
            await db.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }

    [HttpGet("sections/{sectionId:guid}/documents/{documentId:guid}/content")]
    public async Task<IActionResult> GetContent(
        Guid sectionId,
        Guid documentId,
        [FromQuery] bool download,
        CancellationToken cancellationToken)
    {
        var section = await GetAccessibleSection(sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        var document = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == documentId && x.SectionId == sectionId && !x.IsDirectory, cancellationToken);
        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(sectionId, cancellationToken);
        if (document is null
            || !CanAccessRelativePath(document.RelativePath, authorizedTopLevelPaths)
            || !KnowledgeLibraryFilePolicy.IsAllowedFile(document.Name))
            return NotFound();

        if (!KnowledgeLibraryFilePolicy.TryResolvePath(section.RootPath, document.RelativePath, out var fullPath)
            || !System.IO.File.Exists(fullPath))
            return NotFound(new { message = "Файл больше не найден на сетевом диске. Запустите переиндексацию раздела." });

        try
        {
            var userId = GetUserId();
            if (userId.HasValue)
            {
                db.OfficeKnowledgeHistory.Add(new OfficeKnowledgeHistory
                {
                    OfficeUserId = userId.Value,
                    DocumentId = document.Id,
                    OpenedAtUtc = DateTime.UtcNow
                });
                await db.SaveChangesAsync(cancellationToken);
            }

            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 64 * 1024,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            var contentType = ContentTypes.TryGetContentType(document.Name, out var detected)
                ? detected
                : "application/octet-stream";
            return download
                ? File(stream, contentType, document.Name, enableRangeProcessing: true)
                : File(stream, contentType, enableRangeProcessing: true);
        }
        catch (IOException ex)
        {
            logger.LogWarning(ex, "Knowledge file {DocumentId} could not be opened.", documentId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Файл временно недоступен." });
        }
    }

    [HttpPost("sections/{sectionId:guid}/documents/{documentId:guid}/ticket")]
    public async Task<ActionResult> CreateMediaTicket(Guid sectionId, Guid documentId, CancellationToken cancellationToken)
    {
        var section = await GetAccessibleSection(sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        var document = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == documentId && x.SectionId == sectionId && !x.IsDirectory, cancellationToken);
        var userId = GetUserId();
        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(sectionId, cancellationToken);
        if (document is null
            || !CanAccessRelativePath(document.RelativePath, authorizedTopLevelPaths)
            || !userId.HasValue)
            return NotFound();

        return Ok(new { ticket = fileTickets.Issue(sectionId, documentId, userId.Value) });
    }

    [AllowAnonymous]
    [HttpGet("media/{ticket}/{fileName?}")]
    public async Task<IActionResult> GetTicketedContent(
        string ticket,
        string? fileName,
        [FromQuery] bool download,
        CancellationToken cancellationToken)
    {
        // fileName из маршрута не используется для поиска (источник истины — тикет),
        // он нужен только чтобы во внешнем URL было видно расширение файла —
        // это важно для Office Online Viewer при определении формата документа.
        _ = fileName;
        if (!fileTickets.TryGet(ticket, out var mediaTicket) || mediaTicket is null)
            return Unauthorized(new { message = "Ссылка на файл истекла. Откройте файл повторно из библиотеки." });

        var data = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .Where(x => x.Id == mediaTicket.DocumentId && x.SectionId == mediaTicket.SectionId && !x.IsDirectory)
            .Select(x => new { Document = x, x.Section.RootPath, x.Section.IsActive })
            .FirstOrDefaultAsync(cancellationToken);
        if (data is null || !data.IsActive || !KnowledgeLibraryFilePolicy.IsAllowedFile(data.Document.Name))
            return NotFound();
        var ticketUserIsAdmin = await IsKnowledgeAdminAsync(mediaTicket.UserId, cancellationToken);
        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(
            mediaTicket.SectionId,
            cancellationToken,
            mediaTicket.UserId,
            ticketUserIsAdmin);
        if (!CanAccessRelativePath(data.Document.RelativePath, authorizedTopLevelPaths))
            return NotFound();
        if (!KnowledgeLibraryFilePolicy.TryResolvePath(data.RootPath, data.Document.RelativePath, out var fullPath)
            || !System.IO.File.Exists(fullPath))
            return NotFound();

        try
        {
            if (mediaTicket.TryMarkHistoryRecorded())
            {
                db.OfficeKnowledgeHistory.Add(new OfficeKnowledgeHistory
                {
                    OfficeUserId = mediaTicket.UserId,
                    DocumentId = data.Document.Id,
                    OpenedAtUtc = DateTime.UtcNow
                });
                await db.SaveChangesAsync(cancellationToken);
            }

            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 64 * 1024,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            var contentType = ContentTypes.TryGetContentType(data.Document.Name, out var detected)
                ? detected
                : "application/octet-stream";
            return download
                ? File(stream, contentType, data.Document.Name, enableRangeProcessing: true)
                : File(stream, contentType, enableRangeProcessing: true);
        }
        catch (IOException ex)
        {
            logger.LogWarning(ex, "Ticketed knowledge file {DocumentId} could not be opened.", mediaTicket.DocumentId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Файл временно недоступен." });
        }
    }

    [HttpGet("sections/{sectionId:guid}/cover")]
    public async Task<IActionResult> GetCover(Guid sectionId, CancellationToken cancellationToken)
    {
        var section = await GetAccessibleSection(sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        var cover = await db.OfficeKnowledgeSectionCovers
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.SectionId == sectionId, cancellationToken);
        if (cover is null || cover.Data.Length == 0)
            return NotFound();

        var etag = $"\"{sectionId:N}-{cover.UpdatedAtUtc.Ticks:x}\"";
        if (Request.Headers.IfNoneMatch.Any(x => string.Equals(x, etag, StringComparison.Ordinal)))
            return StatusCode(StatusCodes.Status304NotModified);

        Response.Headers.ETag = etag;
        Response.Headers.CacheControl = "private, max-age=300";
        Response.Headers.XContentTypeOptions = "nosniff";
        if (cover.ContentType == "image/svg+xml")
            Response.Headers.ContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
        return File(cover.Data, cover.ContentType);
    }

    [HttpGet("sections/{sectionId:guid}/documents/{documentId:guid}/folder-icon")]
    public async Task<IActionResult> GetFolderIcon(Guid sectionId, Guid documentId, CancellationToken cancellationToken)
    {
        var section = await GetAccessibleSection(sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        var folder = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == documentId && x.SectionId == sectionId && x.IsDirectory, cancellationToken);
        var authorizedTopLevelPaths = await GetAuthorizedTopLevelPathsAsync(sectionId, cancellationToken);
        if (folder is null || !CanAccessRelativePath(folder.RelativePath, authorizedTopLevelPaths))
            return NotFound();

        var prefix = string.IsNullOrEmpty(folder.RelativePath) ? string.Empty : folder.RelativePath + "/";
        var candidates = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .Where(x => x.SectionId == sectionId && !x.IsDirectory && x.Extension == ".svg" && x.RelativePath.StartsWith(prefix))
            .ToListAsync(cancellationToken);
        var icon = candidates
            .Where(x => !x.RelativePath[prefix.Length..].Contains('/'))
            .OrderBy(x => x.Name)
            .FirstOrDefault();
        if (icon is null)
            return NotFound();

        if (!KnowledgeLibraryFilePolicy.TryResolvePath(section.RootPath, icon.RelativePath, out var fullPath)
            || !System.IO.File.Exists(fullPath))
            return NotFound();

        var etag = $"\"{icon.Id:N}-{icon.LastWriteTimeUtc.Ticks:x}\"";
        if (Request.Headers.IfNoneMatch.Any(x => string.Equals(x, etag, StringComparison.Ordinal)))
            return StatusCode(StatusCodes.Status304NotModified);

        try
        {
            var bytes = await System.IO.File.ReadAllBytesAsync(fullPath, cancellationToken);
            Response.Headers.ETag = etag;
            Response.Headers.CacheControl = "private, max-age=300";
            Response.Headers.XContentTypeOptions = "nosniff";
            Response.Headers.ContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
            return File(bytes, "image/svg+xml");
        }
        catch (IOException ex)
        {
            logger.LogWarning(ex, "Folder icon {DocumentId} could not be opened.", icon.Id);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Файл временно недоступен." });
        }
    }

    [Authorize(Roles = AdminRole)]
    [HttpGet("admin/sections")]
    public async Task<ActionResult<IReadOnlyList<KnowledgeSectionAdminDto>>> GetAdminSections(CancellationToken cancellationToken)
    {
        var sections = await db.OfficeKnowledgeSections
            .AsNoTracking()
            .Include(x => x.Roles)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Title)
            .ToListAsync(cancellationToken);
        var coverIds = await GetCoverIdsAsync(sections.Select(x => x.Id), cancellationToken);
        return Ok(sections.Select(x => ToAdminDto(x, coverIds.Contains(x.Id))));
    }

    [Authorize(Roles = AdminRole)]
    [HttpGet("admin/roles")]
    public async Task<ActionResult> GetRoles(CancellationToken cancellationToken)
    {
        var roles = await db.OfficeRole
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new { id = x.ID, name = x.Name, role = x.Role })
            .ToListAsync(cancellationToken);
        return Ok(roles);
    }

    [Authorize(Roles = AdminRole)]
    [HttpPost("admin/sections")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<ActionResult<KnowledgeSectionAdminDto>> CreateSection(
        [FromForm] KnowledgeSectionForm form,
        CancellationToken cancellationToken)
    {
        var validation = ValidateForm(form);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var now = DateTime.UtcNow;
        var section = new OfficeKnowledgeSection
        {
            Id = Guid.NewGuid(),
            Title = form.Title.Trim(),
            Description = form.Description?.Trim() ?? string.Empty,
            RootPath = NormalizeUnc(form.RootPath),
            IsActive = form.IsActive,
            AvailableToAll = form.AvailableToAll,
            SortOrder = form.SortOrder,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            IndexStatus = "Pending"
        };
        await ApplyCover(section, form.Cover, cancellationToken);
        await SetRoles(section, form.RoleIds, cancellationToken);
        db.OfficeKnowledgeSections.Add(section);
        await db.SaveChangesAsync(cancellationToken);
        indexQueue.Request(section.Id);
        return CreatedAtAction(nameof(GetAdminSections), ToAdminDto(section, section.Cover is not null));
    }

    [Authorize(Roles = AdminRole)]
    [HttpPut("admin/sections/{sectionId:guid}")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<ActionResult<KnowledgeSectionAdminDto>> UpdateSection(
        Guid sectionId,
        [FromForm] KnowledgeSectionForm form,
        CancellationToken cancellationToken)
    {
        var validation = ValidateForm(form);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var section = await db.OfficeKnowledgeSections
            .Include(x => x.Roles)
            .FirstOrDefaultAsync(x => x.Id == sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        var oldRoot = section.RootPath;
        section.Title = form.Title.Trim();
        section.Description = form.Description?.Trim() ?? string.Empty;
        section.RootPath = NormalizeUnc(form.RootPath);
        section.IsActive = form.IsActive;
        section.AvailableToAll = form.AvailableToAll;
        section.SortOrder = form.SortOrder;
        section.UpdatedAtUtc = DateTime.UtcNow;
        await ApplyCover(section, form.Cover, cancellationToken);
        await SetRoles(section, form.RoleIds, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        if (!oldRoot.Equals(section.RootPath, StringComparison.OrdinalIgnoreCase))
        {
            section.IndexStatus = "Pending";
            section.IndexError = null;
            await db.SaveChangesAsync(cancellationToken);
        }
        if (section.IsActive)
            indexQueue.Request(section.Id);

        var hasCover = await db.OfficeKnowledgeSectionCovers.AsNoTracking()
            .AnyAsync(x => x.SectionId == section.Id, cancellationToken);
        return Ok(ToAdminDto(section, hasCover));
    }

    [Authorize(Roles = AdminRole)]
    [HttpDelete("admin/sections/{sectionId:guid}")]
    public async Task<IActionResult> DeleteSection(Guid sectionId, CancellationToken cancellationToken)
    {
        var section = await db.OfficeKnowledgeSections.FirstOrDefaultAsync(x => x.Id == sectionId, cancellationToken);
        if (section is null)
            return NotFound();

        db.OfficeKnowledgeSections.Remove(section);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Roles = AdminRole)]
    [HttpPost("admin/sections/{sectionId:guid}/reindex")]
    public async Task<IActionResult> Reindex(Guid sectionId, CancellationToken cancellationToken)
    {
        if (!await db.OfficeKnowledgeSections.AnyAsync(x => x.Id == sectionId, cancellationToken))
            return NotFound();

        indexQueue.Request(sectionId);
        return Accepted(new { message = "Переиндексация поставлена в очередь." });
    }

    [Authorize(Roles = AdminRole)]
    [HttpPost("admin/test-path")]
    public ActionResult TestPath([FromBody] KnowledgePathRequest request)
    {
        if (!KnowledgeLibraryFilePolicy.IsSafeUncRoot(request.RootPath, out var normalized, out var error))
            return BadRequest(new { message = error });

        try
        {
            if (!Directory.Exists(normalized))
                return BadRequest(new { message = "Папка не найдена или недоступна для учетной записи сервера." });

            return Ok(new { message = "Папка доступна.", normalizedPath = normalized });
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return BadRequest(new { message = "Нет доступа к папке: " + ex.Message });
        }
    }

    private async Task<OfficeKnowledgeSection?> GetAccessibleSection(Guid id, CancellationToken cancellationToken)
    {
        var section = await db.OfficeKnowledgeSections
            .AsNoTracking()
            .Include(x => x.Roles)
                .ThenInclude(x => x.OfficeRole)
            .FirstOrDefaultAsync(x => x.Id == id && (x.IsActive || User.IsInRole(AdminRole)), cancellationToken);
        return section is not null && CanAccess(section) ? section : null;
    }

    private bool CanAccess(OfficeKnowledgeSection section)
    {
        if (User.IsInRole(AdminRole) || section.AvailableToAll)
            return true;

        var roles = User.FindAll(ClaimTypes.Role).Select(x => x.Value).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return section.Roles.Any(x => roles.Contains(x.OfficeRole.Role));
    }

    private int? GetUserId() => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    private async Task<Guid[]> GetAccessibleSectionIdsAsync(CancellationToken cancellationToken)
    {
        var sections = await db.OfficeKnowledgeSections
            .AsNoTracking()
            .Include(x => x.Roles)
                .ThenInclude(x => x.OfficeRole)
            .Where(x => x.IsActive || User.IsInRole(AdminRole))
            .ToListAsync(cancellationToken);
        return sections.Where(CanAccess).Select(x => x.Id).ToArray();
    }

    private async Task<HashSet<Guid>> GetCoverIdsAsync(IEnumerable<Guid> sectionIds, CancellationToken cancellationToken)
    {
        var ids = sectionIds.Distinct().ToArray();
        if (ids.Length == 0)
            return [];

        return (await db.OfficeKnowledgeSectionCovers
            .AsNoTracking()
            .Where(x => ids.Contains(x.SectionId))
            .Select(x => x.SectionId)
            .ToListAsync(cancellationToken))
            .ToHashSet();
    }

    private static KnowledgeSectionDto ToSectionDto(OfficeKnowledgeSection x, bool hasCover) => new(
        x.Id, x.Title, x.Description, hasCover, x.LastIndexedAtUtc, x.IndexStatus);

    private static KnowledgeSectionAdminDto ToAdminDto(OfficeKnowledgeSection x, bool hasCover) => new(
        x.Id, x.Title, x.Description, x.RootPath, hasCover, x.IsActive,
        x.AvailableToAll, x.SortOrder, x.LastIndexedAtUtc, x.IndexStatus, x.IndexError,
        x.Roles.Select(r => r.OfficeRoleId).ToArray());

    private static KnowledgeEntryDto ToEntryDto(OfficeKnowledgeDocument x) => new(
        x.Id, x.Name, x.RelativePath, x.Extension, x.IsDirectory, x.Size, x.LastWriteTimeUtc);

    private async Task<HashSet<string>?> GetAuthorizedTopLevelPathsAsync(
        Guid sectionId,
        CancellationToken cancellationToken,
        int? userIdOverride = null,
        bool adminBypass = false)
    {
        if (sectionId != ReferenceDocumentsSectionId)
            return null;

        if (adminBypass || (!userIdOverride.HasValue && User.IsInRole(AdminRole)))
            return null;

        var allowedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            NormalizeAccessName(CommonDocumentsFolder)
        };

        var userId = userIdOverride ?? GetUserId();
        if (userId.HasValue)
        {
            var userAccess = await db.OfficeUser
                .AsNoTracking()
                .Where(x => x.Id == userId.Value)
                .Select(x => new { x.DefaultLocations })
                .FirstOrDefaultAsync(cancellationToken);

            if (userAccess is not null)
            {
                var currentLocationVersions = db.LocationVersions
                    .AsNoTracking()
                    .Where(x => x.Actual == 1 && x.VersionEndDate == null && x.EntityGuid != null);

                if (userAccess.DefaultLocations != 1)
                {
                    var linkedLocationIds = db.OfficeUser
                        .AsNoTracking()
                        .Where(x => x.Id == userId.Value)
                        .SelectMany(x => x.Locations.Select(location => location.Guid));
                    currentLocationVersions = currentLocationVersions
                        .Where(x => linkedLocationIds.Contains(x.LocationGuid));
                }

                var entityNames = await currentLocationVersions
                    .Where(x => x.Entity != null)
                    .Select(x => x.Entity!.Name)
                    .Distinct()
                    .ToListAsync(cancellationToken);

                foreach (var entityName in entityNames)
                {
                    var normalizedName = NormalizeAccessName(entityName);
                    if (!string.IsNullOrEmpty(normalizedName))
                        allowedNames.Add(normalizedName);
                }
            }
        }

        var topLevelFolders = await db.OfficeKnowledgeDocuments
            .AsNoTracking()
            .Where(x => x.SectionId == sectionId
                && x.IsDirectory
                && !x.RelativePath.Contains("/"))
            .Select(x => new { x.Name, x.RelativePath })
            .ToListAsync(cancellationToken);

        return topLevelFolders
            .Where(x => allowedNames.Contains(NormalizeAccessName(x.Name)))
            .Select(x => x.RelativePath)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private async Task<bool> IsKnowledgeAdminAsync(int userId, CancellationToken cancellationToken) =>
        await db.OfficeUser
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .SelectMany(x => x.OfficeGroup)
            .SelectMany(x => x.OfficeRole)
            .AnyAsync(x => x.Role == AdminRole, cancellationToken);

    private static bool CanAccessRelativePath(string relativePath, HashSet<string>? authorizedTopLevelPaths)
    {
        if (authorizedTopLevelPaths is null)
            return true;

        var normalizedPath = NormalizeRelativePath(relativePath);
        if (string.IsNullOrEmpty(normalizedPath))
            return true;

        var separatorIndex = normalizedPath.IndexOf('/');
        var topLevelPath = separatorIndex < 0 ? normalizedPath : normalizedPath[..separatorIndex];
        return authorizedTopLevelPaths.Contains(topLevelPath);
    }

    private static IQueryable<OfficeKnowledgeDocument> ApplyDocumentAccess(
        IQueryable<OfficeKnowledgeDocument> documents,
        HashSet<string>? authorizedTopLevelPaths)
    {
        if (authorizedTopLevelPaths is null)
            return documents;
        if (authorizedTopLevelPaths.Count == 0)
            return documents.Where(_ => false);

        var document = Expression.Parameter(typeof(OfficeKnowledgeDocument), "document");
        var relativePath = Expression.Property(document, nameof(OfficeKnowledgeDocument.RelativePath));
        var startsWith = typeof(string).GetMethod(nameof(string.StartsWith), [typeof(string)])!;
        Expression? accessExpression = null;

        foreach (var topLevelPath in authorizedTopLevelPaths)
        {
            var exactMatch = Expression.Equal(relativePath, Expression.Constant(topLevelPath));
            var childMatch = Expression.Call(relativePath, startsWith, Expression.Constant(topLevelPath + "/"));
            var pathMatch = Expression.OrElse(exactMatch, childMatch);
            accessExpression = accessExpression is null
                ? pathMatch
                : Expression.OrElse(accessExpression, pathMatch);
        }

        var predicate = Expression.Lambda<Func<OfficeKnowledgeDocument, bool>>(accessExpression!, document);
        return documents.Where(predicate);
    }

    private static string NormalizeAccessName(string? value) =>
        value?.Replace(".", string.Empty, StringComparison.Ordinal).Trim() ?? string.Empty;

    private string? ValidateForm(KnowledgeSectionForm form)
    {
        if (string.IsNullOrWhiteSpace(form.Title) || form.Title.Trim().Length > 160)
            return "Название обязательно и должно быть короче 160 символов.";
        if ((form.Description?.Length ?? 0) > 500)
            return "Описание должно быть короче 500 символов.";
        if (!KnowledgeLibraryFilePolicy.IsSafeUncRoot(form.RootPath, out var normalized, out var error))
            return error;
        if (!Directory.Exists(normalized))
            return "Папка не найдена или недоступна для учетной записи сервера.";
        if (!form.AvailableToAll && (form.RoleIds is null || form.RoleIds.Length == 0))
            return "Выберите хотя бы одну роль или включите доступ для всех пользователей библиотеки.";
        if (form.Cover is { Length: > 5 * 1024 * 1024 })
            return "Размер обложки не должен превышать 5 МБ.";
        if (form.Cover is not null && !KnowledgeLibraryFilePolicy.IsAllowedCover(form.Cover.FileName))
            return "Для обложки разрешены JPG, PNG, WEBP и SVG.";
        return null;
    }

    private static string NormalizeUnc(string path)
    {
        KnowledgeLibraryFilePolicy.IsSafeUncRoot(path, out var normalized, out _);
        return normalized;
    }

    private async Task SetRoles(OfficeKnowledgeSection section, int[]? roleIds, CancellationToken cancellationToken)
    {
        var ids = (roleIds ?? []).Distinct().ToArray();
        var validIds = await db.OfficeRole.Where(x => ids.Contains(x.ID)).Select(x => x.ID).ToListAsync(cancellationToken);
        var validSet = validIds.ToHashSet();
        var removed = section.Roles.Where(x => !validSet.Contains(x.OfficeRoleId)).ToList();
        db.OfficeKnowledgeSectionRoles.RemoveRange(removed);

        var existingIds = section.Roles.Select(x => x.OfficeRoleId).ToHashSet();
        foreach (var roleId in validIds.Where(x => !existingIds.Contains(x)))
            section.Roles.Add(new OfficeKnowledgeSectionRole { SectionId = section.Id, OfficeRoleId = roleId });
    }

    private async Task ApplyCover(OfficeKnowledgeSection section, IFormFile? cover, CancellationToken cancellationToken)
    {
        if (cover is null || cover.Length == 0)
            return;

        await using var stream = new MemoryStream((int)cover.Length);
        await cover.CopyToAsync(stream, cancellationToken);
        var contentType = Path.GetExtension(cover.FileName).Equals(".svg", StringComparison.OrdinalIgnoreCase)
            ? "image/svg+xml"
            : ContentTypes.TryGetContentType(cover.FileName, out var detected) ? detected : "application/octet-stream";
        var existing = await db.OfficeKnowledgeSectionCovers
            .FirstOrDefaultAsync(x => x.SectionId == section.Id, cancellationToken);

        if (existing is null)
        {
            section.Cover = new OfficeKnowledgeSectionCover
            {
                SectionId = section.Id,
                ContentType = contentType,
                Data = stream.ToArray(),
                UpdatedAtUtc = DateTime.UtcNow
            };
        }
        else
        {
            existing.ContentType = contentType;
            existing.Data = stream.ToArray();
            existing.UpdatedAtUtc = DateTime.UtcNow;
            section.Cover = existing;
        }
    }

    private static string NormalizeRelativePath(string? path) =>
        (path ?? string.Empty).Replace('\\', '/').Trim('/');
}

public sealed class KnowledgeSectionForm
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string RootPath { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public bool AvailableToAll { get; set; }
    public int SortOrder { get; set; }
    public int[]? RoleIds { get; set; }
    public IFormFile? Cover { get; set; }
}

public sealed record KnowledgePathRequest(string RootPath);
public sealed record KnowledgeSectionDto(Guid Id, string Title, string Description, bool HasCover, DateTime? LastIndexedAtUtc, string IndexStatus);
public sealed record KnowledgeSectionAdminDto(
    Guid Id, string Title, string Description, string RootPath, bool HasCover, bool IsActive, bool AvailableToAll,
    int SortOrder, DateTime? LastIndexedAtUtc, string IndexStatus, string? IndexError, int[] RoleIds);
public sealed record KnowledgeEntryDto(Guid Id, string Name, string RelativePath, string Extension, bool IsDirectory, long Size, DateTime LastWriteTimeUtc, bool HasIcon = false, int? MatchCount = null);
public sealed record KnowledgeSearchResultDto(IReadOnlyList<KnowledgeEntryDto> NameMatches, IReadOnlyList<KnowledgeEntryDto> ContentMatches);
public sealed record KnowledgePersonalEntryDto(
    Guid Id,
    Guid SectionId,
    string SectionTitle,
    string Name,
    string RelativePath,
    string Extension,
    long Size,
    DateTime LastWriteTimeUtc,
    DateTime ActivityAtUtc);
public sealed record KnowledgeBrowseDto(KnowledgeSectionDto Section, string CurrentPath, IReadOnlyList<KnowledgeEntryDto> Entries);
