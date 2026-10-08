namespace Office.Server.Stock;

public static class StockRoles
{
    /// <summary>Передача, поиск и просмотр карточек объектов склада.</summary>
    public const string User = "Stock";

    /// <summary>Дополнительно: структура склада и списание объектов.</summary>
    public const string Admin = "StockAdmin";

    public const string Any = User + "," + Admin;
}
