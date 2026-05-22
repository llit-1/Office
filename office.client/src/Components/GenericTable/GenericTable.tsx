import { useState, useMemo, useEffect, useRef } from "react";
import styles from "./GenericTable.module.css";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../LoadingSpinner/LoadingSpinner";
import React from "react";

export interface WithId {
  id: string | number;
}

export type Column<T> =
  | {
      label: string;
      key: keyof T;
      sortValue?: (row: T) => string | number; // опционально (если key — массив/объект)
    }
  | {
      label: string;
      render: (row: T) => React.ReactNode;
      sortValue?: (row: T) => string | number; // обязательно для сортировки render-колонки
    };

interface GenericTableProps<T extends WithId> {
  columns: Column<T>[];
  data: T[];
  routeTo?: string;
  loading: boolean;
  addOption: boolean;
  initialVisibleRows?: number;
  rowsPerBatch?: number;
}

function isKeyColumn<T>(col: Column<T>): col is Extract<Column<T>, { key: keyof T }> {
  return "key" in col;
}

function GenericTable<T extends WithId>({
  columns,
  data,
  routeTo,
  loading,
  addOption,
  initialVisibleRows = 20,
  rowsPerBatch = 10,
}: GenericTableProps<T>) {
  const navigate = useNavigate();
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  const [sortIndex, setSortIndex] = useState<number>(0);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [visibleColumnsCount, setVisibleColumnsCount] = useState(columns.length);
  const [visibleRowsCount, setVisibleRowsCount] = useState(initialVisibleRows);

  useEffect(() => {
    const updateVisibleColumns = () => {
      const tableWrapper = document.querySelector(`.${styles.tableWrapper}`) as HTMLElement | null;
      if (!tableWrapper) return;

      const availableWidth = tableWrapper.clientWidth;
      const approxColumnWidth = 150;
      const maxColumns = Math.max(1, Math.floor(availableWidth / approxColumnWidth));

      setVisibleColumnsCount(Math.max(Math.min(columns.length, maxColumns), 1));
    };

    updateVisibleColumns();
    window.addEventListener("resize", updateVisibleColumns);
    return () => window.removeEventListener("resize", updateVisibleColumns);
  }, [columns]);

  // если сменились видимые колонки — сбрасываем сортировку в начало
  useEffect(() => {
    setSortIndex(0);
    setSortOrder("asc");
  }, [/* reset when total columns or visible count changes */ columns.length, visibleColumnsCount]);

  const visibleColumns = useMemo(() => columns.slice(0, visibleColumnsCount), [columns, visibleColumnsCount]);

  // Clamp sortIndex if visible columns become fewer
  useEffect(() => {
    if (sortIndex >= visibleColumns.length) {
      setSortIndex(0);
      setSortOrder("asc");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns.length]);

  const getCellValue = (row: T, col: Column<T>): React.ReactNode => {
    if (isKeyColumn(col)) return String(row[col.key] ?? "");
    return col.render(row);
  };

  const getSortValue = (row: T, col: Column<T>): string | number => {
    if (col.sortValue) return col.sortValue(row);

    if (isKeyColumn(col)) {
      const v = row[col.key];
      // если массив/объект и нет sortValue — сортируем по строке (лучше все же задавать sortValue)
      if (Array.isArray(v)) return v.length;
      if (typeof v === "number") return v;
      return String(v ?? "").toLowerCase();
    }

    // render без sortValue сортировать нельзя — возвращаем пустое
    return "";
  };

  const sortedData = useMemo(() => {
    if (loading) return data;
    const col = visibleColumns[sortIndex];
    if (!col) return data;

    return [...data].sort((a, b) => {
      const av = getSortValue(a, col);
      const bv = getSortValue(b, col);

      if (typeof av === "number" && typeof bv === "number") {
        return sortOrder === "asc" ? av - bv : bv - av;
      }

      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();

      if (as < bs) return sortOrder === "asc" ? -1 : 1;
      if (as > bs) return sortOrder === "asc" ? 1 : -1;
      
      return 0;

    });

  }, [data, visibleColumns, sortIndex, sortOrder, loading]);

  useEffect(() => {
    setVisibleRowsCount(initialVisibleRows);
    tbodyRef.current?.scrollTo({ top: 0 });
  }, [initialVisibleRows, data, sortIndex, sortOrder, visibleColumnsCount, loading]);

  useEffect(() => {
    if (loading) return;

    setVisibleRowsCount((current) => {
      if (current <= sortedData.length) return current;
      return Math.max(initialVisibleRows, sortedData.length);
    });
  }, [sortedData.length, loading, initialVisibleRows]);

  const visibleData = useMemo(
    () => sortedData.slice(0, visibleRowsCount),
    [sortedData, visibleRowsCount],
  );

  useEffect(() => {
    if (loading) return;

    const tbody = tbodyRef.current;
    if (!tbody) return;

    if (visibleRowsCount >= sortedData.length) return;

    if (tbody.scrollHeight <= tbody.clientHeight + 1) {
      setVisibleRowsCount((current) => Math.min(current + rowsPerBatch, sortedData.length));
    }
  }, [loading, visibleRowsCount, sortedData.length, rowsPerBatch]);

  const handleTableScroll = (event: React.UIEvent<HTMLTableSectionElement>) => {
    if (loading) return;

    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceToBottom > 120) return;

    setVisibleRowsCount((current) => {
      if (current >= sortedData.length) return current;
      return Math.min(current + rowsPerBatch, sortedData.length);
    });
  };

  const handleSort = (index: number) => {
    if (sortIndex === index) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortIndex(index);
      setSortOrder("asc");
    }
  };

  const onRowClickHandle = (row: T | null) => {
    if (!routeTo) return;

    if (!row) {
      navigate(routeTo);
      return;
    }

    navigate(`${routeTo}/${row.id}`, { state: row });
  };

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {visibleColumns.map((col, index) => (
              <th
                key={isKeyColumn(col) ? String(col.key) : col.label}
                onClick={() => handleSort(index)}
                className={styles.sortable}
              >
                {col.label}
                {sortIndex === index && (
                  <span className={styles.sortArrow}>
                    {sortOrder === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody ref={tbodyRef} className={styles.scrollableTbody} onScroll={handleTableScroll}>
          { loading ? (
            <tr>
              <td colSpan={Math.max(visibleColumns.length, 1)} className={styles.textAlign}>
                <LoadingSpinner />
              </td>
            </tr>
          ) : visibleData.length > 0 ? (
            visibleData.map((row) => (
              <tr key={String(row.id)} onClick={() => onRowClickHandle(row)}>
                {visibleColumns.map((col) => (
                  <td key={col.label} title={String(getCellValue(row, col))}>{getCellValue(row, col)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={Math.max(visibleColumns.length, 1)} className={styles.textAlign}>
                По такому запросу ничего не найдено!
              </td>
            </tr>
          )}
        </tbody>

        {!loading && addOption && (
          <tfoot>
            <tr>
              <td colSpan={Math.max(visibleColumns.length, 1)}>
                <div className={styles.addButton} onClick={() => onRowClickHandle(null)}>
                  +
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default GenericTable;
