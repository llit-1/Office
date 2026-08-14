import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
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
  createDeliveryGroup,
  createDeliveryItem,
  deleteDeliveryGroup,
  findDeliveryItem,
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
import DeliveryStopsPage from "./DeliveryStopsPage";

export default function DeliveryMenuPage() {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const location = useLocation();
  const isMenuAuditor = roles.includes("MenuAuditor");
  const isMenuAdminStops = roles.includes("MenuAdmin") && location.pathname.toLocaleLowerCase() === "/deliverymenu/stops";
  return isMenuAuditor || isMenuAdminStops ? <DeliveryStopsPage /> : <DeliveryCatalogPage />;
}

function DeliveryCatalogPage() {
  const { groupId } = useParams<{ groupId?: string }>();
  const selectedGroupId = groupId && Number.isInteger(Number(groupId)) ? Number(groupId) : null;
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const notifications = useNotifications();
  const roles = useSelector((state: RootState) => state.userData.roles);
  const isMenuAdmin = roles.includes("MenuAdmin");
  const canManageMenu = roles.includes("MenuMarketing") || isMenuAdmin;
  const canUseStops = isMenuAdmin || (roles.includes("Menu") && !canManageMenu);
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
  const [stopLocations, setStopLocations] = useState<StopLocation[]>([]);
  const [stopPacks, setStopPacks] = useState<StopPack[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [stopTarget, setStopTarget] = useState<DeliveryItem | null>(null);
  const [stopMutating, setStopMutating] = useState(false);
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
    try {
      const [locations, packs] = await Promise.all([getStopLocations(), getStopPacks()]);
      setStopLocations(locations);
      setStopPacks(packs);
      setSelectedLocation((current) => isMenuAdmin && locations.some((location) => location.guid === current)
        ? current
        : locations[0]?.guid ?? "");
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось загрузить стопы и доступные торговые точки."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    }
  }, [canUseStops, isMenuAdmin, notifications]);

  useEffect(() => { void loadWorkerStops(); }, [loadWorkerStops]);

  useEffect(() => {
    setSearch("");
  }, [selectedGroupId]);

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: selectedGroupId === null ? "/Main" : "/DeliveryMenu" }));
    dispatch(titleSet({ title: selectedGroup?.yaName ?? "Категории" }));
  }, [dispatch, selectedGroup?.yaName, selectedGroupId]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    return items
      .filter((item) => !query || `${item.yeName} ${item.rkName} ${item.description} ${item.rkcode}`
          .toLocaleLowerCase("ru-RU")
          .includes(query))
      .sort((left, right) => Number(right.actual === 1) - Number(left.actual === 1));
  }, [items, search]);

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
        notifications.show("Категория обновлена", { severity: "success", autoHideDuration: 3000 });
      } else {
        await createDeliveryGroup(payload);
        notifications.show("Категория создана", { severity: "success", autoHideDuration: 3000 });
      }
      setCategoryModalOpen(false);
      await loadData();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось сохранить категорию."), {
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
      notifications.show("Категория удалена", { severity: "success", autoHideDuration: 3000 });
      setDeleteCategoryTarget(null);
      navigate("/DeliveryMenu");
      await loadData();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Удалить можно только пустую категорию."), {
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
      notifications.show(getFriendlyErrorMessage(error, "Не удалось загрузить меню R-Keeper."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setSourceLoading(false);
    }
  }, [notifications, sourceLoaded, sourceLoading]);

  const openCreateItem = () => {
    setEditingItem(null);
    setItemModalOpen(true);
    void ensureSourceMenu();
  };

  const openEditItem = (item: DeliveryItem) => {
    setEditingItem(item);
    setItemModalOpen(true);
  };

  const saveItem = async (payload: DeliveryItemPayload) => {
    setItemSaving(true);
    try {
      const savedItem: DeliveryItem = { ...payload, imageHash: "" };

      if (editingItem) {
        await updateDeliveryItem(editingItem.rkcode, payload);
        if (editingItem.actual !== payload.actual) {
          await setDeliveryItemActual(editingItem.rkcode, payload.actual === 1);
        }
        setItems((current) => current.map((item) =>
          item.rkcode === editingItem.rkcode ? savedItem : item,
        ));
        notifications.show("Позиция обновлена", { severity: "success", autoHideDuration: 3000 });
      } else {
        const existingItem = await findDeliveryItem(payload.rkcode);
        if (existingItem) {
          const existingGroupName = groups.find((group) => group.id === existingItem.yeGroup)?.yaName;
          notifications.show(
            existingGroupName
              ? `Позиция уже добавлена в категорию «${existingGroupName}».`
              : "Позиция с таким RK-кодом уже добавлена в меню.",
            { severity: "warning", autoHideDuration: 5000 },
          );
          return;
        }
        await createDeliveryItem(payload);
        setItems((current) => [...current, savedItem]);
        notifications.show("Позиция добавлена", { severity: "success", autoHideDuration: 3000 });
      }
      setItemModalOpen(false);
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось сохранить позицию."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setItemSaving(false);
    }
  };

  const effectiveStopsFor = useCallback((itemId: number) => {
    const now = Date.now();
    return stopPacks.flatMap((pack) => pack.stops).filter((stop) => {
      const begin = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(stop.begin) ? stop.begin : `${stop.begin}+03:00`).getTime();
      const end = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(stop.end) ? stop.end : `${stop.end}+03:00`).getTime();
      return stop.item === itemId && stop.locationGUID === selectedLocation && begin <= now && end > now;
    });
  }, [selectedLocation, stopPacks]);

  const effectivePacksFor = useCallback((itemId: number) => {
    const effectiveStops = effectiveStopsFor(itemId);
    return stopPacks.filter((pack) => pack.stops.some((stop) => effectiveStops.includes(stop)));
  }, [effectiveStopsFor, stopPacks]);

  const mutateWorkerStop = async (item: DeliveryItem) => {
    if (!selectedLocation || stopMutating) return;
    const effectivePacks = effectivePacksFor(item.rkcode);
    const hasLevelTwo = effectivePacks.some((pack) => pack.permissionLevel === 2);
    setStopMutating(true);
    try {
      if (hasLevelTwo) {
        await removeLevelTwoStops(item.rkcode, selectedLocation);
        notifications.show("Стоп снят", { severity: "success", autoHideDuration: 2500 });
      } else {
        const location = stopLocations.find((entry) => entry.guid === selectedLocation);
        const now = new Date();
        await createStopPack({
          itemId: item.rkcode,
          itemName: item.rkName,
          locationGUID: null,
          locationName: null,
          begin: now.toISOString(),
          end: now.toISOString(),
          permissionLevel: 2,
          stops: [{ locationGUID: selectedLocation, item: item.rkcode }],
        });
        notifications.show(`Позиция заблокирована для «${location?.name ?? "ТТ"}» до 00:00`, { severity: "success", autoHideDuration: 3000 });
      }
      setStopTarget(null);
      await loadWorkerStops();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось изменить стоп."), { severity: "error", autoHideDuration: 5000 });
    } finally {
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
        <Button variant="primary" onClick={() => navigate("/DeliveryMenu")}>
          К списку категорий
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {isMenuAdmin && selectedGroup && (
        <section className={styles.locationBar}>
          <div className={styles.locationBarIntro}>
            <span className={styles.locationBarIcon}><LocationOnOutlinedIcon /></span>
            <div>
              <strong>Быстрый стоп</strong>
              <small>Замки на позициях применяются к выбранной торговой точке</small>
            </div>
          </div>
          <div className={styles.locationPicker}>
            <Select
              label="Торговая точка"
              options={stopLocations.map((location) => ({ value: location.guid, label: location.name }))}
              value={selectedLocation}
              onChange={(event) => setSelectedLocation(event.target.value)}
              placeholder="Выберите торговую точку"
              wrapperClassName={styles.locationSelect}
              search
              size="small"
            />
          </div>
        </section>
      )}
      {selectedGroup ? (
        <>
          <section className={styles.categoryHero}>
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
            {canManageMenu && (
              <div className={styles.categoryHeroActions}>
                <button type="button" className={styles.heroSecondaryButton} onClick={() => openEditCategory(selectedGroup)}>
                  <EditRoundedIcon />
                  Изменить категорию
                </button>
                <button
                  type="button"
                  className={`${styles.heroSecondaryButton} ${styles.heroDangerButton}`}
                  onClick={() => setDeleteCategoryTarget(selectedGroup)}
                >
                  <DeleteOutlineRoundedIcon />
                  Удалить категорию
                </button>
                <button type="button" className={styles.heroPrimaryButton} onClick={openCreateItem}>
                  <AddRoundedIcon />
                  Добавить позицию
                </button>
              </div>
            )}
          </section>

          <section className={styles.toolbar}>
            <label className={styles.searchField}>
              <SearchRoundedIcon />
              <input
                value={search}
                placeholder="Поиск по названию, описанию или RK-коду"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </section>

          {filteredItems.length === 0 ? (
            <section className={styles.emptyState}>
              <RestaurantMenuRoundedIcon />
              <h2>{items.length === 0 ? "В категории пока нет позиций" : "Ничего не найдено"}</h2>
              <p>{items.length === 0 ? "Добавьте первое блюдо из актуального меню R-Keeper." : "Попробуйте изменить поисковый запрос."}</p>
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
                const effectiveStops = effectiveStopsFor(item.rkcode);
                const effectivePacks = effectivePacksFor(item.rkcode);
                const hasLevelOne = effectivePacks.some((pack) => pack.permissionLevel === 1);
                const hasLevelTwo = effectivePacks.some((pack) => pack.permissionLevel === 2);
                const stopped = hasLevelOne || hasLevelTwo;
                const currentLocationName = stopLocations.find((location) => location.guid === selectedLocation)?.name ?? "выбранной ТТ";
                const latestStopEnd = effectiveStops.sort((left, right) => right.end.localeCompare(left.end))[0]?.end;
                const stopEnd = latestStopEnd
                  ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    .format(new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(latestStopEnd) ? latestStopEnd : `${latestStopEnd}+03:00`))
                  : "";
                const stopTitle = !selectedLocation
                  ? "Сначала выберите торговую точку"
                  : hasLevelOne
                    ? `Касса и агрегаторы · ${currentLocationName} · до ${stopEnd}. Снять может только аудитор`
                    : hasLevelTwo
                      ? `Только агрегаторы · ${currentLocationName} · до ${stopEnd}. Нажмите, чтобы снять`
                      : `Поставить стоп в агрегаторах для «${currentLocationName}» до 00:00`;
                return (
                  <article
                    key={item.rkcode}
                    className={`${styles.itemCard} ${!active ? styles.itemCardInactive : ""} ${stopped ? styles.itemCardStopped : ""}`}
                  >
                    <div className={styles.itemMedia}>
                      {imageSource ? <img src={imageSource} alt={item.yeName} /> : <RestaurantMenuRoundedIcon />}
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
                              disabled={!selectedLocation || stopMutating}
                              aria-disabled={hasLevelOne}
                              onClick={() => { if (!hasLevelOne) setStopTarget(item); }}
                              aria-label={stopped ? `Снять стоп с ${item.yeName}` : `Поставить стоп на ${item.yeName}`}
                              title={stopTitle}
                            >
                              {stopped ? <LockRoundedIcon /> : <LockOpenRoundedIcon />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={styles.itemBody}>
                      <div className={styles.itemHeading}>
                        <h2>{item.yeName}</h2>
                        <strong>{formatPrice(item.price)}</strong>
                      </div>
                      <p>{item.description}</p>
                      <div className={styles.itemMeta}>
                        <span>{item.measure} {formatMeasureUnit(item.measureUnit)}</span>
                        <span>RK #{item.rkcode}</span>
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
            {isMenuAdmin && (
              <button type="button" className={styles.stopListsCard} onClick={() => navigate("/DeliveryMenu/stops") }>
                <span><LockRoundedIcon /></span>
                <strong>Стоп-листы</strong>
                <small>Управление блокировками</small>
              </button>
            )}
            {canManageMenu && (
              <button type="button" className={styles.addCategoryCard} onClick={openCreateCategory}>
                <span><AddRoundedIcon /></span>
                <strong>Новая категория</strong>
                <small>Добавить раздел меню</small>
              </button>
            )}

            {groups.map((group) => {
              const imageSource = getImageSource(group.image);
              return (
                <article key={group.id} className={styles.categoryCard}>
                  <button type="button" className={styles.categoryCardMain} onClick={() => navigate(`/DeliveryMenu/${group.id}`)}>
                    <span className={styles.categoryCardMedia}>
                      {imageSource ? <img src={imageSource} alt="" /> : <RestaurantMenuRoundedIcon />}
                      <span className={styles.categoryCardShade}></span>
                    </span>
                    <span className={styles.categoryCardContent}>
                      <span className={styles.categoryCardTitle}>{group.yaName}</span>
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
          onSubmit={(payload) => void saveItem(payload)}
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
          title={stopTarget && effectivePacksFor(stopTarget.rkcode).some((pack) => pack.permissionLevel === 2) ? "Снять стоп?" : "Поставить стоп?"}
          message={stopTarget
            ? effectivePacksFor(stopTarget.rkcode).some((pack) => pack.permissionLevel === 2)
              ? `Позиция «${stopTarget.yeName}» снова станет доступна в агрегаторах.`
              : `Позиция «${stopTarget.yeName}» будет недоступна в агрегаторах до 00:00 для выбранной ТТ.`
            : ""}
          confirmLabel={stopMutating
            ? "Сохраняем…"
            : stopTarget && effectivePacksFor(stopTarget.rkcode).some((pack) => pack.permissionLevel === 2) ? "Снять стоп" : "Поставить стоп"}
          cancelLabel="Отмена"
          onCancel={() => { if (!stopMutating) setStopTarget(null); }}
          onConfirm={() => {
            if (stopTarget) void mutateWorkerStop(stopTarget);
          }}
        />
      )}
    </div>
  );
}
