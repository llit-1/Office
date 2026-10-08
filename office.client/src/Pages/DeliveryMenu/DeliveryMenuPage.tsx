import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PriorityHighRoundedIcon from "@mui/icons-material/PriorityHighRounded";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import RestaurantMenuRoundedIcon from "@mui/icons-material/RestaurantMenuRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useNotifications } from "@toolpad/core";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import useLoadingPresence from "../../Components/LoadingSpinner/useLoadingPresence";
import Select from "../../Components/Select/Select";
import { getFriendlyErrorMessage } from "../../Services/api";
import type { RootState } from "../../Store";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import CategoryModal from "./components/CategoryModal";
import ItemModal from "./components/ItemModal";
import {
  createDeclaration,
  createDeliveryGroup,
  createDeliveryItem,
  deleteDeliveryGroup,
  findDeliveryItem,
  getActualDeclarations,
  getDeliveryGroupItems,
  getDeliveryGroups,
  getRkReference,
  createStopPack,
  getStopLocations,
  getStopPacks,
  removeLevelTwoStops,
  setDeliveryItemActual,
  updateDeliveryGroup,
  updateDeliveryItem,
} from "./deliveryMenu.api";
import type {
  Declaration,
  DeclarationPayload,
  DeliveryGroup,
  DeliveryGroupPayload,
  DeliveryItem,
  DeliveryItemPayload,
  RkMenuOption,
  StopLocation,
  StopPack,
} from "./deliveryMenu.types";
import { flattenRkCategories, formatMeasureUnit, formatPrice, getImageSource } from "./deliveryMenu.utils";
import styles from "./DeliveryMenu.module.css";
import { deliveryMenuRoles, hasAnyRole } from "./sectionRoles";
import { activeItemStops, formatStopEnd, stopTime } from "./stopStatus";
import useStopRefresh from "./useStopRefresh";
import useCashMenuSearch from "./useCashMenuSearch";
import { declarationStatus, normalizeDocNumber, type DeclarationStatus } from "./declarations.utils";

const DECLARATION_BADGE: Record<DeclarationStatus, string> = {
  valid: "Декларация",
  expired: "Декларация истекла",
  none: "Нет декларации",
};

export default function DeliveryMenuPage() {
  const { groupId } = useParams<{ groupId?: string }>();
  const selectedGroupId = groupId && Number.isInteger(Number(groupId)) ? Number(groupId) : null;
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { show } = useNotifications();
  const roles = useSelector((state: RootState) => state.userData.roles);
  const userId = useSelector((state: RootState) => state.auth?.id ?? null);
  const locationStorageKey = `office:cash-location:${userId ?? "session"}`;
  const location = useLocation();
  const cashMode = /^\/cash(?:\/|$)/i.test(location.pathname);
  const isCashAuditor = roles.includes("MenuAuditor");
  const canManageMenu = !cashMode && hasAnyRole(roles, deliveryMenuRoles);
  const canUseStops = cashMode && (isCashAuditor || roles.includes("Menu"));
  const catalogPath = cashMode ? "/Cash/items" : "/Delivery/menu";
  const hideInactiveCategories = !canManageMenu;
  const hideInactiveItems = !canManageMenu;

  const [groups, setGroups] = useState<DeliveryGroup[]>([]);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedGroupId, setLoadedGroupId] = useState<number | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DeliveryGroup | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<DeliveryGroup | null>(null);
  const [deletingCategory, setDeletingCategory] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DeliveryItem | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  // Действующие декларации (закон о платформенной экономике) — для карточки позиции и бейджей.
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [declarationsLoading, setDeclarationsLoading] = useState(false);
  const [declarationsLoaded, setDeclarationsLoaded] = useState(false);
  const [declarationsError, setDeclarationsError] = useState("");
  const [stopLocations, setStopLocations] = useState<StopLocation[]>([]);
  const [stopPacks, setStopPacks] = useState<StopPack[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [stopTarget, setStopTarget] = useState<{ item: DeliveryItem; location: string; locationName: string; remove: boolean } | null>(null);
  const [stopMutating, setStopMutating] = useState(false);
  const stopMutationRef = useRef(false);
  const stopRequestRef = useRef(0);
  const [stopsReady, setStopsReady] = useState(false);
  const [stopError, setStopError] = useState("");
  const [sourceItems, setSourceItems] = useState<RkMenuOption[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const loadRequestIdRef = useRef(0);
  const routeDataPending = loadedGroupId !== selectedGroupId;
  const pageLoading = loading || routeDataPending;
  const loadingPresence = useLoadingPresence(pageLoading);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const globalSearch = canUseStops && search.trim().length > 0;
  // Всё меню нужно поиску по всем категориям, бейджам стопов (касса) и счётчикам позиций без декларации (доставка).
  const allMenu = useCashMenuSearch(groups, (canUseStops || canManageMenu) && (globalSearch || selectedGroupId === null) && !pageLoading);

  const loadDeclarations = useCallback(async () => {
    if (!canManageMenu) return;
    setDeclarationsLoading(true);
    setDeclarationsError("");
    try {
      setDeclarations(await getActualDeclarations());
      setDeclarationsLoaded(true);
    } catch (error) {
      setDeclarationsError(getFriendlyErrorMessage(error, "Не удалось загрузить декларации."));
    } finally {
      setDeclarationsLoading(false);
    }
  }, [canManageMenu]);

  useEffect(() => { void loadDeclarations(); }, [loadDeclarations]);

  const actualDeclarationIds = useMemo(() => new Set(declarations.map((declaration) => declaration.id)), [declarations]);
  // Бейджи деклараций показываем только когда список действующих загружен — иначе все выглядели бы истёкшими.
  const showDeclarations = canManageMenu && declarationsLoaded;

  // Сколько активных позиций каждой категории без действующей декларации (нет или истекла).
  const categoryDeclarationGaps = useMemo(() => {
    if (!showDeclarations || !allMenu.loaded) return null;
    const byCode = new Map(allMenu.items.map((item) => [item.rkcode, item]));
    const gaps = new Map<number, number>();
    allMenu.rkcodesByGroup.forEach((rkcodes, groupId) => {
      gaps.set(groupId, rkcodes.filter((rkcode) => {
        const menuItem = byCode.get(rkcode);
        return menuItem ? declarationStatus(menuItem, actualDeclarationIds) !== "valid" : false;
      }).length);
    });
    return gaps;
  }, [actualDeclarationIds, allMenu.items, allMenu.loaded, allMenu.rkcodesByGroup, showDeclarations]);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setLoadError(null);

    try {
      const loadedGroups = await getDeliveryGroups();
      if (requestId !== loadRequestIdRef.current) return;

      const visibleGroups = hideInactiveCategories
        ? loadedGroups.filter((group) => group.actual === 1)
        : loadedGroups;
      setGroups(visibleGroups);

      if (selectedGroupId !== null) {
        if (!visibleGroups.some((group) => group.id === selectedGroupId)) {
          setItems([]);
          return;
        }

        const loadedItems = await getDeliveryGroupItems(selectedGroupId);
        if (requestId !== loadRequestIdRef.current) return;

        const visibleItems = hideInactiveItems
          ? loadedItems.filter((item) => item.actual === 1)
          : loadedItems;
        setItems(visibleItems);
      } else {
        setItems([]);
      }
    } catch (error) {
      if (requestId === loadRequestIdRef.current) {
        setLoadError(getFriendlyErrorMessage(error, "Не удалось загрузить меню доставки."));
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoadedGroupId(selectedGroupId);
        setLoading(false);
      }
    }
  }, [hideInactiveCategories, hideInactiveItems, selectedGroupId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadWorkerStops = useCallback(async () => {
    if (!canUseStops) return;
    const requestId = ++stopRequestRef.current;
    try {
      const [locations, packs] = await Promise.all([getStopLocations(), getStopPacks()]);
      if (requestId !== stopRequestRef.current) return;
      setStopLocations(locations);
      setStopPacks(packs);
      setSelectedLocation((current) => {
        let saved = "";
        try { saved = localStorage.getItem(locationStorageKey) ?? ""; } catch { /* Storage may be disabled. */ }
        const preferred = current || saved;
        return isCashAuditor && locations.some((entry) => entry.guid === preferred) ? preferred : locations[0]?.guid ?? "";
      });
      setStopsReady(true);
      setStopError("");
      return packs;
    } catch (error) {
      if (requestId === stopRequestRef.current) setStopError(getFriendlyErrorMessage(error, "Не удалось обновить стопы. Показаны последние полученные данные."));
    }
  }, [canUseStops, isCashAuditor, locationStorageKey]);

  useEffect(() => { void loadWorkerStops(); }, [loadWorkerStops]);
  const now = useStopRefresh(canUseStops && !stopMutating, loadWorkerStops);
  const currentLocationName = stopLocations.find((entry) => entry.guid === selectedLocation)?.name ?? "";

  // Сколько позиций каждой категории сейчас в стопе на выбранной ТТ (любой уровень стопа).
  const categoryStopCounts = useMemo(() => {
    if (!canUseStops || !stopsReady || !selectedLocation || !allMenu.loaded) return null;
    const counts = new Map<number, number>();
    allMenu.rkcodesByGroup.forEach((rkcodes, groupId) => {
      counts.set(groupId, rkcodes.filter((rkcode) => activeItemStops(stopPacks, rkcode, selectedLocation, now).length > 0).length);
    });
    return counts;
  }, [allMenu.loaded, allMenu.rkcodesByGroup, canUseStops, now, selectedLocation, stopPacks, stopsReady]);
  const chooseLocation = (value: string) => {
    setSelectedLocation(value);
    setStopTarget(null);
    if (isCashAuditor) {
      try { localStorage.setItem(locationStorageKey, value); } catch { /* Keep the in-memory selection. */ }
    }
  };

  useEffect(() => {
    setSearch("");
  }, [selectedGroupId]);

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: selectedGroupId === null ? "/Main" : catalogPath }));
    dispatch(titleSet({ title: selectedGroup?.yaName ?? (cashMode ? "Касса" : "Доставка") }));
  }, [dispatch, selectedGroup?.yaName, selectedGroupId, cashMode, catalogPath]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    return (globalSearch ? allMenu.items : items)
      .filter((item) => !query || `${item.yeName} ${item.rkName} ${item.description} ${item.rkcode}`
          .toLocaleLowerCase("ru-RU")
          .includes(query))
      .sort((left, right) => Number(right.actual === 1) - Number(left.actual === 1));
  }, [items, search, globalSearch, allMenu.items]);

  const existingCodes = useMemo(() => new Set(items.map((item) => item.rkcode)), [items]);

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: DeliveryGroup) => {
    setEditingCategory(category);
    setCategoryModalOpen(true);
  };

  const saveCategory = async (payload: DeliveryGroupPayload) => {
    setCategorySaving(true);
    try {
      if (editingCategory) {
        await updateDeliveryGroup(editingCategory.id, payload);
        show("Категория обновлена", { severity: "success", autoHideDuration: 3000 });
      } else {
        await createDeliveryGroup(payload);
        show("Категория создана", { severity: "success", autoHideDuration: 3000 });
      }
      setCategoryModalOpen(false);
      await loadData();
    } catch (error) {
      show(getFriendlyErrorMessage(error, "Не удалось сохранить категорию."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setCategorySaving(false);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategoryTarget || deletingCategory) return;
    setDeletingCategory(true);
    try {
      await deleteDeliveryGroup(deleteCategoryTarget.id);
      show("Категория удалена", { severity: "success", autoHideDuration: 3000 });
      setDeleteCategoryTarget(null);
      navigate(catalogPath);
      await loadData();
    } catch (error) {
      show(getFriendlyErrorMessage(error, "Удалить можно только пустую категорию."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setDeletingCategory(false);
    }
  };

  const ensureSourceMenu = useCallback(async () => {
    if (sourceLoaded || sourceLoading) return;
    setSourceLoading(true);
    try {
      const reference = await getRkReference();
      setSourceItems(flattenRkCategories(reference.categories ?? []));
      setSourceLoaded(true);
    } catch (error) {
      show(getFriendlyErrorMessage(error, "Не удалось загрузить меню R-Keeper."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setSourceLoading(false);
    }
  }, [show, sourceLoaded, sourceLoading]);

  const openCreateItem = () => {
    setEditingItem(null);
    setItemModalOpen(true);
    void ensureSourceMenu();
  };

  const openEditItem = (item: DeliveryItem) => {
    setEditingItem(item);
    setItemModalOpen(true);
  };

  const saveItem = async (itemPayload: DeliveryItemPayload, newDeclaration: DeclarationPayload | null) => {
    setItemSaving(true);
    try {
      let payload = itemPayload;
      if (newDeclaration) {
        // Если декларация с таким номером уже есть у нас (например, сохранилась при прошлой неудачной попытке),
        // повторно её не создаём.
        const number = normalizeDocNumber(newDeclaration.docNumber);
        const existing = declarations.find((declaration) => normalizeDocNumber(declaration.docNumber) === number);
        const declaration = existing ?? await createDeclaration(newDeclaration);
        if (!existing) setDeclarations((current) => [...current, declaration]);
        payload = { ...payload, declaration: declaration.id };
      }
      const savedItem: DeliveryItem = { ...payload, imageHash: "" };

      if (editingItem) {
        await updateDeliveryItem(editingItem.rkcode, payload);
        if (editingItem.actual !== payload.actual) {
          await setDeliveryItemActual(editingItem.rkcode, payload.actual === 1);
        }
        setItems((current) => current.map((item) =>
          item.rkcode === editingItem.rkcode ? savedItem : item,
        ));
        show("Позиция обновлена", { severity: "success", autoHideDuration: 3000 });
      } else {
        const existingItem = await findDeliveryItem(payload.rkcode);
        if (existingItem) {
          const existingGroupName = groups.find((group) => group.id === existingItem.yeGroup)?.yaName;
          show(
            existingGroupName
              ? `Позиция уже добавлена в категорию «${existingGroupName}».`
              : "Позиция с таким RK-кодом уже добавлена в меню.",
            { severity: "warning", autoHideDuration: 5000 },
          );
          return;
        }
        await createDeliveryItem(payload);
        setItems((current) => [...current, savedItem]);
        show("Позиция добавлена", { severity: "success", autoHideDuration: 3000 });
      }
      setItemModalOpen(false);
      // Счётчики «без декларации» на категориях считаются по всему меню — перечитываем его.
      allMenu.reload();
    } catch (error) {
      show(getFriendlyErrorMessage(error, "Не удалось сохранить позицию."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setItemSaving(false);
    }
  };

  const mutateWorkerStop = async () => {
    if (!stopTarget || stopMutationRef.current) return;
    const target = stopTarget;
    const item = target.item;
    stopMutationRef.current = true;
    setStopMutating(true);
    try {
      // Recheck immediately before mutation without changing the action shown in the dialog.
      const packs = await loadWorkerStops();
      if (!packs) {
        show("Не удалось проверить состояние стопа. Повторите после обновления данных.", { severity: "error" });
        return;
      }
      const current = activeItemStops(packs, item.rkcode, target.location, Date.now());
      if (current.some((stop) => stop.permissionLevel === 1) || current.some((stop) => stop.permissionLevel === 2) !== target.remove) {
        setStopTarget(null);
        show("Состояние позиции изменилось. Проверьте обновлённый статус и выберите действие заново.", { severity: "warning" });
        return;
      }
      ++stopRequestRef.current;
      if (target.remove) {
        await removeLevelTwoStops(item.rkcode, target.location);
        show(`Стоп снят для «${target.locationName}»`, { severity: "success", autoHideDuration: 2500 });
      } else {
        const now = new Date();
        await createStopPack({
          itemId: item.rkcode,
          itemName: item.rkName,
          locationGUID: null,
          locationName: null,
          begin: now.toISOString(),
          end: now.toISOString(),
          permissionLevel: 2,
          stops: [{ locationGUID: target.location, item: item.rkcode }],
        });
        show(`Позиция заблокирована для «${target.locationName}» до 00:00`, { severity: "success", autoHideDuration: 3000 });
      }
      setStopTarget(null);
      await loadWorkerStops();
    } catch (error) {
      show(getFriendlyErrorMessage(error, "Не удалось изменить стоп."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      stopMutationRef.current = false;
      setStopMutating(false);
    }
  };

  if (pageLoading || loadingPresence.visible) {
    return (
      <div className={styles.statePage}>
        <LoadingSpinner size={96} label="Собираем меню доставки…" exiting={loadingPresence.exiting} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.statePage}>
        <div className={styles.errorStateIcon}>!</div>
        <h2>Не удалось загрузить меню</h2>
        <p>{loadError}</p>
        <Button variant="primary" onClick={() => void loadData()}>
          Попробовать снова
        </Button>
      </div>
    );
  }

  if (selectedGroupId !== null && !selectedGroup) {
    return (
      <div className={styles.statePage}>
        <Inventory2OutlinedIcon className={styles.largeStateIcon} />
        <h2>Категория не найдена</h2>
        <p>Возможно, она была удалена или отключена.</p>
        <Button variant="primary" onClick={() => navigate(catalogPath)}>
          К списку категорий
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {canUseStops && !isCashAuditor && (
        <section className={styles.locationBar}>
          <div className={styles.locationBarIntro}>
            <span className={styles.locationBarIcon}><LocationOnOutlinedIcon /></span>
            <div>
              <strong>{currentLocationName || "Быстрые стопы"}</strong>
              <small>Только агрегаторы · до 00:00 по Москве</small>
            </div>
          </div>
          {!currentLocationName && <strong>{stopsReady ? "Нет доступных торговых точек" : "Загружаем торговую точку…"}</strong>}
        </section>
      )}
      {canUseStops && <>
        {stopError && <p role="alert" className={styles.refreshError}>{stopError} Действия временно недоступны.</p>}
        <section className={styles.toolbar}>
          <div className={styles.toolbarSearchGroup}>
            <label className={styles.searchField}><SearchRoundedIcon /><input value={search}
              aria-label="Поиск по всем категориям" placeholder="Найти блюдо: название или RK-код"
              onChange={(event) => setSearch(event.target.value)} /></label>
            {isCashAuditor && (
              <div className={styles.locationPicker}>
                <Select
                  label="Торговая точка"
                  hideLabel
                  options={stopLocations.map((location) => ({ value: location.guid, label: location.name }))}
                  value={selectedLocation}
                  onChange={(event) => chooseLocation(event.target.value)}
                  disabled={stopMutating || stopTarget !== null}
                  placeholder="Выберите торговую точку"
                  wrapperClassName={styles.locationSelect}
                  search
                  size="small"
                />
              </div>
            )}
          </div>
          {search && <Button size="sm" onClick={() => setSearch("")}>Сбросить поиск</Button>}
        </section>
      </>}
      {selectedGroup || globalSearch ? (
        <>
          {selectedGroup && !globalSearch && canUseStops && <section className={styles.categoryHero}>
            {getImageSource(selectedGroup.image) && (
              <img src={getImageSource(selectedGroup.image) ?? ""} alt="" className={styles.categoryHeroImage} />
            )}
            <div className={styles.categoryHeroShade}></div>
            <div className={styles.categoryHeroContent}>
              <h1>{selectedGroup.yaName}</h1>
              <p>
                {items.length} {items.length === 1 ? "позиция" : "позиций"}
              </p>
            </div>
          </section>}

          {!canUseStops && <section className={styles.toolbar}>
            <div className={styles.toolbarSearchGroup}>
              <label className={styles.searchField}>
                <SearchRoundedIcon />
                <input
                  value={search}
                  placeholder="Поиск по названию, описанию или RK-коду"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {selectedGroup && canManageMenu && (
                <div className={styles.categoryToolbarActions}>
                  <button
                    type="button"
                    className={styles.heroSecondaryButton}
                    onClick={() => openEditCategory(selectedGroup)}
                    aria-label="Изменить категорию"
                  >
                    <EditRoundedIcon />
                    Изменить<span className={styles.labelTail}> категорию</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.heroSecondaryButton} ${styles.heroDangerButton}`}
                    onClick={() => setDeleteCategoryTarget(selectedGroup)}
                    aria-label="Удалить категорию"
                  >
                    <DeleteOutlineRoundedIcon />
                    Удалить<span className={styles.labelTail}> категорию</span>
                  </button>
                  <button type="button" className={styles.heroPrimaryButton} onClick={openCreateItem}>
                    <AddRoundedIcon />
                    Добавить позицию
                  </button>
                </div>
              )}
            </div>
          </section>}

          {globalSearch && <p className={styles.searchSummary}>Поиск по всем категориям{!allMenu.loading && !allMenu.error ? ` · найдено: ${filteredItems.length}` : ""}</p>}
          {globalSearch && allMenu.loading ? (
            <div className={styles.searchLoading}><LoadingSpinner label="Ищем во всех категориях…" /></div>
          ) : globalSearch && allMenu.error ? (
            <div role="alert"><p>{allMenu.error}</p><Button onClick={allMenu.retry}>Повторить поиск</Button></div>
          ) : filteredItems.length === 0 ? (
            <section className={styles.emptyState}>
              <RestaurantMenuRoundedIcon />
              <h2>{!globalSearch && items.length === 0 ? "В категории пока нет позиций" : "Ничего не найдено"}</h2>
              <p>{!globalSearch && items.length === 0 && canManageMenu ? "Добавьте первое блюдо из актуального меню R-Keeper." : "Попробуйте изменить поисковый запрос."}</p>
              {items.length === 0 && canManageMenu && (
                <Button variant="primary" leadingIcon={<AddRoundedIcon />} onClick={openCreateItem}>
                  Добавить позицию
                </Button>
              )}
            </section>
          ) : (
            <section className={styles.itemsGrid}>
              {filteredItems.map((item) => {
                const imageSource = getImageSource(item.image);
                const active = item.actual === 1;
                const effectiveStops = canUseStops ? activeItemStops(stopPacks, item.rkcode, selectedLocation, now) : [];
                const hasLevelOne = effectiveStops.some((stop) => stop.permissionLevel === 1);
                const hasLevelTwo = effectiveStops.some((stop) => stop.permissionLevel === 2);
                const stopped = hasLevelOne || hasLevelTwo;
                const currentLocationName = stopLocations.find((location) => location.guid === selectedLocation)?.name ?? "выбранной ТТ";
                const latestStopEnd = Math.max(...effectiveStops.filter((stop) => stop.permissionLevel === (hasLevelOne ? 1 : 2)).map((stop) => stopTime(stop.end)));
                const stopEnd = Number.isFinite(latestStopEnd) ? formatStopEnd(latestStopEnd) : "";
                const statusUnknown = !stopsReady || Boolean(stopError) || !selectedLocation;
                const stopTitle = !selectedLocation
                  ? "Сначала выберите торговую точку"
                  : hasLevelOne
                    ? `Касса и агрегаторы · ${currentLocationName} · до ${stopEnd}. Управление в разделе «Стоп-листы»`
                    : hasLevelTwo
                      ? `Только агрегаторы · ${currentLocationName} · до ${stopEnd}. Нажмите, чтобы снять`
                      : `Поставить стоп в агрегаторах для «${currentLocationName}» до 00:00`;
                return (
                  <article
                    key={item.rkcode}
                    className={`${styles.itemCard} ${!active ? styles.itemCardInactive : ""} ${
                      stopped ? `${styles.itemCardStopped} ${hasLevelOne ? styles.itemCardStoppedFull : styles.itemCardStoppedPartial}` : ""
                    }`}
                  >
                    <div className={styles.itemMedia}>
                      {imageSource ? <img src={imageSource} alt={item.yeName} /> : <RestaurantMenuRoundedIcon />}
                      <span className={`${styles.itemStatus} ${styles.itemStatusBadge} ${!active || stopped ? styles.statusStopped : styles.statusAvailable}`}>
                        {!active ? "Отключено" : canUseStops ? statusUnknown ? "Статус не подтверждён" : hasLevelOne ? "Глобальный стоп" : hasLevelTwo ? "Стоп до 00:00" : "Доступно" : "Активно"}
                      </span>
                      {(canManageMenu || canUseStops) && (
                        <div className={styles.itemCardActions}>
                          {canManageMenu && (
                            <button
                              type="button"
                              className={styles.itemCardActionButton}
                              onClick={() => openEditItem(item)}
                              aria-label={`Редактировать ${item.yeName}`}
                              title="Редактировать"
                            >
                              <EditRoundedIcon />
                            </button>
                          )}
                          {canUseStops && (
                            <button
                              type="button"
                              className={`${styles.itemCardActionButton} ${stopped ? styles.itemCardLockButtonClosed : ""}`}
                              disabled={statusUnknown || stopMutating || hasLevelOne}
                              aria-disabled={hasLevelOne}
                              onClick={() => setStopTarget({ item, location: selectedLocation, locationName: currentLocationName, remove: hasLevelTwo })}
                              aria-label={hasLevelOne ? `Глобальный стоп на ${item.yeName}` : stopped ? `Снять стоп с ${item.yeName}` : `Поставить стоп на ${item.yeName}`}
                              title={stopTitle}
                            >
                              {stopped ? <LockRoundedIcon /> : <LockOpenRoundedIcon />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={styles.itemBody}>
                      {globalSearch && (
                        <div className={styles.statusLine}>
                          <small>{groups.find((group) => group.id === item.yeGroup)?.yaName}</small>
                        </div>
                      )}
                      <div className={styles.itemHeading}>
                        <h2>{item.yeName}</h2>
                        <strong>{formatPrice(item.price)}</strong>
                      </div>
                      <p>{item.description}</p>
                      <div className={styles.itemMeta}>
                        <span>{item.measure} {formatMeasureUnit(item.measureUnit)}</span>
                        <span>RK #{item.rkcode}</span>
                        {showDeclarations && (() => {
                          const status = declarationStatus(item, actualDeclarationIds);
                          return (
                            <span
                              className={`${styles.itemDeclarationBadge} ${
                                status === "valid" ? styles.itemDeclarationValid : status === "expired" ? styles.itemDeclarationExpired : styles.itemDeclarationMissing
                              }`}
                            >
                              {DECLARATION_BADGE[status]}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

        </>
      ) : (
        <>
          <section className={styles.categoriesGrid}>
            {canManageMenu && (
              <button type="button" className={styles.addCategoryCard} onClick={openCreateCategory}>
                <span><AddRoundedIcon /></span>
                <strong>Новая категория</strong>
                <small>Добавить раздел меню</small>
              </button>
            )}

            {groups.map((group) => {
              const imageSource = getImageSource(group.image);
              const stopCount = categoryStopCounts?.get(group.id) ?? 0;
              const declarationGaps = categoryDeclarationGaps?.get(group.id) ?? 0;
              return (
                <article key={group.id} className={styles.categoryCard}>
                  <button type="button" className={styles.categoryCardMain} onClick={() => navigate(`${catalogPath}/${group.id}`)}>
                    <span className={styles.categoryCardMedia}>
                      {imageSource ? <img src={imageSource} alt="" /> : <RestaurantMenuRoundedIcon />}
                      <span className={styles.categoryCardShade}></span>
                    </span>
                    {stopCount > 0 && (
                      <span className={styles.categoryStopBadge} title={`В стопе позиций: ${stopCount}`}>
                        <LockRoundedIcon aria-hidden="true" />
                        {stopCount}
                        <span className={styles.srOnly}> в стопе</span>
                      </span>
                    )}
                    {declarationGaps > 0 && (
                      <span className={styles.categoryDeclarationBadge} title={`Позиций без действующей декларации: ${declarationGaps}`}>
                        <PriorityHighRoundedIcon aria-hidden="true" />
                        {declarationGaps}
                        <span className={styles.srOnly}> без декларации</span>
                      </span>
                    )}
                    <span className={styles.categoryCardContent}>
                      <span className={styles.categoryCardTitle}>{group.yaName}</span>
                      {canManageMenu && <span className={styles.categoryStatus}>{group.actual === 1 ? "Активна" : "Отключена"}</span>}
                    </span>
                  </button>
                  {canManageMenu && (
                    <button
                      type="button"
                      className={styles.categoryMenuButton}
                      aria-label={`Изменить ${group.yaName}`}
                      onClick={() => openEditCategory(group)}
                    >
                      <MoreHorizRoundedIcon />
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}

      {canManageMenu && (
        <CategoryModal
          isOpen={categoryModalOpen}
          category={editingCategory}
          saving={categorySaving}
          onClose={() => setCategoryModalOpen(false)}
          onSubmit={(payload) => void saveCategory(payload)}
        />
      )}

      {selectedGroupId !== null && canManageMenu && (
        <ItemModal
          isOpen={itemModalOpen}
          groupId={selectedGroupId}
          item={editingItem}
          sourceItems={sourceItems}
          sourceLoading={sourceLoading}
          existingCodes={existingCodes}
          saving={itemSaving}
          onClose={() => setItemModalOpen(false)}
          declarations={declarations}
          declarationsLoading={declarationsLoading || (!declarationsLoaded && !declarationsError)}
          declarationsError={declarationsError}
          onRetryDeclarations={() => void loadDeclarations()}
          onSubmit={(payload, newDeclaration) => void saveItem(payload, newDeclaration)}
        />
      )}

      {canManageMenu && (
        <ConfirmModal
          isOpen={deleteCategoryTarget !== null}
          title="Удалить категорию?"
          message={deleteCategoryTarget ? `Категория «${deleteCategoryTarget.yaName}» исчезнет из меню. Это действие нельзя отменить.` : ""}
          confirmLabel={deletingCategory ? "Удаляем…" : "Удалить"}
          cancelLabel="Отмена"
          onCancel={() => setDeleteCategoryTarget(null)}
          onConfirm={() => void confirmDeleteCategory()}
        />
      )}

      {canUseStops && (
        <ConfirmModal
          isOpen={stopTarget !== null}
          title={stopTarget?.remove ? "Снять стоп?" : "Поставить стоп?"}
          message={stopTarget
            ? stopTarget.remove
              ? `Позиция «${stopTarget.item.yeName}» снова станет доступна в агрегаторах для «${stopTarget.locationName}».`
              : `Позиция «${stopTarget.item.yeName}» будет недоступна в агрегаторах до 00:00 по Москве для «${stopTarget.locationName}».`
            : ""}
          confirmLabel={stopMutating
            ? "Сохраняем…"
            : stopTarget?.remove ? "Снять стоп" : "Поставить стоп"}
          cancelLabel="Отмена"
          onCancel={() => { if (!stopMutating) setStopTarget(null); }}
          onConfirm={() => {
            if (stopTarget) void mutateWorkerStop();
          }}
        />
      )}
    </div>
  );
}
