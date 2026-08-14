using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models;

[Table("OfficeKnowledgeSections")]
public class OfficeKnowledgeSection
{
    [Key]
    public Guid Id { get; set; }

    [MaxLength(160)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(1024)]
    public string RootPath { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
    public bool AvailableToAll { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public DateTime? LastIndexedAtUtc { get; set; }

    [MaxLength(24)]
    public string IndexStatus { get; set; } = "Pending";

    [MaxLength(1000)]
    public string? IndexError { get; set; }

    public ICollection<OfficeKnowledgeSectionRole> Roles { get; set; } = new List<OfficeKnowledgeSectionRole>();
    public ICollection<OfficeKnowledgeDocument> Documents { get; set; } = new List<OfficeKnowledgeDocument>();
    public OfficeKnowledgeSectionCover? Cover { get; set; }
}

[Table("OfficeKnowledgeSectionCovers")]
public class OfficeKnowledgeSectionCover
{
    [Key]
    public Guid SectionId { get; set; }

    [MaxLength(100)]
    public string ContentType { get; set; } = string.Empty;

    public byte[] Data { get; set; } = [];
    public DateTime UpdatedAtUtc { get; set; }
    public OfficeKnowledgeSection Section { get; set; } = null!;
}

[Table("OfficeKnowledgeSectionRoles")]
public class OfficeKnowledgeSectionRole
{
    public Guid SectionId { get; set; }
    public int OfficeRoleId { get; set; }
    public OfficeKnowledgeSection Section { get; set; } = null!;
    public OfficeRole OfficeRole { get; set; } = null!;
}

[Table("OfficeKnowledgeDocuments")]
public class OfficeKnowledgeDocument
{
    [Key]
    public Guid Id { get; set; }
    public Guid SectionId { get; set; }

    [MaxLength(1024)]
    public string RelativePath { get; set; } = string.Empty;

    [MaxLength(260)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(24)]
    public string Extension { get; set; } = string.Empty;

    public bool IsDirectory { get; set; }
    public long Size { get; set; }
    public DateTime LastWriteTimeUtc { get; set; }
    public DateTime IndexedAtUtc { get; set; }

    /// <summary>
    /// Извлечённый текст файла для поиска по содержимому. Null, если извлечение ещё не выполнялось,
    /// не поддерживается для этого формата, или файл не изменился с прошлой попытки (и она провалилась).
    /// Не участвует в отображении — только в поиске (Content.Contains(term)).
    /// </summary>
    public string? Content { get; set; }

    public OfficeKnowledgeSection Section { get; set; } = null!;
}

[Table("OfficeKnowledgeFavorites")]
public class OfficeKnowledgeFavorite
{
    public int OfficeUserId { get; set; }
    public Guid DocumentId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public OfficeUser OfficeUser { get; set; } = null!;
    public OfficeKnowledgeDocument Document { get; set; } = null!;
}

[Table("OfficeKnowledgeHistory")]
public class OfficeKnowledgeHistory
{
    [Key]
    public long Id { get; set; }
    public int OfficeUserId { get; set; }
    public Guid DocumentId { get; set; }
    public DateTime OpenedAtUtc { get; set; }
    public OfficeUser OfficeUser { get; set; } = null!;
    public OfficeKnowledgeDocument Document { get; set; } = null!;
}

[Table("OfficeKnowledgeIndexErrors")]
public class OfficeKnowledgeIndexError
{
    [Key]
    public long Id { get; set; }
    public Guid SectionId { get; set; }

    [MaxLength(1024)]
    public string Path { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Message { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }
    public OfficeKnowledgeSection Section { get; set; } = null!;
}
