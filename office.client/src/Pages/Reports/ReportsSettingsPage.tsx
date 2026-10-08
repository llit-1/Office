import { useCallback, useEffect, useId, useState } from "react";
import { useDispatch } from "react-redux";
import { useNotifications } from "@toolpad/core";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import StatePanel from "../../Components/StatePanel/StatePanel";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { getReportErrorMessage, getReportSettings, updateCommonReportSetting } from "./reports.api";
import type { ReportSetting, ReportSettings } from "./reports.types";
import shared from "./Reports.module.css";
import styles from "./ReportsSettings.module.css";

const settingHint = (setting: ReportSetting) => {
  if (setting.kind === "files") return "Полный путь к сетевой папке, доступной серверу портала.";
  if (setting.kind === "external") return "Откроется в новой вкладке.";
  if (setting.code === "profit" || setting.code === "profit-pro") {
    return "Видна только пользователям с доступом ко всем точкам. Остальным персональная ссылка задаётся в карточке пользователя.";
  }
  return "Ссылка https:// на отчёт Power BI. Показывается внутри портала.";
};

export default function ReportsSettingsPage() {
  const dispatch = useDispatch();
  const notifications = useNotifications();
  const fieldId = useId();
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);

  useEffect(() => {
    dispatch(pathSet({ path: "/Reports" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Настройки отчётов" }));
  }, [dispatch]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await getReportSettings();
      setSettings(data);
      setDrafts(Object.fromEntries(data.common.map((setting) => [setting.code, setting.value])));
    } catch (reason) {
      setLoadError(getReportErrorMessage(reason, "Не удалось загрузить настройки отчётов."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCommon = async (setting: ReportSetting) => {
    const value = (drafts[setting.code] ?? "").trim();
    setSavingCode(setting.code);
    setFieldErrors((prev) => ({ ...prev, [setting.code]: "" }));
    try {
      await updateCommonReportSetting(setting.code, value);
      setSettings((prev) => prev && {
        ...prev,
        common: prev.common.map((item) => (item.code === setting.code ? { ...item, value } : item)),
      });
      setDrafts((prev) => ({ ...prev, [setting.code]: value }));
      notifications.show(`«${setting.title}»: настройка сохранена`, { severity: "success", autoHideDuration: 2500 });
    } catch (reason) {
      setFieldErrors((prev) => ({ ...prev, [setting.code]: getReportErrorMessage(reason, "Не удалось сохранить настройку.") }));
    } finally {
      setSavingCode(null);
    }
  };

  if (loadError) {
    return (
      <div className={shared.page}>
        <section className={shared.panel}>
          <StatePanel
            tone="error"
            icon={<ErrorOutlineRoundedIcon />}
            title="Настройки не загрузились"
            text={loadError}
            action={<Button variant="secondary" onClick={() => void load()}>Повторить</Button>}
          />
        </section>
      </div>
    );
  }

  if (!settings) {
    return <div className={shared.loading}><LoadingSpinner size={96} label="Загружаем настройки отчётов…" /></div>;
  }

  return (
    <div className={shared.page}>
      <section className={shared.panel} aria-labelledby={`${fieldId}-common`}>
        <header className={shared.panelHeader}>
          <div className={shared.panelHeading}>
            <h2 id={`${fieldId}-common`} className={shared.panelTitle}>Общие настройки</h2>
            <p className={shared.panelSubtitle}>
              Действуют для всех, у кого есть роль отчёта. Персональные ссылки «Выручки» задаются в карточке пользователя.
            </p>
          </div>
        </header>
        <div className={styles.commonList}>
          {settings.common.map((setting) => {
            const draft = drafts[setting.code] ?? "";
            const error = fieldErrors[setting.code];
            const errorId = `${fieldId}-${setting.code}-error`;
            return (
              <form
                key={setting.code}
                className={styles.commonRow}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveCommon(setting);
                }}
                noValidate
              >
                <div className={styles.commonInfo}>
                  <span className={styles.commonTitle}>{setting.title}</span>
                  <span className={shared.panelSubtitle}>{settingHint(setting)}</span>
                </div>
                <div className={`${styles.commonField} ${error ? styles.invalid : ""}`}>
                  <Input
                    label={setting.kind === "files" ? "Путь к папке" : "Ссылка"}
                    value={draft}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [setting.code]: event.target.value }))}
                    placeholder={setting.defaultValue ?? (setting.kind === "files" ? "\\\\server\\share\\Отчёты" : "https://app.powerbi.com/…")}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                  />
                  {error ? <p id={errorId} className={styles.fieldError}>{error}</p> : null}
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  loading={savingCode === setting.code}
                  disabled={draft.trim() === setting.value}
                >
                  Сохранить
                </Button>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}
