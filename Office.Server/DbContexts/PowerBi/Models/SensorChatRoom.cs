using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.PowerBi.Models
{
    [Table("SensorChatRooms")]
    public class SensorChatRoom
    {
        [Column("ChatId")]
        public int ChatId { get; set; }

        [Column("RoomId")]
        public int RoomId { get; set; }
    }
}
