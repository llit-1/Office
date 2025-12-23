namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeUser
    {
        public int Id { get; set; }
        public string Login { get; set; } = "";
        public string? Name { get; set; }
        public string? Surname { get; set; }
        public string? Patronymic { get; set; }
        public string? Position { get; set; }
        public int Actual { get; set; }
        public virtual List<OfficeGroup> OfficeGroup { get; set; }

        public OfficeUser()
        {
            OfficeGroup = new List<OfficeGroup>();
        }

        public OfficeUser(string login, string? name): this()
        {
            Login = login;
            Name = name;
        }

        public OfficeUser(string login, string? name, string? password) : this()
        {
            Login = login;
            Name = name;
        }
    }
}
  