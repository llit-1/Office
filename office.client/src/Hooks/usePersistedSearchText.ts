import { useEffect, useMemo, useState } from "react";

function readPersistedSearchValue(storageKey: string): string {
  try {
    return localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

export default function usePersistedSearchText(stateKey: string) {
  const storageKey = useMemo(() => `genericTableSearch:${stateKey}`, [stateKey]);
  const [searchText, setSearchText] = useState(() => readPersistedSearchValue(storageKey));

  useEffect(() => {
    setSearchText(readPersistedSearchValue(storageKey));
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, searchText);
  }, [searchText, storageKey]);

  return [searchText, setSearchText] as const;
}
