import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "@toolpad/core";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Button from "../../../Components/Button/Button";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import StatePanel from "../../../Components/StatePanel/StatePanel";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { getFriendlyErrorMessage } from "../../../Services/api";
import {
  deleteCashClient,
  getCashClients,
  getCashTasks,
  installOnCashClient,
  type CashClient,
  type CashTask,
  type CashVersion,
} from "../cash.api";
import { cashStats, cashTitle, installedVersion, isTaskActive, type VersionState } from "../cashClients.utils";
import CashCard from "./CashCard";
import CashInstallModal from "./CashInstallModal";
import dashboard from "../../../styles/entity-dashboard.module.css";
import styles from "../CashUpdate.module.css";

interface CashClientsSectionProps {
  versions: CashVersion[];
  /** Версия, которую кассы ставят по умолчанию: по ней считается статистика и красятся карточки. */
  actualVersion: string | null;
  /** Список версий загружен: без него номер и отставание на карточках не показываются. */
  versionsLoaded: boolean;
  /** Версия, выбранная в панели: предлагается по умолчанию при установке на одну кассу. */
  targetVersion: CashVersion | null;
  /** Счётчик из панели версий: его изменение перечитывает список. */
  reloadToken: number;
  /** Действия над версиями живут в той же панели, что и поиск по кассам. */
  versionActions: React.ReactNode;
}

type Filter = "all" | VersionState | "busy";

const searchKey = "cash-clients-list";

/** Пока у какой-то кассы идёт задача, этапы перечитываются с этой частотой: по локальной сети обновление занимает секунды. */
export const TASK_POLL_MS = 3_000;

// Завершённое задание yeapi больше не отдаёт. Чтобы оператор увидел итог, последнее активное
// задание кассы, пропавшее из ответа, показываем как выполненное (до следующего действия с кассой).
const FINAL_STAGE: Record<string, string> = { install: "Completed", update: "Completed", delete: "Ending_installer" };

const filterItems: Array<[Filter, string]> = [
  ["all", "Все"],
  ["outdated", "Отстают"],
  ["busy", "В работе"],
  ["unknown", "Без связи"],
];

export default function CashClientsSection({ versions, actualVersion, versionsLoaded, targetVersion, reloadToken, versionActions }: CashClientsSectionProps) {
  const notifications = useNotifications();
  const [searchText, setSearchText] = usePersistedSearchText(searchKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [filter, setFilter] = useState<Filter>("all");
  const [clients, setClients] = useState<CashClient[]>([]);
  const [tasks, setTasks] = useState<Map<number, CashTask>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CashClient | null>(null);
  const [installTarget, setInstallTarget] = useState<CashClient | null>(null);
  const loadedOnce = useRef(false);
  const activeTasks = useRef(new Map<number, CashTask>());
  const finishedTasks = useRef(new Map<number, CashTask>());

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Этапы задач — дополнительная информация: их сбой не прячет список касс.
  const loadTasks = useCallback(async () => {
    try {
      const current = new Map((await getCashTasks() ?? []).map((task) => [task.cashId, task]));

      for (const [cashId, previous] of activeTasks.current) {
        if (current.has(cashId)) continue;
        const kind = (previous.type ?? "").toLowerCase();
        if (FINAL_STAGE[kind]) finishedTasks.current.set(cashId, { ...previous, stage: FINAL_STAGE[kind] });
      }
      for (const cashId of current.keys()) finishedTasks.current.delete(cashId);

      activeTasks.current = new Map([...current].filter(([, task]) => isTaskActive(task)));
      setTasks(new Map([...finishedTasks.current, ...current]));
    } catch {
      /* карточки остаются без этапа до следующего опроса */
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Спиннер только при первой загрузке и после ошибки: фоновое обновление не мигает сеткой.
    if (!loadedOnce.current) setLoading(true);
    setError("");
    getCashClients()
      .then((data) => { if (active) { setClients(data); loadedOnce.current = true; } })
      .catch((reason) => {
        if (!active) return;
        loadedOnce.current = false;
        setError(getFriendlyErrorMessage(reason, "Не удалось загрузить список касс."));
      })
      .finally(() => { if (active) setLoading(false); });
    void loadTasks();
    return () => { active = false; };
  }, [attempt, reloadToken, loadTasks]);

  const hasActiveTasks = useMemo(() => [...tasks.values()].some(isTaskActive), [tasks]);

  useEffect(() => {
    if (!hasActiveTasks) return;
    const timer = window.setInterval(retry, TASK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks, retry]);

  const stats = useMemo(
    () => cashStats(clients, versions, actualVersion, tasks, versionsLoaded),
    [clients, versions, actualVersion, tasks, versionsLoaded],
  );

  const visible = useMemo(() => clients.filter((cash) => {
    const installed = installedVersion(cash, versions, actualVersion, versionsLoaded);
    if (filter === "busy" && !isTaskActive(tasks.get(cash.id))) return false;
    if (filter !== "all" && filter !== "busy" && installed.state !== filter) return false;
    if (!debouncedSearchText) return true;
    return [cashTitle(cash), cash.ip, installed.label]
      .some((field) => field && includesNormalized(field, debouncedSearchText));
  }), [clients, versions, tasks, actualVersion, versionsLoaded, filter, debouncedSearchText]);

  const install = async (cash: CashClient, version: CashVersion) => {
    if (pendingId !== null) return;
    setInstallTarget(null);
    setPendingId(cash.id);
    finishedTasks.current.delete(cash.id);
    try {
      await installOnCashClient(cash.id, version.id);
      notifications.show(
        `${cashTitle(cash)}: задача на установку версии ${version.version} поставлена.`,
        { severity: "success", autoHideDuration: 4000 },
      );
      retry();
    } catch (reason) {
      notifications.show(getFriendlyErrorMessage(reason, `${cashTitle(cash)} не приняла задачу на обновление.`), { severity: "error", autoHideDuration: 6000 });
    } finally {
      setPendingId(null);
    }
  };

  const remove = async () => {
    const cash = pendingDelete;
    if (!cash || pendingId !== null) return;
    setPendingId(cash.id);
    setPendingDelete(null);
    finishedTasks.current.delete(cash.id);
    try {
      await deleteCashClient(cash.id);
      notifications.show(`${cashTitle(cash)}: задача на удаление клиента поставлена.`, { severity: "success", autoHideDuration: 4000 });
      retry();
    } catch (reason) {
      notifications.show(getFriendlyErrorMessage(reason, `${cashTitle(cash)} не приняла задачу на удаление.`), { severity: "error", autoHideDuration: 6000 });
    } finally {
      setPendingId(null);
    }
  };

  const filterCount = (key: Filter) =>
    key === "outdated" ? stats.outdated : key === "busy" ? stats.busy : key === "unknown" ? stats.unknown : null;

  return (
    <section className={dashboard.section}>
      <div className={`${dashboard.toolbar} ${styles.cashToolbar}`}>
        <div className={`${dashboard.toolbarGroup} ${styles.cashToolbarGroup}`}>
          <label className={`${dashboard.search} ${styles.cashSearch}`}>
            <SearchRoundedIcon fontSize="small" />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)}
              placeholder="Поиск по ТТ, IP или версии" aria-label="Поиск по кассам" />
          </label>
          <div className={`${dashboard.actionGroup} ${styles.versionActions}`}>{versionActions}</div>
        </div>

        <div className={`${dashboard.toolbarEnd} ${styles.cashToolbarEnd}`}>
          <div className={`${dashboard.filterGroup} ${styles.cashFilters}`}>
            {filterItems.map(([key, label]) => (
              <button type="button" key={key} aria-pressed={filter === key}
                className={`${dashboard.filterButton} ${filter === key ? dashboard.filterButtonActive : ""}`}
                onClick={() => setFilter(key)}>
                {label}{key === "all" ? "" : ` (${filterCount(key)})`}
              </button>
            ))}
          </div>
          <Button variant="secondary" className={styles.refreshAction} onClick={retry} disabled={loading}
            aria-label="Обновить список касс">
            <RefreshRoundedIcon className={styles.refreshIcon} />
            <span className={styles.refreshLabel}>Обновить</span>
          </Button>
        </div>
      </div>

      <div className={`${dashboard.metricsGrid} ${dashboard.metricsGridFour} ${styles.cashMetrics}`}>
        <div className={dashboard.metricCard}>
          <span className={dashboard.metricLabel}>Всего касс</span>
          <strong className={dashboard.metricValue}>{stats.total}</strong>
        </div>
        <div className={dashboard.metricCard}>
          <span className={dashboard.metricLabel}>Отстают</span>
          <strong className={dashboard.metricValue}>{stats.outdated}</strong>
        </div>
        <div className={dashboard.metricCard}>
          <span className={dashboard.metricLabel}>В работе</span>
          <strong className={dashboard.metricValue}>{stats.busy}</strong>
        </div>
        <div className={dashboard.metricCard}>
          <span className={dashboard.metricLabel}>Без связи</span>
          <strong className={dashboard.metricValue}>{stats.unknown}</strong>
        </div>
      </div>

      {error ? <div className={styles.sectionState}>
          <StatePanel tone="error" title="Список касс недоступен" text={error}
            action={<Button variant="secondary" onClick={retry}>Повторить</Button>} />
        </div>
        : loading ? <div className={styles.sectionState}><LoadingSpinner size={96} label="Загружаем кассы…" /></div>
        : clients.length === 0 ? <div className={styles.sectionState}>
            <StatePanel icon={<PointOfSaleOutlinedIcon />} title="Касс пока нет"
              text="Кассы появятся здесь после установки кассового клиента." />
          </div>
        : <div className={`${dashboard.cardsGrid} ${styles.cashGrid}`}>
            {visible.map((cash) => (
              <CashCard key={cash.id} cash={cash} versions={versions} actualVersion={actualVersion}
                versionsLoaded={versionsLoaded} task={tasks.get(cash.id)}
                pending={pendingId === cash.id}
                onInstall={setInstallTarget}
                onDelete={setPendingDelete} />
            ))}
            {visible.length === 0 && <div className={dashboard.emptyState}>По заданным условиям касс нет</div>}
          </div>}

      <CashInstallModal
        cash={installTarget}
        versions={versions}
        installed={installTarget ? installedVersion(installTarget, versions, actualVersion, versionsLoaded).label : null}
        defaultVersionId={targetVersion?.id ?? null}
        onCancel={() => setInstallTarget(null)}
        onConfirm={(cash, version) => void install(cash, version)}
      />

      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Удалить кассовый клиент"
        message={pendingDelete
          ? `С кассы «${cashTitle(pendingDelete)}» будут удалены клиент, монитор и автозагрузка. Касса перестанет получать заказы, пока клиент не установят заново.`
          : ""}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
