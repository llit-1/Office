using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("VideoDevices")]
    public class VideoDevice
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Column("LocationGUID")]
        public Guid? LocationGuid { get; set; }

        [ForeignKey(nameof(LocationGuid))]
        public Location? Location { get; set; }

        public int? Status { get; set; }

        public string Ip { get; set; } = string.Empty;

        [Column("OrientationGUID")]
        public Guid? OrientationGuid { get; set; }

        [ForeignKey(nameof(OrientationGuid))]
        public VideoOrientation? Orientation { get; set; }

        public string VideoList { get; set; } = "[]";

        public int? OnlyMusic { get; set; }

        [Column("CustomADS")]
        public string? CustomAds { get; set; }

        [Column("muteStartTime")]
        public string? MuteStartTime { get; set; }

        [Column("muteEndTime")]
        public string? MuteEndTime { get; set; }

        public string? Version { get; set; }
    }
}
