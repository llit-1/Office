import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import Input from "../../Components/Input/Input";
import Button from "../../Components/Button/Button";
import OutlinedField from "../../Components/OutlinedField/OutlinedField";
import Select from "../../Components/Select/Select";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { get, getFriendlyErrorMessage, post } from "../../Services/api";
import styles from "./Salary.module.css";
import {
  SalaryFiltersResponse,
  SalaryPersonalitySearchItem,
  SalaryTimeSheet,
  SalaryTimeSheetRefresh,
  calculateWorkedHours,
  formatDateTime,
  formatHours,
  formatMoney,
  getRangeDays,
  isWarningRate,
} from "./salaryShared";

const MAX_RANGE_DAYS = 155;

const SalaryPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const notifications = useNotifications();

  const [filters, setFilters] = useState<SalaryFiltersResponse>({ locations: [] });
  const [isFiltersLoading, setIsFiltersLoading] = useState(true);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [recalculatingGuid, setRecalculatingGuid] = useState<string | null>(null);

  const [rows, setRows] = useState<SalaryTimeSheet[]>([]);

  const [locationGuid, setLocationGuid] = useState("");
  const [personalityQuery, setPersonalityQuery] = useState("");
  const [selectedPersonality, setSelectedPersonality] = useState<SalaryPersonalitySearchItem | null>(null);
  const [personalityItems, setPersonalityItems] = useState<SalaryPersonalitySearchItem[]>([]);
  const [isPersonalityLoading, setIsPersonalityLoading] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [monthValue, setMonthValue] = useState("");

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Расчет заработной платы" }));
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;

    const loadFilters = async () => {
      try {
        setIsFiltersLoading(true);
        const data = await get<SalaryFiltersResponse>("/salary/filters");
        if (!cancelled) {
          setFilters({
            locations: Array.isArray(data?.locations) ? data.locations : [],
          });
        }
      } catch (error) {
        notifications.show(getFriendlyErrorMessage(error, "Не удалось загрузить фильтры зарплаты."), {
          severity: "error",
          autoHideDuration: 3500,
        });
      } finally {
        if (!cancelled) {
          setIsFiltersLoading(false);
        }
      }
    };

    loadFilters();

    return () => {
      cancelled = true;
    };
  }, [notifications]);

  useEffect(() => {
    if (selectedPersonality && personalityQuery === selectedPersonality.fio) {
      setPersonalityItems([]);
      return;
    }

    const normalized = personalityQuery.trim();
    if (normalized.length < 2) {
      setPersonalityItems([]);
      setIsPersonalityLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsPersonalityLoading(true);
        const data = await get<SalaryPersonalitySearchItem[]>("/salary/personality-search", {
          params: { fio: normalized },
        });
        if (!cancelled) {
          setPersonalityItems(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setPersonalityItems([]);
        }
      } finally {
        if (!cancelled) {
          setIsPersonalityLoading(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [personalityQuery, selectedPersonality]);

  const locationOptions = useMemo(
    () => [
      { value: "", label: "Не выбрано" },
      ...filters.locations.map((item) => ({
        value: item.guid,
        label: item.name,
      })),
    ],
    [filters.locations],
  );

  const hasMainFilterValue = Boolean(locationGuid || selectedPersonality?.personalityGuid);

  const buildRequestParams = () => {
    const params: Record<string, string | number> = {};

    if (locationGuid) {
      params.locationGuid = locationGuid;
    }

    if (selectedPersonality?.personalityGuid) {
      params.personGuid = selectedPersonality.personalityGuid;
    }

    if (monthValue) {
      const [year, month] = monthValue.split("-");
      if (year && month) {
        params.year = Number(year);
        params.month = Number(month);
      }
      return params;
    }

    if (dateFrom) {
      params.start = dateFrom;
    }

    if (dateTo) {
      params.end = dateTo;
    }

    return params;
  };

  const validatePeriod = () => {
    if (!dateFrom || !dateTo) {
      return true;
    }

    if (dateFrom > dateTo) {
      notifications.show('Дата "По" должна быть не раньше даты "С".', {
        severity: "error",
        autoHideDuration: 3500,
      });
      return false;
    }

    if (getRangeDays(dateFrom, dateTo) > MAX_RANGE_DAYS) {
      notifications.show(`Диапазон не должен превышать ${MAX_RANGE_DAYS} дней.`, {
        severity: "error",
        autoHideDuration: 3500,
      });
      return false;
    }

    return true;
  };

  const loadTimeSheets = async () => {
    if (!hasMainFilterValue) {
      notifications.show("Выберите ТТ или сотрудника.", {
        severity: "warning",
        autoHideDuration: 3000,
      });
      return;
    }

    if (!validatePeriod()) {
      return;
    }

    try {
      setIsTableLoading(true);
      const data = await get<SalaryTimeSheet[]>("/salary/timesheets", {
        params: buildRequestParams(),
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось загрузить табели зарплаты."), {
        severity: "error",
        autoHideDuration: 3500,
      });
      setRows([]);
    } finally {
      setIsTableLoading(false);
    }
  };

  const handlePersonalityChange = (value: string) => {
    setPersonalityQuery(value);
    if (selectedPersonality && value !== selectedPersonality.fio) {
      setSelectedPersonality(null);
    }
  };

  const handlePickPersonality = (item: SalaryPersonalitySearchItem) => {
    setSelectedPersonality(item);
    setPersonalityQuery(item.fio);
    setPersonalityItems([]);
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setMonthValue("");
    if (dateTo && value && value > dateTo) {
      setDateTo(value);
    }
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setMonthValue("");
    if (dateFrom && value && value < dateFrom) {
      setDateFrom(value);
    }
  };

  const handleMonthChange = (value: string) => {
    setMonthValue(value);
    if (value) {
      setDateFrom("");
      setDateTo("");
    }
  };

  const handleRecalculateRow = async (row: SalaryTimeSheet) => {
    try {
      setRecalculatingGuid(row.guid);
      const payload = await post<SalaryTimeSheetRefresh>(`/salary/timesheets/${row.guid}/recalculate`);
      setRows((current) =>
        current.map((item) =>
          item.guid === row.guid
            ? {
                ...item,
                begin: payload.begin,
                end: payload.end,
                baseRate: payload.baseRate,
                locationCashBonus: payload.locationCashBonus,
                experienceCashBonus: payload.experienceCashBonus,
                personalCashBonus: payload.personalCashBonus,
                totalSalary: payload.totalSalary,
              }
            : item,
        ),
      );
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось пересчитать строку табеля."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    } finally {
      setRecalculatingGuid(null);
    }
  };

  const handleCalculateAll = async () => {
    if (rows.length === 0) {
      notifications.show("Нет табелей для расчета.", {
        severity: "warning",
        autoHideDuration: 3000,
      });
      return;
    }

    try {
      setIsCalculating(true);
      await post("/salary/calculate", rows.map((item) => item.guid));
      await loadTimeSheets();
      notifications.show("Расчет выполнен.", {
        severity: "success",
        autoHideDuration: 2500,
      });
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось выполнить расчет зарплаты."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={`${styles.panel}`}>

        {isFiltersLoading ? (
          <div className={styles.centerState}>
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <div className={styles.salaryHeader}>
              <div className={styles.filtersGrid}>
                <Select
                  label="ТТ"
                  value={locationGuid}
                  onChange={(event) => setLocationGuid(event.target.value)}
                  options={locationOptions}
                  search
                  size="medium"
                  wrapperClassName={styles.compactField}
                />

                <div className={`${styles.autocompleteField} ${styles.autocompleteFieldMedium}`}>
                  <OutlinedField
                    label="Сотрудник"
                    htmlFor="salary-personality-search"
                    className={styles.autocompleteWrapper}
                  >
                    <input
                      id="salary-personality-search"
                      className={styles.autocompleteInput}
                      value={personalityQuery}
                      onChange={(event) => handlePersonalityChange(event.target.value)}
                      placeholder="Введите ФИО"
                    />
                    <SearchOutlinedIcon className={styles.autocompleteIcon} />
                  </OutlinedField>

                  {(isPersonalityLoading || personalityItems.length > 0) && (
                    <div className={styles.autocompleteDropdown}>
                      {isPersonalityLoading ? (
                        <div className={styles.dropdownState}>Поиск...</div>
                      ) : (
                        personalityItems.map((item) => (
                          <button
                            key={item.personalityVersionGuid}
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => handlePickPersonality(item)}
                          >
                            {item.fio}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

              <Input label="Период с" type="date" value={dateFrom} onChange={(event) => handleDateFromChange(event.target.value)} size="small" wrapperClassName={styles.compactField} />
              <Input label="Период по" type="date" value={dateTo} onChange={(event) => handleDateToChange(event.target.value)} size="small" wrapperClassName={styles.compactField} />
              <Input label="Месяц" type="month" value={monthValue} onChange={(event) => handleMonthChange(event.target.value)} size="small" wrapperClassName={styles.compactField} />

                <Button variant="primary" className={styles.showButton} onClick={loadTimeSheets} loading={isTableLoading}>
                  {isTableLoading ? "Загрузка..." : "Показать"}
                </Button>

              </div>

              <div className={styles.settingsButtonWrapper}>
                <button
                  className={styles.settingsIconButton}
                  type="button"
                  onClick={() => navigate("/Salary/Settings")}
                  aria-label="Настройки"
                  title="Настройки"
                >
                  <SettingsOutlinedIcon fontSize="small" />
                </button>
              </div>

            </div>


          </>
        )}
      </section>

      <section className={`${styles.panel} ${styles.resultsPanel}`}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionMeta}>Найдено записей: {rows.length}</p>
          </div>

          <Button variant="primary" onClick={handleCalculateAll} disabled={rows.length === 0} loading={isCalculating}>
            {isCalculating ? "Расчет..." : "Рассчитать"}
          </Button>
        </div>

        {isTableLoading ? (
          <div className={styles.centerState}>
            <LoadingSpinner />
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>По выбранным фильтрам данных нет.</div>
        ) : (
          <div className={styles.tableWrap}>
            <div className={styles.tableScroll}>
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "3%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Начало</th>
                  <th>Окончание</th>
                  <th>Сотрудник</th>
                  <th>ТТ</th>
                  <th>Должность</th>
                  <th>Базовая ставка</th>
                  <th>Бонус ТТ</th>
                  <th>Бонус стажа</th>
                  <th>Личный бонус</th>
                  <th>Отработано часов</th>
                  <th>Итого</th>
                  <th>Обновить</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const workedHours = calculateWorkedHours(row.begin, row.end);

                  return (
                    <tr key={row.guid} className={isWarningRate(row.baseRate) ? styles.warningRow : undefined}>
                      <td data-label="Начало">{formatDateTime(row.begin)}</td>
                      <td data-label="Окончание">{formatDateTime(row.end)}</td>
                      <td data-label="Сотрудник">{row.fio || "-"}</td>
                      <td data-label="ТТ">{row.location || "-"}</td>
                      <td data-label="Должность">{row.position || "-"}</td>
                      <td data-label="Базовая ставка">{formatMoney(row.baseRate)}</td>
                      <td data-label="Бонус ТТ" className={styles.statusCell}>
                        {(row.locationCashBonus ?? 0) > 0
                          ? <AddRoundedIcon className={styles.positiveIcon} fontSize="small" />
                          : <RemoveRoundedIcon className={styles.negativeIcon} fontSize="small" />}
                      </td>
                      <td data-label="Бонус стажа" className={styles.statusCell}>
                        {(row.experienceCashBonus ?? 0) > 0
                          ? <AddRoundedIcon className={styles.positiveIcon} fontSize="small" />
                          : <RemoveRoundedIcon className={styles.negativeIcon} fontSize="small" />}
                      </td>
                      <td data-label="Личный бонус">{formatMoney(row.personalCashBonus)}</td>
                      <td data-label="Отработано часов">{formatHours(workedHours)}</td>
                      <td data-label="Итого">{formatMoney(row.totalSalary)}</td>
                      <td data-label="Обновить" className={styles.actionCell}>
                        <button
                          className={styles.refreshButton}
                          type="button"
                          onClick={() => handleRecalculateRow(row)}
                          disabled={recalculatingGuid === row.guid}
                          title="Пересчитать строку"
                        >
                          <AutorenewOutlinedIcon className={recalculatingGuid === row.guid ? styles.spinningIcon : undefined} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default SalaryPage;
