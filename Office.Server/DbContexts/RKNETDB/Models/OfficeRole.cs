using System.ComponentModel.DataAnnotations;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeRole
    {
        public int ID { get; set; }
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Role { get; set; } = "";

        /// <summary>Раздел портала («Заказы ТТ», «Отчёты»…): по нему роли собираются в блоки в редакторе группы.</summary>
        [MaxLength(50)]
        public string? Section { get; set; }

        /// <summary>
        /// Ключ взаимоисключения: из ролей с одинаковым ключом группе, а пользователю — по всем его группам,
        /// можно дать только одну. Пусто — роль ни с чем не конфликтует.
        /// </summary>
        [MaxLength(50)]
        public string? ExclusiveKey { get; set; }
    }
}
