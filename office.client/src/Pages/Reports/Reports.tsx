import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import StatePanel from "../../Components/StatePanel/StatePanel";
import StatusBadge from "../../Components/StatusBadge/StatusBadge";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { getReportCatalog, getReportErrorMessage } from "./reports.api";
import type { ReportCatalog, ReportCatalogItem } from "./reports.types";
import styles from "./Reports.module.css";

const reportIcons: Record<string, ReactNode> = {
  profit: <TrendingUpRoundedIcon />,
  "profit-pro": <InsightsRoundedIcon />,
  "service-desk": <SupportAgentRoundedIcon />,
  "checks-time": <ReceiptLongRoundedIcon />,
  franchisee: <StorefrontRoundedIcon />,
  other: <FolderOpenRoundedIcon />,
  "1c": <DescriptionOutlinedIcon />,
};

function reportPath(report: ReportCatalogItem): string {
  if (report.kind === "franchisee") return "/Reports/Franchisee";
  if (report.kind === "files") return "/Reports/Other";
  return `/Reports/View/${report.code}`;
}

export default function Reports() {
  const dispatch = useDispatch();
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Отчёты" }));
  }, [dispatch]);

  const load = useCallback(async () => {
    setError("");
    try {
      setCatalog(await getReportCatalog());
    } catch (reason) {
      setError(getReportErrorMessage(reason, "Не удалось загрузить список отчётов."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <StatePanel
            tone="error"
            icon={<ErrorOutlineRoundedIcon />}
            title="Список отчётов не загрузился"
            text={error}
            action={<Button variant="secondary" onClick={() => void load()}>Повторить</Button>}
          />
        </section>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className={styles.loading}>
        <LoadingSpinner size={96} label="Загружаем отчёты…" />
      </div>
    );
  }

  if (catalog.reports.length === 0 && !catalog.canManage) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <StatePanel
            icon={<AssessmentOutlinedIcon />}
            title="Нет доступных отчётов"
            text="Попросите администратора выдать роль нужного отчёта."
          />
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <ul className={styles.grid}>
        {catalog.reports.map((report) => (
          <li key={report.code}>
            <ReportCard report={report} />
          </li>
        ))}
        {catalog.canManage ? (
          <li>
            <Link className={styles.card} to="/Reports/Settings">
              <div className={styles.cardTop}>
                <span className={styles.cardIcon} aria-hidden="true"><SettingsRoundedIcon /></span>
              </div>
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>Настройки отчётов</h2>
                <p className={styles.cardText}>Общие и персональные ссылки Power BI, папка «Других отчётов».</p>
              </div>
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ReportCard({ report }: { report: ReportCatalogItem }) {
  const badge = !report.configured
    ? <StatusBadge tone="warning">Не настроен</StatusBadge>
    : report.kind === "external"
      ? <StatusBadge icon={<OpenInNewRoundedIcon />}>Новая вкладка</StatusBadge>
      : null;

  const content = (
    <>
      <div className={styles.cardTop}>
        <span className={styles.cardIcon} aria-hidden="true">{reportIcons[report.code] ?? <AssessmentOutlinedIcon />}</span>
        {badge}
      </div>
      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle}>{report.title}</h2>
        <p className={styles.cardText}>{report.description}</p>
      </div>
    </>
  );

  if (report.kind === "external") {
    return report.url ? (
      <a className={styles.card} href={report.url} target="_blank" rel="noopener noreferrer">{content}</a>
    ) : (
      <div className={`${styles.card} ${styles.cardDisabled}`} aria-disabled="true">{content}</div>
    );
  }

  return <Link className={styles.card} to={reportPath(report)}>{content}</Link>;
}
