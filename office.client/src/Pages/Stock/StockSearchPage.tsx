import { useEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "@toolpad/core";
import Select from "../../Components/Select/Select";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../Components/Modal/Modal";
import { get, getFriendlyErrorMessage } from "../../Services/api";
import styles from "./StockSearch.module.css";

type WarehouseHolder = {
  id: number;
  surname: string;
  name: string;
  patronymic?: string | null;
  actual: number;
};

type Location = {
  guid: string;
  name: string;
  actual: number;
};

type WarehouseCategoryNode = {
  id: number | null;
  name: string;
  parent: number | null;
  actual: number;
};

type StockSearchData = {
  holders: WarehouseHolder[];
  locations: Location[];
  mainCategories: WarehouseCategoryNode[];
  categories?: WarehouseCategoryNode[];
};

type ExternalTokenResponse = {
  token: string;
};

type CategoryRef = {
  id?: number | null;
  name?: string | null;
};

type SearchHolder = {
  surname?: string | null;
  name?: string | null;
  patronymic?: string | null;
};

type SearchLocation = {
  guid?: string | null;
  name?: string | null;
};

type SearchItem = {
  code?: string | null;
  mainCat?: CategoryRef | null;
  cat?: CategoryRef | null;
  secondCat?: CategoryRef | null;
  warehouseHolder?: SearchHolder | null;
  location?: SearchLocation | null;
};

type SearchGroup = {
  mainCat?: CategoryRef | null;
  cat?: CategoryRef | null;
  secondCat?: CategoryRef | null;
  warehouseHolder?: SearchHolder | null;
  location?: SearchLocation | null;
  items?: SearchItem[] | null;
};

type HistoryAction = {
  id?: number | null;
  name?: string | null;
};

type HistoryEntry = {
  user?: string | null;
  location?: { name?: string | null } | null;
  dateTime?: string | null;
  comment?: string | null;
  holder?: SearchHolder | null;
  warehouseAction?: HistoryAction | null;
};

type HistoryModalState = {
  isOpen: boolean;
  code: string;
  name: string;
  loading: boolean;
  data: HistoryEntry[];
};

const emptyHistoryState: HistoryModalState = {
  isOpen: false,
  code: "",
  name: "",
  loading: false,
  data: [],
};

const EXTERNAL_WAREHOUSE_API = "https://warehouseapi.ludilove.ru/api";
const GET_HARD_MODEL_URL = `${EXTERNAL_WAREHOUSE_API}/category/gethardmodel`;
const GET_OBJECT_HISTORY_URL = `${EXTERNAL_WAREHOUSE_API}/transfer/GetObjectHistory`;
const GET_ALL_HOLDERS_URL = `${EXTERNAL_WAREHOUSE_API}/holder/GetAllHolders`;

const SPECIAL_GREEN_LOCATION_GUID = "c6c585f2-2825-4946-88a7-92ce7c97013c";

const sortByName = <T,>(items: T[], getter: (item: T) => string | null | undefined) =>
  [...items].sort((a, b) => (getter(a) ?? "").localeCompare(getter(b) ?? ""));

const holderFullName = (holder?: SearchHolder | null) => {
  if (!holder) return "-";
  return [holder.surname ?? "", holder.name ?? "", holder.patronymic ?? ""].filter(Boolean).join(" ").trim() || "-";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const normalized = value.split(".")[0].replace("T", " ");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/);
  if (!match) return normalized;
  return `${match[3]}.${match[2]}.${match[1]} ${match[4]}`;
};

const getTextOrDash = (value?: string | null) => {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : "-";
};

const getItemDisplayName = (item: SearchItem | SearchGroup) => {
  return getTextOrDash(item.secondCat?.name ?? item.cat?.name ?? item.mainCat?.name);
};

const StockSearchPage = () => {
  const notifications = useNotifications();

  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [holders, setHolders] = useState<WarehouseHolder[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [mainCategories, setMainCategories] = useState<WarehouseCategoryNode[]>([]);
  const [categories, setCategories] = useState<WarehouseCategoryNode[]>([]);

  const [statusFilter, setStatusFilter] = useState<"active" | "disposed">("active");
  const [holderId, setHolderId] = useState("");
  const [locationGuid, setLocationGuid] = useState("");
  const [mainCategoryId, setMainCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [leafCategoryId, setLeafCategoryId] = useState("");

  const [results, setResults] = useState<SearchGroup[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [historyModal, setHistoryModal] = useState<HistoryModalState>(emptyHistoryState);

  const warehouseTokenRef = useRef<string | null>(null);

  const getWarehouseApiToken = async (forceRefresh = false) => {
    if (!forceRefresh && warehouseTokenRef.current) {
      return warehouseTokenRef.current;
    }

    const response = await get<ExternalTokenResponse>("/stock/external/token", {
      params: { forceRefresh },
    });
    const token = response?.token?.trim();
    if (!token) {
      throw new Error("Не удалось получить токен внешней складской API.");
    }

    warehouseTokenRef.current = token;
    return token;
  };

  const requestWarehouseApi = async <T,>(url: string): Promise<T> => {
    const send = async (forceRefresh: boolean): Promise<T> => {
      const token = await getWarehouseApiToken(forceRefresh);
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${token}`);

      const response = await fetch(url, { method: "GET", headers });

      if (response.status === 401 && !forceRefresh) {
        warehouseTokenRef.current = null;
        return send(true);
      }

      if (!response.ok) {
        let errorMessage = `Ошибка запроса (${response.status})`;
        try {
          const body = await response.json() as { message?: string; title?: string; detail?: string };
          errorMessage = body.message || body.title || body.detail || errorMessage;
        } catch {
          const text = await response.text();
          if (text) {
            errorMessage = text;
          }
        }
        throw new Error(errorMessage);
      }

      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    };

    return send(false);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const data = await get<StockSearchData>("/stock/search-data");

        const locationList = Array.isArray(data?.locations)
          ? sortByName(data.locations, (item) => item.name)
          : [];
        setLocations(locationList);

        const categoryList = Array.isArray(data?.categories)
          ? data.categories.filter((item) => item.id != null)
          : [];
        setCategories(categoryList);

        const mainCategoryList = Array.isArray(data?.mainCategories)
          ? sortByName(data.mainCategories.filter((item) => item.id != null), (item) => item.name)
          : sortByName(categoryList.filter((item) => item.parent == null), (item) => item.name);
        setMainCategories(mainCategoryList);

        const fallbackHolders = Array.isArray(data?.holders)
          ? sortByName(data.holders, (item) => item.surname)
          : [];

        try {
          const externalHolders = await requestWarehouseApi<WarehouseHolder[]>(GET_ALL_HOLDERS_URL);
          setHolders(Array.isArray(externalHolders) ? sortByName(externalHolders, (item) => item.surname) : fallbackHolders);
        } catch {
          setHolders(fallbackHolders);
        }
      } catch (error) {
        notifications.show(getFriendlyErrorMessage(error, "Не удалось загрузить фильтры поиска склада."), {
          severity: "error",
          autoHideDuration: 3500,
        });
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [notifications]);

  const subCategories = useMemo(() => {
    if (!mainCategoryId) return [];
    const parentId = Number(mainCategoryId);
    return sortByName(categories.filter((item) => item.parent === parentId), (item) => item.name);
  }, [categories, mainCategoryId]);

  const leafCategories = useMemo(() => {
    if (!subCategoryId) return [];
    const parentId = Number(subCategoryId);
    return sortByName(categories.filter((item) => item.parent === parentId), (item) => item.name);
  }, [categories, subCategoryId]);

  const holderOptions = useMemo(
    () =>
      holders
        .filter((item) => item.actual === 1)
        .map((item) => ({
          value: String(item.id),
          label: [item.surname, item.name, item.patronymic ?? ""].filter(Boolean).join(" "),
        })),
    [holders],
  );

  const locationOptions = useMemo(
    () =>
      locations
        .filter((item) => item.actual === 1)
        .map((item) => ({ value: item.guid, label: item.name })),
    [locations],
  );

  const mainCategoryOptions = useMemo(
    () =>
      mainCategories.map((item) => ({
        value: String(item.id),
        label: item.name,
      })),
    [mainCategories],
  );

  const subCategoryOptions = useMemo(
    () =>
      subCategories.map((item) => ({
        value: String(item.id),
        label: item.name,
      })),
    [subCategories],
  );

  const leafCategoryOptions = useMemo(
    () =>
      leafCategories.map((item) => ({
        value: String(item.id),
        label: item.name,
      })),
    [leafCategories],
  );

  const selectedCategoryForSearch = leafCategoryId || subCategoryId || mainCategoryId;

  const clearFilters = () => {
    setHolderId("");
    setLocationGuid("");
    setMainCategoryId("");
    setSubCategoryId("");
    setLeafCategoryId("");
    setResults([]);
    setHasSearched(false);
    setExpandedGroups(new Set());
  };

  const handleSearch = async () => {
    const params = new URLSearchParams();
    if (selectedCategoryForSearch) params.append("cathegory", selectedCategoryForSearch);
    if (holderId) params.append("holder", holderId);
    if (locationGuid) params.append("location", locationGuid);
    params.append("actual", statusFilter === "active" ? "1" : "0");

    const requestUrl = `${GET_HARD_MODEL_URL}?${params.toString()}`;

    try {
      setIsSearching(true);
      const response = await requestWarehouseApi<SearchGroup[]>(requestUrl);
      setResults(Array.isArray(response) ? response : []);
      setHasSearched(true);
      setExpandedGroups(new Set());
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось выполнить поиск по складу."), {
        severity: "error",
        autoHideDuration: 4000,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const openHistory = async (code: string, name: string) => {
    if (!code) return;

    setHistoryModal({
      isOpen: true,
      code,
      name,
      loading: true,
      data: [],
    });

    try {
      const response = await requestWarehouseApi<HistoryEntry[]>(`${GET_OBJECT_HISTORY_URL}?id=${encodeURIComponent(code)}`);
      setHistoryModal((prev) => ({
        ...prev,
        loading: false,
        data: Array.isArray(response) ? response : [],
      }));
    } catch (error) {
      setHistoryModal((prev) => ({
        ...prev,
        loading: false,
        data: [],
      }));
      notifications.show(getFriendlyErrorMessage(error, "Не удалось загрузить историю объекта."), {
        severity: "error",
        autoHideDuration: 4000,
      });
    }
  };

  const closeHistory = () => {
    setHistoryModal(emptyHistoryState);
  };

  const historySections = useMemo(() => {
    const data = historyModal.data;
    return {
      acceptance: data.filter((item) => item?.warehouseAction?.id === 1),
      transfer: data.filter((item) => item?.warehouseAction?.id === 2),
      writeOff: data.filter((item) => item?.warehouseAction?.id === 3),
    };
  }, [historyModal.data]);

  if (isLoading) {
    return (
      <div className={styles.loaderWrapper}>
        <LoadingSpinner size={96} label="Загружаем поиск…" />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.filtersCard}>
        <div className={styles.statusSwitch}>
          <button
            className={`${styles.statusButton} ${statusFilter === "active" ? styles.statusButtonActive : ""}`}
            onClick={() => setStatusFilter("active")}
          >
            Только активные
          </button>
          <button
            className={`${styles.statusButton} ${statusFilter === "disposed" ? styles.statusButtonDisposed : ""}`}
            onClick={() => setStatusFilter("disposed")}
          >
            Только списанные
          </button>
        </div>

        <div className={styles.filterGrid}>
          <Select
            label="Держатель"
            options={holderOptions}
            value={holderId}
            onChange={(e) => setHolderId(e.target.value)}
            placeholder="Выберите ФИО"
            search
          />
          <Select
            label="Торговая точка"
            options={locationOptions}
            value={locationGuid}
            onChange={(e) => setLocationGuid(e.target.value)}
            placeholder="Выберите ТТ"
            search
          />
          <Select
            label="Категория"
            options={mainCategoryOptions}
            value={mainCategoryId}
            onChange={(e) => {
              setMainCategoryId(e.target.value);
              setSubCategoryId("");
              setLeafCategoryId("");
            }}
            placeholder="Выберите категорию"
            search
          />
          <Select
            label="Подкатегория"
            options={subCategoryOptions}
            value={subCategoryId}
            disabled={!mainCategoryId || subCategoryOptions.length === 0}
            onChange={(e) => {
              setSubCategoryId(e.target.value);
              setLeafCategoryId("");
            }}
            placeholder="Выберите подкатегорию"
            search
          />
          <Select
            label="Наименование"
            options={leafCategoryOptions}
            value={leafCategoryId}
            disabled={!subCategoryId || leafCategoryOptions.length === 0}
            onChange={(e) => setLeafCategoryId(e.target.value)}
            placeholder="Выберите наименование"
            search
          />
        </div>

        <div className={styles.actions}>
          <Button variant="primary" loading={isSearching} onClick={() => void handleSearch()}>
            {isSearching ? "Поиск..." : "Поиск"}
          </Button>
          <Button variant="secondary" disabled={isSearching} onClick={clearFilters}>
            Очистить
          </Button>
        </div>
      </div>

      <div className={styles.resultsCard}>
        <div className={styles.tableHeader}>
          <p>Категория</p>
          <p>Подкатегория</p>
          <p>Наименование</p>
          <p className={styles.mobileHidden}>Держатель</p>
          <p className={styles.mobileHidden}>ТТ</p>
          <p>Количество / Код</p>
        </div>

        <div className={styles.tableBody}>
          {isSearching && (
            <div className={styles.loaderInline}>
              <LoadingSpinner />
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className={styles.emptyState}>К сожалению, ничего не найдено.</div>
          )}

          {!isSearching && results.map((group, groupIndex) => {
            const groupId = `${group.mainCat?.id ?? "g"}-${group.cat?.id ?? "c"}-${group.secondCat?.id ?? "s"}-${groupIndex}`;
            const isExpanded = expandedGroups.has(groupId);
            const items = Array.isArray(group.items) ? group.items : [];

            return (
              <div key={groupId} className={styles.groupWrapper}>
                <button className={styles.groupRow} onClick={() => toggleGroup(groupId)}>
                  <p>{getTextOrDash(group.mainCat?.name)}</p>
                  <p>{getTextOrDash(group.cat?.name)}</p>
                  <p>{getTextOrDash(group.secondCat?.name)}</p>
                  <p className={styles.mobileHidden}>{holderFullName(group.warehouseHolder)}</p>
                  <p className={styles.mobileHidden}>{getTextOrDash(group.location?.name)}</p>
                  <p>{isExpanded ? "▾" : "▸"} {items.length}</p>
                </button>

                {isExpanded && items.map((item, itemIndex) => {
                  const rawCode = (item.code ?? "").trim();
                  const rowCode = rawCode.length > 0 ? rawCode : "-";
                  const rowName = getItemDisplayName(item);
                  const isGreenRow = !item.warehouseHolder && item.location?.guid === SPECIAL_GREEN_LOCATION_GUID;
                  const rowClassName = statusFilter === "disposed"
                    ? `${styles.itemRow} ${styles.itemRowDisposed}`
                    : isGreenRow
                      ? `${styles.itemRow} ${styles.itemRowFree}`
                      : styles.itemRow;

                  return (
                    <button
                      key={`${groupId}-${rowCode}-${itemIndex}`}
                      className={rowClassName}
                      onClick={() => {
                        if (!rawCode) return;
                        void openHistory(rawCode, rowName);
                      }}
                    >
                      <p>{getTextOrDash(item.mainCat?.name)}</p>
                      <p>{getTextOrDash(item.cat?.name)}</p>
                      <p>{rowName}</p>
                      <p className={styles.mobileHidden}>{holderFullName(item.warehouseHolder)}</p>
                      <p className={styles.mobileHidden}>{getTextOrDash(item.location?.name)}</p>
                      <p>{rowCode}</p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={historyModal.isOpen}
        onClose={closeHistory}
        title={
          <div className={styles.historyTitle}>
            <span>{historyModal.code}</span>
            <b>{historyModal.name}</b>
          </div>
        }
        size="lg"
      >
        <div className={styles.historyContent}>
          {historyModal.loading && (
            <div className={styles.loaderInline}>
              <LoadingSpinner />
            </div>
          )}

          {!historyModal.loading && historyModal.data.length === 0 && (
            <div className={styles.emptyState}>История по объекту отсутствует.</div>
          )}

          {!historyModal.loading && historySections.acceptance.length > 0 && (
            <div className={styles.historySection}>
              <div className={`${styles.historySectionHeader} ${styles.acceptanceHeader}`}>Оприходование</div>
              {historySections.acceptance.map((item, index) => (
                <div className={styles.historyRow} key={`a-${index}`}>
                  <p>{getTextOrDash(item.user)}</p>
                  <p>{getTextOrDash(item.location?.name)}</p>
                  <p>{formatDateTime(item.dateTime)}</p>
                  <p>{getTextOrDash(item.comment)}</p>
                  <p>{holderFullName(item.holder)}</p>
                </div>
              ))}
            </div>
          )}

          {!historyModal.loading && historySections.transfer.length > 0 && (
            <div className={styles.historySection}>
              <div className={`${styles.historySectionHeader} ${styles.transferHeader}`}>Перемещение</div>
              {historySections.transfer.map((item, index) => (
                <div className={styles.historyRow} key={`t-${index}`}>
                  <p>{getTextOrDash(item.user)}</p>
                  <p>{getTextOrDash(item.location?.name)}</p>
                  <p>{formatDateTime(item.dateTime)}</p>
                  <p>{getTextOrDash(item.comment)}</p>
                  <p>{holderFullName(item.holder)}</p>
                </div>
              ))}
            </div>
          )}

          {!historyModal.loading && historySections.writeOff.length > 0 && (
            <div className={styles.historySection}>
              <div className={`${styles.historySectionHeader} ${styles.writeOffHeader}`}>Списание</div>
              {historySections.writeOff.map((item, index) => (
                <div className={styles.historyRow} key={`w-${index}`}>
                  <p>{getTextOrDash(item.user)}</p>
                  <p>{getTextOrDash(item.location?.name)}</p>
                  <p>{formatDateTime(item.dateTime)}</p>
                  <p>{getTextOrDash(item.comment)}</p>
                  <p>{holderFullName(item.holder)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default StockSearchPage;
