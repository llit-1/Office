import { useEffect, useMemo, useState } from "react";
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
};

export function MultiplySelect<T>({
  items,
  getKey,
  getLabel,
  selectedKeys,
  onChange,
  placeholder = "Поиск...",
  disabled = false,
}: MultiplySelectProps<T>) {
  const [searchText, setSearchText] = useState("");

  // Подсветка/выбор — обновляется при каждом клике (это нормально)
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  /**
   * Фиксируем порядок в state, чтобы:
   * 1) после первичной инициализации отрисовалось
   * 2) порядок не пересчитывался от кликов
   */
  const [orderKeys, setOrderKeys] = useState<Key[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!items.length) {
      setOrderKeys([]);
      setInitialized(false);
      return;
    }

    const keysInItems = new Set(items.map(getKey));

    // 1) Первая инициализация: выбранные сверху + алфавит
    if (!initialized) {
      const selectedAtInit = new Set(selectedKeys);

      const sortedOnce = [...items].sort((a, b) => {
        const aKey = getKey(a);
        const bKey = getKey(b);

        const aSel = selectedAtInit.has(aKey);
        const bSel = selectedAtInit.has(bKey);

        if (aSel && !bSel) return -1;
        if (!aSel && bSel) return 1;

        const la = getLabel(a);
        const lb = getLabel(b);

        const byLabel = la.localeCompare(lb, "ru");
        if (byLabel !== 0) return byLabel;

        return String(aKey).localeCompare(String(bKey), "ru");
      });

      setOrderKeys(sortedOnce.map(getKey));
      setInitialized(true);
      return;
    }

    // 2) После инициализации:
    //    - удаляем ключи, которых больше нет
    //    - новые элементы добавляем в конец
    setOrderKeys((prev) => {
      const next = prev.filter((k) => keysInItems.has(k));

      for (const it of items) {
        const k = getKey(it);
        if (!next.includes(k)) next.push(k);
      }

      return next;
    });

    // ВАЖНО: специально НЕ зависим от selectedKeys,
    // чтобы клики не пересортировывали порядок
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, getKey, getLabel, initialized]);

  // key -> item
  const itemByKey = useMemo(() => {
    const map = new Map<Key, T>();
    for (const it of items) map.set(getKey(it), it);
    return map;
  }, [items, getKey]);

  // items в зафиксированном порядке
  const orderedItems = useMemo(() => {
    return orderKeys
      .map((k) => itemByKey.get(k))
      .filter((x): x is T => Boolean(x));
  }, [orderKeys, itemByKey]);

  // Фильтрация НЕ меняет порядок
  const visibleItems = useMemo(() => {
    const lower = searchText.trim().toLowerCase();
    if (!lower) return orderedItems;

    return orderedItems.filter((item) =>
      getLabel(item).toLowerCase().includes(lower)
    );
  }, [orderedItems, searchText, getLabel]);

  const toggle = (key: Key) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };

  return (
    <div className={`${styles.multiplySelectWrapper} ${disabled ? styles.disabled : ""}`}>
      <input
        className={styles.search}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />

      <div className={styles.optionsWrapper}>
        {visibleItems.map((item) => {
          const key = getKey(item);
          const label = getLabel(item);
          const isSelected = selectedSet.has(key);

          return (
            <div
              key={String(key)}
              className={`${styles.optionItem} ${
                isSelected ? styles.selected : ""
              }`}
              onClick={() => toggle(key)}
              role="button"
              tabIndex={0}
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
