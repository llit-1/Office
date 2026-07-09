using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.PowerBi.Models;

namespace Office.Server.DbContexts.PowerBi
{
    public class PowerBiContext : DbContext
    {
        public PowerBiContext(DbContextOptions<PowerBiContext> options) : base(options)
        {
        }

        public DbSet<SensorRoom> SensorRooms { get; set; }
        public DbSet<SensorDataPoint> SensorData { get; set; }
        public DbSet<SensorAlertSetting> SensorAlertSettings { get; set; }
        public DbSet<SensorMaintenanceWindow> SensorMaintenanceWindows { get; set; }
        public DbSet<SensorChat> SensorChats { get; set; }
        public DbSet<SensorChatRoom> SensorChatRooms { get; set; }
        public DbSet<SensorChatUser> SensorChatUsers { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<SensorChatRoom>()
                .HasKey(x => new { x.ChatId, x.RoomId });

            modelBuilder.Entity<SensorChatUser>()
                .HasKey(x => new { x.ChatId, x.UserLogin });
        }
    }
}
