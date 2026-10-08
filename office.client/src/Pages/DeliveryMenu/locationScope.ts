import type { RequestLocation } from "./deliveryRequests.types";

/** Для каких точек выполнить массовое действие: текущая, выбранные вручную или все доступные. */
export type LocationScope =
  | { mode: "current" }
  | { mode: "manual"; guids: string[] }
  | { mode: "all" };

export function initialScope(current: RequestLocation | null): LocationScope {
  return current ? { mode: "current" } : { mode: "manual", guids: [] };
}

export function scopeGuids(scope: LocationScope, locations: RequestLocation[], current: RequestLocation | null): string[] {
  if (scope.mode === "all") return locations.map((location) => location.guid);
  if (scope.mode === "manual") return scope.guids;
  return current ? [current.guid] : [];
}
