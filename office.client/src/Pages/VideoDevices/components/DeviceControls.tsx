import type { Dispatch, SetStateAction } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import type { FilterState, SortMode } from "../videoDevices.types";
import styles from "../VideoDevices.module.css";

type DeviceCounts = {
  video: number;
  music: number;
  test: number;
};

type DeviceControlsProps = {
  searchText: string;
  counts: DeviceCounts;
  filters: FilterState;
  sortMode: SortMode;
  outdatedCount: number;
  onSearchTextChange: (value: string) => void;
  onFiltersChange: Dispatch<SetStateAction<FilterState>>;
  onSortModeChange: (value: SortMode) => void;
  onAddDevice: () => void;
  onReplaceVideo: () => void;
  onBulkUpdate: () => void;
};

const filterItems: Array<[keyof FilterState, (counts: DeviceCounts) => string]> = [
  ["video", (counts) => `Видео (${counts.video})`],
  ["music", (counts) => `Музыка (${counts.music})`],
  ["test", (counts) => `Не розница/тест (${counts.test})`],
];

export default function DeviceControls({
  searchText,
  counts,
  filters,
  sortMode,
  outdatedCount,
  onSearchTextChange,
  onFiltersChange,
  onSortModeChange,
  onAddDevice,
  onReplaceVideo,
  onBulkUpdate,
}: DeviceControlsProps) {
  return (
    <div className={styles.deviceControls}>
      <div className={styles.controlsLeft}>
        <label className={styles.search}>
          <SearchRoundedIcon fontSize="small" />
          <input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Поиск по ТТ, IP или видео"
          />
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={onAddDevice}>
            Добавить устройство
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onReplaceVideo}>
            Замена видео
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onBulkUpdate} disabled={outdatedCount === 0}>
            Обновить приложения
          </button>
        </div>
      </div>

      <div className={styles.controlsRight}>
        <div className={styles.filterBar}>
          {filterItems.map(([key, getLabel]) => (
            <button
              type="button"
              key={key}
              className={`${styles.filterButton} ${filters[key] ? styles.filterButtonActive : ""}`}
              onClick={() => onFiltersChange((current) => ({ ...current, [key]: !current[key] }))}
            >
              {getLabel(counts)}
            </button>
          ))}
        </div>

        <select
          className={styles.sortSelect}
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          aria-label="Сортировка устройств"
        >
          <option value="nameAsc">По алфавиту</option>
          <option value="versionDesc">Версия ↓</option>
          <option value="versionAsc">Версия ↑</option>
          <option value="offlineFirst">Сначала оффлайн</option>
          <option value="onlineFirst">Сначала онлайн</option>
        </select>
      </div>
    </div>
  );
}
