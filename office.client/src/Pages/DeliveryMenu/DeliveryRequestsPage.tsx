import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import Button from "../../Components/Button/Button";
import Select from "../../Components/Select/Select";
import StatePanel from "../../Components/StatePanel/StatePanel";
import StatusBadge from "../../Components/StatusBadge/StatusBadge";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import BlockModal from "./components/BlockModal";
import BlocksPanel from "./components/BlocksPanel";
import MenuImportModal, { type ImportKind } from "./components/MenuImportModal";
import SalesLoadModal from "./components/SalesLoadModal";
import OrdersPanel from "./components/OrdersPanel";
import { getRequestErrorMessage, getRequestLocations } from "./deliveryRequests.api";
import type { RequestLocation } from "./deliveryRequests.types";
import useSectionTitle from "./useSectionTitle";
import styles from "./DeliveryRequests.module.css";

/**
 * Запросы в Яндекс.Еду по одной точке: точка выбирается один раз вверху,
 * ниже — её блокировки и заказы. Точка хранится в адресе, чтобы ссылкой можно было поделиться.
 */
export default function DeliveryRequestsPage() {
  useSectionTitle("Доставка", "/Main");
  const [searchParams, setSearchParams] = useSearchParams();
  const locationGuid = searchParams.get("location") ?? "";

  const [locations, setLocations] = useState<RequestLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const [blockOpen, setBlockOpen] = useState(false);
  const [importKind, setImportKind] = useState<ImportKind | null>(null);
  const [salesOpen, setSalesOpen] = useState(false);
  const [blocksReloadKey, setBlocksReloadKey] = useState(0);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");

  const selectLocation = useCallback((guid: string) => {
    setBlocked(null);
    setNotice("");
    setSearchParams(guid ? { location: guid } : {}, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getRequestLocations()
      .then((data) => {
        if (cancelled) return;
        setLocations(data);
        // Единственную доступную точку выбираем сразу — выбирать её руками незачем.
        if (data.length === 1 && !locationGuid) selectLocation(data[0].guid);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(getRequestErrorMessage(reason, "Не удалось загрузить торговые точки."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Точку из адреса проверяем только при загрузке списка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]);

  const locationOptions = useMemo(
    () => locations.map((location) => ({ value: location.guid, label: location.name })),
    [locations],
  );
  const location = locations.find((item) => item.guid === locationGuid) ?? null;

  if (error) {
    return (
      <div className={styles.page}>
        <StatePanel
          tone="error"
          icon={<ErrorOutlineRoundedIcon />}
          title="Точки не загрузились"
          text={error}
          action={<Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>Повторить</Button>}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.locationSelect}>
          <Select
            label="Торговая точка"
            options={locationOptions}
            value={locationGuid}
            onChange={(event) => selectLocation(event.target.value)}
            placeholder={loading ? "Загружаем точки…" : "Выберите точку"}
            search
            disabled={loading}
          />
        </div>

        {location && blocked ? (
          <span className={styles.toolbarStatus}>
            <StatusBadge tone="danger" icon={<LockRoundedIcon />}>Заблокирована</StatusBadge>
          </span>
        ) : null}

        <span className={styles.spacer} />

        {/* На телефоне — сетка 2×2: импорты в первом ряду, продажи и блокировка во втором. */}
        <div className={styles.toolbarActions}>
          <Button
            variant="secondary"
            className={styles.toolbarActionImportMenu}
            leadingIcon={<SyncRoundedIcon fontSize="small" />}
            onClick={() => setImportKind("menu")}
            disabled={locations.length === 0}
          >
            Импорт меню
          </Button>
          <Button
            variant="secondary"
            className={styles.toolbarActionImportStops}
            leadingIcon={<BlockRoundedIcon fontSize="small" />}
            onClick={() => setImportKind("stopList")}
            disabled={locations.length === 0}
          >
            Импорт стоп-листов
          </Button>
          <Button
            variant="secondary"
            className={styles.toolbarActionSales}
            leadingIcon={<DownloadRoundedIcon fontSize="small" />}
            onClick={() => setSalesOpen(true)}
          >
            Подгрузить продажи
          </Button>
          <Button
            variant="danger"
            className={styles.toolbarActionBlock}
            leadingIcon={<LockRoundedIcon fontSize="small" />}
            onClick={() => setBlockOpen(true)}
            disabled={locations.length === 0}
          >
            Заблокировать
          </Button>
        </div>
      </div>

      {notice ? <p className={styles.success} role="status">{notice}</p> : null}

      {location ? (
        <>
          <BlocksPanel
            key={`blocks-${location.guid}`}
            locationGuid={location.guid}
            locationName={location.name}
            reloadKey={blocksReloadKey}
            onActiveChange={setBlocked}
          />
          <OrdersPanel key={`orders-${location.guid}`} locationGuid={location.guid} />
        </>
      ) : !loading ? (
        <StatePanel
          icon={<StorefrontRoundedIcon />}
          title="Выберите торговую точку"
          text="Здесь появятся её блокировки в Яндекс.Еде и заказы. Заблокировать точки и запустить импорт меню можно и без выбора — сразу для нескольких или всех."
        />
      ) : null}

      <BlockModal
        isOpen={blockOpen}
        locations={locations}
        current={location}
        onClose={() => setBlockOpen(false)}
        onBlocked={(succeeded) => {
          setBlockOpen(false);
          // Отдельное сообщение не нужно: новая блокировка сама появится в списке ниже.
          if (location && succeeded.includes(location.guid)) setBlocksReloadKey((key) => key + 1);
        }}
      />
      <SalesLoadModal
        isOpen={salesOpen}
        onClose={() => setSalesOpen(false)}
        onLoaded={(date) => {
          setSalesOpen(false);
          setNotice(`Продажи за ${new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")} подгружены.`);
        }}
      />
      <MenuImportModal
        isOpen={importKind !== null}
        kind={importKind ?? "menu"}
        locations={locations}
        current={location}
        onClose={() => setImportKind(null)}
      />
    </div>
  );
}
