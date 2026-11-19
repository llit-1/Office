import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Обратный отсчёт сессии калькулятора по времени сервера.
 * Сервер отдаёт «сейчас» и конец сессии; разницу с часами браузера учитываем, чтобы неверные часы на кассе не сбивали таймер.
 */
export function useSessionTimer() {
  const [end, setEnd] = useState<number | null>(null);
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  /** serverNow и sessionEnd — время сервера в одном формате. */
  const sync = useCallback((serverNow: string, sessionEnd: string) => {
    offset.current = Date.parse(serverNow) - Date.now();
    setEnd(Date.parse(sessionEnd));
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (end === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [end]);

  const left = end === null ? null : Math.max(0, Math.ceil((end - (now + offset.current)) / 1000));
  return { left, sync };
}

/** 3600 → «60:00», 59 → «0:59». */
export const formatLeft = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
