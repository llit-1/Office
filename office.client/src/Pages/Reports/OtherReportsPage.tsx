import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { useNotifications } from "@toolpad/core";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import FolderOffOutlinedIcon from "@mui/icons-material/FolderOffOutlined";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import SlideshowOutlinedIcon from "@mui/icons-material/SlideshowOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import Button from "../../Components/Button/Button";
import { FILE_KIND_LABEL, getFileKind, type FileKind } from "../../Components/FileTypeIcon/fileTypes";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../Components/Modal/Modal";
import StatePanel from "../../Components/StatePanel/StatePanel";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { createReportFileTicket, getReportErrorMessage, getReportFiles, isNotFoundError, reportFileUrl } from "./reports.api";
import type { ReportFileEntry } from "./reports.types";
import { formatDateTime, formatFileSize, normalizeText } from "./reports.utils";
import shared from "./Reports.module.css";
import styles from "./OtherReports.module.css";

const OfficeViewer = lazy(() => import("../../Components/OfficeViewer/OfficeViewer"));

type Preview = { entry: ReportFileEntry; ticket: string };

const fileIcons: Record<FileKind, ReactNode> = {
  folder: <InsertDriveFileOutlinedIcon />,
  pdf: <PictureAsPdfOutlinedIcon />,
  word: <DescriptionOutlinedIcon />,
  excel: <TableChartOutlinedIcon />,
  powerpoint: <SlideshowOutlinedIcon />,
  image: <ImageOutlinedIcon />,
  video: <MovieOutlinedIcon />,
  audio: <InsertDriveFileOutlinedIcon />,
  archive: <FolderZipOutlinedIcon />,
  text: <ArticleOutlinedIcon />,
  code: <CodeRoundedIcon />,
  other: <InsertDriveFileOutlinedIcon />,
};

export default function OtherReportsPage() {
  const dispatch = useDispatch();
  const notifications = useNotifications();
  const [entries, setEntries] = useState<ReportFileEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    dispatch(pathSet({ path: "/Reports" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Другие отчёты" }));
  }, [dispatch]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getReportFiles();
      if (id !== requestId.current) return;
      setEntries(data.entries);
    } catch (reason) {
      if (id !== requestId.current) return;
      setError({ message: getReportErrorMessage(reason, "Не удалось загрузить отчёты."), notFound: isNotFoundError(reason) });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openFile = async (entry: ReportFileEntry) => {
    setOpeningPath(entry.path);
    try {
      const { ticket } = await createReportFileTicket(entry.path);
      setPreview({ entry, ticket });
    } catch (reason) {
      notifications.show(getReportErrorMessage(reason, "Не удалось открыть файл."), { severity: "error", autoHideDuration: 4000 });
    } finally {
      setOpeningPath(null);
    }
  };

  const query = normalizeText(filter);
  const visibleEntries = useMemo(
    () => (entries ?? []).filter((entry) => !query || normalizeText(entry.name).includes(query)),
    [entries, query],
  );

  let body: ReactNode;
  if (loading) {
    body = <div className={shared.loading}><LoadingSpinner size={56} label="Загружаем отчёты…" /></div>;
  } else if (error) {
    body = (
      <StatePanel
        tone={error.notFound ? "default" : "error"}
        icon={error.notFound ? <FolderOffOutlinedIcon /> : <ErrorOutlineRoundedIcon />}
        title={error.notFound ? "Отчёты недоступны" : "Отчёты не загрузились"}
        text={error.message}
        action={error.notFound ? undefined : <Button variant="secondary" onClick={() => void load()}>Повторить</Button>}
      />
    );
  } else if (!entries || entries.length === 0) {
    body = <StatePanel icon={<InsertDriveFileOutlinedIcon />} title="Отчётов пока нет" text="Здесь пока нет файлов, которые можно открыть в портале." />;
  } else if (visibleEntries.length === 0) {
    body = (
      <StatePanel
        icon={<SearchOffRoundedIcon />}
        title="Ничего не найдено"
        text={`Нет файлов с «${filter.trim()}» в названии.`}
        action={<Button variant="secondary" onClick={() => setFilter("")}>Очистить поиск</Button>}
      />
    );
  } else {
    body = (
      <ul className={styles.list}>
        {visibleEntries.map((entry) => {
          const kind = getFileKind(entry.extension);
          const opening = openingPath === entry.path;
          return (
            <li key={entry.path}>
              <button
                type="button"
                className={styles.row}
                onClick={() => void openFile(entry)}
                disabled={opening}
                aria-busy={opening || undefined}
              >
                <span className={styles.icon} data-kind={kind} aria-hidden="true">{fileIcons[kind]}</span>
                <span className={styles.text}>
                  <span className={styles.name}>{entry.name}</span>
                  <span className={styles.meta}>
                    {`${FILE_KIND_LABEL[kind]} · ${formatFileSize(entry.size)} · изменён ${formatDateTime(entry.modifiedAt)}`}
                  </span>
                </span>
                {opening ? <LoadingSpinner size={24} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={shared.page}>
      <section className={shared.panel} aria-labelledby="other-reports-title">
        <div className={styles.toolbar}>
          <h2 id="other-reports-title" className={styles.title}>
            Файлы отчётов
            {entries && entries.length > 0 && !error ? <span className={styles.count}>{entries.length}</span> : null}
          </h2>
          {entries && entries.length > 0 && !error ? (
            <div className={styles.search}>
              <Input
                label="Поиск по отчётам"
                labelVisible={false}
                wrapperClassName={shared.compactField}
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Название файла"
              />
            </div>
          ) : null}
        </div>
        {body}
      </section>

      <Modal
        isOpen={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.entry.name}
        size="lg"
        panelClassName={styles.previewPanel}
        bodyClassName={styles.previewBody}
        headerActions={preview ? (
          <a
            className={shared.iconButton}
            href={reportFileUrl(preview.ticket, preview.entry.name, true)}
            aria-label="Скачать файл"
            title="Скачать файл"
          >
            <DownloadRoundedIcon />
          </a>
        ) : null}
      >
        {preview ? <FilePreview preview={preview} /> : null}
      </Modal>
    </div>
  );
}

function FilePreview({ preview }: { preview: Preview }) {
  const { entry, ticket } = preview;
  const kind = getFileKind(entry.extension);
  const url = reportFileUrl(ticket, entry.name);
  const downloadUrl = reportFileUrl(ticket, entry.name, true);

  if (kind === "pdf" || kind === "text") {
    return <iframe className={styles.previewFrame} src={url} title={entry.name} />;
  }

  if (kind === "image") {
    return <img className={styles.previewImage} src={url} alt={entry.name} />;
  }

  if (kind === "video") {
    return <video className={styles.previewVideo} src={url} controls />;
  }

  if (kind === "word" || kind === "excel") {
    return (
      <Suspense fallback={<div className={shared.loading}><LoadingSpinner size={56} label="Открываем документ…" /></div>}>
        <OfficeViewer url={url} downloadUrl={downloadUrl} extension={entry.extension} fileName={entry.name} />
      </Suspense>
    );
  }

  return (
    <StatePanel
      icon={<InsertDriveFileOutlinedIcon />}
      title="Предпросмотр недоступен"
      text="Скачайте файл, чтобы открыть его на компьютере."
      action={<Button variant="primary" leadingIcon={<DownloadRoundedIcon />} onClick={() => window.location.assign(downloadUrl)}>Скачать файл</Button>}
    />
  );
}
