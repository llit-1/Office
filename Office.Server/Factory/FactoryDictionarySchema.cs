using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Tasks;

namespace Office.Server.Factory
{
    /// <summary>
    /// Справочники завода заводились в БД вручную: у одних Id — IDENTITY, у других нет,
    /// длина Name тоже разная. Вместо того чтобы помнить это в моделях, читаем схему таблицы.
    /// </summary>
    public static class FactoryDictionarySchema
    {
        public class TableInfo
        {
            public bool IdIsIdentity { get; set; }

            /// <summary>Длина колонки Name; null или -1 — без ограничения (nvarchar(max)).</summary>
            public int? NameMaxLength { get; set; }
        }

        private static readonly ConcurrentDictionary<Type, TableInfo> Cache = new();

        public static async Task<TableInfo> GetAsync<T>(RKNETDBContext context) where T : class
        {
            if (Cache.TryGetValue(typeof(T), out var cached)) return cached;

            var entityType = context.Model.FindEntityType(typeof(T))
                ?? throw new InvalidOperationException($"{typeof(T).Name} is not mapped");
            var table = entityType.GetTableName()!;
            var schema = entityType.GetSchema() ?? "dbo";
            var fullName = $"{schema}.{table}";

            var info = (await context.Database.SqlQuery<TableInfo>($@"
                SELECT
                    CAST(ISNULL(COLUMNPROPERTY(OBJECT_ID({fullName}), 'Id', 'IsIdentity'), 0) AS bit) AS IdIsIdentity,
                    (SELECT TOP 1 CHARACTER_MAXIMUM_LENGTH
                     FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = {schema} AND TABLE_NAME = {table} AND COLUMN_NAME = 'Name') AS NameMaxLength")
                .ToListAsync())
                .First();

            Cache[typeof(T)] = info;
            return info;
        }

        /// <summary>
        /// Назначает Id = MAX(Id) + 1 новой записи, если в таблице Id не IDENTITY.
        /// Вызывать внутри Serializable-транзакции, чтобы параллельные вставки не получили одинаковый Id.
        /// </summary>
        public static async Task AssignIdIfNeededAsync<T>(RKNETDBContext context, T entity) where T : class
        {
            var info = await GetAsync<T>(context);
            if (info.IdIsIdentity) return;

            var maxId = await context.Set<T>().MaxAsync(x => (int?)EF.Property<int>(x, "Id")) ?? 0;
            context.Entry(entity).Property("Id").CurrentValue = maxId + 1;
        }

        /// <summary>Текст ошибки, если название не помещается в колонку, иначе null.</summary>
        public static async Task<string?> ValidateNameLengthAsync<T>(RKNETDBContext context, string name) where T : class
        {
            var info = await GetAsync<T>(context);
            return info.NameMaxLength is int max && max > 0 && name.Length > max
                ? $"Название не должно быть длиннее {max} символов."
                : null;
        }
    }
}
