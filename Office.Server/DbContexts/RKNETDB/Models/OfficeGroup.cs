namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeGroup
    {
        public int ID { get; set; }
        public string Name { get; set; } = "";
        public virtual List<OfficeRole> OfficeRole { get; set; }
        public OfficeGroup()
        {
            OfficeRole = new List<OfficeRole>();
        }
    }
}
