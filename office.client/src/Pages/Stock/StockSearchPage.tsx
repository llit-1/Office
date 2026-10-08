import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@toolpad/core";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import FilterAltOffRoundedIcon from "@mui/icons-material/FilterAltOffRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../Components/Modal/Modal";
import OutlinedField from "../../Components/OutlinedField/OutlinedField";
import Select from "../../Components/Select/Select";
import LocationPickerModal from "./components/LocationPickerModal";
import StockObjectDetails from "./components/StockObjectDetails";
import { StockBadge, StockState } from "./components/StockUi";
import { getStockErrorMessage, getStockLookups, searchStock } from "./stock.api";
import type { StockCategoryOption, StockLookups, StockSearchGroup, StockSearchRequest } from "./stock.types";
import { formatCount, formatObjectCode, normalizeSearchText, objectsLabel, readSessionValue, writeSessionValue } from "./stock.utils";
import shared from "./StockShared.module.css";
import styles from "./StockSearch.module.css";

type Filters = {
  writtenOff: boolean;
  holderId: string;
  locationGuids: string[];
  categoryId: string;
  subCategoryId: string;
  itemCategoryId: string;
};

type StoredSearch = {
  filters: Filters;
  searched: boolean;
};

const SEARCH_STORAGE_KEY = "office.stock.search";
const ITEMS_PAGE_SIZE = 100;
const emptyFilters: Filters = {
  writtenOff: false,
  holderId: "",
  locationGuids: [],
  categoryId: "",
  subCategoryId: "",
  itemCategoryId: "",
};
const groupForms: [string, string, string] = ["группа", "группы", "групп"];

const toRequest = (filters: Filters): StockSearchRequest => ({
  writtenOff: filters.writtenOff,
  holderId: filters.holderId ? Number(filters.holderId) : null,
  categoryId: Number(filters.itemCategoryId || filters.subCategoryId || filters.categoryId) || null,
  locationGuids: filters.locationGuids,
});

const categoryLabel = (category: StockCategoryOption) =>
  category.actual ? category.name : `${category.name} (неактуальна)`;

export default function StockSearchPage() {
  const ids = useId();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [stored] = useState(() => readSessionValue<StoredSearch>(SEARCH_STORAGE_KEY));

  const [lookups, setLookups] = useState<StockLookups | null>(null);
  const [lookupsError, setLookupsError] = useState("");
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters, ...stored?.filters }));
  const [groups, setGroups] = useState<StockSearchGroup[] | null>(null);
  const [resultWrittenOff, setResultWrittenOff] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [itemLimits, setItemLimits] = useState<Record<string, number>>({});
  const [quickFilter, setQuickFilter] = useState("");
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [detailsCode, setDetailsCode] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const lastRequestRef = useRef<StockSearchRequest | null>(null);
  const searchedRef = useRef(Boolean(stored?.searched));
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const loadLookups = useCallback(async (force = false) => {
    setLookupsError("");
    try {
      setLookups(await getStockLookups(force));
    } catch (error) {
      setLookupsError(getStockErrorMessage(error, "Не удалось загрузить фильтры поиска."));
    }
  }, []);

  const runSearch = useCallback(async (request: StockSearchRequest, background = false) => {
    const requestId = ++requestIdRef.current;
    lastRequestRef.current = request;
    setSearching(true);
    if (!background) setSearchError("");

    try {
      const result = await searchStock(request);
      if (requestId !== requestIdRef.current) return;
      setGroups(result);
      setResultWrittenOff(request.writtenOff);
      setSearchError("");
      if (!background) {
        setExpanded(new Set(result.length === 1 ? [result[0].key] : []));
        setItemLimits({});
        setQuickFilter("");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = getStockErrorMessage(error, "Не удалось выполнить поиск. Попробуйте ещё раз.");
      if (background) {
        // Фоновое обновление после списания оставляет на экране прежние результаты.
        notificationsRef.current.show(message, { severity: "error", autoHideDuration: 5000 });
      } else {
        setGroups(null);
        setSearchError(message);
      }
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    // Возврат на вкладку повторяет последний поиск, чтобы не терять результат.
    if (stored?.searched) void runSearch(toRequest({ ...emptyFilters, ...stored.filters }));
  }, [runSearch, stored]);

  useEffect(() => {
    writeSessionValue(SEARCH_STORAGE_KEY, { filters, searched: searchedRef.current });
  }, [filters]);

  const holderOptions = useMemo(
    () => [
      { value: "", label: "Все держатели" },
      ...(lookups?.holders ?? []).map((holder) => ({
        value: String(holder.id),
        label: holder.actual ? holder.fullName : `${holder.fullName} (неактивен)`,
      })),
    ],
    [lookups],
  );

  const categoryOptions = useCallback(
    (parent: number | null, emptyLabel: string) => [
      { value: "", label: emptyLabel },
      ...(lookups?.categories ?? [])
        .filter((category) => category.parent === parent)
        .sort((left, right) => left.name.localeCompare(right.name, "ru"))
        .map((category) => ({ value: String(category.id), label: categoryLabel(category) })),
    ],
    [lookups],
  );

  const mainOptions = useMemo(() => categoryOptions(null, "Все категории"), [categoryOptions]);
  const subOptions = useMemo(
    () => (filters.categoryId ? categoryOptions(Number(filters.categoryId), "Все подкатегории") : []),
    [categoryOptions, filters.categoryId],
  );
  const itemOptions = useMemo(
    () => (filters.subCategoryId ? categoryOptions(Number(filters.subCategoryId), "Все наименования") : []),
    [categoryOptions, filters.subCategoryId],
  );

  const selectedLocations = (lookups?.locations ?? []).filter((location) => filters.locationGuids.includes(location.guid));
  const locationSummary = filters.locationGuids.length === 0
    ? "Все точки"
    : selectedLocations.length > 0 && selectedLocations.length <= 2
      ? selectedLocations.map((location) => location.name).join(", ")
      : `Выбрано: ${filters.locationGuids.length}`;

  const activeFilterCount = [filters.holderId, filters.locationGuids.length > 0, filters.categoryId].filter(Boolean).length;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    searchedRef.current = true;
    writeSessionValue(SEARCH_STORAGE_KEY, { filters, searched: true });
    void runSearch(toRequest(filters));
  };

  const query = normalizeSearchText(quickFilter);
  const compactQuery = query.replace(/\s+/g, "");

  const visibleGroups = useMemo(() => {
    if (!groups) return [];
    if (!query) return groups;

    return groups.flatMap((group) => {
      const groupText = normalizeSearchText(
        [group.category, group.subCategory, group.name, group.holderName, group.locationName].filter(Boolean).join(" "),
      );
      if (groupText.includes(query)) return [group];

      const items = group.items.filter((item) =>
        item.code.toLowerCase().includes(compactQuery)
        || normalizeSearchText([item.name, item.subCategory, item.category, item.holderName, item.locationName].filter(Boolean).join(" "))
          .includes(query));
      return items.length > 0 ? [{ ...group, items }] : [];
    });
  }, [groups, query, compactQuery]);

  const totalObjects = groups?.reduce((sum, group) => sum + group.items.length, 0) ?? 0;
  const visibleObjects = visibleGroups.reduce((sum, group) => sum + group.items.length, 0);
  const allExpanded = visibleGroups.length > 0 && visibleGroups.every((group) => expanded.has(group.key));

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  let resultsBody: ReactNode;
  if (searching && !groups) {
    resultsBody = (
      <div className={shared.loadingBlock}>
        <LoadingSpinner size={56} label="Ищем объекты…" />
      </div>
    );
  } else if (searchError) {
    resultsBody = (
      <StockState
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Поиск не выполнен"
        text={searchError}
        action={lastRequestRef.current ? (
          <Button variant="secondary" onClick={() => lastRequestRef.current && void runSearch(lastRequestRef.current)}>
            Повторить
          </Button>
        ) : undefined}
      />
    );
  } else if (!groups) {
    resultsBody = (
      <StockState
        icon={<Inventory2OutlinedIcon />}
        title="Задайте условия поиска"
        text="Выберите держателя, торговые точки или категорию и нажмите «Найти». Без фильтров покажутся все объекты с выбранным статусом."
      />
    );
  } else if (groups.length === 0) {
    resultsBody = (
      <StockState
        icon={<SearchOffRoundedIcon />}
        title="Ничего не найдено"
        text="По выбранным условиям объектов нет. Измените фильтры или статус."
      />
    );
  } else if (visibleGroups.length === 0) {
    resultsBody = (
      <StockState
        icon={<FilterAltOffRoundedIcon />}
        title="Нет совпадений"
        text={`В найденных объектах нет «${quickFilter.trim()}».`}
        action={<Button variant="secondary" onClick={() => setQuickFilter("")}>Очистить фильтр</Button>}
      />
    );
  } else {
    resultsBody = (
      <div className={shared.tableWrap}>
        <table className={`${shared.table} ${styles.table}`} data-busy={searching || undefined}>
          <caption className={shared.srOnly}>Найденные объекты, сгруппированные по наименованию</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.toggleCell}><span className={shared.srOnly}>Раскрыть группу</span></th>
              <th scope="col">Категория</th>
              <th scope="col">Подкатегория</th>
              <th scope="col">Наименование</th>
              <th scope="col">Держатель</th>
              <th scope="col">Торговая точка</th>
              <th scope="col" className={styles.num}>Объектов</th>
            </tr>
          </thead>
          {visibleGroups.map((group) => {
            const isOpen = query.length > 0 || expanded.has(group.key);
            const limit = itemLimits[group.key] ?? ITEMS_PAGE_SIZE;
            const items = isOpen ? group.items.slice(0, limit) : [];
            const hiddenCount = isOpen ? group.items.length - items.length : 0;
            const title = group.name ?? group.subCategory ?? group.category ?? "Без категории";

            return (
              <tbody key={group.key}>
                <tr className={styles.groupRow} data-expanded={isOpen} onClick={() => toggleGroup(group.key)}>
                  <td className={styles.toggleCell}>
                    <button
                      type="button"
                      className={`${shared.iconButton} ${shared.iconButtonGhost} ${styles.toggleButton}`}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Свернуть" : "Раскрыть"} группу «${title}»`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleGroup(group.key);
                      }}
                    >
                      <ExpandMoreRoundedIcon />
                    </button>
                  </td>
                  <td className={styles.categoryCell}><span className={shared.cellLabel}>Категория</span>{group.category ?? "—"}</td>
                  <td className={styles.subCategoryCell}><span className={shared.cellLabel}>Подкатегория</span>{group.subCategory ?? "—"}</td>
                  <td className={styles.nameCell}><span className={shared.cellLabel}>Наименование</span>{group.name ?? "—"}</td>
                  <td className={styles.holderCell}><span className={shared.cellLabel}>Держатель</span>{group.holderName ?? "—"}</td>
                  <td className={styles.locationCell}><span className={shared.cellLabel}>Торговая точка</span>{group.locationName ?? "—"}</td>
                  <td className={`${styles.num} ${styles.countCell}`}>
                    <StockBadge tone="neutral">{group.items.length}</StockBadge>
                  </td>
                </tr>

                {items.map((item) => (
                  <tr
                    key={item.code}
                    className={styles.itemRow}
                    data-storage={!resultWrittenOff && item.inStorage ? "true" : undefined}
                  >
                    <td className={styles.toggleCell} aria-hidden="true" />
                    <td colSpan={3} className={styles.itemMain}>
                      <div className={styles.itemInfo}>
                        <button
                          type="button"
                          className={shared.linkButton}
                          onClick={() => setDetailsCode(item.code)}
                          aria-label={`Открыть карточку объекта ${item.code}`}
                        >
                          <span className={shared.code}>{formatObjectCode(item.code)}</span>
                        </button>
                        <span className={shared.muted}>
                          {[item.category, item.subCategory, item.name].filter(Boolean).join(" / ") || "Без категории"}
                        </span>
                      </div>
                    </td>
                    <td className={styles.holderCell}><span className={shared.cellLabel}>Держатель</span>{item.holderName ?? "—"}</td>
                    <td className={styles.locationCell}><span className={shared.cellLabel}>Торговая точка</span>{item.locationName ?? "—"}</td>
                    <td className={`${styles.num} ${styles.statusCell}`}>
                      {resultWrittenOff ? (
                        <StockBadge tone="danger">Списан</StockBadge>
                      ) : item.inStorage ? (
                        <span className={shared.srOnly}>На складе</span>
                      ) : null}
                    </td>
                  </tr>
                ))}

                {hiddenCount > 0 ? (
                  <tr className={styles.moreRow}>
                    <td colSpan={7}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setItemLimits((prev) => ({ ...prev, [group.key]: limit + ITEMS_PAGE_SIZE }))}
                      >
                        Показать ещё {Math.min(ITEMS_PAGE_SIZE, hiddenCount)} из {hiddenCount}
                      </Button>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            );
          })}
        </table>
      </div>
    );
  }

  return (
    <div className={shared.page}>
      <section className={shared.panel} aria-labelledby={`${ids}-filters`}>
        <h2 id={`${ids}-filters`} className={shared.srOnly}>Фильтры поиска</h2>
        <form className={styles.filters} onSubmit={handleSubmit} noValidate>
          <div className={`${shared.segmented} ${styles.statusSwitch}`} role="group" aria-label="Статус объектов">
            <button
              type="button"
              className={shared.segmentedButton}
              aria-pressed={!filters.writtenOff}
              onClick={() => setFilters((prev) => ({ ...prev, writtenOff: false }))}
            >
              Активные
            </button>
            <button
              type="button"
              className={shared.segmentedButton}
              aria-pressed={filters.writtenOff}
              onClick={() => setFilters((prev) => ({ ...prev, writtenOff: true }))}
            >
              Списанные
            </button>
          </div>

            <Select
              label="Держатель"
              options={holderOptions}
              value={filters.holderId}
              onChange={(event) => setFilters((prev) => ({ ...prev, holderId: event.target.value }))}
              disabled={!lookups}
              search
            />

            <OutlinedField label="Торговые точки" htmlFor={`${ids}-locations`} disabled={!lookups}>
              <button
                id={`${ids}-locations`}
                type="button"
                className={styles.fieldButton}
                aria-haspopup="dialog"
                onClick={() => setLocationsOpen(true)}
                disabled={!lookups}
              >
                <span className={styles.fieldButtonValue} data-empty={filters.locationGuids.length === 0}>
                  {locationSummary}
                </span>
                <StorefrontOutlinedIcon aria-hidden="true" />
              </button>
            </OutlinedField>

            <Select
              label="Категория"
              options={mainOptions}
              value={filters.categoryId}
              onChange={(event) => setFilters((prev) => ({
                ...prev,
                categoryId: event.target.value,
                subCategoryId: "",
                itemCategoryId: "",
              }))}
              disabled={!lookups}
              search
            />
            <Select
              label="Подкатегория"
              options={subOptions}
              value={filters.subCategoryId}
              onChange={(event) => setFilters((prev) => ({ ...prev, subCategoryId: event.target.value, itemCategoryId: "" }))}
              placeholder={filters.categoryId ? "Нет подкатегорий" : "Выберите категорию"}
              disabled={!lookups || subOptions.length <= 1}
              search
            />
            <Select
              label="Наименование"
              options={itemOptions}
              value={filters.itemCategoryId}
              onChange={(event) => setFilters((prev) => ({ ...prev, itemCategoryId: event.target.value }))}
              placeholder={filters.subCategoryId ? "Нет наименований" : "Выберите подкатегорию"}
              disabled={!lookups || itemOptions.length <= 1}
              search
            />

          <div className={styles.filterActions}>
            <button
              type="button"
              className={`${shared.iconButton} ${shared.iconButtonLarge}`}
              aria-label="Сбросить фильтры"
              title="Сбросить фильтры"
              disabled={activeFilterCount === 0}
              onClick={() => setFilters((prev) => ({ ...emptyFilters, writtenOff: prev.writtenOff }))}
            >
              <FilterAltOffRoundedIcon />
            </button>
            <Button type="submit" variant="primary" size="lg" loading={searching} leadingIcon={<SearchRoundedIcon />}>
              Найти
            </Button>
          </div>

          {lookupsError ? (
            <div className={styles.lookupsError} role="alert">
              <span>{lookupsError}</span>
              <Button variant="secondary" size="sm" onClick={() => void loadLookups(true)}>Повторить</Button>
            </div>
          ) : null}
        </form>
      </section>

      <section className={`${shared.panel} ${styles.resultsPanel}`} aria-labelledby={`${ids}-results`} aria-busy={searching}>
        <header className={shared.panelHeader}>
          <div className={shared.panelHeading}>
            <h2 id={`${ids}-results`} className={shared.panelTitle}>Результаты</h2>
            {groups && groups.length > 0 ? (
              <p className={shared.panelSubtitle}>
                {formatCount(visibleGroups.length, groupForms)} · {objectsLabel(visibleObjects)}
                {query ? ` из ${objectsLabel(totalObjects)}` : ""}
              </p>
            ) : null}
            {groups && groups.length > 0 && !resultWrittenOff ? (
              <p className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendSwatch} data-storage="true" aria-hidden="true" />
                  На складе
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendSwatch} aria-hidden="true" />
                  Не на складе
                </span>
              </p>
            ) : null}
          </div>
          {groups && groups.length > 0 ? (
            <div className={styles.resultsTools}>
              <div className={styles.quickFilter}>
                <Input
                  label="Фильтр по результатам"
                  labelVisible={false}
                  wrapperClassName={shared.compactField}
                  type="search"
                  value={quickFilter}
                  onChange={(event) => setQuickFilter(event.target.value)}
                  placeholder="Код, наименование, держатель или точка"
                />
              </div>
              {!query ? (
                <Button
                  variant="ghost"
                  onClick={() => setExpanded(allExpanded ? new Set() : new Set(visibleGroups.map((group) => group.key)))}
                >
                  {allExpanded ? "Свернуть все" : "Развернуть все"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>
        {resultsBody}
      </section>

      {lookups ? (
        <LocationPickerModal
          isOpen={locationsOpen}
          locations={lookups.locations}
          selected={filters.locationGuids}
          onClose={() => setLocationsOpen(false)}
          onApply={(guids) => {
            setFilters((prev) => ({ ...prev, locationGuids: guids }));
            setLocationsOpen(false);
          }}
        />
      ) : null}

      <Modal
        isOpen={detailsCode !== null}
        onClose={() => setDetailsCode(null)}
        title="Карточка объекта"
        size="lg"
        headerActions={detailsCode ? (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<OpenInNewRoundedIcon />}
            onClick={() => navigate(`/Stock/Card?code=${encodeURIComponent(detailsCode)}`)}
          >
            Открыть отдельно
          </Button>
        ) : null}
      >
        {detailsCode ? (
          <StockObjectDetails
            key={detailsCode}
            code={detailsCode}
            embedded
            onChanged={() => {
              if (lastRequestRef.current) void runSearch(lastRequestRef.current, true);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
