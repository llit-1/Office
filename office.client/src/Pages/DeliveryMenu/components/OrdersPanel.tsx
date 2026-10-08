import { useCallback, useEffect, useState, type FormEvent } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../../Components/Modal/Modal";
import { getOrderLogs, getOrdersDetails, getOrdersHistory, getRequestErrorMessage } from "../deliveryRequests.api";
import type { OrderLogEntry, YandexResponse } from "../deliveryRequests.types";
import {
  findRowId,
  findRows,
  parseList,
  periodPresets,
  presetRange,
  rowStatus,
  statusInfo,
  toIsoSeconds,
  type PeriodPreset,
} from "../deliveryRequests.utils";
import OrderDetails from "./OrderDetails";
import OrderLogs from "./OrderLogs";
import Pager from "./Pager";
import RequestPanel from "./RequestPanel";
import ResponseTable from "./ResponseTable";
import styles from "../DeliveryRequests.module.css";

type OrdersPanelProps = {
  locationGuid: string;
};

const PAGE_SIZE = 100;

type OrderDetailsState = {
  title: string;
  order: { loading: boolean; error: string; response: YandexResponse };
  logs: { loading: boolean; error: string; entries: OrderLogEntry[] };
};
/** GUID точки одинаковый у всех заказов выбранной точки — в таблице он только мешает. */
const HIDDEN_COLUMNS = ["origin_id"];

export default function OrdersPanel({ locationGuid }: OrdersPanelProps) {
  const [preset, setPreset] = useState<PeriodPreset | "custom">("today");
  const [customFrom, setCustomFrom] = useState(() => presetRange("week").from);
  const [customTo, setCustomTo] = useState(() => presetRange("today").to);
  const [customError, setCustomError] = useState("");

  const [response, setResponse] = useState<YandexResponse>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [details, setDetails] = useState<OrderDetailsState | null>(null);

  const load = useCallback(async (nextOffset: number, range: { from: string; to: string }) => {
    setLoading(true);
    setError("");
    try {
      const data = await getOrdersHistory({
        locationGuid,
        from: toIsoSeconds(range.from),
        to: toIsoSeconds(range.to),
        statuses: [],
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setResponse(data);
      setOffset(nextOffset);
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Не удалось получить заказы."));
    } finally {
      setLoading(false);
    }
  }, [locationGuid]);

  // Период «сегодня» считается на момент запроса, чтобы обновление подтягивало свежие заказы.
  const currentRange = useCallback(
    () => (preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset)),
    [customFrom, customTo, preset],
  );

  useEffect(() => {
    setResponse(null);
    setStatusFilter(null);
    // Свой период грузится по кнопке «Показать», быстрые — сразу.
    if (preset !== "custom") void load(0, presetRange(preset));
  }, [load, preset]);

  const applyCustom = (event: FormEvent) => {
    event.preventDefault();
    if (!customFrom || !customTo) {
      setCustomError("Укажите начало и конец периода.");
      return;
    }
    if (customTo < customFrom) {
      setCustomError("Конец периода раньше начала.");
      return;
    }
    setCustomError("");
    setStatusFilter(null);
    void load(0, { from: customFrom, to: customTo });
  };

  const rows = findRows(response);

  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = rowStatus(row);
    if (status) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const statusCounts = [...counts.entries()].sort((left, right) => right[1] - left[1]);

  const searchText = search.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (statusFilter && rowStatus(row) !== statusFilter) return false;
    if (!searchText) return true;
    return Object.values(row).some((value) =>
      (typeof value === "string" || typeof value === "number") && String(value).toLowerCase().includes(searchText));
  });

  // Детали заказа и журнал yeapi грузятся параллельно и независимо: ошибка одного не прячет другое.
  const openDetails = (eatsIds: string[]) => {
    if (eatsIds.length === 0) return;
    const title = eatsIds.join(", ");
    setDetails({
      title,
      order: { loading: true, error: "", response: null },
      logs: { loading: true, error: "", entries: [] },
    });

    const isCurrent = (state: OrderDetailsState | null): state is OrderDetailsState => state?.title === title;

    getOrdersDetails({ eatsIds })
      .then((response) => setDetails((state) => (isCurrent(state) ? { ...state, order: { loading: false, error: "", response } } : state)))
      .catch((reason: unknown) => setDetails((state) => (isCurrent(state)
        ? { ...state, order: { loading: false, error: getRequestErrorMessage(reason, "Не удалось получить детали заказа."), response: null } }
        : state)));

    Promise.all(eatsIds.map((id) => getOrderLogs(id)))
      .then((lists) => setDetails((state) => (isCurrent(state) ? { ...state, logs: { loading: false, error: "", entries: lists.flat() } } : state)))
      .catch((reason: unknown) => setDetails((state) => (isCurrent(state)
        ? { ...state, logs: { loading: false, error: getRequestErrorMessage(reason, "Не удалось получить логи заказа."), entries: [] } }
        : state)));
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    // Если заказ уже в списке — хватит фильтра; иначе запрашиваем детали по введённым номерам.
    if (visibleRows.length === 0) openDetails(parseList(search));
  };

  return (
    <>
      <RequestPanel
        id="orders-heading"
        title="Заказы"
        count={response === null ? null : rows.length}
        loading={loading}
        error={error}
        response={response}
        onRefresh={() => void load(offset, currentRange())}
        actions={(
          <>
            <div className={styles.segmented} role="group" aria-label="Период">
              {periodPresets.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={preset === item.key ? styles.segmentActive : undefined}
                  aria-pressed={preset === item.key}
                  onClick={() => setPreset(item.key)}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                className={preset === "custom" ? styles.segmentActive : undefined}
                aria-pressed={preset === "custom"}
                onClick={() => setPreset("custom")}
              >
                Период
              </button>
            </div>
            <form className={styles.search} onSubmit={submitSearch} role="search">
              <SearchRoundedIcon fontSize="small" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Номер заказа"
                aria-label="Номер заказа"
              />
            </form>
          </>
        )}
      >
        {preset === "custom" ? (
          <form className={styles.customPeriod} onSubmit={applyCustom} noValidate>
            <Input label="С" type="datetime-local" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            <Input label="По" type="datetime-local" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            <Button type="submit" variant="secondary" loading={loading}>Показать</Button>
            {customError ? <p className={styles.fieldError}>{customError}</p> : null}
          </form>
        ) : null}

        {statusCounts.length > 1 ? (
          <div className={styles.chips} role="group" aria-label="Статус заказа">
            <button
              type="button"
              className={statusFilter === null ? styles.chipActive : undefined}
              aria-pressed={statusFilter === null}
              onClick={() => setStatusFilter(null)}
            >
              Все <span>{rows.length}</span>
            </button>
            {statusCounts.map(([status, count]) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? styles.chipActive : undefined}
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              >
                {statusInfo(status)?.label ?? status} <span>{count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {visibleRows.length > 0 ? (
          <ResponseTable
            rows={visibleRows}
            hiddenColumns={HIDDEN_COLUMNS}
            onRowClick={(row) => {
              const id = findRowId(row);
              if (id) openDetails([id]);
            }}
            rowLabel={(row) => `Детали заказа ${findRowId(row) ?? ""}`.trim()}
          />
        ) : response !== null && !loading ? (
          <p className={styles.empty}>
            {searchText && rows.length > 0
              ? "В загруженных заказах такого номера нет. Нажмите Enter, чтобы запросить заказ по номеру."
              : searchText
                ? "Нажмите Enter, чтобы запросить заказ по номеру."
                : "За этот период заказов нет."}
          </p>
        ) : null}

        <Pager offset={offset} pageSize={PAGE_SIZE} count={rows.length} disabled={loading} onChange={(next) => void load(next, currentRange())} />
      </RequestPanel>

      <Modal isOpen={details !== null} onClose={() => setDetails(null)} title={`Заказ ${details?.title ?? ""}`} size="lg">
        {details ? (
          <div className={styles.detailsBody}>
            {details.order.loading ? (
              <div className={styles.modalLoading}><LoadingSpinner size={56} label="Запрашиваем детали…" /></div>
            ) : details.order.error ? (
              <p className={styles.error} role="alert">{details.order.error}</p>
            ) : (
              <OrderDetails response={details.order.response} />
            )}
            <OrderLogs entries={details.logs.entries} loading={details.logs.loading} error={details.logs.error} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
