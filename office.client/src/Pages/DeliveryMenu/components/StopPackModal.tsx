import { useEffect, useMemo, useState } from "react";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import RestaurantMenuRoundedIcon from "@mui/icons-material/RestaurantMenuRounded";
import Checkbox from "../../../Components/Checkbox/Checkbox";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import type {
  DeliveryItem,
  StopLocation,
  StopPack,
  StopPackPayload,
} from "../deliveryMenu.types";
import styles from "../DeliveryStops.module.css";

type PackMode = "item" | "location";

interface StopPackModalProps {
  isOpen: boolean;
  pack: StopPack | null;
  items: DeliveryItem[];
  locations: StopLocation[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: StopPackPayload) => void;
}

function moscowInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function nextMoscowMidnight(begin: string) {
  const date = new Date(`${begin}:00+03:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return moscowInputValue(date).replace(/T\d{2}:\d{2}$/, "T00:00");
}

function parseStopDate(value: string) {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}+03:00`);
}

export default function StopPackModal({
  isOpen,
  pack,
  items,
  locations,
  saving,
  onClose,
  onSubmit,
}: StopPackModalProps) {
  const [mode, setMode] = useState<PackMode>("item");
  const [primaryItem, setPrimaryItem] = useState("");
  const [primaryLocation, setPrimaryLocation] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [begin, setBegin] = useState("");
  const [end, setEnd] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const inferredMode: PackMode = pack?.itemId ? "item" : "location";
    const initialBegin = pack ? moscowInputValue(parseStopDate(pack.begin)) : moscowInputValue();
    setMode(inferredMode);
    setPrimaryItem(pack?.itemId ? String(pack.itemId) : "");
    setPrimaryLocation(pack?.locationGUID ?? "");
    setSelectedLocations(pack?.stops.map((stop) => stop.locationGUID) ?? []);
    setSelectedItems(pack?.stops.map((stop) => stop.item) ?? []);
    setBegin(initialBegin);
    setEnd(pack ? moscowInputValue(parseStopDate(pack.end)) : nextMoscowMidnight(initialBegin));
    setQuery("");
    setError("");
  }, [isOpen, pack]);

  const visibleLocations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    return locations.filter((location) => !normalized || location.name.toLocaleLowerCase("ru-RU").includes(normalized));
  }, [locations, query]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    return items.filter((item) => !normalized || `${item.yeName} ${item.rkName} ${item.rkcode}`
      .toLocaleLowerCase("ru-RU").includes(normalized));
  }, [items, query]);

  const selectedCount = mode === "item" ? selectedLocations.length : selectedItems.length;
  const allVisibleSelected = mode === "item"
    ? visibleLocations.length > 0 && visibleLocations.every((location) => selectedLocations.includes(location.guid))
    : visibleItems.length > 0 && visibleItems.every((item) => selectedItems.includes(item.rkcode));

  const toggleAllVisible = () => {
    if (mode === "item") {
      const visibleIds = visibleLocations.map((location) => location.guid);
      setSelectedLocations((current) => allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])));
    } else {
      const visibleIds = visibleItems.map((item) => item.rkcode);
      setSelectedItems((current) => allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])));
    }
  };

  const submit = () => {
    setError("");
    if (mode === "item" && !primaryItem) return setError("Выберите позицию.");
    if (mode === "location" && !primaryLocation) return setError("Выберите торговую точку.");
    if (selectedCount === 0) return setError(mode === "item" ? "Выберите хотя бы одну торговую точку." : "Выберите хотя бы одну позицию.");
    if (!begin) return setError("Укажите начало действия стопа.");
    if (!end || end <= begin) return setError("Окончание должно быть позже начала.");

    const itemId = mode === "item" ? Number(primaryItem) : null;
    const item = itemId === null ? null : items.find((entry) => entry.rkcode === itemId);
    const location = mode === "location" ? locations.find((entry) => entry.guid === primaryLocation) : null;
    onSubmit({
      itemId,
      itemName: item?.rkName ?? null,
      locationGUID: mode === "location" ? primaryLocation : null,
      locationName: mode === "location" ? location?.name ?? null : null,
      begin,
      end,
      permissionLevel: 1,
      stops: mode === "item"
        ? selectedLocations.map((locationGUID) => ({ locationGUID, item: itemId }))
        : selectedItems.map((selectedItem) => ({ locationGUID: primaryLocation, item: selectedItem })),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={pack ? "Редактирование стоп-пакета" : "Новый стоп-пакет"}
      panelClassName={styles.editorModal}
      bodyClassName={styles.editorModalBody}
    >
      <div className={styles.editorLayout}>
        <div className={styles.editorMain}>
          <div className={styles.modeSwitch}>
            <button type="button" className={mode === "item" ? styles.modeActive : ""} onClick={() => { setMode("item"); setQuery(""); }}>
              <RestaurantMenuRoundedIcon /> Одна позиция
            </button>
            <button type="button" className={mode === "location" ? styles.modeActive : ""} onClick={() => { setMode("location"); setQuery(""); }}>
              <LocationOnOutlinedIcon /> Одна торговая точка
            </button>
          </div>

          <Select
            label={mode === "item" ? "Позиция" : "Торговая точка"}
            options={mode === "item"
              ? items.map((entry) => ({
                  value: String(entry.rkcode),
                  label: `${entry.rkName} · RK ${entry.rkcode}`,
                }))
              : locations.map((entry) => ({ value: entry.guid, label: entry.name }))}
            value={mode === "item" ? primaryItem : primaryLocation}
            onChange={(event) => mode === "item"
              ? setPrimaryItem(event.target.value)
              : setPrimaryLocation(event.target.value)}
            placeholder={mode === "item" ? "Выберите позицию" : "Выберите торговую точку"}
            wrapperClassName={styles.primaryEntitySelect}
            search
          />

          <section className={styles.periodBar}>
            <div className={styles.periodBarFields}>
              <Input label="Начало" type="datetime-local" value={begin} onChange={(event) => setBegin(event.target.value)} />
              <Input label="Окончание" type="datetime-local" value={end} min={begin} onChange={(event) => setEnd(event.target.value)} />
              <Button variant="secondary" size="lg" className={styles.quickPeriodAction} onClick={() => setEnd(nextMoscowMidnight(begin))}>До конца дня</Button>
            </div>
          </section>

          <div className={styles.scopePanel}>
            <div className={styles.scopeHeader}>
              <div>
                <strong>{mode === "item" ? "Где заблокировать" : "Что заблокировать"}</strong>
                <span>Выбрано: {selectedCount}</span>
              </div>
              <button type="button" onClick={toggleAllVisible}>{allVisibleSelected ? "Снять выбор" : "Выбрать всё"}</button>
            </div>
            <input className={styles.listSearch} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "item" ? "Найти торговую точку" : "Найти позицию"} />
            <div className={styles.selectionList}>
              {mode === "item" ? visibleLocations.map((location) => (
                <Checkbox
                  key={location.guid}
                  checked={selectedLocations.includes(location.guid)}
                  onChange={() => setSelectedLocations((current) => current.includes(location.guid) ? current.filter((id) => id !== location.guid) : [...current, location.guid])}
                  label={<span className={styles.optionLabel}><strong>{location.name}</strong></span>}
                />
              )) : visibleItems.map((itemOption) => (
                <Checkbox
                  key={itemOption.rkcode}
                  checked={selectedItems.includes(itemOption.rkcode)}
                  onChange={() => setSelectedItems((current) => current.includes(itemOption.rkcode) ? current.filter((id) => id !== itemOption.rkcode) : [...current, itemOption.rkcode])}
                  label={<span className={styles.optionLabel}><strong>{itemOption.rkName}</strong><small>RK {itemOption.rkcode}{itemOption.actual !== 1 ? " · неактивная" : ""}</small></span>}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.modalActions}>
        <Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button>
        <Button variant="primary" loading={saving} onClick={submit}>Сохранить</Button>
      </div>
    </Modal>
  );
}
