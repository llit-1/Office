import type { Persistor } from "redux-persist";

// Persisted slices that belong to a person, not to the browser. A calculator draft left by the admin
// must not be sent on behalf of the user he switched to, and the other way round.
const PER_USER_SLICES = ["calculatorData", "usersTabs"];
const PERSIST_KEY = "persist:root";

/** Полная загрузка страницы под другим пользователем без его чужих черновиков. */
export function reloadAsAnotherUser(persistor: Persistor, path: string) {
  // Stop redux-persist first, otherwise it writes the old state back before the page unloads.
  persistor.pause();
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const persisted = JSON.parse(raw) as Record<string, unknown>;
      for (const slice of PER_USER_SLICES) delete persisted[slice];
      localStorage.setItem(PERSIST_KEY, JSON.stringify(persisted));
    }
  } catch {
    // Storage is unavailable or corrupted: the reload below still switches the user.
  }
  window.location.assign(path);
}
