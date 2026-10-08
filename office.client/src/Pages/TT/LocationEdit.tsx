import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import {
  createLocation,
  getLocation,
  getLocationLookups,
  getTTErrorMessage,
  updateLocation,
  type LocationGroup,
  type LocationLookups,
} from "./ttApi";
import { toInputDate, toNullableNumber, validateCoordinate, validateDate } from "./ttEditUtils";
import styles from "./TTEdit.module.css";

type LocationFormValues = {
  name: string;
  locationTypeGuid: string;
  entityGuid: string;
  parentGuid: string;
  address: string;
  latitude: string;
  longitude: string;
  versionStartDate: string;
  versionEndDate: string;
};

const GROUP_TEXT: Record<LocationGroup, { createTitle: string; editTitle: string; subject: string; loading: string }> = {
  factory: { createTitle: "Новый завод или цех", editTitle: "Редактирование завода", subject: "завода", loading: "Загружаем завод…" },
  office: { createTitle: "Новый офис или кабинет", editTitle: "Редактирование офиса", subject: "офиса", loading: "Загружаем офис…" },
};

const EMPTY_VALUES: LocationFormValues = {
  name: "",
  locationTypeGuid: "",
  entityGuid: "",
  parentGuid: "",
  address: "",
  latitude: "",
  longitude: "",
  versionStartDate: "",
  versionEndDate: "",
};

const isLocationGroup = (value: string | undefined): value is LocationGroup => value === "factory" || value === "office";

export default function LocationEdit() {
  const { group: groupParam, id } = useParams();
  const group = isLocationGroup(groupParam) ? groupParam : null;
  const isCreate = !id || id === "new";
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [lookups, setLookups] = useState<LocationLookups | null>(null);
  const [versionGuid, setVersionGuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const listPath = `/TT?tab=${group ?? "trade"}`;

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { isDirty, errors },
  } = useForm<LocationFormValues>({ mode: "onTouched", defaultValues: EMPTY_VALUES });

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: listPath }));
    dispatch(titleSet({ title: group ? (isCreate ? GROUP_TEXT[group].createTitle : GROUP_TEXT[group].editTitle) : "Локация" }));
  }, [dispatch, group, isCreate, listPath]);

  useEffect(() => {
    if (!group) {
      setLoadError("Неизвестный раздел. Вернитесь к списку и откройте запись заново.");
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [nextLookups, location] = await Promise.all([
          getLocationLookups(group, isCreate ? undefined : id),
          isCreate ? Promise.resolve(null) : getLocation(group, id!),
        ]);
        if (cancelled) return;
        setLookups(nextLookups);
        setVersionGuid(location?.versionGuid ?? null);
        reset(location
          ? {
            name: location.name ?? "",
            locationTypeGuid: location.locationTypeGuid ?? "",
            entityGuid: location.entityGuid ?? "",
            parentGuid: location.parentGuid ?? "",
            address: location.address ?? "",
            latitude: location.latitude?.toString() ?? "",
            longitude: location.longitude?.toString() ?? "",
            versionStartDate: toInputDate(location.versionStartDate),
            versionEndDate: toInputDate(location.versionEndDate),
          }
          : { ...EMPTY_VALUES, locationTypeGuid: nextLookups.types.length === 1 ? nextLookups.types[0].guid : "" });
      } catch (error) {
        if (!cancelled) setLoadError(getTTErrorMessage(error, "Не удалось загрузить данные."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [group, id, isCreate, reset, retry]);

  const onSubmit = handleSubmit(async (values) => {
    if (!group || saving) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      versionGuid,
      name: values.name.trim(),
      locationTypeGuid: values.locationTypeGuid,
      entityGuid: values.entityGuid,
      parentGuid: values.parentGuid || null,
      address: values.address.trim() || null,
      latitude: toNullableNumber(values.latitude),
      longitude: toNullableNumber(values.longitude),
      versionStartDate: values.versionStartDate || null,
      versionEndDate: values.versionEndDate || null,
    };
    try {
      if (isCreate) await createLocation(group, payload);
      else await updateLocation(group, id!, payload);
      navigate(listPath);
    } catch (error) {
      setSaveError(getTTErrorMessage(error, "Не удалось сохранить. Попробуйте ещё раз."));
      setSaving(false);
    }
  });

  const fieldError = (name: keyof LocationFormValues) =>
    errors[name] ? (
      <span id={`${name}-error`} className={styles.fieldError} role="alert">
        {errors[name]?.message}
      </span>
    ) : null;

  const errorProps = (name: keyof LocationFormValues) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <LoadingSpinner size={96} label={group ? GROUP_TEXT[group].loading : "Загружаем…"} />
      </div>
    );
  }

  if (loadError || !lookups || !group) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.errorBanner} role="alert">{loadError}</div>
        <Button onClick={() => setRetry((value) => value + 1)}>Повторить загрузку</Button>
      </div>
    );
  }

  const text = GROUP_TEXT[group];
  const options = (items: LookupItemLike[]) => items.map((item) => ({ value: item.guid, label: item.name }));

  return (
    <form className={styles.wrapper} onSubmit={onSubmit} noValidate aria-busy={saving}>
      {saveError && <div className={styles.errorBanner} role="alert">{saveError}</div>}
      <fieldset className={styles.fields} disabled={saving}>
        <section className={`${styles.formCard} ${styles.generalCard}`} aria-labelledby="location-general">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true"><BusinessOutlinedIcon /></span>
            <div>
              <h2 id="location-general">Основные сведения</h2>
              <p>Название, тип и принадлежность {text.subject}</p>
            </div>
          </div>
          <div className={styles.identityGrid}>
            <div className={styles.field}>
              <Input
                label="Название *"
                maxLength={50}
                {...register("name", { validate: (value) => !!value.trim() || "Укажите название" })}
                {...errorProps("name")}
              />
              {fieldError("name")}
            </div>
            <div className={styles.field}>
              <Controller
                name="locationTypeGuid"
                control={control}
                rules={{ required: "Выберите тип" }}
                render={({ field }) => (
                  <Select {...field} label="Тип *" options={options(lookups.types)} placeholder="Выберите тип" disabled={saving} {...errorProps("locationTypeGuid")} />
                )}
              />
              {fieldError("locationTypeGuid")}
            </div>
            <div className={styles.field}>
              <Controller
                name="entityGuid"
                control={control}
                rules={{ required: "Выберите юридическое лицо" }}
                render={({ field }) => (
                  <Select {...field} label="Юридическое лицо *" options={options(lookups.entities)} placeholder="Выберите организацию" search disabled={saving} {...errorProps("entityGuid")} />
                )}
              />
              {fieldError("entityGuid")}
            </div>
            <div className={styles.field}>
              <Controller
                name="parentGuid"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    label="Принадлежит"
                    options={[{ value: "", label: "Не указано" }, ...options(lookups.parents)]}
                    placeholder="Не указано"
                    search
                    disabled={saving}
                  />
                )}
              />
            </div>
          </div>
        </section>

        <section className={`${styles.formCard} ${styles.contactCard}`} aria-labelledby="location-place">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true"><PlaceOutlinedIcon /></span>
            <div>
              <h2 id="location-place">Расположение</h2>
              <p>Адрес и координаты</p>
            </div>
          </div>
          <div className={styles.contactGrid}>
            <Input label="Адрес" wrapperClassName={styles.addressField} autoComplete="street-address" maxLength={100} {...register("address")} />
            {(
              [
                ["latitude", "Широта", 90, "59,938784"],
                ["longitude", "Долгота", 180, "30,314997"],
              ] as const
            ).map(([name, label, limit, placeholder]) => (
              <div key={name} className={styles.field}>
                <Input
                  label={label}
                  inputMode="decimal"
                  placeholder={placeholder}
                  {...register(name, { validate: (value) => validateCoordinate(value, limit) })}
                  {...errorProps(name)}
                />
                {fieldError(name)}
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.formCard} ${styles.operationCard}`} aria-labelledby="location-period">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true"><EventOutlinedIcon /></span>
            <div>
              <h2 id="location-period">Период работы</h2>
              <p>Даты открытия и закрытия</p>
            </div>
          </div>
          <div className={styles.period}>
            <div className={styles.grid}>
              <div className={styles.field}>
                <Input
                  label="Дата открытия"
                  type="date"
                  min="1753-01-01"
                  max="9999-12-31"
                  {...register("versionStartDate", { deps: ["versionEndDate"], validate: validateDate })}
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
                        : !value || !getValues("versionStartDate") || value >= getValues("versionStartDate")
                          || "Дата закрытия не может быть раньше даты открытия",
                  })}
                  {...errorProps("versionEndDate")}
                />
                {fieldError("versionEndDate")}
              </div>
            </div>
            <p className={styles.hint}>Для работающей локации дату закрытия можно оставить пустой.</p>
          </div>
        </section>
      </fieldset>
      <footer className={styles.footer}>
        <span className={styles.saveHint} role="status" data-dirty={isDirty || undefined}>
          {isDirty ? <span className={styles.dirtyDot} aria-hidden="true" /> : <CheckCircleOutlineOutlinedIcon aria-hidden="true" />}
          {saving ? "Сохраняем…" : isDirty ? "Есть несохранённые изменения" : isCreate ? "Заполните данные" : "Все изменения сохранены"}
        </span>
        <div className={styles.actions}>
          <Button variant="secondary" disabled={saving} onClick={() => navigate(listPath)}>Отмена</Button>
          <Button
            variant="primary"
            type="submit"
            disabled={(!isDirty && !isCreate) || saving}
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

type LookupItemLike = { guid: string; name: string };
