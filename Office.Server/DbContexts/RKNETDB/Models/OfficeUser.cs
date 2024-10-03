namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeUser
    {
        public int Id { get; set; }
        public string? Login { get; set; }
        public string? Password { get; set; }
        public string? Name { get; set; }

        public OfficeUser()
        {
            
        }

        public OfficeUser(string? login, string? name)
        {
            Login = login;
            Name = name;
        }

        public OfficeUser(string? login, string? name, string? password)
        {
            Login = login;
            Name = name;
            Password = password;
        }
    }
}
