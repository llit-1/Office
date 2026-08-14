import { useCallback, useEffect, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useNotifications } from "@toolpad/core";
import { useDispatch, useSelector } from "react-redux";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import useLoadingPresence from "../../Components/LoadingSpinner/useLoadingPresence";
import { getFriendlyErrorMessage } from "../../Services/api";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import type { RootState } from "../../Store";
import StopPackModal from "./components/StopPackModal";
import {
  createStopPack,
  deleteStopPack,
  getStopLocations,
  getStopItems,
  getStopPacks,
  updateStopPack,
} from "./deliveryMenu.api";
import type { DeliveryItem, StopLocation, StopPack, StopPackPayload } from "./deliveryMenu.types";
import styles from "./DeliveryStops.module.css";

type PackStatus = "active" | "scheduled";

function parseMoscow(value: string) {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}+03:00`);
}

function getStatus(pack: StopPack): PackStatus {
  return parseMoscow(pack.begin).getTime() > Date.now() ? "scheduled" : "active";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseMoscow(value));
}

export default function DeliveryStopsPage() {
  const dispatch = useDispatch();
  const roles = useSelector((state: RootState) => state.userData.roles);
  const notifications = useNotifications();
  const [packs, setPacks] = useState<StopPack[]>([]);
  const [locations, setLocations] = useState<StopLocation[]>([]);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PackStatus>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<StopPack | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StopPack | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loadingPresence = useLoadingPresence(loading);

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: roles.includes("MenuAdmin") ? "/DeliveryMenu" : "/Main" }));
    dispatch(titleSet({ title: "Стоп-листы" }));
  }, [dispatch, roles]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedPacks, loadedLocations, loadedItems] = await Promise.all([
        getStopPacks(),
        getStopLocations(),
        getStopItems(),
      ]);
      const uniqueItems = Array.from(new Map(loadedItems.map((item) => [item.rkcode, item])).values())
        .sort((left, right) => left.rkName.localeCompare(right.rkName, "ru"));
      setPacks(loadedPacks);
      setLocations(loadedLocations);
      setItems(uniqueItems);
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, "Не удалось загрузить стоп-листы."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredPacks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    return packs
      .filter((pack) => statusFilter === "all" || getStatus(pack) === statusFilter)
      .filter((pack) => !query || `${pack.itemName ?? ""} ${pack.locationName ?? ""} ${pack.stops.map((stop) => locations.find((location) => location.guid === stop.locationGUID)?.name ?? "").join(" ")}`
        .toLocaleLowerCase("ru-RU").includes(query))
      .sort((left, right) => parseMoscow(left.begin).getTime() - parseMoscow(right.begin).getTime());
  }, [locations, packs, search, statusFilter]);

  const stats = useMemo(() => ({
    active: packs.filter((pack) => getStatus(pack) === "active").length,
    scheduled: packs.filter((pack) => getStatus(pack) === "scheduled").length,
  }), [packs]);

  const openCreate = () => { setEditingPack(null); setEditorOpen(true); };
  const openEdit = (pack: StopPack) => { setEditingPack(pack); setEditorOpen(true); };

  const save = async (payload: StopPackPayload) => {
    setSaving(true);
    try {
      if (editingPack) await updateStopPack(editingPack.id, payload);
      else await createStopPack(payload);
      notifications.show(editingPack ? "Стоп-пакет обновлён" : "Стоп-пакет создан", { severity: "success", autoHideDuration: 3000 });
      setEditorOpen(false);
      await load();
    } catch (saveError) {
      notifications.show(getFriendlyErrorMessage(saveError, "Не удалось сохранить стоп-пакет."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteStopPack(deleteTarget.id);
      notifications.show("Стоп-пакет удалён", { severity: "success", autoHideDuration: 3000 });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      notifications.show(getFriendlyErrorMessage(deleteError, "Не удалось удалить стоп-пакет."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      setDeleting(false);
    }
  };

  if (loadingPresence.visible) return <div className={styles.statePage}><LoadingSpinner size={96} label="Загружаем стоп-листы…" exiting={loadingPresence.exiting} /></div>;
  if (error) return <div className={styles.statePage}><BlockRoundedIcon /><h2>Стоп-листы недоступны</h2><p>{error}</p><Button variant="primary" onClick={() => void load()}>Повторить</Button></div>;

  return (
    <main className={styles.page}>
      <section className={styles.toolbar}>
        <label className={styles.searchField}><SearchRoundedIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по позиции или торговой точке" /></label>
        <Button variant="primary" leadingIcon={<AddRoundedIcon />} onClick={openCreate}>Создать стоп</Button>
      </section>

      <section className={styles.statsBar} aria-label="Фильтры по стопам">
        <button type="button" className={statusFilter === "all" ? styles.statActive : ""} onClick={() => setStatusFilter("all")}><span>Все</span><strong>{packs.length}</strong></button>
        <button type="button" className={statusFilter === "active" ? styles.statActive : ""} onClick={() => setStatusFilter("active")}><span>Действуют</span><strong>{stats.active}</strong></button>
        <button type="button" className={statusFilter === "scheduled" ? styles.statActive : ""} onClick={() => setStatusFilter("scheduled")}><span>Запланированы</span><strong>{stats.scheduled}</strong></button>
      </section>

      {filteredPacks.length === 0 ? (
        <section className={styles.emptyState}><BlockRoundedIcon /><h2>{packs.length ? "Ничего не найдено" : "Стоп-лист пока пуст"}</h2><p>{packs.length ? "Измените поиск или сбросьте фильтр." : "Создайте первую блокировку для позиции или торговой точки."}</p>{!packs.length && <Button variant="primary" leadingIcon={<AddRoundedIcon />} onClick={openCreate}>Создать стоп</Button>}</section>
      ) : (
        <section className={styles.packGrid}>
          {filteredPacks.map((pack) => {
            const status = getStatus(pack);
            const itemBased = pack.itemId !== null;
            return (
              <article key={pack.id} className={styles.packCard}>
                <div className={styles.packTitle}>
                  <span>{itemBased ? <BlockRoundedIcon /> : <LocationOnOutlinedIcon />}</span>
                  <div><h2>{itemBased ? pack.itemName : pack.locationName}</h2><p>{itemBased ? `${pack.stops.length} ТТ` : `${pack.stops.length} позиций`}</p></div>
                </div>
                <div className={styles.packMeta}>
                  <span className={`${styles.statusBadge} ${status === "scheduled" ? styles.statusScheduled : ""}`}>{status === "active" ? "Действует" : "Запланирован"}</span>
                  <div className={styles.packPeriod}><EventRoundedIcon /><div><span>{formatDate(pack.begin)}</span><strong>до {formatDate(pack.end)}</strong></div></div>
                  <div className={styles.packActions}><button type="button" onClick={() => openEdit(pack)} aria-label="Редактировать"><EditRoundedIcon /></button><button type="button" className={styles.deleteButton} onClick={() => setDeleteTarget(pack)} aria-label="Удалить"><DeleteOutlineRoundedIcon /></button></div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <StopPackModal isOpen={editorOpen} pack={editingPack} items={items} locations={locations} saving={saving} onClose={() => setEditorOpen(false)} onSubmit={(payload) => void save(payload)} />
      <ConfirmModal isOpen={deleteTarget !== null} title="Удалить стоп-пакет?" message="Все входящие в пакет блокировки будут сняты. Действие нельзя отменить." confirmLabel={deleting ? "Удаляем…" : "Удалить"} cancelLabel="Отмена" onCancel={() => !deleting && setDeleteTarget(null)} onConfirm={() => void remove()} />
    </main>
  );
}
