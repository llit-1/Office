import { useEffect, useState } from "react";

export default function useLoadingPresence(active: boolean, exitDuration = 180) {
  const [visible, setVisible] = useState(active);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setExiting(false);
      return undefined;
    }

    if (!visible) return undefined;

    setExiting(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, exitDuration);

    return () => window.clearTimeout(timer);
  }, [active, exitDuration, visible]);

  return { visible, exiting };
}
