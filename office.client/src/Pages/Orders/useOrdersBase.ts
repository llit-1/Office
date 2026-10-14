import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../Store";
import { getPermissions } from "./orders.rules";
import type { OrdersPermissions } from "./orders.types";

/** Права текущего пользователя в разделе. Это подсказка интерфейсу: проверяет их сервер. */
export function usePermissions(): OrdersPermissions {
  const roles = useSelector((state: RootState) => state.userData.roles);
  return useMemo(() => getPermissions(roles), [roles]);
}

/** Текущее время с редким обновлением: статусы и обратный отсчёт меняются без перезагрузки. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Совпадение media-запроса: когда компоновка меняется не только стилями, но и составом элементов. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

interface AsyncState<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
}

/** Загрузка данных с повтором. При reload прежние данные остаются на экране. */
export function useLoader<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: false, loading: true });
  const request = useRef(0);

  const reload = useCallback(async () => {
    const id = ++request.current;
    setState((prev) => ({ ...prev, error: false, loading: true }));
    try {
      const data = await loader();
      if (id === request.current) setState({ data, error: false, loading: false });
    } catch {
      if (id === request.current) setState((prev) => ({ ...prev, error: true, loading: false }));
    }
  }, [loader]);

  useEffect(() => {
    void reload();
    return () => { request.current += 1; };
  }, [reload]);

  return { ...state, reload };
}
