export type TtBinding = "allTT" | "manualTT";

export function resolveTtSettings(defaultLocations: number | undefined, selectedLocationCount: number) {
  const usesAllLocations = defaultLocations === 1;

  return {
    isTT: usesAllLocations || selectedLocationCount > 0,
    ttBinding: (usesAllLocations || selectedLocationCount === 0 ? "allTT" : "manualTT") as TtBinding,
  };
}

export function getSavedTtSettings(isTT: boolean, ttBinding: TtBinding, selectedLocationGuids: string[]) {
  if (!isTT) {
    return { defaultLocations: 0, locations: [] };
  }

  if (ttBinding === "allTT") {
    return { defaultLocations: 1, locations: [] };
  }

  return { defaultLocations: 0, locations: selectedLocationGuids };
}
