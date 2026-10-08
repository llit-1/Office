namespace Office.Server.Stock;

// ===== Ответы внешней складской API (поля читаются без учёта регистра) =====

public sealed class WarehouseCategoryRef
{
    public int? Id { get; set; }
    public string? Name { get; set; }
    public int? Parent { get; set; }
}

public sealed class WarehouseHolderRef
{
    public int? Id { get; set; }
    public string? Surname { get; set; }
    public string? Name { get; set; }
    public string? Patronymic { get; set; }
    public string? JobTitle { get; set; }
    public string? Department { get; set; }
}

public sealed class WarehouseLocationRef
{
    public string? Guid { get; set; }
    public string? Name { get; set; }
}

public sealed class WarehouseSearchItem
{
    public WarehouseCategoryRef? MainCat { get; set; }
    public WarehouseCategoryRef? Cat { get; set; }
    public WarehouseCategoryRef? SecondCat { get; set; }
    public WarehouseHolderRef? WarehouseHolder { get; set; }
    public WarehouseLocationRef? Location { get; set; }
    public string? Code { get; set; }
}

public sealed class WarehouseSearchGroup
{
    public WarehouseCategoryRef? MainCat { get; set; }
    public WarehouseCategoryRef? Cat { get; set; }
    public WarehouseCategoryRef? SecondCat { get; set; }
    public WarehouseHolderRef? WarehouseHolder { get; set; }
    public WarehouseLocationRef? Location { get; set; }
    public List<WarehouseSearchItem>? Items { get; set; }
}

public sealed class WarehouseObject
{
    public int? WarehouseCategoriesId { get; set; }
    public WarehouseCategoryRef? WarehouseCategories { get; set; }
    public WarehouseHolderRef? Holder { get; set; }
    public WarehouseLocationRef? Location { get; set; }
    public int? Actual { get; set; }
}

public sealed class WarehouseActionRef
{
    public int? Id { get; set; }
    public string? Name { get; set; }
}

public sealed class WarehouseHistoryEntry
{
    public string? User { get; set; }
    public WarehouseLocationRef? Location { get; set; }
    public string? DateTime { get; set; }
    public string? Comment { get; set; }
    public WarehouseHolderRef? Holder { get; set; }
    public WarehouseActionRef? WarehouseAction { get; set; }
    public WarehouseObject? WarehouseObjects { get; set; }
}

// ===== Контракт api/stock для клиента Office =====

public sealed record StockLocationOption(Guid Guid, string Name, bool Actual);

public sealed record StockHolderOption(int Id, string FullName, string? JobTitle, string? Department, bool Actual);

public sealed record StockCategoryOption(int Id, string Name, int? Parent, bool Actual);

public sealed record StockLookupsDto(
    IReadOnlyList<StockLocationOption> Locations,
    IReadOnlyList<StockHolderOption> Holders,
    IReadOnlyList<StockCategoryOption> Categories);

public sealed class StockHolderCreateRequest
{
    public string? Surname { get; set; }
    public string? Name { get; set; }
    public string? Patronymic { get; set; }
    public string? JobTitle { get; set; }
    public string? Department { get; set; }
}

public sealed class StockSearchRequest
{
    public int? HolderId { get; set; }
    public int? CategoryId { get; set; }
    public List<Guid>? LocationGuids { get; set; }
    public bool WrittenOff { get; set; }
}

public sealed record StockSearchItemDto(
    string Code,
    string? Category,
    string? SubCategory,
    string? Name,
    string? HolderName,
    string? LocationName,
    bool InStorage);

public sealed record StockSearchGroupDto(
    string Key,
    string? Category,
    string? SubCategory,
    string? Name,
    string? HolderName,
    string? LocationName,
    IReadOnlyList<StockSearchItemDto> Items);

public sealed record StockObjectDto(
    string Code,
    string Name,
    IReadOnlyList<string> CategoryPath,
    string? HolderName,
    string? HolderDetails,
    string? LocationName,
    bool Active);

public sealed record StockHistoryEntryDto(
    int ActionId,
    string ActionName,
    string? DateTime,
    string? User,
    string? LocationName,
    string? HolderName,
    string? Comment);

public sealed record StockObjectCardDto(
    StockObjectDto Object,
    IReadOnlyList<StockHistoryEntryDto> History,
    bool CanWriteOff);

public sealed class StockTransferRequest
{
    public Guid? LocationGuid { get; set; }
    public int? HolderId { get; set; }
    public string? Comment { get; set; }
    public List<StockTransferItemRequest>? Items { get; set; }
}

public sealed class StockTransferItemRequest
{
    public string? Code { get; set; }

    /// <summary>Конечная точка объекта; если не задана, берётся из запроса.</summary>
    public Guid? LocationGuid { get; set; }

    /// <summary>Новый держатель объекта; если не задан, берётся из запроса.</summary>
    public int? HolderId { get; set; }

    /// <summary>Необязательный комментарий к конкретному объекту; по умолчанию используется общий.</summary>
    public string? Comment { get; set; }
}

public sealed record StockTransferResultDto(int Count);

public sealed class StockWriteOffRequest
{
    public string? Comment { get; set; }
}
