import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useNotifications } from "@toolpad/core";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import Button from "../../../Components/Button/Button";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import { ApiError } from "../../../Services/api";
import { getStockErrorMessage, getStockObjectCard } from "../stock.api";
import type { StockHistoryEntry, StockObjectCard } from "../stock.types";
import { formatObjectCode, formatStockDateTime } from "../stock.utils";
import shared from "../StockShared.module.css";
import styles from "./StockObjectDetails.module.css";
import { StockBadge, StockState, historyActionTone } from "./StockUi";
import WriteOffModal from "./WriteOffModal";

type LoadState =
  | { status: "loading" }
  | { status: "error"; notFound: boolean; message: string }
  | { status: "ready"; card: StockObjectCard };

type StockObjectDetailsProps = {
  code: string;
  /** Внутри модального окна карточка не рисует собственную рамку. */
  embedded?: boolean;
  onChanged?: () => void;
};

const actionIcons: Record<number, ReactNode> = {
  1: <AddBoxOutlinedIcon />,
  2: <SwapHorizRoundedIcon />,
  3: <BlockRoundedIcon />,
};

export default function StockObjectDetails({ code, embedded = false, onChanged }: StockObjectDetailsProps) {
  const titleId = useId();
  const notifications = useNotifications();
  const notificationsRef = useRef(notifications);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const stateRef = useRef(state);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionFilter, setActionFilter] = useState<number | "all">("all");
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  notificationsRef.current = notifications;
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    const hasContent = stateRef.current.status === "ready" && stateRef.current.card.object.code === code;
    if (!hasContent) setState({ status: "loading" });

    getStockObjectCard(code)
      .then((card) => {
        if (!cancelled) setState({ status: "ready", card });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = getStockErrorMessage(error, "Не удалось загрузить карточку объекта.");
        if (hasContent) {
          // Фоновое обновление не стирает уже показанную карточку.
          notificationsRef.current.show(message, { severity: "error", autoHideDuration: 5000 });
          return;
        }
        setState({ status: "error", notFound: error instanceof ApiError && error.status === 404, message });
      });

    return () => {
      cancelled = true;
    };
  }, [code, reloadKey]);

  const history = useMemo(() => (state.status === "ready" ? state.card.history : []), [state]);

  const actionCounts = useMemo(() => {
    const counts = new Map<number, { name: string; count: number }>();
    history.forEach((entry) => {
      const current = counts.get(entry.actionId);
      counts.set(entry.actionId, { name: entry.actionName, count: (current?.count ?? 0) + 1 });
    });
    return Array.from(counts.entries()).sort(([left], [right]) => left - right);
  }, [history]);

  const rootClassName = `${styles.root} ${embedded ? styles.embedded : shared.panel}`;

  if (state.status === "loading") {
    return (
      <section className={rootClassName} aria-busy="true">
        <div className={shared.loadingBlock}>
          <LoadingSpinner size={56} label="Загружаем карточку объекта…" />
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className={rootClassName}>
        {state.notFound ? (
          <StockState
            icon={<SearchOffRoundedIcon />}
            title="Объект не найден"
            text={`Метки ${formatObjectCode(code)} нет в складской системе. Проверьте код и попробуйте ещё раз.`}
          />
        ) : (
          <StockState
            tone="error"
            icon={<ErrorOutlineRoundedIcon />}
            title="Карточка не загрузилась"
            text={state.message}
            action={<Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Повторить</Button>}
          />
        )}
      </section>
    );
  }

  const { object, canWriteOff } = state.card;
  const parentPath = object.categoryPath.slice(0, -1);
  const effectiveFilter = actionFilter !== "all" && actionCounts.some(([id]) => id === actionFilter) ? actionFilter : "all";
  const visibleHistory = effectiveFilter === "all" ? history : history.filter((entry) => entry.actionId === effectiveFilter);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(object.code);
      notifications.show("Код скопирован", { severity: "success", autoHideDuration: 2000 });
    } catch {
      notifications.show("Не удалось скопировать код. Выделите его вручную.", { severity: "warning", autoHideDuration: 3000 });
    }
  };

  return (
    <section className={rootClassName} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          {parentPath.length > 0 ? <p className={styles.path}>{parentPath.join(" / ")}</p> : null}
          <h2 id={titleId} className={styles.title}>{object.name}</h2>
          <div className={styles.codeRow}>
            <span className={shared.code}>{formatObjectCode(object.code)}</span>
            <button
              type="button"
              className={`${shared.iconButton} ${shared.iconButtonGhost}`}
              aria-label="Скопировать код"
              title="Скопировать код"
              onClick={() => void copyCode()}
            >
              <ContentCopyRoundedIcon />
            </button>
          </div>
        </div>

        <div className={styles.headerAside}>
          <StockBadge tone={object.active ? "success" : "danger"}>{object.active ? "Активен" : "Списан"}</StockBadge>
          {canWriteOff ? (
            <Button variant="danger" leadingIcon={<BlockRoundedIcon />} onClick={() => setWriteOffOpen(true)}>
              Списать
            </Button>
          ) : null}
        </div>
      </header>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Держатель</dt>
          <dd>
            {object.holderName ?? "Не закреплён"}
            {object.holderDetails ? <span className={styles.factHint}>{object.holderDetails}</span> : null}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Торговая точка</dt>
          <dd>{object.locationName ?? "Не указана"}</dd>
        </div>
      </dl>

      <div className={styles.history}>
        <div className={styles.historyHeader}>
          <h3 className={styles.historyTitle}>История операций</h3>
          {actionCounts.length > 1 ? (
            <div className={shared.segmented} role="group" aria-label="Тип операции">
              <button
                type="button"
                className={shared.segmentedButton}
                aria-pressed={effectiveFilter === "all"}
                onClick={() => setActionFilter("all")}
              >
                Все <span className={shared.segmentedCount}>{history.length}</span>
              </button>
              {actionCounts.map(([actionId, info]) => (
                <button
                  key={actionId}
                  type="button"
                  className={shared.segmentedButton}
                  aria-pressed={effectiveFilter === actionId}
                  onClick={() => setActionFilter(actionId)}
                >
                  {info.name} <span className={shared.segmentedCount}>{info.count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {visibleHistory.length === 0 ? (
          <p className={styles.historyEmpty}>
            <HistoryRoundedIcon aria-hidden="true" />
            Складская система не вернула операций по этому объекту.
          </p>
        ) : (
          <ol className={styles.timeline}>
            {visibleHistory.map((entry, index) => (
              <HistoryItem key={`${entry.dateTime ?? "no-date"}-${entry.actionId}-${index}`} entry={entry} />
            ))}
          </ol>
        )}
      </div>

      <WriteOffModal
        isOpen={writeOffOpen}
        object={object}
        onClose={() => setWriteOffOpen(false)}
        onWrittenOff={() => {
          setWriteOffOpen(false);
          notifications.show(`Объект «${object.name}» списан`, { severity: "success", autoHideDuration: 3000 });
          setReloadKey((key) => key + 1);
          onChanged?.();
        }}
      />
    </section>
  );
}

function HistoryItem({ entry }: { entry: StockHistoryEntry }) {
  const tone = historyActionTone(entry.actionId);
  const facts = [
    { label: "Точка", value: entry.locationName },
    { label: "Держатель", value: entry.holderName },
    { label: "Выполнил", value: entry.user },
  ].filter((fact) => fact.value);

  return (
    <li className={styles.timelineItem}>
      <span className={styles.timelineMarker} data-tone={tone} aria-hidden="true">
        {actionIcons[entry.actionId] ?? <HistoryRoundedIcon />}
      </span>
      <div className={styles.timelineBody}>
        <div className={styles.timelineTop}>
          <StockBadge tone={tone}>{entry.actionName}</StockBadge>
          <time className={styles.timelineTime} dateTime={entry.dateTime ?? undefined}>
            {formatStockDateTime(entry.dateTime)}
          </time>
        </div>
        {facts.length > 0 ? (
          <dl className={styles.timelineFacts}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}:</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {entry.comment ? <p className={styles.timelineComment}>{entry.comment}</p> : null}
      </div>
    </li>
  );
}
