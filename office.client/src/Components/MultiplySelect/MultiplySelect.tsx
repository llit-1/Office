import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./MultiplySelect.module.css";

type Key = string | number;

type MultiplySelectProps<T> = {
  items: T[];
  getKey: (item: T) => Key;
  getLabel: (item: T) => string;
  selectedKeys: Key[];
  onChange: (nextSelectedKeys: Key[]) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
};

const INITIAL_VISIBLE_ITEMS = 120;
const VISIBLE_ITEMS_BATCH = 120;
const SCROLL_THRESHOLD_PX = 160;

export function MultiplySelect<T>({
  items,
  getKey,
  getLabel,
  selectedKeys,
  onChange,
  placeholder = "Поиск...",
  disabled = false,
  loading = false,
  loadingText = "Загрузка...",
}: MultiplySelectProps<T>) {
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const [searchText, setSearchText] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ITEMS);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const [orderKeys, setOrderKeys] = useState<Key[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!items.length) {
      setOrderKeys([]);
      setInitialized(false);
      return;
    }

    const keysInItems = new Set(items.map(getKey));

    if (!initialized) {
      const selectedAtInit = new Set(selectedKeys);

      const sortedOnce = [...items].sort((a, b) => {
        const aKey = getKey(a);
        const bKey = getKey(b);

        const aSelected = selectedAtInit.has(aKey);
        const bSelected = selectedAtInit.has(bKey);

        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;

        const byLabel = getLabel(a).localeCompare(getLabel(b), "ru");
        if (byLabel !== 0) return byLabel;

        return String(aKey).localeCompare(String(bKey), "ru");
      });

      setOrderKeys(sortedOnce.map(getKey));
      setInitialized(true);
      return;
    }

    setOrderKeys((prev) => {
      const next = prev.filter((key) => keysInItems.has(key));

      for (const item of items) {
        const key = getKey(item);
        if (!next.includes(key)) {
          next.push(key);
        }
      }

      return next;
    });
  }, [getKey, getLabel, initialized, items, selectedKeys]);

  const itemByKey = useMemo(() => {
    const map = new Map<Key, T>();
    for (const item of items) {
      map.set(getKey(item), item);
    }
    return map;
  }, [getKey, items]);

  const orderedItems = useMemo(
    () =>
      orderKeys
        .map((key) => itemByKey.get(key))
        .filter((item): item is T => Boolean(item)),
    [itemByKey, orderKeys],
  );

  const visibleItems = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    if (!normalizedSearch) {
      return orderedItems;
    }

    return orderedItems.filter((item) => getLabel(item).toLowerCase().includes(normalizedSearch));
  }, [getLabel, orderedItems, searchText]);

  const renderedItems = useMemo(() => visibleItems.slice(0, visibleCount), [visibleCount, visibleItems]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ITEMS);
    if (optionsRef.current) {
      optionsRef.current.scrollTop = 0;
    }
  }, [searchText]);

  const loadMore = () => {
    setVisibleCount((current) => {
      if (current >= visibleItems.length) {
        return current;
      }

      return Math.min(current + VISIBLE_ITEMS_BATCH, visibleItems.length);
    });
  };

  const handleScroll = () => {
    const node = optionsRef.current;
    if (!node || loading) {
      return;
    }

    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceToBottom <= SCROLL_THRESHOLD_PX) {
      loadMore();
    }
  };

  const toggle = (key: Key) => {
    if (disabled || loading) {
      return;
    }

    const next = new Set(selectedSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    onChange(Array.from(next));
  };

  return (
    <div className={`${styles.multiplySelectWrapper} ${disabled ? styles.disabled : ""}`}>
      <input
        className={styles.search}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        placeholder={placeholder}
        disabled={disabled || loading}
      />

      <div ref={optionsRef} className={styles.optionsWrapper} onScroll={handleScroll}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>{loadingText}</span>
          </div>
        )}

        {!loading &&
          renderedItems.map((item) => {
            const key = getKey(item);
            const label = getLabel(item);
            const isSelected = selectedSet.has(key);

            return (
              <div
                key={String(key)}
                className={`${styles.optionItem} ${isSelected ? styles.selected : ""}`}
                onClick={() => toggle(key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(key);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {label}
              </div>
            );
          })}

        {!loading && visibleItems.length > renderedItems.length && (
          <div className={styles.loadMoreHint}>
            Показано {renderedItems.length} из {visibleItems.length}
          </div>
        )}

        {!loading && visibleItems.length === 0 && <div className={styles.emptyState}>Ничего не найдено</div>}
      </div>
    </div>
  );
}
