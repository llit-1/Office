using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models;

/// <summary>
/// Погода по дням, которую кладёт в RKNET парсер Яндекса: средняя за день по городу.
/// У прошедших дней — факт, у будущих — прогноз; predict_* портал не использует.
/// </summary>
[Table("WeatherStatistics")]
public class WeatherStatistic
{
    [Key]
    [Column("date", TypeName = "date")]
    public DateTime Date { get; set; }

    /// <summary>Средняя температура, °C.</summary>
    [Column("temperature")]
    public double? Temperature { get; set; }

    /// <summary>Осадки за день, мм.</summary>
    [Column("rain")]
    public double? Rain { get; set; }

    /// <summary>Ветер, м/с.</summary>
    [Column("wind")]
    public double? Wind { get; set; }

    /// <summary>Облачность в октах: 0 — ясно, 8 — сплошная.</summary>
    [Column("cloudiness")]
    public int? Cloudiness { get; set; }
}
