namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeUser
    {
        public int Id { get; set; }
        public string? Login { get; set; }
        public string? Password { get; set; }
        public string? SurName { get; set; }
        public string? Name { get; set; }
        public string? Patronymic { get; set; }
    }
}
