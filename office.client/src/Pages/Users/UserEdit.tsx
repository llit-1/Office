import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { UseFormSetError } from "react-hook-form";
import { useNotifications } from "@toolpad/core";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";

import styles from "./UserEdit.module.css";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import Input from "../../Components/Input/Input";
import Button from "../../Components/Button/Button";
import { MultiplySelect } from "../../Components/MultiplySelect/MultiplySelect";
import Toggle from "../../Components/Toggle/Toggle";
import Modal from "../../Components/Modal/Modal";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import {
  callApi,
  get,
  getFriendlyErrorMessage,
  post,
  put,
} from "../../Services/api";

import type {
  OfficeGroup,
  OfficeUser,
  FactoryPerson,
  Personality,
  Location,
  OfficeBid,
} from "../../Interfaces/Users";
import Select from "../../Components/Select/Select";
import {
  getSavedTtSettings,
  resolveTtSettings,
  type TtBinding,
} from "./userEdit.utils";

/**
 * Формат ответа с бэка (по Swagger)
 */
type OfficeUserModel = {
  officeUser: OfficeUser;
  locations: Location[] | null; // справочник всех локаций
  officeGroups: OfficeGroup[] | null; // справочник всех групп
  officeBids: OfficeBid[] | null;
  reportLinks?: { profit: string | null; profitPro: string | null } | null;
};

/** Ответ сохранения: предупреждения приходят, когда доступы в Nx применились не полностью. */
type UserSaveResponse = {
  nxWarnings?: string[];
};

/** Персональные ссылки на отчёты Power BI «Выручка» и «Выручка Pro». */
type ReportLinksForm = {
  profit: string;
  profitPro: string;
};

/**
 * Что храним в react-hook-form
 * (делаем удобные/не-null массивы и отдельный флаг isTT для UI)
 */
type FormValues = {
  officeUser: OfficeUser;
  locations: Location[];
  officeGroups: OfficeGroup[];
  ttBinding: TtBinding;
  isTT: boolean;
  reportLinks: ReportLinksForm;
};

type OfficeUserUpdateModel = {
  id: number;
  login: string;
  name: string | null;
  surname: string | null;
  patronymic: string | null;
  position: string | null;
  actual: number;

  factoryPersonId: number | null;
  personalitiesGuid: string | null;

  officeGroup: number[]; // ID групп
  locations: string[]; // GUID локаций

  defaultLocations: number;
  reportLinks: ReportLinksForm;
};

/**
 * Дефолты формы (важно: без undefined, чтобы не ловить ошибки в UI)
 */
const DEFAULTS: FormValues = {
  officeUser: {
    id: 0,
    login: "",
    name: null,
    surname: null,
    patronymic: null,
    position: null,
    actual: 0,
    defaultLocations: 0,
    factoryPersonId: null,
    personalitiesGuid: null,
    factoryPerson: null as FactoryPerson | null,
    personality: null as Personality | null,
    officeGroup: [],
    locations: [],
  },
  locations: [],
  officeGroups: [],
  ttBinding: "manualTT",
  isTT: false,
  reportLinks: { profit: "", profitPro: "" },
};

/**
 * Конвертер: бэкенд-модель -> данные формы
 * Делает все массивы "безопасными" (не null/undefined) и вычисляет isTT.
 */
function modelToForm(model?: OfficeUserModel | null): FormValues {
  const user = model?.officeUser ?? DEFAULTS.officeUser;

  // Справочники (то, что можно выбрать)
  const allLocations = model?.locations ?? [];
  const allGroups = model?.officeGroups ?? [];

  // То, что уже выбрано у пользователя
  const userLocations = user.locations ?? [];
  const userGroups = user.officeGroup ?? [];
  const ttSettings = resolveTtSettings(
    user.defaultLocations,
    userLocations.length,
  );

  return {
    officeUser: {
      ...user,
      locations: userLocations,
      officeGroup: userGroups,
    },
    locations: allLocations,
    officeGroups: allGroups,
    ttBinding: ttSettings.ttBinding,
    isTT: ttSettings.isTT,
    reportLinks: {
      profit: model?.reportLinks?.profit ?? "",
      profitPro: model?.reportLinks?.profitPro ?? "",
    },
  };
}

function asApiSetError(
  setError: UseFormSetError<FormValues>,
): UseFormSetError<Record<string, unknown>> {
  return (name, error, options) => {
    if (
      name === "login" ||
      name === "surname" ||
      name === "name" ||
      name === "patronymic" ||
      name === "position"
    ) {
      setError(`officeUser.${name}`, error, options);
    } else {
      setError("root.server", error);
    }
  };
}

function formatOfficeBidDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getOfficeBidComment(bid: OfficeBid) {
  return bid.comment ?? bid.Comment ?? "Без комментария";
}

function getOfficeBidDateTime(bid: OfficeBid) {
  return formatOfficeBidDate(bid.dateTime ?? bid.DateTime);
}

export default function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const isCreate = !id || id === "new";
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const notifications = useNotifications();
  const [pageLoading, setPageLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"access" | "reports" | "bids">(
    "access",
  );
  const [officeBids, setOfficeBids] = useState<OfficeBid[]>([]);
  const [selectedOfficeBid, setSelectedOfficeBid] = useState<OfficeBid | null>(
    null,
  );
  const [closingOfficeBidId, setClosingOfficeBidId] = useState<number | null>(
    null,
  );
  const [bidError, setBidError] = useState<string | null>(null);
  const {
    register,
    reset,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { isDirty, errors },
  } = useForm<FormValues>({ defaultValues: DEFAULTS, mode: "onBlur" });
  const actual = watch("officeUser.actual");
  const isTt = watch("isTT");
  const ttBinding = watch("ttBinding");
  const allGroups = watch("officeGroups");
  const userGroups = watch("officeUser.officeGroup");
  const allLocations = watch("locations");
  const userLocations = watch("officeUser.locations");
  const factoryPersonId = watch("officeUser.factoryPersonId");
  const personalitiesGuid = watch("officeUser.personalitiesGuid");
  const factoryPerson = watch("officeUser.factoryPerson");
  const personality = watch("officeUser.personality");
  const selectedGroupIds = useMemo(
    () => userGroups.map((g) => g.id),
    [userGroups],
  );
  const selectedLocationGuids = useMemo(
    () => userLocations.map((l) => l.guid),
    [userLocations],
  );
  const linkedFactoryName = factoryPerson
    ? [factoryPerson.surname, factoryPerson.name, factoryPerson.patronymic]
        .filter(Boolean)
        .join(" ")
    : "";

  useEffect(() => {
    dispatch(pathSet({ path: "/Users" }));
    dispatch(
      titleSet({
        title: isCreate
          ? "Создание пользователя"
          : "Редактирование пользователя",
      }),
    );
    dispatch(visibleSet({ visible: true }));
  }, [dispatch, isCreate]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setSaveError(null);
    setActiveTab("access");
    setSelectedOfficeBid(null);
    const load = async () => {
      if (isCreate) {
        reset(DEFAULTS);
        setOfficeBids([]);
        setPageLoading(false);
        return;
      }
      setPageLoading(true);
      const result = await callApi(get<OfficeUserModel>(`/User/users/${id}`));
      if (cancelled) return;
      if (result.ok && result.data) {
        reset(modelToForm(result.data));
        setOfficeBids(result.data.officeBids ?? []);
      } else {
        setLoadError(
          result.ok
            ? "Не удалось загрузить пользователя."
            : getFriendlyErrorMessage(
                result.error,
                "Не удалось загрузить пользователя.",
              ),
        );
      }
      setPageLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isCreate, reset, retry]);

  const onSubmit = async (form: FormValues) => {
    if (saving) return;
    if (
      form.isTT &&
      form.ttBinding === "manualTT" &&
      form.officeUser.locations.length === 0
    ) {
      setError("root.locations", {
        message: "Выберите хотя бы одну торговую точку или режим «Все ТТ».",
      });
      setActiveTab("access");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const ttSettings = getSavedTtSettings(
      form.isTT,
      form.ttBinding,
      form.officeUser.locations.map((location) => location.guid),
    );
    const payload: OfficeUserUpdateModel = {
      id: form.officeUser.id,
      login: form.officeUser.login,
      name: form.officeUser.name,
      surname: form.officeUser.surname,
      patronymic: form.officeUser.patronymic,
      position: form.officeUser.position,
      actual: form.officeUser.actual,
      factoryPersonId: form.officeUser.factoryPersonId,
      personalitiesGuid: form.officeUser.personalitiesGuid,
      officeGroup: form.officeUser.officeGroup.map((g) => g.id),
      locations: ttSettings.locations,
      defaultLocations: ttSettings.defaultLocations,
      reportLinks: {
        profit: form.reportLinks.profit.trim(),
        profitPro: form.reportLinks.profitPro.trim(),
      },
    };
    const result = await callApi(put<UserSaveResponse>("/User/users", payload), {
      notifications,
      setError: asApiSetError(setError),
      successMessage: "Пользователь сохранён",
    });
    setSaving(false);
    if (result.ok) {
      // Изменения на портале сохранены, но доступы в Nx применились не полностью — показываем, что именно.
      for (const warning of result.data?.nxWarnings ?? []) {
        notifications.show(warning, { severity: "warning", autoHideDuration: 8000 });
      }
      navigate("/Users");
    }
    else
      setSaveError(
        getFriendlyErrorMessage(
          result.error,
          "Не удалось сохранить пользователя. Попробуйте ещё раз.",
        ),
      );
  };

  const handleCloseOfficeBid = async () => {
    if (!selectedOfficeBid || closingOfficeBidId !== null) return;
    const bidId = selectedOfficeBid.id;
    setClosingOfficeBidId(bidId);
    setBidError(null);
    const result = await callApi(post(`/User/users/bids/${bidId}/close`), {
      notifications,
      successMessage: "Заявка закрыта",
    });
    setClosingOfficeBidId(null);
    if (!result.ok) {
      setBidError(
        getFriendlyErrorMessage(result.error, "Не удалось закрыть заявку."),
      );
      return;
    }
    setOfficeBids((current) => current.filter((bid) => bid.id !== bidId));
    setSelectedOfficeBid(null);
  };

  const heading = (icon: ReactNode, title: string, subtitle: string) => (
    <div className={styles.sectionHeading}>
      <span className={styles.sectionIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
  const fieldError = (field: "login" | "surname" | "name") =>
    errors.officeUser?.[field]?.message;

  if (pageLoading)
    return (
      <div className={styles.loadingState}>
        <LoadingSpinner label="Загружаем данные пользователя…" />
      </div>
    );
  if (loadError)
    return (
      <div className={styles.loadError}>
        <p role="alert">{loadError}</p>
        <Button onClick={() => setRetry((value) => value + 1)}>
          Повторить загрузку
        </Button>
      </div>
    );

  return (
    <div className={styles.page}>
      <form
        className={styles.editor}
        onSubmit={handleSubmit(onSubmit, (formErrors) => {
          if (formErrors.reportLinks) setActiveTab("reports");
        })}
        noValidate
        aria-busy={saving}
      >
        <fieldset className={styles.layout} disabled={saving}>
          <aside className={styles.identity} aria-label="Данные пользователя">
            {heading(
              <PersonOutlineIcon />,
              "Данные пользователя",
              "Учётная запись и личные данные",
            )}
            <div className={styles.identityFields}>
              <div className={styles.fullWidth}>
                <Input
                  label="Логин *"
                  autoComplete="username"
                  {...register("officeUser.login", {
                    required: "Логин обязателен",
                  })}
                  aria-invalid={Boolean(fieldError("login"))}
                  aria-describedby={
                    fieldError("login") ? "user-login-error" : undefined
                  }
                />
                {fieldError("login") && (
                  <p
                    className={styles.fieldError}
                    id="user-login-error"
                    role="alert"
                  >
                    {fieldError("login")}
                  </p>
                )}
              </div>
              <div className={styles.fullWidth}>
                <Input
                  label="Фамилия *"
                  autoComplete="family-name"
                  {...register("officeUser.surname", {
                    required: "Фамилия обязательна",
                  })}
                  aria-invalid={Boolean(fieldError("surname"))}
                  aria-describedby={
                    fieldError("surname") ? "user-surname-error" : undefined
                  }
                />
                {fieldError("surname") && (
                  <p
                    className={styles.fieldError}
                    id="user-surname-error"
                    role="alert"
                  >
                    {fieldError("surname")}
                  </p>
                )}
              </div>
              <div>
                <Input
                  label="Имя *"
                  autoComplete="given-name"
                  {...register("officeUser.name", {
                    required: "Имя обязательно",
                  })}
                  aria-invalid={Boolean(fieldError("name"))}
                  aria-describedby={
                    fieldError("name") ? "user-name-error" : undefined
                  }
                />
                {fieldError("name") && (
                  <p
                    className={styles.fieldError}
                    id="user-name-error"
                    role="alert"
                  >
                    {fieldError("name")}
                  </p>
                )}
              </div>
              <Input
                label="Отчество"
                autoComplete="additional-name"
                placeholder="Не указано"
                {...register("officeUser.patronymic")}
              />
              <Input
                label="Должность"
                wrapperClassName={styles.fullWidth}
                placeholder="Не указана"
                {...register("officeUser.position")}
                disabled
              />
            </div>
            <Toggle
              ariaLabel="Активность"
              checked={actual === 1}
              disabled={saving}
              onChange={(value) =>
                setValue("officeUser.actual", value ? 1 : 0, {
                  shouldDirty: true,
                })
              }
              containerClassName={`${styles.statusCard} ${actual === 1 ? styles.statusActive : ""}`}
              labelClassName={styles.statusLabel}
              label={
                <span className={styles.statusText}>
                  <strong>Активность</strong>
                  <span>
                    {actual === 1
                      ? "Пользователь активен"
                      : "Пользователь неактивен"}
                  </span>
                </span>
              }
            />
          </aside>
          <div className={styles.workspace}>
            <div
              className={styles.tabs}
              role="tablist"
              aria-label="Настройки пользователя"
            >
              {(
                [
                  {
                    key: "access",
                    label: "Доступ",
                    icon: <ShieldOutlinedIcon />,
                  },
                  {
                    key: "reports",
                    label: "Отчёты выручки",
                    icon: <InsightsOutlinedIcon />,
                  },
                  {
                    key: "bids",
                    label: "Заявки",
                    icon: <AssignmentOutlinedIcon />,
                  },
                ] as const
              ).map((tab, index, tabs) => (
                <button
                  key={tab.key}
                  id={`user-tab-${tab.key}`}
                  type="button"
                  role="tab"
                  className={styles.tab}
                  aria-selected={activeTab === tab.key}
                  aria-controls={`user-panel-${tab.key}`}
                  tabIndex={activeTab === tab.key ? 0 : -1}
                  onClick={() => setActiveTab(tab.key)}
                  onKeyDown={(event) => {
                    let nextIndex: number | undefined;
                    if (event.key === "ArrowRight")
                      nextIndex = (index + 1) % tabs.length;
                    if (event.key === "ArrowLeft")
                      nextIndex = (index - 1 + tabs.length) % tabs.length;
                    if (event.key === "Home") nextIndex = 0;
                    if (event.key === "End") nextIndex = tabs.length - 1;
                    if (nextIndex !== undefined) {
                      event.preventDefault();
                      const next = tabs[nextIndex].key;
                      setActiveTab(next);
                      document.getElementById(`user-tab-${next}`)?.focus();
                    }
                  }}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                  {tab.key === "reports" && (
                    <span className={styles.count}>
                      {
                        [
                          watch("reportLinks.profit"),
                          watch("reportLinks.profitPro"),
                        ].filter((link) => link?.trim()).length
                      }
                    </span>
                  )}
                  {tab.key === "bids" && (
                    <span className={styles.count}>{officeBids.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div
              id="user-panel-access"
              role="tabpanel"
              aria-labelledby="user-tab-access"
              hidden={activeTab !== "access"}
              className={`${styles.panel} ${styles.accessSections}`}
            >
              <section
                className={styles.accessSection}
                aria-label="Группы доступа"
              >
                {heading(
                  <GroupsOutlinedIcon />,
                  "Группы",
                  "Права пользователя в портале",
                )}
                <MultiplySelect
                  className={styles.accessPicker}
                  items={allGroups}
                  getKey={(group) => group.id}
                  getLabel={(group) => group.name || `Группа ${group.id}`}
                  selectedKeys={selectedGroupIds}
                  label="Поиск группы"
                  disabled={saving}
                  onChange={(ids) =>
                    setValue(
                      "officeUser.officeGroup",
                      allGroups.filter((group) => ids.includes(group.id)),
                      { shouldDirty: true },
                    )
                  }
                />
              </section>
              <section
                className={styles.accessSection}
                aria-label="Привязка торговых точек"
              >
                <div className={styles.bindingHeading}>
                  {heading(
                    <StorefrontOutlinedIcon />,
                    "Торговые точки",
                    isTt ? "Привязка включена" : "Привязка выключена",
                  )}
                  <Toggle
                    ariaLabel="Привязка ТТ"
                    checked={isTt}
                    disabled={saving}
                    onChange={(value) => {
                      setValue("isTT", value, { shouldDirty: true });
                      clearErrors("root.locations");
                    }}
                  />
                </div>
                {isTt ? (
                  <>
                    <Select
                      key={activeTab}
                      label="Тип привязки ТТ"
                      disabled={saving}
                      options={[
                        { value: "allTT", label: "Все ТТ" },
                        { value: "manualTT", label: "Выбрать ТТ" },
                      ]}
                      value={ttBinding}
                      onChange={(event) => {
                        const value = event.target.value as TtBinding;
                        setValue("ttBinding", value, { shouldDirty: true });
                        if (value === "allTT")
                          setValue("officeUser.locations", [], {
                            shouldDirty: true,
                          });
                        clearErrors("root.locations");
                      }}
                    />
                    {ttBinding === "manualTT" ? (
                      <MultiplySelect
                        className={styles.accessPicker}
                        items={allLocations}
                        getKey={(location) => location.guid}
                        getLabel={(location) => location.name || location.guid}
                        selectedKeys={selectedLocationGuids}
                        label="Поиск торговой точки"
                        disabled={saving}
                        onChange={(guids) => {
                          setValue(
                            "officeUser.locations",
                            allLocations.filter((location) =>
                              guids.includes(location.guid),
                            ),
                            { shouldDirty: true },
                          );
                          clearErrors("root.locations");
                        }}
                      />
                    ) : (
                      <div className={styles.infoState}>
                        <span className={styles.stateIcon} aria-hidden="true">
                          <StorefrontOutlinedIcon />
                        </span>
                        <h3>Все торговые точки</h3>
                        <p>
                          Новые точки будут доступны автоматически. Для
                          ограничения списка выберите «Выбрать ТТ».
                        </p>
                      </div>
                    )}
                    {errors.root?.locations && (
                      <p className={styles.fieldError} role="alert">
                        {errors.root.locations.message}
                      </p>
                    )}
                  </>
                ) : (
                  <div className={styles.connections}>
                    <p className={styles.hint}>
                      Включите привязку, чтобы настроить доступ к торговым
                      точкам.
                    </p>
                    <div className={styles.connectionHeading}>
                      <LinkOutlinedIcon aria-hidden="true" />
                      <h3>Связи с сотрудником</h3>
                    </div>
                    <dl className={styles.connectionList}>
                      <div>
                        <dt>Сотрудник торговой точки</dt>
                        <dd data-linked={Boolean(personalitiesGuid)}>
                          {personalitiesGuid
                            ? personality?.name || "Привязан"
                            : "Не привязан"}
                        </dd>
                      </div>
                      <div>
                        <dt>Сотрудник завода</dt>
                        <dd data-linked={factoryPersonId != null}>
                          {factoryPersonId != null
                            ? linkedFactoryName || "Привязан"
                            : "Не привязан"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </section>
            </div>
            <div
              id="user-panel-reports"
              role="tabpanel"
              aria-labelledby="user-tab-reports"
              hidden={activeTab !== "reports"}
              className={`${styles.panel} ${styles.reportLinksPanel}`}
            >
              {heading(
                <InsightsOutlinedIcon />,
                "Отчёты «Выручка»",
                isTt && ttBinding === "allTT"
                  ? "У пользователя доступ ко всем ТТ: он видит общий отчёт, персональные ссылки не используются"
                  : "Персональные отчёты Power BI только по точкам пользователя",
              )}
              <div className={styles.reportLinksFields}>
                {(
                  [
                    { key: "profit", label: "Выручка" },
                    { key: "profitPro", label: "Выручка Pro" },
                  ] as const
                ).map(({ key, label }) => {
                  const message = errors.reportLinks?.[key]?.message;
                  return (
                    <div key={key}>
                      <Input
                        label={label}
                        type="url"
                        autoComplete="off"
                        placeholder="https://app.powerbi.com/…"
                        {...register(`reportLinks.${key}`, {
                          validate: (value) =>
                            !value.trim() ||
                            /^https:\/\/\S+$/i.test(value.trim()) ||
                            "Ссылка должна начинаться с https:// — отчёт открывается внутри портала.",
                        })}
                        aria-invalid={Boolean(message)}
                        aria-describedby={
                          message ? `user-report-${key}-error` : undefined
                        }
                      />
                      {message && (
                        <p
                          className={styles.fieldError}
                          id={`user-report-${key}-error`}
                          role="alert"
                        >
                          {message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className={styles.hint}>
                Оставьте поле пустым, чтобы убрать отчёт у пользователя.
              </p>
            </div>
            <div
              id="user-panel-bids"
              role="tabpanel"
              aria-labelledby="user-tab-bids"
              hidden={activeTab !== "bids"}
              className={`${styles.panel} ${styles.bidsPanel}`}
            >
              {heading(
                <AssignmentOutlinedIcon />,
                "Заявки пользователя",
                "Откройте заявку, чтобы прочитать её и закрыть",
              )}
              {officeBids.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon} aria-hidden="true">
                    <TaskAltIcon />
                  </span>
                  <h3>Активных заявок нет</h3>
                  <p>Все текущие заявки обработаны</p>
                </div>
              ) : (
                <div className={styles.officeBidsList}>
                  {officeBids.map((bid) => (
                    <button
                      key={bid.id}
                      type="button"
                      className={styles.officeBidItem}
                      onClick={() => {
                        setSelectedOfficeBid(bid);
                        setBidError(null);
                      }}
                    >
                      <span className={styles.bidIcon} aria-hidden="true">
                        <AssignmentOutlinedIcon />
                      </span>
                      <span className={styles.bidContent}>
                        <span className={styles.bidMeta}>
                          <strong>Заявка № {bid.id}</strong>
                          <span>{getOfficeBidDateTime(bid)}</span>
                        </span>
                        <span className={styles.bidPreview}>
                          {getOfficeBidComment(bid)}
                        </span>
                      </span>
                      <ChevronRightIcon aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </fieldset>
        {saveError && (
          <p className={styles.errorBanner} role="alert">
            {saveError}
          </p>
        )}
        <footer className={styles.footer}>
          <div
            className={styles.saveState}
            data-dirty={isDirty || undefined}
            role="status"
          >
            {isDirty ? (
              <span className={styles.dirtyDot} />
            ) : (
              <CheckCircleOutlineIcon aria-hidden="true" />
            )}
            <span>
              {saving
                ? "Сохраняем изменения…"
                : isDirty
                  ? "Есть несохранённые изменения"
                  : isCreate
                    ? "Заполните данные пользователя"
                    : "Все изменения сохранены"}
            </span>
          </div>
          <div className={styles.actions}>
            <Button onClick={() => navigate("/Users")} disabled={saving}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isDirty && !isCreate}
              loading={saving}
              leadingIcon={<SaveOutlinedIcon />}
            >
              Сохранить
            </Button>
          </div>
        </footer>
      </form>
      <Modal
        isOpen={Boolean(selectedOfficeBid)}
        onClose={() => {
          if (closingOfficeBidId === null) setSelectedOfficeBid(null);
        }}
        title={selectedOfficeBid ? `Заявка № ${selectedOfficeBid.id}` : ""}
        size="sm"
      >
        {selectedOfficeBid && (
          <div className={styles.bidModal}>
            {getOfficeBidDateTime(selectedOfficeBid) && (
              <p className={styles.hint}>
                {getOfficeBidDateTime(selectedOfficeBid)}
              </p>
            )}
            <div className={styles.bidComment}>
              {getOfficeBidComment(selectedOfficeBid)}
            </div>
            {bidError && (
              <p className={styles.fieldError} role="alert">
                {bidError}
              </p>
            )}
            <div className={styles.modalActions}>
              <Button
                onClick={() => setSelectedOfficeBid(null)}
                disabled={closingOfficeBidId !== null}
              >
                Назад
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleCloseOfficeBid()}
                loading={closingOfficeBidId !== null}
              >
                Закрыть заявку
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
