import type { CashClient, CashTask, CashVersion } from "./cash.api";

export type VersionState = "actual" | "outdated" | "unknown";

export const cashTitle = (cash: CashClient) => cash.name?.trim() || `Касса №${cash.id}`;

/** Прочерк на карточке: касса сообщила id версии, которой в списке уже нет. */
export const MISSING_VERSION = "—";

export interface InstalledVersion {
  /** Что писать на карточке: номер версии, «—» или null, если касса версию не сообщала. */
  label: string | null;
  state: VersionState;
}

/**
 * Установленная версия кассы. yeapi присылает id версии — номер берём из списка версий.
 * Версию, удалённую из списка, показываем прочерком и считаем отставшей: актуальной она быть не может.
 * Пока список версий не загрузился, ничего не утверждаем: ни номер, ни отставание.
 */
export function installedVersion(
  cash: CashClient,
  versions: CashVersion[],
  actualVersion: string | null,
  versionsLoaded = true,
): InstalledVersion {
  if (cash.cashVersion) return { label: cash.cashVersion, state: versionState(cash.cashVersion, actualVersion) };
  if (cash.cashVersionId == null) return { label: null, state: "unknown" };
  if (!versionsLoaded) return { label: null, state: "actual" };

  const found = versions.find((entry) => entry.id === cash.cashVersionId);
  if (!found) return { label: MISSING_VERSION, state: "outdated" };
  return { label: found.version, state: versionState(found.version, actualVersion) };
}

/**
 * Пока список версий не загрузился, кассы с известной версией не считаются отставшими:
 * заявлять отставание, которое не с чем сравнить, хуже, чем промолчать.
 */
export function versionState(installed: string | null, actualVersion: string | null): VersionState {
  if (!installed) return "unknown";
  if (!actualVersion) return "actual";
  return installed === actualVersion ? "actual" : "outdated";
}

/** Сравнение номеров вида 1.4.8.0: отрицательное — a старше b. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface CashStats { total: number; actual: number; outdated: number; unknown: number; busy: number }

export function cashStats(
  clients: CashClient[],
  versions: CashVersion[],
  actualVersion: string | null,
  tasks: Map<number, CashTask>,
  versionsLoaded = true,
): CashStats {
  const stats: CashStats = { total: clients.length, actual: 0, outdated: 0, unknown: 0, busy: 0 };
  for (const cash of clients) {
    stats[installedVersion(cash, versions, actualVersion, versionsLoaded).state] += 1;
    if (isTaskActive(tasks.get(cash.id))) stats.busy += 1;
  }
  return stats;
}

// ------------------------------------------------------------------------------------------
// Этапы задач. stage в базе — последний успешно выполненный шаг, который монитор на кассе
// отправляет в PUT task/{id}/stage. Сейчас касса выполняет шаг, следующий за ним.
// ------------------------------------------------------------------------------------------

export type TaskKind = "install" | "update" | "delete";
export type TaskState = "queued" | "running" | "done";

const installStages = ["Downloading", "StoppingClient", "DeleteOldVersion", "Extracting", "Configuring", "Completed"];
const deleteStages = ["StoppingClient", "DeleteOldVersion", "Ending_installer"];

/** Что касса делает, пока выполняется шаг. */
const installStageLabels: Record<string, string> = {
  Downloading: "Скачивание",
  StoppingClient: "Остановка клиента",
  DeleteOldVersion: "Удаление старой версии",
  Extracting: "Распаковка",
  Configuring: "Настройка и запуск",
  Completed: "Завершение",
};

const deleteStageLabels: Record<string, string> = {
  StoppingClient: "Остановка клиента",
  DeleteOldVersion: "Удаление файлов",
  Ending_installer: "Завершение",
};

const kindTitles: Record<TaskKind, string> = { install: "Установка", update: "Обновление", delete: "Удаление" };
const doneLabels: Record<TaskKind, string> = { install: "Установлено", update: "Обновлено", delete: "Клиент удалён" };

export interface TaskProgress {
  kind: TaskKind;
  state: TaskState;
  /** «Обновление до 1.3», «Удаление» */
  title: string;
  /** Шаг, который касса выполняет сейчас, или итог. */
  stageLabel: string;
  /** Сколько шагов выполнено и сколько всего — для полоски прогресса. */
  step: number;
  total: number;
}

const same = (left: string | null | undefined, right: string) => (left ?? "").toLowerCase() === right.toLowerCase();

export function taskKind(task: CashTask): TaskKind | null {
  if (same(task.type, "Install")) return "install";
  if (same(task.type, "Update")) return "update";
  if (same(task.type, "Delete")) return "delete";
  return null;
}

export function taskProgress(task: CashTask | undefined, versions: CashVersion[]): TaskProgress | null {
  if (!task) return null;
  const kind = taskKind(task);
  if (!kind) return null;

  const stages = kind === "delete" ? deleteStages : installStages;
  const labels = kind === "delete" ? deleteStageLabels : installStageLabels;
  const target = kind === "delete" ? null : versions.find((entry) => entry.id === task.versionId)?.version;
  const title = target ? `${kindTitles[kind]} до ${target}` : kindTitles[kind];
  const total = stages.length;
  // Delete_installer ставит сам сервер: он удаляет кассу, клиента на ней уже нет.
  const completed = kind === "delete" && same(task.stage, "Delete_installer")
    ? total
    : stages.findIndex((stage) => same(task.stage, stage)) + 1;

  if (completed === 0) {
    // Created или пусто: касса не забрала задачу или выполняет первый шаг (скачивание).
    return { kind, state: "queued", title, stageLabel: "Ожидает кассу", step: 0, total };
  }
  if (completed === total) {
    return { kind, state: "done", title, stageLabel: doneLabels[kind], step: total, total };
  }
  return { kind, state: "running", title, stageLabel: labels[stages[completed]], step: completed, total };
}

export const isTaskActive = (task: CashTask | undefined) => {
  const state = task ? taskProgress(task, [])?.state : undefined;
  return state === "queued" || state === "running";
};
