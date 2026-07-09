import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import useWindowSize from "../../Hooks/useWindowSize";
import Checkbox from "../Checkbox/Checkbox";
import LoadingSpinner from "../LoadingSpinner/LoadingSpinner";
import { highlightMatches, includesNormalized, normalizeSearchText } from "./searchUtils";
import styles from "./GenericTable.module.css";

export interface WithId {
  id: string | number;
}

type ViewportBucket = "phone" | "tablet" | "desktop";

interface ResponsiveColumnOptions {
  defaultVisible?: boolean;
  responsivePriority?: number;
  responsivePriorityByViewport?: Partial<Record<ViewportBucket, number>>;
}

type BaseColumn<T> = ResponsiveColumnOptions & {
  label: string;
  sortValue?: (row: T) => string | number;
  filterValue?: (row: T) => string | number | null | undefined;
};

export type Column<T> =
  | (BaseColumn<T> & {
      key: keyof T;
    })
  | (BaseColumn<T> & {
      render: (row: T) => React.ReactNode;
    });

interface GenericTableProps<T extends WithId> {
  columns: Column<T>[];
  data: T[];
  routeTo?: string;
  onRowClick?: (row: T) => void;
  loading: boolean;
  addOption: boolean;
  onAddClick?: () => void;
  wrapperClassName?: string;
  initialVisibleRows?: number;
  rowsPerBatch?: number;
  tableStateKey?: string;
  highlightQuery?: string;
  searchText?: string;
  onSearchTextChange?: (value: string) => void;
  searchPlaceholder?: string;
}

type RowDensity = "compact" | "normal" | "comfortable";

interface PersistedTableState {
  sortColumnId: string | null;
  sortOrder: "asc" | "desc";
  orderedColumnIds?: string[];
  visibleColumnIds?: string[];
  visibleColumnMode?: "default" | "custom";
  rowDensity?: RowDensity;
  filters: Record<string, string[]>;
}

interface PopupPosition {
  left: number;
  top: number;
  maxHeight: number;
}

const EMPTY_FILTER_VALUE = "__generic_table_empty__";
const DEFAULT_ROW_DENSITY: RowDensity = "normal";
const PHONE_MAX_WIDTH = 586;
const TABLET_MAX_WIDTH = 900;
const PHONE_DEFAULT_VISIBLE_COLUMNS = 2;
const TABLET_DEFAULT_VISIBLE_COLUMNS = 4;
const ROW_DENSITY_OPTIONS: Array<{ value: RowDensity; label: string }> = [
  { value: "compact", label: "Компактно" },
  { value: "normal", label: "Обычно" },
  { value: "comfortable", label: "Компактно+" },
];

const RUSSIAN_COLLATOR = new Intl.Collator("ru", {
  sensitivity: "base",
  numeric: true,
});

function isKeyColumn<T>(column: Column<T>): column is Extract<Column<T>, { key: keyof T }> {
  return "key" in column;
}

function readPersistedState(storageKey: string): PersistedTableState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedTableState>;
    return {
      sortColumnId: typeof parsed.sortColumnId === "string" ? parsed.sortColumnId : null,
      sortOrder: parsed.sortOrder === "desc" ? "desc" : "asc",
      orderedColumnIds: Array.isArray(parsed.orderedColumnIds) ? parsed.orderedColumnIds : undefined,
      visibleColumnIds: Array.isArray(parsed.visibleColumnIds) ? parsed.visibleColumnIds : undefined,
      visibleColumnMode: parsed.visibleColumnMode === "custom" ? "custom" : "default",
      rowDensity:
        parsed.rowDensity === "compact" || parsed.rowDensity === "comfortable" || parsed.rowDensity === "normal"
          ? parsed.rowDensity
          : DEFAULT_ROW_DENSITY,
      filters: parsed.filters && typeof parsed.filters === "object" ? parsed.filters : {},
    };
  } catch {
    return null;
  }
}

function normalizeFilterValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return EMPTY_FILTER_VALUE;
  return String(value);
}

function displayFilterValue(value: string): string {
  return value === EMPTY_FILTER_VALUE ? "(Пустые)" : value;
}

function hasColumnFilter(filters: Record<string, string[]>, columnId: string): boolean {
  return Object.prototype.hasOwnProperty.call(filters, columnId);
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function getDefaultVisibleColumnLimit(viewportWidth: number): number | null {
  if (viewportWidth <= PHONE_MAX_WIDTH) return PHONE_DEFAULT_VISIBLE_COLUMNS;
  if (viewportWidth <= TABLET_MAX_WIDTH) return TABLET_DEFAULT_VISIBLE_COLUMNS;
  return null;
}

function getViewportBucket(viewportWidth: number): ViewportBucket {
  if (viewportWidth <= PHONE_MAX_WIDTH) return "phone";
  if (viewportWidth <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

function getColumnResponsivePriority<T>(column: Column<T>, viewportBucket: ViewportBucket, index: number): number {
  const viewportPriority = column.responsivePriorityByViewport?.[viewportBucket];
  if (typeof viewportPriority === "number") return viewportPriority;
  if (typeof column.responsivePriority === "number") return column.responsivePriority;
  if (viewportBucket !== "desktop") return 10_000 + index;
  return index;
}

function computePopupPosition(
  anchorRect: DOMRect,
  popupWidth: number,
  popupHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  preferAbove = false,
): PopupPosition {
  const margin = 8;
  const preferredRightSpace = viewportWidth - anchorRect.left - margin;
  const preferredLeftSpace = anchorRect.right - margin;

  let left =
    preferredRightSpace >= popupWidth || preferredRightSpace >= preferredLeftSpace
      ? anchorRect.left
      : anchorRect.right - popupWidth;
  left = Math.max(margin, Math.min(left, viewportWidth - popupWidth - margin));

  const availableBelow = viewportHeight - anchorRect.bottom - margin;
  const availableAbove = anchorRect.top - margin;

  const shouldOpenBelow = preferAbove
    ? availableBelow > availableAbove && availableBelow >= popupHeight
    : availableBelow >= popupHeight || availableBelow >= availableAbove;

  let top = shouldOpenBelow ? anchorRect.bottom + 8 : anchorRect.top - popupHeight - 8;

  const maxHeight = Math.max(180, viewportHeight - margin * 2);
  top = Math.max(margin, Math.min(top, viewportHeight - Math.min(popupHeight, maxHeight) - margin));

  return {
    left,
    top,
    maxHeight: Math.max(180, viewportHeight - top - margin),
  };
}

function GenericTable<T extends WithId>({
  columns,
  data,
  routeTo,
  onRowClick,
  loading,
  addOption,
  onAddClick,
  wrapperClassName,
  initialVisibleRows = 20,
  rowsPerBatch = 10,
  tableStateKey,
  highlightQuery = "",
  searchText,
  onSearchTextChange,
  searchPlaceholder = "Поиск...",
}: GenericTableProps<T>) {
  const navigate = useNavigate();
  const location = useLocation();
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const filterSearchRef = useRef<Record<string, string>>({});
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const { width: viewportWidth } = useWindowSize();
  const viewportBucket = getViewportBucket(viewportWidth);
  const persistedStateKey = `genericTable:${tableStateKey ?? location.pathname}:${viewportBucket}`;
  const persistedState = useMemo(() => readPersistedState(persistedStateKey), [persistedStateKey]);

  const columnsWithId = useMemo(
    () =>
      columns.map((column, index) => ({
        id: isKeyColumn(column) ? String(column.key) : `${column.label}_${index}`,
        column,
      })),
    [columns],
  );
  const columnsById = useMemo(
    () => Object.fromEntries(columnsWithId.map((entry) => [entry.id, entry])) as Record<string, (typeof columnsWithId)[number]>,
    [columnsWithId],
  );
  const defaultOrderedColumnIds = useMemo(
    () => columnsWithId.map(({ id }) => id),
    [columnsWithId],
  );

  const baseDefaultVisibleColumnIds = useMemo(
    () =>
      columnsWithId
        .filter(({ column }) => column.defaultVisible !== false)
        .map(({ id }) => id),
    [columnsWithId],
  );
  const defaultVisibleColumnIds = useMemo(() => {
    const limit = getDefaultVisibleColumnLimit(viewportWidth);
    if (limit === null || baseDefaultVisibleColumnIds.length <= limit) {
      return baseDefaultVisibleColumnIds;
    }

    const visibleColumnSet = new Set(baseDefaultVisibleColumnIds);
    const prioritizedIds = columnsWithId
      .map((entry, index) => ({
        id: entry.id,
        priority: getColumnResponsivePriority(entry.column, viewportBucket, index),
        index,
      }))
      .filter(({ id }) => visibleColumnSet.has(id))
      .sort((a, b) => (a.priority === b.priority ? a.index - b.index : a.priority - b.priority))
      .slice(0, Math.max(1, limit))
      .map(({ id }) => id);

    const prioritizedIdSet = new Set(prioritizedIds);
    return baseDefaultVisibleColumnIds.filter((id) => prioritizedIdSet.has(id));
  }, [baseDefaultVisibleColumnIds, columnsWithId, viewportBucket, viewportWidth]);

  const deriveOrderedColumnIds = (persistedOrderedColumnIds?: string[]) => {
    if (!persistedOrderedColumnIds || persistedOrderedColumnIds.length === 0) {
      return defaultOrderedColumnIds;
    }

    const existing = persistedOrderedColumnIds.filter((id) => defaultOrderedColumnIds.includes(id));
    const missing = defaultOrderedColumnIds.filter((id) => !existing.includes(id));
    return [...existing, ...missing];
  };

  const deriveVisibleColumnIds = (persistedVisibleColumnIds?: string[]) => {
    const fallback = defaultVisibleColumnIds.length > 0 ? defaultVisibleColumnIds : defaultOrderedColumnIds.slice(0, 1);

    if (!persistedVisibleColumnIds || persistedVisibleColumnIds.length === 0) {
      return fallback;
    }

    const persistedExisting = persistedVisibleColumnIds.filter((id) => defaultOrderedColumnIds.includes(id));
    return persistedExisting.length > 0 ? persistedExisting : fallback;
  };

  const initialVisibleColumnMode: "default" | "custom" = (() => {
    if (persistedState?.visibleColumnMode === "default" || persistedState?.visibleColumnMode === "custom") {
      return persistedState.visibleColumnMode;
    }

    const persistedVisibleColumnIds = persistedState?.visibleColumnIds?.filter((id) => defaultOrderedColumnIds.includes(id)) ?? [];
    if (persistedVisibleColumnIds.length === 0) {
      return "default";
    }

    return areStringArraysEqual(persistedVisibleColumnIds, baseDefaultVisibleColumnIds) ? "default" : "custom";
  })();

  const [sortColumnId, setSortColumnId] = useState<string | null>(persistedState?.sortColumnId ?? null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(persistedState?.sortOrder ?? "asc");
  const [orderedColumnIds, setOrderedColumnIds] = useState<string[]>(() =>
    deriveOrderedColumnIds(persistedState?.orderedColumnIds),
  );
  const [visibleColumnMode, setVisibleColumnMode] = useState<"default" | "custom">(initialVisibleColumnMode);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() =>
    deriveVisibleColumnIds(initialVisibleColumnMode === "custom" ? persistedState?.visibleColumnIds : undefined),
  );
  const [rowDensity, setRowDensity] = useState<RowDensity>(persistedState?.rowDensity ?? DEFAULT_ROW_DENSITY);
  const [visibleRowsCount, setVisibleRowsCount] = useState(initialVisibleRows);
  const [filters, setFilters] = useState<Record<string, string[]>>(persistedState?.filters ?? {});
  const [openFilterColumnId, setOpenFilterColumnId] = useState<string | null>(null);
  const [filterSearchText, setFilterSearchText] = useState("");
  const [filterMenuPosition, setFilterMenuPosition] = useState<PopupPosition | null>(null);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [columnsMenuPosition, setColumnsMenuPosition] = useState<PopupPosition | null>(null);
  const normalizedHighlightQuery = useMemo(() => normalizeSearchText(highlightQuery), [highlightQuery]);

  useEffect(() => {
    const nextVisibleColumnMode: "default" | "custom" = (() => {
      if (persistedState?.visibleColumnMode === "default" || persistedState?.visibleColumnMode === "custom") {
        return persistedState.visibleColumnMode;
      }

      const persistedVisibleColumnIds =
        persistedState?.visibleColumnIds?.filter((id) => defaultOrderedColumnIds.includes(id)) ?? [];
      if (persistedVisibleColumnIds.length === 0) {
        return "default";
      }

      return areStringArraysEqual(persistedVisibleColumnIds, baseDefaultVisibleColumnIds) ? "default" : "custom";
    })();

    const nextVisibleColumnIds = deriveVisibleColumnIds(
      nextVisibleColumnMode === "custom" ? persistedState?.visibleColumnIds : undefined,
    );

    setSortColumnId(persistedState?.sortColumnId ?? nextVisibleColumnIds[0] ?? defaultOrderedColumnIds[0] ?? null);
    setSortOrder(persistedState?.sortOrder ?? "asc");
    setOrderedColumnIds(deriveOrderedColumnIds(persistedState?.orderedColumnIds));
    setVisibleColumnMode(nextVisibleColumnMode);
    setVisibleColumnIds(nextVisibleColumnIds);
    setRowDensity(persistedState?.rowDensity ?? DEFAULT_ROW_DENSITY);
    setFilters(persistedState?.filters ?? {});
    setOpenFilterColumnId(null);
    setFilterSearchText("");
    setColumnsMenuOpen(false);
    setColumnsMenuPosition(null);
    filterSearchRef.current = {};
  }, [baseDefaultVisibleColumnIds, defaultOrderedColumnIds, persistedState, persistedStateKey]);

  useEffect(() => {
    setOrderedColumnIds((current) => {
      const next = deriveOrderedColumnIds(current);
      return areStringArraysEqual(current, next) ? current : next;
    });
  }, [defaultOrderedColumnIds]);

  useEffect(() => {
    setVisibleColumnIds((current) => {
      const next = visibleColumnMode === "default" ? deriveVisibleColumnIds() : deriveVisibleColumnIds(current);
      return areStringArraysEqual(current, next) ? current : next;
    });
  }, [defaultOrderedColumnIds, defaultVisibleColumnIds, visibleColumnMode]);

  useEffect(() => {
    if (columnsWithId.length === 0) {
      setSortColumnId(null);
      return;
    }

    if (!columnsWithId.some(({ id }) => id === sortColumnId)) {
      setSortColumnId(deriveVisibleColumnIds()[0] ?? columnsWithId[0].id);
      setSortOrder("asc");
    }
  }, [columnsWithId, sortColumnId]);

  const visibleColumns = useMemo(() => {
    const visibleSet = new Set(visibleColumnIds);
    return orderedColumnIds
      .map((id) => columnsById[id])
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry) && visibleSet.has(entry.id));
  }, [columnsById, orderedColumnIds, visibleColumnIds]);

  useEffect(() => {
    if (visibleColumns.length === 0) {
      setVisibleColumnIds(defaultVisibleColumnIds.length > 0 ? defaultVisibleColumnIds : columnsWithId.slice(0, 1).map(({ id }) => id));
      return;
    }

    if (!visibleColumns.some(({ id }) => id === sortColumnId)) {
      setSortColumnId(visibleColumns[0].id);
      setSortOrder("asc");
    }
  }, [columnsWithId, defaultVisibleColumnIds, sortColumnId, visibleColumns]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;

      if (openFilterColumnId) {
        if (filterMenuRef.current?.contains(targetNode)) return;
        if (filterButtonRefs.current[openFilterColumnId]?.contains(targetNode)) return;
        setOpenFilterColumnId(null);
      }

      if (columnsMenuOpen) {
        if (settingsMenuRef.current?.contains(targetNode)) return;
        if (settingsButtonRef.current?.contains(targetNode)) return;
        setColumnsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [columnsMenuOpen, openFilterColumnId]);

  useEffect(() => {
    const searchText = openFilterColumnId ? filterSearchRef.current[openFilterColumnId] ?? "" : "";
    setFilterSearchText(searchText);
  }, [openFilterColumnId]);

  useEffect(() => {
    if (!openFilterColumnId) {
      setFilterMenuPosition(null);
      return;
    }

    const updateFilterMenuPosition = () => {
      const button = filterButtonRefs.current[openFilterColumnId];
      if (!button) return;

      const popupPosition = computePopupPosition(
        button.getBoundingClientRect(),
        filterMenuRef.current?.offsetWidth ?? 280,
        filterMenuRef.current?.offsetHeight ?? 360,
        window.innerWidth,
        window.innerHeight,
      );

      setFilterMenuPosition(popupPosition);
    };

    updateFilterMenuPosition();
    window.addEventListener("resize", updateFilterMenuPosition);
    const handleFilterMenuScroll = (event: Event) => {
      const targetNode = event.target as Node | null;
      if (targetNode && filterMenuRef.current?.contains(targetNode)) return;
      updateFilterMenuPosition();
    };
    window.addEventListener("scroll", handleFilterMenuScroll, true);

    return () => {
      window.removeEventListener("resize", updateFilterMenuPosition);
      window.removeEventListener("scroll", handleFilterMenuScroll, true);
    };
  }, [openFilterColumnId, visibleColumnIds]);

  useLayoutEffect(() => {
    if (!columnsMenuOpen) {
      setColumnsMenuPosition(null);
      return;
    }

    const updateColumnsMenuPosition = () => {
      const button = settingsButtonRef.current;
      if (!button) return;
      const estimatedColumnsMenuHeight = columnsWithId.length > 1 ? 320 : 176;

      const popupPosition = computePopupPosition(
        button.getBoundingClientRect(),
        settingsMenuRef.current?.offsetWidth ?? 280,
        settingsMenuRef.current?.offsetHeight ?? estimatedColumnsMenuHeight,
        window.innerWidth,
        window.innerHeight,
        true,
      );

      setColumnsMenuPosition(popupPosition);
    };

    updateColumnsMenuPosition();
    window.addEventListener("resize", updateColumnsMenuPosition);
    const handleColumnsMenuScroll = (event: Event) => {
      const targetNode = event.target as Node | null;
      if (targetNode && settingsMenuRef.current?.contains(targetNode)) return;
      updateColumnsMenuPosition();
    };
    window.addEventListener("scroll", handleColumnsMenuScroll, true);

    return () => {
      window.removeEventListener("resize", updateColumnsMenuPosition);
      window.removeEventListener("scroll", handleColumnsMenuScroll, true);
    };
  }, [columnsMenuOpen, columnsWithId.length]);

  const getCellValue = (row: T, column: Column<T>): React.ReactNode => {
    if (isKeyColumn(column)) return String(row[column.key] ?? "");
    return column.render(row);
  };

  const getSortValue = (row: T, column: Column<T>): string | number => {
    if (column.sortValue) return column.sortValue(row);

    if (isKeyColumn(column)) {
      const value = row[column.key];
      if (Array.isArray(value)) return value.length;
      if (typeof value === "number") return value;
      return String(value ?? "");
    }

    return "";
  };

  const getFilterValue = (row: T, column: Column<T>): string => {
    if (column.filterValue) return normalizeFilterValue(column.filterValue(row));

    if (isKeyColumn(column)) {
      return normalizeFilterValue(row[column.key] as string | number | null | undefined);
    }

    const rendered = column.render(row);
    if (typeof rendered === "string" || typeof rendered === "number") {
      return normalizeFilterValue(rendered);
    }

    if (column.sortValue) return normalizeFilterValue(column.sortValue(row));
    return EMPTY_FILTER_VALUE;
  };

  const filteredData = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([columnId]) => visibleColumns.some(({ id }) => id === columnId));
    if (activeFilters.length === 0) return data;

    return data.filter((row) =>
      activeFilters.every(([columnId, selectedValues]) => {
        const columnEntry = columnsWithId.find(({ id }) => id === columnId);
        if (!columnEntry) return true;
        return selectedValues.includes(getFilterValue(row, columnEntry.column));
      }),
    );
  }, [columnsWithId, data, filters, visibleColumns]);

  const filterOptionStatsByColumn = useMemo(() => {
    const stats = Object.fromEntries(
      visibleColumns.map(({ id }) => [id, {} as Record<string, number>]),
    ) as Record<string, Record<string, number>>;

    visibleColumns.forEach(({ id, column }) => {
      const dataWithoutCurrentFilter = data.filter((row) =>
        Object.entries(filters).every(([filterColumnId, selectedValues]) => {
          if (filterColumnId === id) return true;
          const columnEntry = columnsWithId.find(({ id: candidateId }) => candidateId === filterColumnId);
          if (!columnEntry) return true;
          return selectedValues.includes(getFilterValue(row, columnEntry.column));
        }),
      );

      dataWithoutCurrentFilter.forEach((row) => {
        const value = getFilterValue(row, column);
        stats[id][value] = (stats[id][value] ?? 0) + 1;
      });
    });

    return stats;
  }, [columnsWithId, data, filters, visibleColumns]);

  const filterOptionsByColumn = useMemo(() => {
    const entries = visibleColumns.map(({ id }) => {
      const availableValues = Object.entries(filterOptionStatsByColumn[id] ?? {})
        .filter(([, count]) => count > 0)
        .map(([value]) => value);
      const selectedValues = filters[id] ?? [];
      const values = Array.from(new Set([...availableValues, ...selectedValues])).sort((a, b) =>
        displayFilterValue(a).localeCompare(displayFilterValue(b), "ru"),
      );

      return [id, values] as const;
    });

    return Object.fromEntries(entries) as Record<string, string[]>;
  }, [filterOptionStatsByColumn, filters, visibleColumns]);

  const sortedData = useMemo(() => {
    if (loading) return filteredData;

    const columnEntry = visibleColumns.find(({ id }) => id === sortColumnId) ?? visibleColumns[0];
    if (!columnEntry) return filteredData;

    return [...filteredData].sort((a, b) => {
      const av = getSortValue(a, columnEntry.column);
      const bv = getSortValue(b, columnEntry.column);

      if (typeof av === "number" && typeof bv === "number") {
        return sortOrder === "asc" ? av - bv : bv - av;
      }

      const comparison = RUSSIAN_COLLATOR.compare(String(av), String(bv));
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredData, loading, sortColumnId, sortOrder, visibleColumns]);

  useEffect(() => {
    const visibleColumnSet = new Set(visibleColumnIds);
    setFilters((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([columnId]) => visibleColumnSet.has(columnId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [visibleColumnIds]);

  useEffect(() => {
    const payload: PersistedTableState = {
      sortColumnId,
      sortOrder,
      orderedColumnIds,
      visibleColumnIds,
      visibleColumnMode,
      rowDensity,
      filters,
    };

    localStorage.setItem(persistedStateKey, JSON.stringify(payload));
  }, [filters, orderedColumnIds, persistedStateKey, rowDensity, sortColumnId, sortOrder, visibleColumnIds, visibleColumnMode]);

  useEffect(() => {
    setVisibleRowsCount(initialVisibleRows);
    if (typeof tbodyRef.current?.scrollTo === "function") {
      tbodyRef.current.scrollTo({ top: 0 });
    } else if (tbodyRef.current) {
      tbodyRef.current.scrollTop = 0;
    }
  }, [filteredData, initialVisibleRows, loading, sortColumnId, sortOrder, visibleColumnIds]);

  useEffect(() => {
    if (loading) return;

    setVisibleRowsCount((current) => {
      if (current <= sortedData.length) return current;
      return Math.max(initialVisibleRows, sortedData.length);
    });
  }, [initialVisibleRows, loading, sortedData.length]);

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
  }, [loading, rowsPerBatch, sortedData.length, visibleRowsCount]);

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

  const handleSort = (columnId: string) => {
    if (sortColumnId === columnId) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumnId(columnId);
    setSortOrder("asc");
  };

  const handleFilterButtonClick = (columnId: string) => {
    setOpenFilterColumnId((current) => (current === columnId ? null : columnId));
    setColumnsMenuOpen(false);
  };

  const getSelectedValues = (columnId: string): string[] => {
    const options = filterOptionsByColumn[columnId] ?? [];
    return hasColumnFilter(filters, columnId) ? filters[columnId] ?? [] : options;
  };

  const setColumnSelection = (columnId: string, values: string[]) => {
    const options = filterOptionsByColumn[columnId] ?? [];

    setFilters((current) => {
      if (values.length === options.length) {
        const next = { ...current };
        delete next[columnId];
        return next;
      }

      return {
        ...current,
        [columnId]: values,
      };
    });
  };

  const handleToggleFilterValue = (columnId: string, value: string) => {
    const selectedValues = getSelectedValues(columnId);
    const nextValues = selectedValues.includes(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];

    setColumnSelection(columnId, nextValues);
  };

  const handleToggleSelectAll = (columnId: string, checked: boolean) => {
    const options = filterOptionsByColumn[columnId] ?? [];
    setColumnSelection(columnId, checked ? options : []);
  };

  const resetColumnFilter = (columnId: string) => {
    setFilters((current) => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
  };

  const isColumnFiltered = (columnId: string) => {
    const options = filterOptionsByColumn[columnId] ?? [];
    if (!hasColumnFilter(filters, columnId)) return false;
    const selected = filters[columnId] ?? [];
    return selected.length !== options.length;
  };

  const handleToggleVisibleColumn = (columnId: string) => {
    setVisibleColumnMode("custom");
    setVisibleColumnIds((current) => {
      const isVisible = current.includes(columnId);

      if (isVisible) {
        if (current.length === 1) return current;
        return current.filter((id) => id !== columnId);
      }

      const nextVisibleSet = new Set([...current, columnId]);
      return columnsWithId.filter(({ id }) => nextVisibleSet.has(id)).map(({ id }) => id);
    });
  };

  const handleMoveColumn = (columnId: string, direction: "up" | "down") => {
    setOrderedColumnIds((current) => {
      const currentIndex = current.indexOf(columnId);
      if (currentIndex === -1) return current;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
      return next;
    });
  };

  const areColumnsCustomized = useMemo(
    () =>
      !areStringArraysEqual(
        visibleColumnIds,
        defaultVisibleColumnIds.length > 0 ? defaultVisibleColumnIds : defaultOrderedColumnIds.slice(0, 1),
      ) || !areStringArraysEqual(orderedColumnIds, defaultOrderedColumnIds) || rowDensity !== DEFAULT_ROW_DENSITY,
    [defaultOrderedColumnIds, defaultVisibleColumnIds, orderedColumnIds, rowDensity, visibleColumnIds],
  );

  const resetTableSettings = () => {
    const defaultVisible = defaultVisibleColumnIds.length > 0 ? defaultVisibleColumnIds : defaultOrderedColumnIds.slice(0, 1);
    setSortColumnId(defaultVisible[0] ?? defaultOrderedColumnIds[0] ?? null);
    setSortOrder("asc");
    setOrderedColumnIds(defaultOrderedColumnIds);
    setVisibleColumnMode("default");
    setVisibleColumnIds(defaultVisible);
    setRowDensity(DEFAULT_ROW_DENSITY);
    setFilters({});
    filterSearchRef.current = {};
    setOpenFilterColumnId(null);
  };

  const onRowClickHandle = (row: T | null) => {
    if (row && onRowClick) {
      onRowClick(row);
      return;
    }

    if (!routeTo) return;

    if (!row) {
      navigate(routeTo);
      return;
    }

    navigate(`${routeTo}/${row.id}`, { state: row });
  };

  const handleAddClick = () => {
    if (onAddClick) {
      onAddClick();
      return;
    }

    onRowClickHandle(null);
  };

  const renderCellValue = (value: React.ReactNode) => {
    if (typeof value === "string" || typeof value === "number") {
      return highlightMatches(value, normalizedHighlightQuery);
    }

    return value;
  };

  const showSettingsButton = columnsWithId.length > 0;
  const canCustomizeColumns = columnsWithId.length > 1;
  const shouldStretchSingleRow = loading || visibleData.length === 0;
  const shouldAddSingleRowSpacing = !loading && visibleData.length === 1;

  return (
    <div className={`${styles.tableWrapper} ${styles[`density_${rowDensity}`]} ${wrapperClassName ?? ""}`} ref={wrapperRef}>
      {typeof searchText === "string" && onSearchTextChange && (
        <label className={styles.tableSearch}>
          <SearchRoundedIcon fontSize="small" />
          <input
            type="text"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            {visibleColumns.map(({ id, column }) => {
              const columnFiltered = isColumnFiltered(id);

              return (
                <th key={id} onClick={() => handleSort(id)} className={styles.sortable}>
                  <div className={styles.headerCell}>
                    <span className={styles.headerLabel}>{column.label}</span>

                    <div className={styles.headerActions}>
                      {sortColumnId === id && (
                        <span className={styles.sortArrow}>{sortOrder === "asc" ? "▲" : "▼"}</span>
                      )}

                      <button
                        type="button"
                        className={`${styles.filterButton} ${columnFiltered ? styles.filterButtonActive : ""}`}
                        ref={(element) => {
                          filterButtonRefs.current[id] = element;
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleFilterButtonClick(id);
                        }}
                        aria-label={`Фильтр по столбцу ${column.label}`}
                        title={columnFiltered ? `На столбце "${column.label}" установлен фильтр` : `Фильтр по столбцу ${column.label}`}
                      >
                        <FilterListRoundedIcon fontSize="small" />
                        {columnFiltered && <span className={styles.filterButtonDot} />}
                      </button>
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody
          ref={tbodyRef}
          className={`${styles.scrollableTbody} ${shouldStretchSingleRow ? styles.scrollableTbodyState : ""} ${shouldAddSingleRowSpacing ? styles.scrollableTbodySingleRow : ""}`}
          onScroll={handleTableScroll}
        >
          {loading ? (
            <tr className={styles.stateRow}>
              <td colSpan={Math.max(visibleColumns.length, 1)} className={`${styles.textAlign} ${styles.stateCell}`}>
                <LoadingSpinner />
              </td>
            </tr>
          ) : visibleData.length > 0 ? (
            visibleData.map((row) => (
              <tr key={String(row.id)} onClick={() => onRowClickHandle(row)}>
                {visibleColumns.map(({ id, column }) => (
                  <td key={id} title={String(getCellValue(row, column))}>
                    {renderCellValue(getCellValue(row, column))}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr className={styles.stateRow}>
              <td colSpan={Math.max(visibleColumns.length, 1)} className={`${styles.textAlign} ${styles.stateCell}`}>
                По такому запросу ничего не найдено
              </td>
            </tr>
          )}
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={Math.max(visibleColumns.length, 1)}>
              {showSettingsButton && (
                <button
                  type="button"
                  ref={settingsButtonRef}
                  className={`${styles.settingsButton} ${areColumnsCustomized ? styles.settingsButtonActive : ""}`}
                  onClick={() => {
                    setColumnsMenuOpen((current) => !current);
                    setOpenFilterColumnId(null);
                  }}
                  aria-label="Настройка колонок"
                  title="Настройка колонок"
                >
                  <SettingsRoundedIcon />
                  {areColumnsCustomized && <span className={styles.settingsButtonDot} />}
                </button>
              )}

              {!loading && addOption && (
                <div className={styles.addButton} onClick={handleAddClick}>
                  +
                </div>
              )}
            </td>
          </tr>
        </tfoot>
      </table>

      {openFilterColumnId &&
        filterMenuPosition &&
        createPortal(
          (() => {
            if (!visibleColumns.some(({ id }) => id === openFilterColumnId)) return null;

            const filterOptions = filterOptionsByColumn[openFilterColumnId] ?? [];
            const selectedValues = getSelectedValues(openFilterColumnId);
            const visibleFilterOptions = filterOptions.filter((value) =>
              includesNormalized(displayFilterValue(value), filterSearchText),
            );

            return (
              <div
                ref={filterMenuRef}
                className={styles.filterMenu}
                style={{
                  left: `${filterMenuPosition.left}px`,
                  top: `${filterMenuPosition.top}px`,
                  maxHeight: `${filterMenuPosition.maxHeight}px`,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <label className={styles.filterSearch}>
                  <SearchRoundedIcon fontSize="small" />
                  <input
                    type="text"
                    value={filterSearchText}
                    onChange={(event) => {
                      const value = event.target.value;
                      filterSearchRef.current[openFilterColumnId] = value;
                      setFilterSearchText(value);
                    }}
                    placeholder="Поиск"
                  />
                </label>

                <Checkbox
                  size="sm"
                  checked={selectedValues.length === filterOptions.length}
                  onChange={(event) => handleToggleSelectAll(openFilterColumnId, event.target.checked)}
                  label="Выделить все"
                  labelClassName={styles.filterOption}
                />

                <div className={styles.filterOptionsList}>
                  {visibleFilterOptions.map((value) => (
                    <Checkbox
                      key={value}
                      size="sm"
                      checked={selectedValues.includes(value)}
                      onChange={() => handleToggleFilterValue(openFilterColumnId, value)}
                      label={
                        <>
                          <span className={styles.filterOptionLabel} title={displayFilterValue(value)}>
                            {highlightMatches(displayFilterValue(value), filterSearchText)}
                          </span>
                          <span className={styles.filterOptionCount}>
                            ({filterOptionStatsByColumn[openFilterColumnId]?.[value] ?? 0})
                          </span>
                        </>
                      }
                      labelClassName={styles.filterOption}
                    />
                  ))}

                  {visibleFilterOptions.length === 0 && (
                    <div className={styles.filterEmpty}>Ничего не найдено</div>
                  )}
                </div>

                <div className={styles.filterMenuActions}>
                  <button
                    type="button"
                    className={styles.filterSecondaryButton}
                    onClick={() => resetColumnFilter(openFilterColumnId)}
                  >
                    Сбросить
                  </button>
                  <button
                    type="button"
                    className={styles.filterPrimaryButton}
                    onClick={() => setOpenFilterColumnId(null)}
                  >
                    Готово
                  </button>
                </div>
              </div>
            );
          })(),
          document.body,
        )}

      {columnsMenuOpen &&
        columnsMenuPosition &&
        createPortal(
          <div
            ref={settingsMenuRef}
            className={`${styles.filterMenu} ${styles.columnsMenu}`}
            style={{
              left: `${columnsMenuPosition.left}px`,
              top: `${columnsMenuPosition.top}px`,
              maxHeight: `${columnsMenuPosition.maxHeight}px`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.columnsMenuTitle}>Настройки таблицы</div>

            <div className={styles.densitySection}>
              <div className={styles.sectionTitle}>Плотность строк</div>
              <div className={styles.densityOptions}>
                {ROW_DENSITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.densityOptionButton} ${
                      rowDensity === option.value ? styles.densityOptionButtonActive : ""
                    }`}
                    onClick={() => setRowDensity(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {canCustomizeColumns && (
              <>
                <div className={styles.sectionTitle}>Порядок и видимость</div>
                <div className={styles.filterOptionsList}>
                  {orderedColumnIds.map((columnId, index) => {
                    const columnEntry = columnsById[columnId];
                    if (!columnEntry) return null;

                    const { id, column } = columnEntry;
                    const checked = visibleColumnIds.includes(id);
                    const isLastVisible = checked && visibleColumnIds.length === 1;

                    return (
                      <div className={styles.columnSettingsRow} key={id}>
                        <Checkbox
                          size="sm"
                          checked={checked}
                          disabled={isLastVisible}
                          onChange={() => handleToggleVisibleColumn(id)}
                          label={<span className={styles.filterOptionLabel}>{column.label}</span>}
                          labelClassName={styles.filterOption}
                        />

                        <div className={styles.columnOrderActions}>
                          <button
                            type="button"
                            className={styles.columnOrderButton}
                            onClick={() => handleMoveColumn(id, "up")}
                            disabled={index === 0}
                            aria-label={`Поднять колонку ${column.label}`}
                            title={`Поднять колонку ${column.label}`}
                          >
                            <ArrowUpwardRoundedIcon fontSize="inherit" />
                          </button>
                          <button
                            type="button"
                            className={styles.columnOrderButton}
                            onClick={() => handleMoveColumn(id, "down")}
                            disabled={index === orderedColumnIds.length - 1}
                            aria-label={`Опустить колонку ${column.label}`}
                            title={`Опустить колонку ${column.label}`}
                          >
                            <ArrowDownwardRoundedIcon fontSize="inherit" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className={styles.filterMenuActions}>
              <button type="button" className={styles.filterSecondaryButton} onClick={resetTableSettings}>
                По умолчанию
              </button>
              <button type="button" className={styles.filterPrimaryButton} onClick={() => setColumnsMenuOpen(false)}>
                Готово
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default GenericTable;
