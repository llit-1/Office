import { useEffect, useRef, useState } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import FilterDramaOutlined from "@mui/icons-material/FilterDramaOutlined";
import CloudOutlined from "@mui/icons-material/CloudOutlined";
import WaterDropOutlined from "@mui/icons-material/WaterDropOutlined";
import AcUnitOutlined from "@mui/icons-material/AcUnitOutlined";
import ThunderstormOutlined from "@mui/icons-material/ThunderstormOutlined";
import GrainOutlined from "@mui/icons-material/GrainOutlined";
import { get } from "../../Services/api";
import styles from "./WeatherNow.module.css";

export interface WeatherDay {
  date: string;
  /** «Сегодня», «Завтра», «Сб 21». */
  name: string;
  temperature: number;
  code: number;
  description: string;
  /** Осадки за день, мм. */
  rain: number;
}

export interface WeatherNowData {
  temperature: number;
  code: number;
  description: string;
  place: string;
  /** Сегодня и следующие дни, до недели. */
  days: WeatherDay[];
}

// the server caches the week for 30 minutes; the parser updates it a few times a day
const REFRESH_MS = 30 * 60 * 1000;

/** WMO-код погоды → иконка. */
export function weatherIcon(code: number): SvgIconComponent {
  if (code === 0) return WbSunnyOutlined;
  if (code === 1 || code === 2) return FilterDramaOutlined;
  if (code >= 51 && code <= 57) return GrainOutlined;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return WaterDropOutlined;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return AcUnitOutlined;
  if (code >= 95) return ThunderstormOutlined;
  return CloudOutlined; // overcast, fog and anything unknown
}

export type WeatherKind = "sun" | "partly" | "cloud" | "drizzle" | "rain" | "snow" | "storm";

/** WMO-код → вид погоды; от него зависит цвет иконки и плитки. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return "sun";
  if (code === 1 || code === 2) return "partly";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloud";
}

export function formatRain(mm: number) {
  return `${mm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} мм`;
}

export function formatTemperature(value: number) {
  // a real minus sign, and no «−0»
  if (value === 0) return "0°";
  return value > 0 ? `+${value}°` : `−${Math.abs(value)}°`;
}

/** Погода в шапке: иконка и температура; по нажатию — прогноз на день по частям. Нет погоды — ничего не показываем. */
export default function WeatherNow() {
  const [weather, setWeather] = useState<WeatherNowData | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // 204 when there is no weather: the body is empty
        const data = await get<WeatherNowData | "">("/Weather");
        if (!cancelled) setWeather(data ? data : null);
      } catch {
        if (!cancelled) setWeather(null);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // closes on a click elsewhere and on Escape, like the profile menu
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!weather) return null;

  const Icon = weatherIcon(weather.code);
  const temperature = formatTemperature(weather.temperature);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.weather}
        data-kind={weatherKind(weather.code)}
        aria-expanded={open}
        aria-label={`Погода: ${weather.place}, ${weather.description}, ${temperature}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon className={styles.icon} aria-hidden="true" />
        <span>{temperature}</span>
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="Прогноз на неделю">
          <div className={styles.head}>
            <span>{weather.place}</span>
            <span className={styles.updated}>средняя за день</span>
          </div>
          <ul className={styles.days}>
            {weather.days.map((day, index) => {
              const DayIcon = weatherIcon(day.code);
              return (
                <li
                  key={day.date}
                  className={styles.day}
                  title={day.description}
                  data-kind={weatherKind(day.code)}
                  data-now={index === 0 || undefined}
                >
                  <span className={styles.dayName}>{day.name}</span>
                  <DayIcon className={styles.icon} aria-label={day.description} />
                  <span className={styles.dayTemp} data-frost={day.temperature < 0 || undefined}>
                    {formatTemperature(day.temperature)}
                  </span>
                  <span className={styles.dayRain}>{day.rain >= 0.1 ? formatRain(day.rain) : ""}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
