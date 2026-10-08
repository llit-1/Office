import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import Button from "../../Components/Button/Button";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import Textarea from "../../Components/Textarea/Textarea";
import HolderCreateModal from "./components/HolderCreateModal";
import { ScannerStatus, StockBadge, StockState } from "./components/StockUi";
import { getStockErrorMessage, getStockLookups, getStockObjectSummary, sendStockTransfer } from "./stock.api";
import type { StockHolderOption, StockLookups, StockObject } from "./stock.types";
import { formatObjectCode, objectsLabel, readSessionValue, toObjectCode, writeSessionValue } from "./stock.utils";
import useRfidScanner from "./useRfidScanner";
import shared from "./StockShared.module.css";
import styles from "./StockTransfer.module.css";

type DraftRow = {
  code: string;
  status: "loading" | "ready" | "error";
  object: StockObject | null;
  error: string;
  comment: string;
  /** Назначение запоминается в момент добавления объекта, как в старом портале. */
  locationGuid: string;
  holderId: string;
};

type StoredDraft = {
  locationGuid: string;
  holderId: string;
  comment: string;
  rows: Array<{ code: string; object: StockObject; comment: string; locationGuid?: string; holderId?: string }>;
};

const DRAFT_STORAGE_KEY = "office.stock.transfer-draft";
const CODE_HINT = "";
const CODE_ERROR = "Код должен содержать до 24 символов: цифры 0–9 и буквы A–F.";
const EMPTY_OPTION = { value: "", label: "Не выбрано" };

const hasDestination = (row: Pick<DraftRow, "locationGuid" | "holderId">) => Boolean(row.locationGuid || row.holderId);

function readStoredDraft(): StoredDraft | null {
  const draft = readSessionValue<StoredDraft>(DRAFT_STORAGE_KEY);
  return draft && Array.isArray(draft.rows) ? draft : null;
}

export default function StockTransferPage() {
  const notifications = useNotifications();
  const fieldId = useId();
  const [initialDraft] = useState(readStoredDraft);

  const [lookups, setLookups] = useState<StockLookups | null>(null);
  const [lookupsError, setLookupsError] = useState("");
  const [locationGuid, setLocationGuid] = useState(initialDraft?.locationGuid ?? "");
  const [holderId, setHolderId] = useState(initialDraft?.holderId ?? "");
  const [comment, setComment] = useState(initialDraft?.comment ?? "");
  const [rows, setRows] = useState<DraftRow[]>(() =>
    (initialDraft?.rows ?? []).map((row) => ({
      ...row,
      status: "ready" as const,
      error: "",
      locationGuid: row.locationGuid ?? initialDraft?.locationGuid ?? "",
      holderId: row.holderId ?? initialDraft?.holderId ?? "",
    })));
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [flashCode, setFlashCode] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [confirm, setConfirm] = useState<"send" | "clear" | null>(null);
  const [sending, setSending] = useState(false);
  const [holderModalOpen, setHolderModalOpen] = useState(false);

  // Коды проверяются синхронно: два быстрых скана одной метки не должны добавить две строки.
  const codesRef = useRef(new Set(rows.map((row) => row.code)));
  const rowsRef = useRef(rows);
  const flashTimerRef = useRef<number | undefined>(undefined);
  rowsRef.current = rows;

  const loadLookups = useCallback(async (force = false) => {
    setLookupsError("");
    try {
      setLookups(await getStockLookups(force));
    } catch (error) {
      setLookupsError(getStockErrorMessage(error, "Не удалось загрузить торговые точки и держателей."));
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  // Сохранённый черновик мог ссылаться на точку или держателя, которых больше нет.
  useEffect(() => {
    if (!lookups) return;
    const isKnownLocation = (guid: string) => !guid || lookups.locations.some((location) => location.guid === guid);
    const isKnownHolder = (id: string) => !id || lookups.holders.some((holder) => String(holder.id) === id);

    if (!isKnownLocation(locationGuid)) setLocationGuid("");
    if (!isKnownHolder(holderId)) setHolderId("");
    setRows((prev) => (prev.every((row) => isKnownLocation(row.locationGuid) && isKnownHolder(row.holderId))
      ? prev
      : prev.map((row) => ({
        ...row,
        locationGuid: isKnownLocation(row.locationGuid) ? row.locationGuid : "",
        holderId: isKnownHolder(row.holderId) ? row.holderId : "",
      }))));
  }, [lookups, locationGuid, holderId]);

  useEffect(() => {
    const storedRows = rows.flatMap((row) => row.status === "ready" && row.object
      ? [{ code: row.code, object: row.object, comment: row.comment, locationGuid: row.locationGuid, holderId: row.holderId }]
      : []);
    const isEmpty = !locationGuid && !holderId && !comment.trim() && storedRows.length === 0;
    writeSessionValue(DRAFT_STORAGE_KEY, isEmpty ? null : { locationGuid, holderId, comment, rows: storedRows });
  }, [rows, locationGuid, holderId, comment]);

  useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

  const locationNames = useMemo(
    () => new Map((lookups?.locations ?? []).map((location) => [location.guid, location.name])),
    [lookups],
  );
  const holderNames = useMemo(
    () => new Map((lookups?.holders ?? []).map((holder) => [String(holder.id), holder.fullName])),
    [lookups],
  );

  const describeDestination = useCallback((location: string, holder: string) => [
    location ? `на точку «${locationNames.get(location) ?? "…"}»` : "",
    holder ? `держателю ${holderNames.get(holder) ?? "…"}` : "",
  ].filter(Boolean).join(" и "), [locationNames, holderNames]);

  const locationOptions = useMemo(
    () => lookups
      ? [EMPTY_OPTION, ...lookups.locations
        .filter((location) => location.actual || location.guid === locationGuid)
        .map((location) => ({ value: location.guid, label: location.name }))]
      : [],
    [lookups, locationGuid],
  );

  const holderOptions = useMemo(
    () => lookups
      ? [EMPTY_OPTION, ...lookups.holders
        .filter((holder) => holder.actual || String(holder.id) === holderId)
        .map((holder) => ({ value: String(holder.id), label: holder.fullName }))]
      : [],
    [lookups, holderId],
  );

  const selectedHolder = lookups?.holders.find((holder) => String(holder.id) === holderId) ?? null;
  const holderMeta = [selectedHolder?.jobTitle, selectedHolder?.department].filter(Boolean).join(" · ");

  const changeDestination = (nextLocation: string, nextHolder: string) => {
    setLocationGuid(nextLocation);
    setHolderId(nextHolder);
    if (!nextLocation && !nextHolder) return;

    // Объекты, добавленные до выбора назначения, получают его автоматически. Уже назначенные не меняются.
    setRows((prev) => (prev.some((row) => !hasDestination(row))
      ? prev.map((row) => (hasDestination(row) ? row : { ...row, locationGuid: nextLocation, holderId: nextHolder }))
      : prev));
  };

  const flashRow = useCallback((code: string) => {
    setFlashCode(code);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashCode(null), 1600);
  }, []);

  const loadRow = useCallback(async (code: string) => {
    try {
      const object = await getStockObjectSummary(code);
      setRows((prev) => prev.map((row) => (row.code === code ? { ...row, status: "ready", object, error: "" } : row)));
    } catch (error) {
      const message = getStockErrorMessage(error, "Не удалось получить данные объекта.");
      setRows((prev) => prev.map((row) => (row.code === code ? { ...row, status: "error", error: message } : row)));
    }
  }, []);

  const addCode = useCallback((raw: string, source: "manual" | "scanner") => {
    if (source === "manual" && !raw.trim()) {
      setCodeError("Введите код объекта.");
      return;
    }

    const code = toObjectCode(raw);
    if (!code) {
      if (source === "manual") setCodeError(CODE_ERROR);
      return;
    }

    if (source === "manual") {
      setCodeInput("");
      setCodeError("");
    }

    if (codesRef.current.has(code)) {
      flashRow(code);
      const existing = rowsRef.current.find((row) => row.code === code);
      const destinationChanged = existing
        && (locationGuid || holderId)
        && (existing.locationGuid !== locationGuid || existing.holderId !== holderId);

      if (destinationChanged) {
        // Повторное сканирование переназначает объект на текущие точку и держателя, как в старом портале.
        setRows((prev) => prev.map((row) => (row.code === code ? { ...row, locationGuid, holderId } : row)));
        notifications.show(
          `Объект ${formatObjectCode(code)} теперь передаётся ${describeDestination(locationGuid, holderId)}`,
          { severity: "info", autoHideDuration: 3500 },
        );
      } else {
        notifications.show(`Объект ${formatObjectCode(code)} уже в списке`, { severity: "info", autoHideDuration: 2500 });
      }
      return;
    }

    codesRef.current.add(code);
    setRows((prev) => [
      { code, status: "loading", object: null, error: "", comment: "", locationGuid, holderId },
      ...prev,
    ]);
    void loadRow(code);
  }, [describeDestination, flashRow, holderId, loadRow, locationGuid, notifications]);

  useRfidScanner(scanning, (code) => addCode(code, "scanner"));

  const removeRow = (code: string) => {
    codesRef.current.delete(code);
    setRows((prev) => prev.filter((row) => row.code !== code));
  };

  const retryRow = (code: string) => {
    setRows((prev) => prev.map((row) => (row.code === code ? { ...row, status: "loading", error: "" } : row)));
    void loadRow(code);
  };

  const updateRowComment = (code: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.code === code ? { ...row, comment: value } : row)));
  };

  const applyDestinationToAll = () => {
    setRows((prev) => prev.map((row) => ({ ...row, locationGuid, holderId })));
  };

  const readyRows = rows.filter((row) => row.status === "ready");
  const loadingCount = rows.filter((row) => row.status === "loading").length;
  const errorCount = rows.filter((row) => row.status === "error").length;
  const unassignedCount = rows.filter((row) => !hasDestination(row)).length;
  const hasCurrentDestination = Boolean(locationGuid || holderId);
  const differentDestinationCount = hasCurrentDestination
    ? rows.filter((row) => row.locationGuid !== locationGuid || row.holderId !== holderId).length
    : 0;
  const commentMissing = comment.trim().length < 2;
  const showDestinationError = attempted && unassignedCount > 0 && !hasCurrentDestination;
  const showCommentError = attempted && commentMissing;
  const isPristine = rows.length === 0 && !locationGuid && !holderId && !comment && !codeInput;

  // Список показывает новые объекты сверху, а сводка назначений идёт в порядке добавления.
  const destinationGroups = Array.from(
    [...readyRows]
      .reverse()
      .filter(hasDestination)
      .reduce((groups, row) => {
        const key = `${row.locationGuid}|${row.holderId}`;
        const group = groups.get(key) ?? { text: describeDestination(row.locationGuid, row.holderId), count: 0 };
        group.count += 1;
        return groups.set(key, group);
      }, new Map<string, { text: string; count: number }>())
      .values(),
  );

  const issues = [
    unassignedCount > 0 ? `укажите, куда передать ${objectsLabel(unassignedCount)}` : "",
    commentMissing ? "заполните комментарий" : "",
    rows.length === 0 ? "добавьте объекты" : "",
    loadingCount > 0 ? "дождитесь загрузки данных объектов" : "",
    errorCount > 0 ? "уберите объекты с ошибками" : "",
  ].filter(Boolean);

  const rowProblems = [
    loadingCount > 0 ? `загружается: ${loadingCount}` : "",
    errorCount > 0 ? `с ошибкой: ${errorCount}` : "",
  ].filter(Boolean).join(" · ");

  const destinationSummary = destinationGroups.length === 0
    ? "Назначение не выбрано"
    : destinationGroups.length === 1
      ? `Передать ${destinationGroups[0].text}`
      : `Разные назначения: ${destinationGroups.length}`;

  const confirmMessage = destinationGroups.length === 1
    ? `Передать ${objectsLabel(readyRows.length)} ${destinationGroups[0].text}? Операция попадёт в историю каждого объекта.`
    : `Передать ${objectsLabel(readyRows.length)}: ${destinationGroups
      .map((group) => `${objectsLabel(group.count)} — ${group.text}`)
      .join("; ")}. Операция попадёт в историю каждого объекта.`;

  const resetForm = () => {
    codesRef.current.clear();
    setRows([]);
    setLocationGuid("");
    setHolderId("");
    setComment("");
    setCodeInput("");
    setCodeError("");
    setAttempted(false);
    setScanning(false);
  };

  const requestSend = () => {
    setAttempted(true);
    if (issues.length === 0) setConfirm("send");
  };

  const send = async () => {
    setConfirm(null);
    setSending(true);
    try {
      const result = await sendStockTransfer({
        locationGuid: null,
        holderId: null,
        comment: comment.trim(),
        items: readyRows.map((row) => ({
          code: row.code,
          locationGuid: row.locationGuid || null,
          holderId: row.holderId ? Number(row.holderId) : null,
          comment: row.comment.trim() || null,
        })),
      });
      notifications.show(`Передано: ${objectsLabel(result.count)}`, { severity: "success", autoHideDuration: 4000 });
      resetForm();
    } catch (error) {
      notifications.show(
        getStockErrorMessage(error, "Не удалось передать объекты. Данные формы сохранены — попробуйте ещё раз."),
        { severity: "error", autoHideDuration: 6000 },
      );
    } finally {
      setSending(false);
    }
  };

  const handleHolderCreated = async (holder: StockHolderOption | null) => {
    setHolderModalOpen(false);
    try {
      setLookups(await getStockLookups(true));
    } catch {
      // Список обновится при следующем открытии вкладки.
    }

    if (holder) {
      changeDestination(locationGuid, String(holder.id));
      notifications.show(`Держатель ${holder.fullName} добавлен и выбран`, { severity: "success", autoHideDuration: 3000 });
    } else {
      notifications.show("Держатель добавлен. Выберите его в списке.", { severity: "success", autoHideDuration: 3000 });
    }
  };

  return (
    <div className={shared.page}>
      <div className={styles.layout}>
        <section className={`${shared.panel} ${styles.paramsPanel}`} aria-labelledby={`${fieldId}-params`}>
          <header className={shared.panelHeader}>
            <div className={shared.panelHeading}>
              <h2 id={`${fieldId}-params`} className={shared.panelTitle}>Куда передаём</h2>
            </div>
          </header>

          <div className={`${shared.panelBody} ${styles.paramsBody}`}>
            {lookupsError ? (
              <div className={styles.lookupsError} role="alert">
                <span>{lookupsError}</span>
                <Button variant="secondary" size="sm" onClick={() => void loadLookups(true)}>Повторить</Button>
              </div>
            ) : null}

            <div className={`${shared.field} ${showDestinationError ? shared.invalid : ""}`}>
              <Select
                label="Конечная точка"
                options={locationOptions}
                value={locationGuid}
                onChange={(event) => changeDestination(event.target.value, holderId)}
                placeholder={lookups ? "Не выбрано" : "Загружаем точки…"}
                disabled={!lookups}
                search
              />
            </div>

            <div className={`${shared.field} ${showDestinationError ? shared.invalid : ""}`}>
              <div className={styles.holderRow}>
                <Select
                  label="Новый держатель"
                  wrapperClassName={styles.holderSelect}
                  options={holderOptions}
                  value={holderId}
                  onChange={(event) => changeDestination(locationGuid, event.target.value)}
                  placeholder={lookups ? "Не выбрано" : "Загружаем держателей…"}
                  disabled={!lookups}
                  search
                />
                <button
                  type="button"
                  className={`${shared.iconButton} ${shared.iconButtonLarge}`}
                  aria-label="Добавить держателя"
                  title="Добавить держателя"
                  onClick={() => setHolderModalOpen(true)}
                  disabled={!lookups}
                >
                  <PersonAddAlt1RoundedIcon />
                </button>
              </div>
              {holderMeta ? <p className={shared.fieldHint}>{holderMeta}</p> : null}
              {showDestinationError ? (
                <p className={shared.fieldError}>Выберите конечную точку или держателя — они назначатся объектам без назначения.</p>
              ) : null}
            </div>

            {differentDestinationCount > 0 ? (
              <div className={styles.applyAll}>
                <Button variant="secondary" size="sm" onClick={applyDestinationToAll}>
                  Применить ко всем объектам ({differentDestinationCount})
                </Button>
                <p className={shared.fieldHint}>У части объектов в списке другое назначение.</p>
              </div>
            ) : null}

            <div className={`${shared.field} ${styles.commentField} ${showCommentError ? shared.invalid : ""}`}>
              <Textarea
                label="Комментарий *"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={1000}
                placeholder="Номер заявки или основание перемещения"
                aria-required
                aria-invalid={showCommentError || undefined}
                aria-describedby={`${fieldId}-comment-help`}
              />
              <p id={`${fieldId}-comment-help`} className={showCommentError ? shared.fieldError : shared.fieldHint}>
                {showCommentError ? "Укажите комментарий — хотя бы 2 символа." : "Попадёт в историю каждого объекта."}
              </p>
            </div>
          </div>
        </section>

        <section className={`${shared.panel} ${styles.objectsPanel}`} aria-labelledby={`${fieldId}-objects`}>
          <header className={shared.panelHeader}>
            <div className={shared.panelTitleRow}>
              <h2 id={`${fieldId}-objects`} className={shared.panelTitle}>Объекты</h2>
              <StockBadge tone="neutral">{rows.length}</StockBadge>
            </div>
            <Button
              variant="secondary"
              aria-pressed={scanning}
              leadingIcon={<SensorsRoundedIcon />}
              onClick={() => setScanning((value) => !value)}
            >
              {scanning ? "Остановить сканер" : "Сканировать"}
            </Button>
          </header>

          <div className={styles.addBar}>
            <form
              className={styles.addForm}
              onSubmit={(event) => {
                event.preventDefault();
                addCode(codeInput, "manual");
              }}
              noValidate
            >
              <div className={`${shared.field} ${styles.codeField} ${codeError ? shared.invalid : ""}`}>
                <Input
                  label="Код объекта"
                  className={shared.codeInput}
                  value={codeInput}
                  onChange={(event) => {
                    setCodeInput(event.target.value);
                    if (codeError) setCodeError("");
                  }}
                  placeholder="E28011700000020F1A2B3C4D"
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={`${fieldId}-code-help`}
                />
                <p id={`${fieldId}-code-help`} className={codeError ? shared.fieldError : shared.fieldHint}>
                  {codeError || CODE_HINT}
                </p>
              </div>
              <Button type="submit" variant="secondary" size="lg" leadingIcon={<AddRoundedIcon />}>
                Добавить
              </Button>
            </form>
            {scanning ? (
              <ScannerStatus>Сканер включён — подносите метки по очереди, объекты появятся в списке.</ScannerStatus>
            ) : null}
          </div>

          <div className={styles.rows}>
            {rows.length === 0 ? (
              <StockState
                icon={<QrCodeScannerRoundedIcon />}
                title="Список пуст"
                text={scanning
                  ? "Подносите метки к считывателю — объекты появятся здесь."
                  : "Выберите, куда передаём, затем отсканируйте метки или введите код объекта вручную."}
              />
            ) : (
              <table className={`${shared.table} ${styles.table}`}>
                <caption className={shared.srOnly}>Объекты к передаче</caption>
                <thead>
                  <tr>
                    <th scope="col">Объект</th>
                    <th scope="col">Сейчас</th>
                    <th scope="col">Куда</th>
                    <th scope="col">Комментарий к объекту</th>
                    <th scope="col"><span className={shared.srOnly}>Действия</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.code}
                      className={styles.row}
                      data-status={row.status}
                      data-flash={flashCode === row.code || undefined}
                    >
                      <td className={styles.objectCell}>
                        <div className={styles.objectInfo}>
                          {row.status === "ready" && row.object ? (
                            <>
                              <span className={styles.objectName}>{row.object.name}</span>
                              {row.object.categoryPath.length > 1 ? (
                                <span className={shared.muted}>{row.object.categoryPath.slice(0, -1).join(" / ")}</span>
                              ) : null}
                            </>
                          ) : row.status === "loading" ? (
                            <span className={styles.rowLoading}>
                              <LoadingSpinner size={24} />
                              Загружаем данные объекта…
                            </span>
                          ) : (
                            <span className={styles.rowError}>
                              <ErrorOutlineRoundedIcon aria-hidden="true" />
                              {row.error}
                            </span>
                          )}
                          <span className={`${shared.code} ${styles.rowCode}`}>{formatObjectCode(row.code)}</span>
                        </div>
                      </td>
                      <td className={styles.currentCell}>
                        <span className={shared.cellLabel}>Сейчас</span>
                        {row.object ? (
                          <div className={styles.objectInfo}>
                            <span>{row.object.locationName ?? "Точка не указана"}</span>
                            <span className={shared.muted}>{row.object.holderName ?? "Без держателя"}</span>
                          </div>
                        ) : (
                          <span className={shared.muted}>—</span>
                        )}
                      </td>
                      <td className={styles.destinationCell}>
                        <span className={shared.cellLabel}>Куда</span>
                        {hasDestination(row) ? (
                          <div className={styles.objectInfo}>
                            {row.locationGuid ? <span>{locationNames.get(row.locationGuid) ?? "Точка"}</span> : null}
                            {row.holderId ? (
                              <span className={row.locationGuid ? shared.muted : undefined}>
                                {holderNames.get(row.holderId) ?? "Держатель"}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className={styles.destinationMissing}>Не указано</span>
                        )}
                      </td>
                      <td className={styles.commentCell}>
                        <Input
                          label={`Комментарий к объекту ${row.code}`}
                          labelVisible={false}
                          wrapperClassName={shared.compactField}
                          value={row.comment}
                          onChange={(event) => updateRowComment(row.code, event.target.value)}
                          placeholder="Как в общем комментарии"
                          maxLength={1000}
                          disabled={row.status !== "ready"}
                        />
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={styles.rowActions}>
                          {row.status === "error" ? (
                            <button
                              type="button"
                              className={shared.iconButton}
                              aria-label={`Повторить загрузку объекта ${row.code}`}
                              title="Повторить"
                              onClick={() => retryRow(row.code)}
                            >
                              <RefreshRoundedIcon />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`${shared.iconButton} ${shared.iconButtonDanger}`}
                            aria-label={`Убрать объект ${row.code} из списка`}
                            title="Убрать из списка"
                            onClick={() => removeRow(row.code)}
                          >
                            <DeleteOutlineRoundedIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <footer className={styles.footer}>
            <div className={styles.summary} aria-live="polite">
              {attempted && issues.length > 0 ? (
                <p className={styles.issues}>Чтобы передать: {issues.join(", ")}.</p>
              ) : (
                <>
                  <span className={styles.summaryTitle}>
                    {readyRows.length > 0 ? `К передаче: ${objectsLabel(readyRows.length)}` : "Объекты не добавлены"}
                  </span>
                  <span className={shared.muted}>{rowProblems || destinationSummary}</span>
                </>
              )}
            </div>
            <div className={styles.footerActions}>
              <Button variant="ghost" onClick={() => setConfirm("clear")} disabled={sending || isPristine}>
                Очистить
              </Button>
              <Button variant="primary" loading={sending} leadingIcon={<SendRoundedIcon />} onClick={requestSend}>
                Передать
              </Button>
            </div>
          </footer>
        </section>
      </div>

      <ConfirmModal
        isOpen={confirm === "send"}
        title="Подтвердите передачу"
        message={confirmMessage}
        confirmLabel="Передать"
        cancelLabel="Отмена"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void send()}
      />
      <ConfirmModal
        isOpen={confirm === "clear"}
        title="Очистить форму?"
        message="Список объектов, точка, держатель и комментарий будут сброшены."
        confirmLabel="Очистить"
        cancelLabel="Отмена"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          resetForm();
        }}
      />
      <HolderCreateModal
        isOpen={holderModalOpen}
        onClose={() => setHolderModalOpen(false)}
        onCreated={(holder) => void handleHolderCreated(holder)}
      />
    </div>
  );
}
