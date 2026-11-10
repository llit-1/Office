import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useNotifications } from "@toolpad/core";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import Input from "../../Components/Input/Input";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import Toggle from "../../Components/Toggle/Toggle";
import { callApi, get, getFriendlyErrorMessage, post, put } from "../../Services/api";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import {
  formatPhone,
  phoneDigits,
  toInputDate,
  toNullableNumber,
  validateCode,
  validateCoordinate,
  validateDate,
} from "./ttEditUtils";
import {
  currentRequisite,
  RequisiteField,
  requisiteHint,
  RequisitesDialogs,
  type LookupItem,
  type Requisite,
  type RequisiteDraft,
  type RequisitesDialog,
} from "./components/Requisites";
import styles from "./TTEdit.module.css";

type LocationTypeOption = { guid: string; name: string };
type NxGroup = { id: string; name: string; takenBy: string | null };
type RestaurantOption = { rkCode: number; code: number | null; name: string; status: number | null };
type TTEditModel = {
  locationGuid: string;
  versionGuid: string;
  name: string;
  rk7Name?: string | null;
  nameOutdated?: boolean;
  altName: string | null;
  entities?: LookupItem[];
  address: string | null;
  rkCode: number | null;
  aggregatorsCode: number | null;
  obd: number | null;
  requisites?: Requisite[];
  nxLayout?: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  versionStartDate: string | null;
  versionEndDate: string | null;
  actual: number;
  delivery: number;
  locationTypeGuid: string | null;
  locationTypes: LocationTypeOption[];
};
/** Ответ сохранения: предупреждения приходят, когда смена группы NX применилась не ко всем. */
type TTSaveResponse = {
  nxWarnings?: string[];
};
type TTCreateLookups = {
  restaurants: RestaurantOption[];
  locationTypes: LocationTypeOption[];
  entities: LookupItem[];
};
type TTFormValues = {
  name: string;
  altName: string;
  entityGuid: string;
  nxLayout: string;
  address: string;
  rkCode: string;
  aggregatorsCode: string;
  obd: string;
  latitude: string;
  longitude: string;
  phone: string;
  versionStartDate: string;
  versionEndDate: string;
  actual: boolean;
  delivery: boolean;
  locationTypeGuid: string;
};

const EMPTY_VALUES: TTFormValues = {
  name: "",
  altName: "",
  entityGuid: "",
  nxLayout: "",
  address: "",
  rkCode: "",
  aggregatorsCode: "",
  obd: "",
  latitude: "",
  longitude: "",
  phone: "",
  versionStartDate: "",
  versionEndDate: "",
  actual: true,
  delivery: false,
  locationTypeGuid: "",
};

const requiredCode = (message: string) => (value: string) => {
  if (!value.trim()) return message;
  const valid = validateCode(value);
  if (valid !== true) return valid;
  return Number(value) > 0 || "Код должен быть больше нуля";
};

const RK_STATUS: Record<number, string> = { 0: "удалена", 1: "черновик", 2: "неактивна" };

function restaurantLabel(item: RestaurantOption) {
  const status = item.status === null ? undefined : RK_STATUS[item.status];
  return status ? `${item.name} · ${status}` : item.name;
}


export default function TTEdit() {
  const { id } = useParams();
  const isCreate = id === "new";
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const notifications = useNotifications();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [locationTypes, setLocationTypes] = useState<LocationTypeOption[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [entities, setEntities] = useState<LookupItem[]>([]);
  const [requisites, setRequisites] = useState<Requisite[]>([]);
  const [draft, setDraft] = useState<RequisiteDraft | null>(null);
  const [dialog, setDialog] = useState<RequisitesDialog>(null);
  const [rk7Name, setRk7Name] = useState<string | null>(null);
  const [nameOutdated, setNameOutdated] = useState(false);
  const [nxGroups, setNxGroups] = useState<NxGroup[] | null>(null);
  const [nxFailed, setNxFailed] = useState(false);
  const [syncingName, setSyncingName] = useState(false);
  const [versionGuid, setVersionGuid] = useState("");
  const [retry, setRetry] = useState(0);
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { isDirty, errors },
  } = useForm<TTFormValues>({
    mode: "onTouched",
    defaultValues: { ...EMPTY_VALUES, actual: false },
  });
  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: isCreate ? "Новая ТТ" : "Редактирование ТТ" }));
    dispatch(pathSet({ path: "/TT" }));
  }, [dispatch, isCreate]);
  useEffect(() => {
    if (!id) {
      setErrorText("Не указан идентификатор ТТ.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Группы NX грузятся после формы: недоступный NX не должен мешать её открыть.
    const loadNxGroups = async () => {
      setNxGroups(null);
      setNxFailed(false);
      const result = await callApi(
        get<NxGroup[]>("/TT/nx-groups", { params: isCreate ? undefined : { self: id } }),
      );
      if (cancelled) return;
      if (result.ok && Array.isArray(result.data)) setNxGroups(result.data);
      else setNxFailed(true);
    };
    const load = async () => {
      setLoading(true);
      setLoaded(false);
      setErrorText(null);
      setDraft(null);
      if (isCreate) {
        const result = await callApi(get<TTCreateLookups>("/TT/new"));
        if (cancelled) return;
        if (result.ok) {
          setRestaurants(result.data.restaurants ?? []);
          setLocationTypes(result.data.locationTypes ?? []);
          setEntities(result.data.entities ?? []);
          setRequisites([]);
          reset(EMPTY_VALUES);
          setLoaded(true);
          void loadNxGroups();
        } else setErrorText(getFriendlyErrorMessage(result.error));
        setLoading(false);
        return;
      }
      const result = await callApi(get<TTEditModel>(`/TT/${id}`));
      if (cancelled) return;
      if (result.ok) {
        const data = result.data;
        setLocationTypes(data.locationTypes ?? []);
        setEntities(data.entities ?? []);
        setRequisites(data.requisites ?? []);
        setRk7Name(data.rk7Name ?? null);
        setNameOutdated(!!data.nameOutdated);
        setVersionGuid(data.versionGuid);
        reset({
          ...EMPTY_VALUES,
          name: data.name ?? "",
          altName: data.altName ?? "",
          nxLayout: data.nxLayout ?? "",
          address: data.address ?? "",
          rkCode: data.rkCode?.toString() ?? "",
          aggregatorsCode: data.aggregatorsCode?.toString() ?? "",
          obd: data.obd?.toString() ?? "",
          latitude: data.latitude?.toString() ?? "",
          longitude: data.longitude?.toString() ?? "",
          phone: formatPhone(data.phone ?? ""),
          actual: data.actual === 1,
          delivery: data.delivery === 1,
          versionStartDate: toInputDate(data.versionStartDate),
          versionEndDate: toInputDate(data.versionEndDate),
          locationTypeGuid: data.locationTypeGuid ?? "",
        });
        setLoaded(true);
        void loadNxGroups();
      } else setErrorText(getFriendlyErrorMessage(result.error));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isCreate, reset, retry]);

  const syncName = async () => {
    if (!id || syncingName) return;
    setSyncingName(true);
    setErrorText(null);
    const result = await callApi(post<{ name: string; changed: boolean }>(`/TT/${id}/sync-name`));
    setSyncingName(false);
    if (!result.ok) {
      setErrorText(getFriendlyErrorMessage(result.error));
      return;
    }
    setValue("name", result.data.name);
    setNameOutdated(false);
  };
  const current = currentRequisite(requisites);
  const nxLayout = watch("nxLayout");
  const nxOptions = [
    { value: "", label: isCreate ? "Создать автоматически" : "Не привязана" },
    ...(nxGroups ?? [])
      .filter((group) => !group.takenBy)
      .map((group) => ({ value: group.id, label: group.name })),
    // Текущая группа видна, даже если список ещё не пришёл или в NX её больше нет.
    ...(nxLayout && !nxGroups?.some((group) => group.id === nxLayout)
      ? [{ value: nxLayout, label: nxGroups === null && !nxFailed ? "Загружаем…" : nxLayout }]
      : []),
  ];
  const entityName = (guid: string | null | undefined) => entities.find((item) => item.guid === guid)?.name ?? "";

  const onSubmit = handleSubmit(async (values) => {
    if (!id || !loaded || saving) return;
    setSaving(true);
    setErrorText(null);
    const fields = {
      altName: values.altName.trim() || null,
      nxLayout: values.nxLayout || null,
      address: values.address.trim(),
      aggregatorsCode: toNullableNumber(values.aggregatorsCode),
      latitude: toNullableNumber(values.latitude),
      longitude: toNullableNumber(values.longitude),
      phone: phoneDigits(values.phone) || null,
      actual: values.actual ? 1 : 0,
      delivery: values.delivery ? 1 : 0,
      versionStartDate: values.versionStartDate || null,
      versionEndDate: values.versionEndDate || null,
      locationTypeGuid: values.locationTypeGuid || null,
    };
    const result = await callApi(
      isCreate
        ? post("/TT", {
            ...fields,
            rkCode: toNullableNumber(values.rkCode),
            obd: toNullableNumber(values.obd),
            entityGuid: values.entityGuid || null,
          })
        : put<TTSaveResponse | undefined>(`/TT/${id}`, {
            ...fields,
            versionGuid,
            newRequisites: draft,
          }),
    );
    setSaving(false);
    if (!result.ok) {
      setErrorText(getFriendlyErrorMessage(result.error));
      return;
    }
    // ТТ сохранена, но группа NX применилась не ко всем пользователям — показываем, к кому нет.
    for (const warning of (result.data as TTSaveResponse | undefined)?.nxWarnings ?? []) {
      notifications.show(warning, { severity: "warning", autoHideDuration: 8000 });
    }
    navigate("/TT");
  });
  const fieldError = (name: keyof TTFormValues) =>
    errors[name] ? (
      <span id={`${name}-error`} className={styles.fieldError} role="alert">
        {errors[name]?.message}
      </span>
    ) : null;
  const errorProps = (name: keyof TTFormValues) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  if (loading)
    return (
      <div className={styles.loadingState}>
        <LoadingSpinner size={96} label={isCreate ? "Загружаем ТТ из R-Keeper…" : "Загружаем торговую точку…"} />
      </div>
    );
  if (!loaded)
    return (
      <div className={styles.wrapper}>
        <div className={styles.errorBanner} role="alert">
          {errorText}
        </div>
        <Button onClick={() => setRetry((value) => value + 1)}>
          Повторить загрузку
        </Button>
      </div>
    );
  return (
    <form
      className={styles.wrapper}
      onSubmit={onSubmit}
      noValidate
      aria-busy={saving}
    >
      {errorText && (
        <div className={styles.errorBanner} role="alert">
          {errorText}
        </div>
      )}
      <fieldset className={styles.fields} disabled={saving}>
        <section
          className={`${styles.formCard} ${styles.generalCard}`}
          aria-labelledby="tt-general"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <StorefrontOutlinedIcon />
            </span>
            <div>
              <h2 id="tt-general">Основные сведения</h2>
              <p>Название, тип и учётные коды</p>
            </div>
          </div>
          <div className={styles.identityGrid}>
            <div className={styles.field}>
              {isCreate ? (
                <Controller
                  name="rkCode"
                  control={control}
                  rules={{ required: "Выберите ТТ из R-Keeper" }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      label="ТТ из R-Keeper *"
                      disabled={saving}
                      options={restaurants.map((item) => ({
                        value: String(item.rkCode),
                        label: restaurantLabel(item),
                      }))}
                      placeholder={restaurants.length ? "Выберите ТТ" : "Все ТТ из R-Keeper уже добавлены"}
                      search
                      onChange={(event) => {
                        field.onChange(event);
                        const picked = restaurants.find((item) => String(item.rkCode) === event.target.value);
                        setValue("name", picked?.name ?? "", { shouldDirty: true });
                      }}
                      {...errorProps("rkCode")}
                    />
                  )}
                />
              ) : (
                <>
                  <Input
                    label="Название"
                    readOnly
                    disabled
                    value={watch("name")}
                    endAdornment={
                      <button
                        type="button"
                        className={styles.iconAction}
                        title="Обновить название из R-Keeper"
                        aria-label="Обновить название из R-Keeper"
                        data-busy={syncingName || undefined}
                        disabled={saving || syncingName}
                        onClick={() => void syncName()}
                      >
                        <SyncRoundedIcon />
                      </button>
                    }
                  />
                  {nameOutdated && (
                    <span className={styles.hint} data-pending title={rk7Name ?? undefined}>
                      В R-Keeper: {rk7Name}
                    </span>
                  )}
                </>
              )}
              {fieldError("rkCode")}
            </div>
            <div className={styles.field}>
              <Controller
                name="locationTypeGuid"
                control={control}
                rules={{ required: "Выберите тип ТТ" }}
                render={({ field }) => (
                  <Select
                    {...field}
                    label="Тип ТТ *"
                    disabled={saving}
                    options={locationTypes.map((item) => ({
                      value: item.guid,
                      label: item.name,
                    }))}
                    placeholder="Выберите тип"
                    search
                    {...errorProps("locationTypeGuid")}
                  />
                )}
              />
              {fieldError("locationTypeGuid")}
            </div>
            <Input
              label="Альтернативное название"
              maxLength={50}
              {...register("altName")}
            />
            {isCreate ? (
              <div className={styles.field}>
                <Controller
                  name="entityGuid"
                  control={control}
                  rules={{ required: "Выберите юридическое лицо" }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      label="Юридическое лицо *"
                      disabled={saving}
                      options={entities.map((item) => ({ value: item.guid, label: item.name }))}
                      placeholder="Выберите организацию"
                      search
                      {...errorProps("entityGuid")}
                    />
                  )}
                />
                {fieldError("entityGuid")}
              </div>
            ) : (
              <RequisiteField
                label="Юридическое лицо"
                value={draft ? entityName(draft.entityGuid) : current?.entityName ?? ""}
                draft={!!draft}
                disabled={saving}
                historyDisabled={!requisites.length && !draft}
                onEdit={() => setDialog("edit")}
                onHistory={() => setDialog("history")}
                onUndo={() => setDraft(null)}
              />
            )}
          </div>
          <div className={styles.codes}>
            <Input label="Код RK" readOnly disabled value={watch("rkCode")} />
            <div className={styles.field}>
              <Input
                label="Код ТТ"
                inputMode="numeric"
                {...register("aggregatorsCode", { validate: validateCode })}
                {...errorProps("aggregatorsCode")}
              />
              {fieldError("aggregatorsCode")}
            </div>
            {isCreate ? (
              <div className={styles.field}>
                <Input
                  label="Код OBD *"
                  inputMode="numeric"
                  {...register("obd", { validate: requiredCode("Укажите код OBD") })}
                  {...errorProps("obd")}
                />
                {fieldError("obd")}
              </div>
            ) : (
              <RequisiteField
                label="Код OBD"
                value={String((draft ? draft.obd : current?.obd) ?? "")}
                hint={requisiteHint(requisites, draft)}
                draft={!!draft}
                disabled={saving}
                historyDisabled={!requisites.length && !draft}
                onEdit={() => setDialog("edit")}
                onHistory={() => setDialog("history")}
                onUndo={() => setDraft(null)}
              />
            )}
          </div>
          {!isCreate && (
            <RequisitesDialogs
              open={dialog}
              onClose={() => setDialog(null)}
              withObd
              versions={requisites}
              entities={entities}
              draft={draft}
              onApply={setDraft}
            />
          )}
        </section>
        <section
          className={`${styles.formCard} ${styles.contactCard}`}
          aria-labelledby="tt-contact"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <PlaceOutlinedIcon />
            </span>
            <div>
              <h2 id="tt-contact">Контакты и расположение</h2>
              <p>Как связаться с точкой и где её найти</p>
            </div>
          </div>
          <div className={styles.contactGrid}>
            <Input
              label="Адрес"
              wrapperClassName={styles.addressField}
              autoComplete="street-address"
              maxLength={100}
              {...register("address")}
            />
            <div className={styles.field}>
              <Controller
                name="phone"
                control={control}
                rules={{
                  validate: (value) =>
                    !value ||
                    /^9\d{9}$/.test(phoneDigits(value)) ||
                    "Введите 10 цифр, начиная с 9",
                }}
                render={({ field }) => (
                  <Input
                    {...field}
                    label="Телефон"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="9XX XXX-XX-XX"
                    {...errorProps("phone")}
                    aria-describedby={
                      errors.phone ? "phone-error" : "phone-hint"
                    }
                    onChange={(event) => {
                      const input = event.target;
                      const raw = input.value;
                      const digits = phoneDigits(raw);
                      if (digits && !digits.startsWith("9")) return;
                      const digitsBeforeCaret = phoneDigits(
                        raw.slice(0, input.selectionStart ?? raw.length),
                      ).length;
                      const formatted = formatPhone(raw);
                      field.onChange(formatted);
                      requestAnimationFrame(() => {
                        let position = 0;
                        let count = 0;
                        while (
                          position < formatted.length &&
                          count < digitsBeforeCaret
                        ) {
                          if (/\d/.test(formatted[position])) count++;
                          position++;
                        }
                        input.setSelectionRange(position, position);
                      });
                    }}
                  />
                )}
              />
              {fieldError("phone") || (
                <span className={styles.hint} id="phone-hint">
                  10 цифр с 9 · без +7 и 8
                </span>
              )}
            </div>
            {(
              [
                ["latitude", "Широта", 90, "55,755826"],
                ["longitude", "Долгота", 180, "37,617300"],
              ] as const
            ).map(([name, label, limit, placeholder]) => (
              <div key={name} className={styles.field}>
                <Input
                  label={label}
                  inputMode="decimal"
                  placeholder={placeholder}
                  {...register(name, {
                    validate: (value) => validateCoordinate(value, limit),
                  })}
                  {...errorProps(name)}
                  aria-describedby={
                    errors[name] ? `${name}-error` : `${name}-hint`
                  }
                />
                {fieldError(name) || (
                  <span className={styles.hint} id={`${name}-hint`}>
                    От −{limit} до {limit}°
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
        <section
          className={`${styles.formCard} ${styles.operationCard}`}
          aria-labelledby="tt-operation"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <TuneOutlinedIcon />
            </span>
            <div>
              <h2 id="tt-operation">Параметры работы</h2>
              <p>Доступность и период работы</p>
            </div>
          </div>
          <div className={styles.statusGrid}>
            <Controller
              name="delivery"
              control={control}
              render={({ field }) => (
                <Toggle
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={saving}
                  ariaLabel="Доставка"
                  containerClassName={`${styles.statusCard} ${field.value ? styles.statusActive : ""}`}
                  labelClassName={styles.statusLabel}
                  label={
                    <>
                      <span className={styles.statusIcon} aria-hidden="true">
                        <LocalShippingOutlinedIcon />
                      </span>
                      <span className={styles.statusText}>
                        <strong>Доставка</strong>
                        <span>{field.value ? "Включена" : "Выключена"}</span>
                      </span>
                    </>
                  }
                />
              )}
            />
            <Controller
              name="actual"
              control={control}
              render={({ field }) => (
                <Toggle
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={saving}
                  ariaLabel="Актуальность"
                  containerClassName={`${styles.statusCard} ${field.value ? styles.statusActive : ""}`}
                  labelClassName={styles.statusLabel}
                  label={
                    <>
                      <span className={styles.statusIcon} aria-hidden="true">
                        <CheckCircleOutlineOutlinedIcon />
                      </span>
                      <span className={styles.statusText}>
                        <strong>Актуальность</strong>
                        <span>
                          {field.value
                            ? "Точка актуальна"
                            : "Точка неактуальна"}
                        </span>
                      </span>
                    </>
                  }
                />
              )}
            />
          </div>
          <div className={styles.field}>
            <Controller
              name="nxLayout"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  label="Группа NX"
                  disabled={saving || nxFailed || nxGroups === null}
                  options={nxOptions}
                  search
                />
              )}
            />
            {nxFailed && <span className={styles.hint}>NX недоступен, группу сейчас не поменять</span>}
          </div>
          <div className={styles.period}>
            <h3>Период работы</h3>
            <div className={styles.grid}>
              <div className={styles.field}>
                <Input
                  label="Дата открытия"
                  type="date"
                  min="1753-01-01"
                  max="9999-12-31"
                  {...register("versionStartDate", {
                    deps: ["versionEndDate"],
                    validate: validateDate,
                  })}
                  {...errorProps("versionStartDate")}
                />
                {fieldError("versionStartDate")}
              </div>
              <div className={styles.field}>
                <Input
                  label="Дата закрытия"
                  type="date"
                  min="1753-01-01"
                  max="9999-12-31"
                  {...register("versionEndDate", {
                    validate: (value) =>
                      validateDate(value) !== true
                        ? validateDate(value)
                        : !value ||
                          !getValues("versionStartDate") ||
                          value >= getValues("versionStartDate") ||
                          "Дата закрытия не может быть раньше даты открытия",
                  })}
                  {...errorProps("versionEndDate")}
                />
                {fieldError("versionEndDate")}
              </div>
            </div>
            <p className={styles.hint}>
              Для работающей точки дату закрытия можно оставить пустой.
            </p>
          </div>
        </section>
      </fieldset>
      <footer className={styles.footer}>
        <span
          className={styles.saveHint}
          role="status"
          data-dirty={isDirty || draft ? true : undefined}
        >
          {isDirty || draft ? (
            <span className={styles.dirtyDot} aria-hidden="true" />
          ) : (
            <CheckCircleOutlineOutlinedIcon aria-hidden="true" />
          )}
          {saving
            ? "Сохраняем изменения…"
            : isDirty || draft
              ? "Есть несохранённые изменения"
              : isCreate
                ? "Заполните данные"
                : "Все изменения сохранены"}
        </span>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => navigate("/TT")}
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={(!isDirty && !isCreate && !draft) || saving}
            loading={saving}
            leadingIcon={<SaveOutlinedIcon />}
          >
            {isCreate ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </footer>
    </form>
  );
}
