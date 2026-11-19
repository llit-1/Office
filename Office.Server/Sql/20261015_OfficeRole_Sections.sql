-- Run against RKNET before deploying the updated OfficeRole model.
-- Роли получают раздел (Section) — по нему они собираются в блоки в редакторе группы —
-- и ключ взаимоисключения (ExclusiveKey): из ролей с одним ключом группе и пользователю
-- (по всем его группам вместе) можно дать только одну.
-- Повторный запуск безопасен: колонки добавляются, только если их нет, а значения
-- проставляются только там, где они ещё пустые, — правки из интерфейса не затираются.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.OfficeRole', N'Section') IS NULL
    ALTER TABLE dbo.OfficeRole ADD Section nvarchar(50) NULL;

IF COL_LENGTH(N'dbo.OfficeRole', N'ExclusiveKey') IS NULL
    ALTER TABLE dbo.OfficeRole ADD ExclusiveKey nvarchar(50) NULL;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Разделы — по пунктам меню портала. Роль «Админ» (Admin) нигде в коде не используется и остаётся без раздела.
UPDATE r SET Section = v.Section
FROM dbo.OfficeRole AS r
JOIN (VALUES
    (N'Calculator', N'Калькулятор'),
    (N'Location', N'Торговые точки'),
    (N'Users', N'Пользователи'),
    (N'FactoryNX', N'NX Завод'),
    (N'OrdersTTAdmin', N'Заказы ТТ'),
    (N'Order_man', N'Заказы ТТ'),
    (N'Order_woman', N'Заказы ТТ'),
    (N'FactoryPerson', N'Сотрудники завода'),
    (N'Stock', N'Склад'),
    (N'StockAdmin', N'Склад'),
    (N'MenuMarketing', N'Доставка'),
    (N'DeliveryRequests', N'Доставка'),
    (N'MenuAdmin', N'Доставка'),
    (N'MenuAuditor', N'Касса'),
    (N'Menu', N'Касса'),
    (N'CashUpdate', N'Касса'),
    (N'VideoDevices', N'Видео на ТТ'),
    (N'NX', N'Видео на ТТ'),
    (N'Sensors', N'Датчики'),
    (N'SensorsView', N'Датчики'),
    (N'SensorsEdit', N'Датчики'),
    (N'Salary', N'Зарплата'),
    (N'KnowledgeLibrary', N'Библиотека знаний'),
    (N'KnowledgeLibraryAdmin', N'Библиотека знаний'),
    (N'ReportsProfit', N'Отчёты'),
    (N'ReportsProfitPro', N'Отчёты'),
    (N'ReportsChecksTime', N'Отчёты'),
    (N'ReportsServiceDesk', N'Отчёты'),
    (N'ReportsFranchisee', N'Отчёты'),
    (N'ReportsOther', N'Отчёты'),
    (N'Reports1C', N'Отчёты'),
    (N'ReportsAdmin', N'Отчёты')
) AS v (Role, Section) ON v.Role = r.Role
WHERE r.Section IS NULL;

-- Взаимоисключающие уровни доступа к одному разделу:
--   «Заказы ТТ» — админ / все позиции / собственное управление (меняют набор позиций и права);
--   «Датчики» — полный доступ / редактирование / просмотр.
UPDATE r SET ExclusiveKey = v.ExclusiveKey
FROM dbo.OfficeRole AS r
JOIN (VALUES
    (N'OrdersTTAdmin', N'orders'),
    (N'Order_man', N'orders'),
    (N'Order_woman', N'orders'),
    (N'Sensors', N'sensors'),
    (N'SensorsView', N'sensors'),
    (N'SensorsEdit', N'sensors')
) AS v (Role, ExclusiveKey) ON v.Role = r.Role
WHERE r.ExclusiveKey IS NULL;

COMMIT TRANSACTION;
GO

-- Что уже противоречит новым правилам: группы с двумя ролями одного ключа
-- и пользователи, у которых такие роли собираются из разных групп.
SELECT N'группа' AS Kind, g.Name AS Owner, r1.Name AS Role1, r2.Name AS Role2
FROM dbo.OfficeGroup AS g
JOIN dbo.OfficeGroupOfficeRole AS gr1 ON gr1.OfficeGroupId = g.ID
JOIN dbo.OfficeRole AS r1 ON r1.ID = gr1.OfficeRoleId
JOIN dbo.OfficeGroupOfficeRole AS gr2 ON gr2.OfficeGroupId = g.ID
JOIN dbo.OfficeRole AS r2 ON r2.ID = gr2.OfficeRoleId
WHERE r1.ExclusiveKey IS NOT NULL AND r1.ExclusiveKey = r2.ExclusiveKey AND r1.ID < r2.ID
UNION ALL
SELECT DISTINCT N'пользователь', u.Login, r1.Name, r2.Name
FROM dbo.OfficeUser AS u
JOIN dbo.OfficeGroupOfficeUser AS ug1 ON ug1.OfficeUserId = u.Id
JOIN dbo.OfficeGroupOfficeRole AS gr1 ON gr1.OfficeGroupId = ug1.OfficeGroupID
JOIN dbo.OfficeRole AS r1 ON r1.ID = gr1.OfficeRoleId
JOIN dbo.OfficeGroupOfficeUser AS ug2 ON ug2.OfficeUserId = u.Id
JOIN dbo.OfficeGroupOfficeRole AS gr2 ON gr2.OfficeGroupId = ug2.OfficeGroupID
JOIN dbo.OfficeRole AS r2 ON r2.ID = gr2.OfficeRoleId
WHERE u.Actual = 1 AND r1.ExclusiveKey IS NOT NULL AND r1.ExclusiveKey = r2.ExclusiveKey AND r1.ID < r2.ID;
