namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeUser
    {
        public int Id { get; set; }
        public string? Login { get; set; }
        public string? Password { get; set; }
        public string? Name { get; set; }

        public virtual List<OfficeRole> OfficeRole { get; set; }
        public virtual List<OfficeGroup> OfficeGroup { get; set; }

        public OfficeUser()
        {
            OfficeGroup = new List<OfficeGroup>();
            OfficeRole = new List<OfficeRole>();
        }

        public OfficeUser(string? login, string? name): this()
        {
            Login = login;
            Name = name;
        }

        public OfficeUser(string? login, string? name, string? password) : this()
        {
            Login = login;
            Name = name;
            Password = password;
        }
    }
}
  