import { useState, useMemo, useEffect } from "react";
import styles from "./GenericTable.module.css";
import { useNavigate } from "react-router-dom";

interface Column<T> {
  key: keyof T;
  label: string;
}

interface GenericTableProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  routeTo?: string;
}

function GenericTable<T extends object>({
  columns,
  data,
  routeTo,
}: GenericTableProps<T>) {
    const [sortKey, setSortKey] = useState<keyof T | null>(columns[0]?.key);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [visibleColumnsCount, setVisibleColumnsCount] = useState(columns.length)
    const navigate = useNavigate();
    
  useEffect(() => {
      const updateVisibleColumns = () => {
        const tableWrapper = document.querySelector(`.${styles.tableWrapper}`);
        if (!tableWrapper) return;

        const availableWidth = tableWrapper.clientWidth;
        const approxColumnWidth = 150; // можно скорректировать под твой дизайн
        const maxColumns = Math.floor(availableWidth / approxColumnWidth);

        setVisibleColumnsCount(Math.max(Math.min(columns.length, maxColumns), 1));
      };

      updateVisibleColumns();
      window.addEventListener("resize", updateVisibleColumns);
      return () => window.removeEventListener("resize", updateVisibleColumns);
    }, [columns.length]);

  // 🔹 сортировка данных при изменении ключа/порядка
  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      const aValue = String(a[sortKey] ?? "").toLowerCase();
      const bValue = String(b[sortKey] ?? "").toLowerCase();

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortOrder]);

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const onRowClickHandle = (row: T | null) => {
    if (!routeTo) return;

    navigate(routeTo, {
      state: row,            // тут передаём все данные строки
    });
  };

  const visibleColumns = columns.slice(0, visibleColumnsCount);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {visibleColumns.map(col => (
              <th
                key={String(col.key)}
                onClick={() => handleSort(col.key)}
                className={styles.sortable}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className={styles.sortArrow}>
                    {sortOrder === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className={styles.scrollableTbody}>
          {sortedData.length === 1 ? (
            <tr key={0} className={styles.textAlign} onClick={() => onRowClickHandle(sortedData[0])}>
              {visibleColumns.map(col => (
                <td key={String(col.key)}>{String(sortedData[0][col.key] ?? "")}</td>
              ))}
            </tr>
          ) : sortedData.length > 1 ? (
            sortedData.map((row, idx) => (
              <tr key={idx} onClick={() => onRowClickHandle(sortedData[idx])}>
                {visibleColumns.map(col => (
                  <td key={String(col.key)}>{String(row[col.key] ?? "")}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={visibleColumns.length} className={styles.textAlign}>
                По такому запросу ничего не найдено!
              </td>
            </tr>
          )}
        </tbody>

        <div className={styles.addButton} onClick={() => onRowClickHandle(null)}>+</div>
        
      </table>
    </div>
  );
}

export default GenericTable;
