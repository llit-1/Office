import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import StatePanel from "../../Components/StatePanel/StatePanel";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { getReportErrorMessage, getReportLink, isNotFoundError } from "./reports.api";
import type { ReportLink } from "./reports.types";
import shared from "./Reports.module.css";
import styles from "./ReportViewer.module.css";

const openInNewTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

export default function ReportViewerPage() {
  const { code = "" } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [link, setLink] = useState<ReportLink | null>(null);
  const [error, setError] = useState<{ message: string; notConfigured: boolean } | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    dispatch(pathSet({ path: "/Reports" }));
    dispatch(visibleSet({ visible: true }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(titleSet({ title: link?.title ?? "Отчёты" }));
  }, [dispatch, link]);

  const load = useCallback(async () => {
    setError(null);
    setLink(null);
    setFrameLoaded(false);
    try {
      setLink(await getReportLink(code));
    } catch (reason) {
      setError({
        message: getReportErrorMessage(reason, "Не удалось открыть отчёт."),
        notConfigured: isNotFoundError(reason),
      });
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen]);

  if (error) {
    return (
      <div className={shared.page}>
        <section className={shared.panel}>
          <StatePanel
            tone={error.notConfigured ? "default" : "error"}
            icon={error.notConfigured ? <LinkOffRoundedIcon /> : <ErrorOutlineRoundedIcon />}
            title={error.notConfigured ? "Отчёт не настроен" : "Отчёт не открылся"}
            text={error.message}
            action={error.notConfigured ? (
              <Button variant="secondary" onClick={() => navigate("/Reports")}>К списку отчётов</Button>
            ) : (
              <Button variant="secondary" onClick={() => void load()}>Повторить</Button>
            )}
          />
        </section>
      </div>
    );
  }

  if (!link) {
    return (
      <div className={shared.loading}>
        <LoadingSpinner size={96} label="Открываем отчёт…" />
      </div>
    );
  }

  // Портал работает по HTTPS: страницу по HTTP браузер не покажет во фрейме.
  const canEmbed = link.url.startsWith("https://");

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <section className={`${styles.viewer} ${fullscreen ? styles.fullscreen : ""}`} aria-label={link.title}>
        <header className={styles.toolbar}>
          <h2 className={styles.title}>{link.title}</h2>
          <div className={styles.actions}>
            {canEmbed ? (
              <Button
                variant="ghost"
                leadingIcon={<RefreshRoundedIcon />}
                onClick={() => {
                  setFrameLoaded(false);
                  setReloadKey((key) => key + 1);
                }}
              >
                Обновить
              </Button>
            ) : null}
            <Button variant="secondary" leadingIcon={<OpenInNewRoundedIcon />} onClick={() => openInNewTab(link.url)}>
              В новой вкладке
            </Button>
            {canEmbed ? (
              <button
                type="button"
                className={shared.iconButton}
                aria-label={fullscreen ? "Свернуть отчёт" : "Развернуть отчёт на весь экран"}
                title={fullscreen ? "Свернуть (Esc)" : "На весь экран"}
                onClick={() => setFullscreen((value) => !value)}
              >
                {fullscreen ? <FullscreenExitRoundedIcon /> : <FullscreenRoundedIcon />}
              </button>
            ) : null}
          </div>
        </header>

        {canEmbed ? (
          <>
            <p className={styles.rotateHint}>Отчёт удобнее смотреть, повернув телефон горизонтально.</p>
            <div className={styles.frameWrap}>
              {!frameLoaded ? (
                <div className={styles.frameLoader}>
                  <LoadingSpinner size={56} label="Загружаем отчёт…" />
                </div>
              ) : null}
              <iframe
                key={reloadKey}
                className={styles.frame}
                src={link.url}
                title={link.title}
                allowFullScreen
                onLoad={() => setFrameLoaded(true)}
              />
            </div>
          </>
        ) : (
          <StatePanel
            icon={<OpenInNewRoundedIcon />}
            title="Отчёт открывается на отдельном сайте"
            text="Сайт работает по незащищённому протоколу HTTP, поэтому браузер не позволит показать его внутри портала."
            action={<Button variant="primary" onClick={() => openInNewTab(link.url)}>Открыть отчёт</Button>}
          />
        )}
      </section>
    </div>
  );
}
