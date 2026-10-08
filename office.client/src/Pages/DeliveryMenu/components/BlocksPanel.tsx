import { useCallback, useEffect, useState } from "react";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import Button from "../../../Components/Button/Button";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import Input from "../../../Components/Input/Input";
import { getBlockStatus, getRequestErrorMessage, unblockRestaurant } from "../deliveryRequests.api";
import type { YandexResponse } from "../deliveryRequests.types";
import { findRowId, findRows, parseList, rowStatus } from "../deliveryRequests.utils";
import Pager from "./Pager";
import RequestPanel from "./RequestPanel";
import ResponseTable from "./ResponseTable";
import styles from "../DeliveryRequests.module.css";

type BlocksPanelProps = {
  locationGuid: string;
  locationName: string;
  /** Меняется после новой блокировки — панель перечитывает список. */
  reloadKey: number;
  /** Есть ли у точки действующая блокировка; null — пока неизвестно. */
  onActiveChange: (active: boolean | null) => void;
};

const PAGE_SIZE = 100;
/** Сразу после блокировки Яндекс её ещё не отдаёт — перечитываем список один раз с этой задержкой. */
const RELOAD_AFTER_BLOCK_MS = 2000;

export default function BlocksPanel({ locationGuid, locationName, reloadKey, onActiveChange }: BlocksPanelProps) {
  const [response, setResponse] = useState<YandexResponse>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualIds, setManualIds] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError("");
    try {
      const data = await getBlockStatus({ locationGuid, statuses: [], limit: PAGE_SIZE, offset: nextOffset });
      setResponse(data);
      setOffset(nextOffset);
      setSelectedIds([]);
      if (nextOffset === 0) {
        onActiveChange(findRows(data).some((row) => rowStatus(row)?.toLowerCase() === "active"));
      }
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Не удалось получить блокировки."));
      onActiveChange(null);
    } finally {
      setLoading(false);
    }
  }, [locationGuid, onActiveChange]);

  // Первая загрузка точки — со сбросом списка.
  useEffect(() => {
    setResponse(null);
    setResult("");
    setManualIds("");
    void load(0);
  }, [load]);

  // После новой блокировки — одно перечитывание; текущие строки остаются на экране, пока идёт загрузка.
  useEffect(() => {
    if (reloadKey === 0) return;
    const timer = window.setTimeout(() => void load(0), RELOAD_AFTER_BLOCK_MS);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const rows = findRows(response);
  const rowsWithoutId = rows.length > 0 && rows.every((row) => findRowId(row) === null);
  const unblockIds = selectedIds.length > 0 ? selectedIds : parseList(manualIds);

  const unblock = async () => {
    setConfirmOpen(false);
    setUnblocking(true);
    setError("");
    setResult("");
    try {
      await unblockRestaurant({ locationGuid, blockIds: unblockIds });
      setResult(unblockIds.length === 1 ? "Блокировка снята." : `Снято блокировок: ${unblockIds.length}.`);
      setManualIds("");
      await load(0);
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Не удалось снять блокировку."));
    } finally {
      setUnblocking(false);
    }
  };

  return (
    <>
      <RequestPanel
        id="blocks-heading"
        title="Блокировки"
        count={response === null ? null : rows.length}
        loading={loading}
        error={error}
        response={response}
        onRefresh={() => void load(offset)}
        actions={unblockIds.length > 0 ? (
          <Button
            variant="danger"
            size="sm"
            leadingIcon={<LockOpenRoundedIcon fontSize="small" />}
            onClick={() => setConfirmOpen(true)}
            loading={unblocking}
          >
            Снять ({unblockIds.length})
          </Button>
        ) : null}
      >
        {result ? <p className={styles.success} role="status">{result}</p> : null}

        {rows.length > 0 ? (
          <ResponseTable rows={rows} selection={{ selectedIds, onChange: setSelectedIds }} />
        ) : response !== null && !loading ? (
          <p className={styles.empty}>Блокировок нет — точка принимает заказы.</p>
        ) : null}

        {rowsWithoutId ? (
          <div className={styles.inlineField}>
            <Input
              label="ID блокировок для снятия"
              value={manualIds}
              onChange={(event) => setManualIds(event.target.value)}
              placeholder="id1, id2"
              disabled={unblocking}
            />
            <p className={styles.hint}>В ответе не нашлись идентификаторы — введите их через запятую.</p>
          </div>
        ) : null}

        <Pager offset={offset} pageSize={PAGE_SIZE} count={rows.length} disabled={loading} onChange={(next) => void load(next)} />
      </RequestPanel>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Снять блокировку?"
        message={`Для «${locationName}» будет снято блокировок: ${unblockIds.length} (${unblockIds.join(", ")}).`}
        confirmLabel="Снять блокировку"
        cancelLabel="Отмена"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void unblock()}
      />
    </>
  );
}
