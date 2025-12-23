namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeRole
    {
        public int ID { get; set; }
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Role { get; set; } = "";

        public virtual List<OfficeGroup> OfficeGroup { get; set; }
        public OfficeRole()
        {
            OfficeGroup = new List<OfficeGroup>();
        }
        public static bool operator ==(OfficeRole left, OfficeRole right)
        {
            return left.ID == right.ID;
        }
        public static bool operator !=(OfficeRole left, OfficeRole right)
        {
            return left.ID != right.ID;
        }

    }
}
