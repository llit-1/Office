import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { useNotifications } from "@toolpad/core";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import Button from "../../Components/Button/Button";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import StatePanel from "../../Components/StatePanel/StatePanel";
import StatusBadge from "../../Components/StatusBadge/StatusBadge";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { getFranchiseeLookups, getFranchiseeReport, getReportErrorMessage } from "./reports.api";
import { exportReportTable } from "./reports.excel";
import type { FranchiseeLookups, ReportCellValue, ReportTable } from "./reports.types";
import {
  formatIsoDate,
  formatMoney,
  formatNumber,
  formatReportValue,
  presetRange,
  sumColumn,
  toIsoDate,
  validatePeriod,
  type PeriodPreset,
} from "./reports.utils";
import shared from "./Reports.module.css";
import styles from "./FranchiseeReports.module.css";

type TableRow = Record<string, ReportCellValue> & { id: number };

const PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "current-month", label: "Текущий месяц" },
  { value: "previous-month", label: "Прошлый месяц" },
  { value: "last-7-days", label: "7 дней" },
  { value: "custom", label: "Свой период" },
];

// Колонки с ценами, как в старом портале, не суммируются; итоги считаются по количеству и массе.
const NOT_SUMMABLE = new Set(["sum", "price", "orderPrice", "strikeAmount"]);

function rowsLabel(count: number): string {
  const rest100 = count % 100;
  const rest10 = count % 10;
  const word = rest100 > 10 && rest100 < 20 ? "строк" : rest10 === 1 ? "строка" : rest10 >= 2 && rest10 <= 4 ? "строки" : "строк";
  return `${new Intl.NumberFormat("ru-RU").format(count)} ${word}`;
}

export default function FranchiseeReportsPage() {
  const dispatch = useDispatch();
  const notifications = useNotifications();
  const titleId = useId();
  const [initialRange] = useState(() => presetRange("current-month"));
  const [lookups, setLookups] = useState<FranchiseeLookups | null>(null);
  const [lookupsError, setLookupsError] = useState("");
  const [locationGuid, setLocationGuid] = useState("");
  const [reportCode, setReportCode] = useState("");
  const [preset, setPreset] = useState<PeriodPreset>("current-month");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [formError, setFormError] = useState("");
  const [table, setTable] = useState<ReportTable | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    dispatch(pathSet({ path: "/Reports" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Отчёты франчайзи" }));
  }, [dispatch]);

  const loadLookups = useCallback(async () => {
    setLookupsError("");
    try {
      const data = await getFranchiseeLookups();
      setLookups(data);
      setLocationGuid((current) => current || (data.locations.length === 1 ? data.locations[0].guid : ""));
      setReportCode((current) => (data.reports.some((item) => item.code === current) ? current : data.reports[0]?.code ?? ""));
    } catch (reason) {
      setLookupsError(getReportErrorMessage(reason, "Не удалось загрузить точки и список отчётов."));
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  // Любое изменение условий делает прежнюю таблицу неактуальной.
  useEffect(() => {
    requestId.current += 1;
    setTable(null);
    setTableError("");
    setTableLoading(false);
  }, [reportCode, locationGuid, from, to]);

  const report = lookups?.reports.find((item) => item.code === reportCode) ?? null;
  const maxDays = lookups?.maxPeriodDays ?? 40;

  const locationOptions = useMemo(
    () => (lookups?.locations ?? []).map((location) => ({ value: location.guid, label: location.name })),
    [lookups],
  );

  const rows = useMemo<TableRow[]>(() => (table?.rows ?? []).map((row, index) => ({ ...row, id: index })), [table]);

  const columns = useMemo<Column<TableRow>[]>(
    () => (table?.columns ?? []).map((column) => ({
      label: column.label,
      render: (row: TableRow) => (
        <span className={column.type === "number" || column.type === "money" ? styles.numberCell : undefined}>
          {formatReportValue(row[column.key], column.type)}
        </span>
      ),
      sortValue: (row: TableRow) => {
        const value = row[column.key];
        return typeof value === "number" ? value : String(value ?? "");
      },
      filterValue: (row: TableRow) => formatReportValue(row[column.key], column.type),
    })),
    [table],
  );

  const totals = useMemo(
    () => (table?.columns ?? [])
      .filter((column) => (column.type === "number" || column.type === "money") && !NOT_SUMMABLE.has(column.key))
      .map((column) => {
        const sum = sumColumn(table?.rows ?? [], column.key);
        return { label: column.label, value: column.type === "money" ? formatMoney(sum) : formatNumber(sum) };
      }),
    [table],
  );

  const applyPreset = (next: PeriodPreset) => {
    setPreset(next);
    setFormError("");
    if (next === "custom") return;
    const range = presetRange(next);
    setFrom(range.from);
    setTo(range.to);
  };

  const buildReport = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!report) return;

    if (!locationGuid) {
      setFormError("Выберите торговую точку.");
      return;
    }

    const periodError = report.usesPeriod ? validatePeriod(from, to, maxDays) : null;
    setFormError(periodError ?? "");
    if (periodError) return;

    const id = ++requestId.current;
    setTableLoading(true);
    setTableError("");
    try {
      const result = await getFranchiseeReport(report.code, report.usesPeriod ? { locationGuid, from, to } : { locationGuid });
      if (id === requestId.current) setTable(result);
    } catch (reason) {
      if (id !== requestId.current) return;
      setTable(null);
      setTableError(getReportErrorMessage(reason, "Не удалось сформировать отчёт. Попробуйте ещё раз."));
    } finally {
      if (id === requestId.current) setTableLoading(false);
    }
  };

  const fileName = table
    ? [table.title, table.locationName, table.from && table.to ? `${formatIsoDate(table.from)}-${formatIsoDate(table.to)}` : formatIsoDate(toIsoDate(new Date()))].join(" ")
    : "Отчёт";

  const exportExcel = async () => {
    if (!table) return;
    setExporting(true);
    try {
      await exportReportTable(table, fileName);
    } catch {
      notifications.show("Не удалось сформировать Excel-файл. Попробуйте ещё раз.", { severity: "error", autoHideDuration: 4000 });
    } finally {
      setExporting(false);
    }
  };

  let body: ReactNode;
  if (lookupsError) {
    body = (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Отчёты не загрузились"
        text={lookupsError}
        action={<Button variant="secondary" onClick={() => void loadLookups()}>Повторить</Button>}
      />
    );
  } else if (!lookups) {
    body = <div className={shared.loading}><LoadingSpinner size={56} label="Загружаем точки…" /></div>;
  } else if (lookups.locations.length === 0) {
    body = (
      <StatePanel
        icon={<StorefrontOutlinedIcon />}
        title="Нет доступных точек"
        text="Отчёты строятся по точкам, привязанным к вашей учётной записи. Попросите администратора портала добавить нужные точки."
      />
    );
  } else if (tableLoading) {
    body = <div className={shared.loading}><LoadingSpinner size={56} label="Формируем отчёт…" /></div>;
  } else if (tableError) {
    body = (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Отчёт не сформирован"
        text={tableError}
        action={<Button variant="secondary" onClick={() => void buildReport()}>Повторить</Button>}
      />
    );
  } else if (!table) {
    body = (
      <StatePanel
        icon={<AssessmentOutlinedIcon />}
        title="Отчёт ещё не сформирован"
        text="Выберите точку и период, затем нажмите «Сформировать». Данные появятся здесь, и их можно будет скачать в Excel."
      />
    );
  } else if (table.rows.length === 0) {
    body = (
      <StatePanel
        icon={<EventBusyOutlinedIcon />}
        title="Данных нет"
        text="За выбранный период по этой точке записей нет. Попробуйте другой период."
      />
    );
  } else {
    body = (
      <>
        {totals.length > 0 ? (
          <dl className={styles.totals} aria-label="Итого по отчёту">
            {totals.map((total) => (
              <div key={total.label} className={styles.total}>
                <dt>{total.label}</dt>
                <dd>{total.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className={styles.tableWrap}>
          <GenericTable<TableRow>
            key={table.code}
            columns={columns}
            data={rows}
            loading={false}
            addOption={false}
            tableStateKey={`reports-franchisee-${table.code}`}
            searchPlaceholder="Поиск по отчёту"
            exportFileName={fileName}
          />
        </div>
      </>
    );
  }

  const subtitle = table
    ? [
      table.locationName,
      table.from && table.to ? `${formatIsoDate(table.from)} — ${formatIsoDate(table.to)}` : "последние 30 дней",
      rowsLabel(table.rows.length),
    ].join(" · ")
    : report?.description;

  return (
    <div className={shared.page}>
      <section className={shared.panel} aria-label="Условия отчёта">
        <form className={styles.filters} onSubmit={(event) => void buildReport(event)} noValidate>
          <div className={styles.location}>
            <Select
              label="Торговая точка"
              options={locationOptions}
              value={locationGuid}
              onChange={(event) => setLocationGuid(event.target.value)}
              placeholder={lookups ? "Выберите точку" : "Загружаем точки…"}
              disabled={!lookups || lookups.locations.length <= 1}
              search={locationOptions.length > 10}
            />
          </div>
          <div className={styles.segmented} role="group" aria-label="Период">
            {PRESETS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={styles.segmentedButton}
                aria-pressed={preset === item.value}
                disabled={!report?.usesPeriod}
                onClick={() => applyPreset(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={styles.dates}>
            <Input
              label="С"
              type="date"
              value={from}
              max={to || undefined}
              disabled={!report?.usesPeriod}
              onChange={(event) => {
                setFrom(event.target.value);
                setPreset("custom");
                setFormError("");
              }}
            />
            <Input
              label="По"
              type="date"
              value={to}
              min={from || undefined}
              disabled={!report?.usesPeriod}
              onChange={(event) => {
                setTo(event.target.value);
                setPreset("custom");
                setFormError("");
              }}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={tableLoading}
            disabled={!report || !lookups || lookups.locations.length === 0}
            leadingIcon={<AssessmentOutlinedIcon />}
          >
            Сформировать
          </Button>
        </form>
        {formError ? (
          <p className={styles.formError} role="alert">{formError}</p>
        ) : report ? (
          <p className={styles.formHint}>
            {report.usesPeriod
              ? `Период — не больше ${maxDays} дней.`
              : `«${report.title}» строится за последние 30 дней, период выбирать не нужно.`}
          </p>
        ) : null}
      </section>

      <div className={styles.layout}>
        <nav className={`${shared.panel} ${styles.reportNav}`} aria-label="Отчёты франчайзи">
          <ul className={styles.reportList}>
            {(lookups?.reports ?? []).map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  className={styles.reportItem}
                  aria-pressed={item.code === reportCode}
                  onClick={() => setReportCode(item.code)}
                >
                  <span className={styles.reportItemTitle}>
                    {item.title}
                    {item.uses1C ? <StatusBadge tone="info">1С</StatusBadge> : null}
                  </span>
                  <span className={styles.reportItemText}>{item.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className={`${shared.panel} ${styles.result}`} aria-labelledby={titleId} aria-busy={tableLoading}>
          <header className={shared.panelHeader}>
            <div className={shared.panelHeading}>
              <h2 id={titleId} className={shared.panelTitle}>{report?.title ?? "Отчёт"}</h2>
              {subtitle ? <p className={shared.panelSubtitle}>{subtitle}</p> : null}
            </div>
            {table && table.rows.length > 0 ? (
              <Button variant="secondary" leadingIcon={<DownloadRoundedIcon />} loading={exporting} onClick={() => void exportExcel()}>
                Скачать Excel
              </Button>
            ) : null}
          </header>
          {body}
        </section>
      </div>
    </div>
  );
}
