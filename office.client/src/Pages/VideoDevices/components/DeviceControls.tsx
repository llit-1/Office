import type { Dispatch, SetStateAction } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Button from "../../../Components/Button/Button";
import type { FilterState, ScopeFilter, SortMode } from "../videoDevices.types";
import { DEFAULT_FILTERS } from "../videoDevices.utils";
import styles from "../VideoDevices.module.css";

type ScopeCounts = Record<ScopeFilter, number>;

type DeviceControlsProps = {
  searchText: string;
  counts: ScopeCounts;
  filters: FilterState;
  sortMode: SortMode;
  outdatedCount: number;
  shownCount: number;
  onSearchTextChange: (value: string) => void;
  onFiltersChange: Dispatch<SetStateAction<FilterState>>;
  onSortModeChange: (value: SortMode) => void;
  onAddDevice: () => void;
  onReplaceVideo: () => void;
  onBulkUpdate: () => void;
};

const scopeOptions: Array<[ScopeFilter, string]> = [
  ["all", "Все точки"],
  ["video", "Только с видео"],
  ["music", "Только с музыкой"],
  ["test", "Тест и не розница"],
];

const sortOptions: Array<[SortMode, string]> = [
  ["nameAsc", "По названию"],
  ["versionDesc", "Сначала новые версии"],
  ["versionAsc", "Сначала старые версии"],
  ["offlineFirst", "Сначала без связи"],
  ["onlineFirst", "Сначала на связи"],
];

export default function DeviceControls({
  searchText,
  counts,
  filters,
  sortMode,
  outdatedCount,
  shownCount,
  onSearchTextChange,
  onFiltersChange,
  onSortModeChange,
  onAddDevice,
  onReplaceVideo,
  onBulkUpdate,
}: DeviceControlsProps) {
  const isFiltered =
    searchText.trim() !== "" ||
    filters.scope !== DEFAULT_FILTERS.scope ||
    filters.status !== DEFAULT_FILTERS.status;

  const resetAll = () => {
    onFiltersChange(DEFAULT_FILTERS);
    onSearchTextChange("");
  };

  return (
    <div className={styles.toolbarTop}>
      <label className={styles.toolbarSearch}>
        <SearchRoundedIcon fontSize="small" />
        <input
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="Поиск по точке, IP или видео"
          aria-label="Поиск устройств"
        />
        {searchText && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => onSearchTextChange("")}
            aria-label="Очистить поиск"
          >
            <CloseRoundedIcon fontSize="small" />
          </button>
        )}
      </label>

      <span className={styles.selectWrap}>
        <select
          className={styles.toolbarSelect}
          value={filters.scope}
          onChange={(event) =>
            onFiltersChange((current) => ({
              ...current,
              scope: event.target.value as ScopeFilter,
            }))
          }
          aria-label="Какие точки показывать"
          title="Какие точки показывать"
        >
          {scopeOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label} ({counts[value]})
            </option>
          ))}
        </select>
      </span>

      <span className={styles.selectWrap}>
        <select
          className={styles.toolbarSelect}
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          aria-label="Сортировка устройств"
          title="Сортировка"
        >
          {sortOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </span>

      {isFiltered && (
        <div className={styles.resultSummary} aria-live="polite">
          Найдено <strong>{shownCount}</strong>
          <button
            type="button"
            className={styles.resetFilters}
            onClick={resetAll}
          >
            Сбросить
          </button>
        </div>
      )}

      <div className={styles.toolbarActions}>
        <Button variant="secondary" onClick={onReplaceVideo}>
          Замена видео
        </Button>
        <Button
          variant="secondary"
          onClick={onBulkUpdate}
          disabled={outdatedCount === 0}
          title={
            outdatedCount === 0
              ? "Все приставки на связи уже на последней версии"
              : undefined
          }
        >
          Обновить приложения{outdatedCount > 0 ? ` (${outdatedCount})` : ""}
        </Button>
        <Button variant="primary" onClick={onAddDevice}>
          Добавить устройство
        </Button>
      </div>
    </div>
  );
}
