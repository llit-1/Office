import { useEffect, useState } from "react";

/** С этой ширины окна позиции раскладываются в два столбца. */
const WIDE_QUERY = "(min-width: 1200px)";

const matches = () => typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches;

export function useWideScreen() {
  const [wide, setWide] = useState(matches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return wide;
}
