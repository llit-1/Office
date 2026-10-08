import { useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import StoreMallDirectoryRoundedIcon from "@mui/icons-material/StoreMallDirectoryRounded";
import Checkbox from "../../../Components/Checkbox/Checkbox";
import type { RequestLocation } from "../deliveryRequests.types";
import type { LocationScope } from "../locationScope";
import styles from "../DeliveryRequests.module.css";

type LocationScopePickerProps = {
  locations: RequestLocation[];
  current: RequestLocation | null;
  value: LocationScope;
  onChange: (value: LocationScope) => void;
  disabled?: boolean;
  error?: string;
};

/** Для каких точек выполнить действие: текущая, выбранные вручную или все доступные. */
export default function LocationScopePicker({ locations, current, value, onChange, disabled, error }: LocationScopePickerProps) {
  const [search, setSearch] = useState("");

  const options: { mode: LocationScope["mode"]; label: string }[] = [
    ...(current ? [{ mode: "current" as const, label: "Эта точка" }] : []),
    { mode: "manual", label: "Выбрать" },
    { mode: "all", label: `Все · ${locations.length}` },
  ];

  const selected = value.mode === "manual" ? value.guids : [];
  const selectedSet = new Set(selected);
  const query = search.trim().toLowerCase();
  const found = query ? locations.filter((location) => location.name.toLowerCase().includes(query)) : locations;
  const allFoundSelected = found.length > 0 && found.every((location) => selectedSet.has(location.guid));

  const setSelected = (guids: string[]) => onChange({ mode: "manual", guids });
  const toggle = (guid: string, checked: boolean) =>
    setSelected(checked ? [...selected, guid] : selected.filter((item) => item !== guid));
  const toggleFound = () => {
    const foundGuids = new Set(found.map((location) => location.guid));
    setSelected(allFoundSelected
      ? selected.filter((guid) => !foundGuids.has(guid))
      : [...new Set([...selected, ...foundGuids])]);
  };

  return (
    <section className={styles.scopePicker} aria-label="Точки">
      <span className={styles.scopeTitle}>Точки</span>
      <div className={`${styles.segmented} ${styles.scopeSegmented}`} role="group" aria-label="Для каких точек">
        {options.map((option) => (
          <button
            key={option.mode}
            type="button"
            className={value.mode === option.mode ? styles.segmentActive : undefined}
            aria-pressed={value.mode === option.mode}
            disabled={disabled}
            onClick={() => onChange(
              option.mode === "manual"
                ? { mode: "manual", guids: value.mode === "manual" ? value.guids : current ? [current.guid] : [] }
                : { mode: option.mode },
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {value.mode === "current" && current ? (
        <div className={styles.scopeSummary}>
          <StorefrontRoundedIcon fontSize="small" aria-hidden="true" />
          <span>{current.name}</span>
        </div>
      ) : null}

      {value.mode === "all" ? (
        <div className={styles.scopeSummary}>
          <StoreMallDirectoryRoundedIcon fontSize="small" aria-hidden="true" />
          <span>Все доступные точки</span>
          <span className={styles.scopeCount}>{locations.length}</span>
        </div>
      ) : null}

      {value.mode === "manual" ? (
        <div className={styles.scopeBox}>
          <div className={styles.scopeTools}>
            <label className={styles.search}>
              <SearchRoundedIcon fontSize="small" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Найти точку"
                aria-label="Найти точку"
                disabled={disabled}
              />
            </label>
            <span className={styles.scopeCount}>Выбрано {selected.length}</span>
            <button type="button" className={styles.linkButton} onClick={toggleFound} disabled={disabled || found.length === 0}>
              {allFoundSelected ? "Снять найденные" : query ? "Выбрать найденные" : "Выбрать все"}
            </button>
          </div>

          <div className={styles.scopeList}>
            {found.map((location) => (
              <Checkbox
                key={location.guid}
                size="sm"
                label={location.name}
                labelClassName={styles.scopeOption}
                checked={selectedSet.has(location.guid)}
                onChange={(event) => toggle(location.guid, event.target.checked)}
                disabled={disabled}
              />
            ))}
            {found.length === 0 ? <p className={styles.scopeEmpty}>Ничего не нашлось</p> : null}
          </div>
        </div>
      ) : null}

      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </section>
  );
}
