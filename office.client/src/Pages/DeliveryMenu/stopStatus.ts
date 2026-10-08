import type { StopPack } from "./deliveryMenu.types";

export function stopTime(value: string) {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}+03:00`).getTime();
}

export function activeItemStops(packs: StopPack[], item: number, location: string, now: number) {
  return packs.flatMap((pack) => pack.stops
    .filter((stop) => stop.item === item && stop.locationGUID === location && stopTime(stop.begin) <= now && stopTime(stop.end) > now)
    .map((stop) => ({ ...stop, permissionLevel: pack.permissionLevel })));
}

export function formatStopEnd(time: number) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
}
