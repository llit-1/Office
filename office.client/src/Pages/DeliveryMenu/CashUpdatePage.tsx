import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import Button from "../../Components/Button/Button";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import { getFriendlyErrorMessage } from "../../Services/api";
import CashClientsSection from "./components/CashClientsSection";
import CashVersionModal from "./components/CashVersionModal";
import {
  addCashVersion,
  deleteCashVersion,
  downloadCashVersion,
  getCashVersions,
  installCashVersion,
  type CashVersion,
} from "./cash.api";
import useSectionTitle from "./useSectionTitle";
import sectionStyles from "./SectionPage.module.css";
import styles from "./CashUpdate.module.css";

export default function CashUpdatePage() {
  useSectionTitle("Обновление", "/Cash");
  const notifications = useNotifications();
  const [versions, setVersions] = useState<CashVersion[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [clientsToken, setClientsToken] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [confirmInstall, setConfirmInstall] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CashVersion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const busyRef = useRef(false);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    getCashVersions()
      .then((data) => {
        if (!active) return;
        setVersions(data);
        // Выбор сбрасывается на актуальную версию: это ответ на вопрос «что сейчас на кассах».
        setSelectedId(String(data.find((entry) => entry.actual)?.id ?? data[0]?.id ?? ""));
      })
      .catch((reason) => { if (active) setLoadError(getFriendlyErrorMessage(reason, "Не удалось загрузить список версий.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const selected = useMemo(
    () => versions.find((entry) => String(entry.id) === selectedId) ?? null,
    [versions, selectedId],
  );
  const actualVersion = useMemo(() => versions.find((entry) => entry.actual) ?? null, [versions]);

  const download = async () => {
    if (!selected || busyRef.current) return;
    busyRef.current = true;
    setDownloading(true);
    try {
      const blob = await downloadCashVersion(selected.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CashClient-${selected.version}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      notifications.show(getFriendlyErrorMessage(reason, "Не удалось скачать дистрибутив."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      busyRef.current = false;
      setDownloading(false);
    }
  };

  const install = async () => {
    if (!selected || busyRef.current) return;
    busyRef.current = true;
    setInstalling(true);
    try {
      const result = await installCashVersion(selected.id);
      setConfirmInstall(false);
      // Часть касс могла не принять задачу — об этом говорим прямо, а не «успешно».
      notifications.show(
        result.failed.length === 0
          ? `Задача на установку ${selected.version} поставлена всем кассам (${result.queued}).`
          : `Задача поставлена ${result.queued} из ${result.total}. Не приняли: ${result.failed.join(", ")}.`,
        { severity: result.failed.length === 0 ? "success" : "warning", autoHideDuration: 6000 },
      );
      setClientsToken((value) => value + 1);
    } catch (reason) {
      notifications.show(getFriendlyErrorMessage(reason, "Не удалось поставить задачу на установку."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      busyRef.current = false;
      setInstalling(false);
    }
  };

  const save = async (version: string, file: File) => {
    if (busyRef.current) return;
    if (versions.some((entry) => entry.version === version)) {
      setSaveError(`Версия ${version} уже загружена.`);
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await addCashVersion(version, file);
      setModalOpen(false);
      notifications.show(`Версия ${version} загружена.`, { severity: "success", autoHideDuration: 4000 });
      reload();
    } catch (reason) {
      setSaveError(getFriendlyErrorMessage(reason, "Не удалось загрузить версию."));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete || busyRef.current) return;
    busyRef.current = true;
    setDeleting(true);
    try {
      await deleteCashVersion(pendingDelete.id);
      notifications.show(`Версия ${pendingDelete.version} удалена.`, { severity: "success", autoHideDuration: 4000 });
      setPendingDelete(null);
      reload();
    } catch (reason) {
      notifications.show(getFriendlyErrorMessage(reason, "Не удалось удалить версию."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      busyRef.current = false;
      setDeleting(false);
    }
  };

  const versionActions = loading
    ? <LoadingSpinner size={24} />
    : loadError
      ? <Button variant="secondary" onClick={reload}>Повторить загрузку версий</Button>
      : versions.length === 0
        ? <Button variant="primary" leadingIcon={<AddRoundedIcon />}
            onClick={() => { setSaveError(""); setModalOpen(true); }}>Добавить версию</Button>
        : <>
            <Select
              label="Версия"
              hideLabel
              className={styles.versionSelect}
              wrapperClassName={styles.versionSelectWrapper}
              options={versions.map((entry) => ({ value: String(entry.id), label: entry.version }))}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              placeholder="Версия"
            />
            <Button variant="primary" className={styles.installAction} loading={installing} disabled={!selected}
              onClick={() => setConfirmInstall(true)}>Установить на все кассы</Button>
            <Button variant="secondary" className={styles.addAction} leadingIcon={<AddRoundedIcon />}
              onClick={() => { setSaveError(""); setModalOpen(true); }}>Добавить версию</Button>
            {/* Второстепенные действия над версией — иконками, иначе панель не помещается по ширине. */}
            <Button variant="secondary" className={`${styles.iconAction} ${styles.downloadAction}`} loading={downloading}
              disabled={!selected} onClick={() => void download()}
              aria-label="Скачать архив версии" title="Скачать архив версии">
              <DownloadRoundedIcon />
            </Button>
            {/* Подсказка висит на обёртке: у выключенной кнопки браузер её не показывает. */}
            <span className={styles.deleteHint}
              title={selected?.actual
                ? `Версия ${selected.version} стоит на кассах — сначала установите другую`
                : "Удалить версию"}>
              <Button variant="secondary" className={`${styles.iconAction} ${styles.deleteAction}`}
                disabled={!selected || selected.actual} onClick={() => selected && setPendingDelete(selected)}
                aria-label="Удалить версию">
                <DeleteOutlineRoundedIcon />
              </Button>
            </span>
          </>;

  return <main className={sectionStyles.page} aria-label="Обновление">
    <CashClientsSection versions={versions} actualVersion={actualVersion?.version ?? null}
      versionsLoaded={!loading && !loadError} targetVersion={selected}
      reloadToken={clientsToken} versionActions={versionActions} />

    <CashVersionModal
      isOpen={modalOpen}
      saving={saving}
      error={saveError}
      onClose={() => { if (!saving) setModalOpen(false); }}
      onSubmit={(version, file) => void save(version, file)}
    />

    <ConfirmModal
      isOpen={confirmInstall}
      title="Установить на все кассы"
      message={selected ? `Всем кассам будет поставлена задача обновиться до версии ${selected.version}. Монитор на кассе заберёт задачу сразу или в течение 5 минут, ход обновления виден на карточках.` : ""}
      confirmLabel={installing ? "Ставим задачи…" : "Установить"}
      cancelLabel="Отмена"
      onCancel={() => { if (!installing) setConfirmInstall(false); }}
      onConfirm={() => void install()}
    />

    <ConfirmModal
      isOpen={pendingDelete !== null}
      title="Удалить версию"
      message={pendingDelete ? `Версия ${pendingDelete.version} будет удалена с сервера обновлений. Кассы, которые ещё не обновились, её не получат.` : ""}
      confirmLabel={deleting ? "Удаляем…" : "Удалить"}
      onCancel={() => { if (!deleting) setPendingDelete(null); }}
      onConfirm={() => void remove()}
    />
  </main>;
}
