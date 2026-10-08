import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import Input from "../../Components/Input/Input";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import Toggle from "../../Components/Toggle/Toggle";
import { callApi, get, getFriendlyErrorMessage, put } from "../../Services/api";
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
import styles from "./TTEdit.module.css";

type LocationTypeOption = { guid: string; name: string };
type TTEditModel = {
  locationGuid: string;
  versionGuid: string;
  name: string;
  address: string | null;
  rkCode: number | null;
  aggregatorsCode: number | null;
  obd: number | null;
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
type TTFormValues = {
  name: string;
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

export default function TTEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [locationTypes, setLocationTypes] = useState<LocationTypeOption[]>([]);
  const [versionGuid, setVersionGuid] = useState("");
  const [retry, setRetry] = useState(0);
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { isDirty, errors },
  } = useForm<TTFormValues>({
    mode: "onTouched",
    defaultValues: {
      name: "",
      address: "",
      rkCode: "",
      aggregatorsCode: "",
      obd: "",
      latitude: "",
      longitude: "",
      phone: "",
      versionStartDate: "",
      versionEndDate: "",
      actual: false,
      delivery: false,
      locationTypeGuid: "",
    },
  });
  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Редактирование ТТ" }));
    dispatch(pathSet({ path: "/TT" }));
  }, [dispatch]);
  useEffect(() => {
    if (!id) {
      setErrorText("Не указан идентификатор ТТ.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoaded(false);
      setErrorText(null);
      const result = await callApi(get<TTEditModel>(`/TT/${id}`));
      if (cancelled) return;
      if (result.ok) {
        const data = result.data;
        setLocationTypes(data.locationTypes ?? []);
        setVersionGuid(data.versionGuid);
        reset({
          name: data.name ?? "",
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
      } else setErrorText(getFriendlyErrorMessage(result.error));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, reset, retry]);
  const onSubmit = handleSubmit(async (values) => {
    if (!id || !loaded || saving) return;
    setSaving(true);
    setErrorText(null);
    const result = await callApi(
      put(`/TT/${id}`, {
        versionGuid,
        name: values.name.trim(),
        address: values.address.trim(),
        rkCode: toNullableNumber(values.rkCode),
        aggregatorsCode: toNullableNumber(values.aggregatorsCode),
        obd: toNullableNumber(values.obd),
        latitude: toNullableNumber(values.latitude),
        longitude: toNullableNumber(values.longitude),
        phone: phoneDigits(values.phone) || null,
        actual: values.actual ? 1 : 0,
        delivery: values.delivery ? 1 : 0,
        versionStartDate: values.versionStartDate || null,
        versionEndDate: values.versionEndDate || null,
        locationTypeGuid: values.locationTypeGuid || null,
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setErrorText(getFriendlyErrorMessage(result.error));
      return;
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
        <LoadingSpinner size={96} label="Загружаем торговую точку…" />
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
              <Input
                label="Название *"
                maxLength={50}
                {...register("name", {
                  validate: (value) => !!value.trim() || "Укажите название ТТ",
                })}
                {...errorProps("name")}
              />
              {fieldError("name")}
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
          </div>
          <div className={styles.codes}>
            {(
              [
                ["rkCode", "Код RK"],
                ["aggregatorsCode", "Код ТТ"],
                ["obd", "Код OBD"],
              ] as const
            ).map(([name, label]) => (
              <div key={name} className={styles.field}>
                <Input
                  label={label}
                  inputMode="numeric"
                  {...register(name, { validate: validateCode })}
                  {...errorProps(name)}
                />
                {fieldError(name)}
              </div>
            ))}
          </div>
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
          data-dirty={isDirty || undefined}
        >
          {isDirty ? (
            <span className={styles.dirtyDot} aria-hidden="true" />
          ) : (
            <CheckCircleOutlineOutlinedIcon aria-hidden="true" />
          )}
          {saving
            ? "Сохраняем изменения…"
            : isDirty
              ? "Есть несохранённые изменения"
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
            disabled={!isDirty || saving}
            loading={saving}
            leadingIcon={<SaveOutlinedIcon />}
          >
            Сохранить
          </Button>
        </div>
      </footer>
    </form>
  );
}
