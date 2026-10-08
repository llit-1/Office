import { useEffect, useRef, useState } from "react";

// Refresh data without replacing the page; keep time-based statuses current even between requests.
export default function useStopRefresh(enabled: boolean, refresh: () => Promise<unknown>) {
  const [now, setNow] = useState(Date.now);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let pending = false;
    const update = async () => {
      setNow(Date.now());
      if (document.visibilityState === "hidden" || pending) return;
      pending = true;
      try { await refreshRef.current(); } finally { pending = false; }
    };
    const onReturn = () => { void update(); };
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "hidden") setNow(Date.now());
    }, 1000);
    const poll = window.setInterval(onReturn, 30_000);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [enabled]);
  return now;
}
