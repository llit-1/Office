/** Снег идёт с 15 ноября по конец февраля. */
export function isSnowSeason(date: Date): boolean {
  const month = date.getMonth() + 1;
  return month === 12 || month === 1 || month === 2 || (month === 11 && date.getDate() >= 15);
}

/**
 * Показывать ли снег. Выбор пользователя в настройках важнее всего; пока он ничего не выбирал,
 * снег включён, кроме тех, кто попросил систему уменьшить анимацию.
 */
export function shouldShowSnow(date: Date, choice: boolean | null | undefined, prefersReducedMotion: boolean): boolean {
  if (!isSnowSeason(date)) return false;
  return choice ?? !prefersReducedMotion;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
