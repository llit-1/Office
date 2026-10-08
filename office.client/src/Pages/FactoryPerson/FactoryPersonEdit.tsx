import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, Controller, type FieldErrors } from "react-hook-form";
import Webcam from "react-webcam";
import FactoryPersonPhotoCrop from "./FactoryPersonPhotoCrop";
import Input from "../../Components/Input/Input";
import Button from "../../Components/Button/Button";
import Select from "../../Components/Select/Select";
import {
  get,
  post,
  put,
  callApi,
  getFriendlyErrorMessage,
} from "../../Services/api";
import { FactoryPersonWithNav } from "../../Interfaces/Users";
import styles from "./FactoryPersonEdit.module.css";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import useLoadingPresence from "../../Components/LoadingSpinner/useLoadingPresence";
import Modal from "../../Components/Modal/Modal";
import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";

interface Option {
  id: number;
  name: string;
  citizenshipTypeId?: number;
}

const normalizeOptions = (value: unknown): Option[] => {
  const list = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];

  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const option = item as Record<string, unknown>;
    const id = Number(option.id ?? option.Id);
    const name = String(option.name ?? option.Name ?? "").trim();
    if (!Number.isFinite(id) || !name) return [];

    return [
      {
        id,
        name,
        citizenshipTypeId:
          option.citizenshipTypeId != null
            ? Number(option.citizenshipTypeId)
            : undefined,
      },
    ];
  });
};

interface PersonalityFactoryEditModel {
  factoryPerson?: FactoryPersonWithNav | null;
  factoryDepartments?: Option[];
  factoryWorkshops?: Option[];
  factoryJobTitles?: Option[];
  factoryCitizenshipTypes?: Option[];
  factoryCitizenships?: Option[];
  factoryEntities?: Option[];
  factoryDocumentTypes?: Option[];
  factoryBanks?: Option[];
  factorySKUDGroups?: Option[];
  isFactorySecurity?: boolean;
}

interface PersonalityFactoryAddModel {
  factoryDepartments?: Option[];
  factoryCitizenshipTypes?: Option[];
  factoryEntities?: Option[];
  factoryDocumentTypes?: Option[];
  factoryBanks?: Option[];
  factorySKUDGroups?: Option[];
}

export default function FactoryPersonForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const loadingPresence = useLoadingPresence(loading);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    watch,
    reset,
    formState: { isDirty, errors, isSubmitted },
  } = useForm<Partial<FactoryPersonWithNav>>();
  const [activeTab, setActiveTab] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [initialPhoto, setInitialPhoto] = useState<string | null>(null);

  const [isSecurity, setIsSecurity] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [options, setOptions] = useState({
    departments: [] as Option[],
    workshops: [] as Option[],
    jobTitles: [] as Option[],
    entities: [] as Option[],
    documentTypes: [] as Option[],
    banks: [] as Option[],
    skudGroups: [] as Option[],
    citizenshipTypes: [] as Option[],
    citizenships: [] as Option[],
  });

  const [disabled, setDisabled] = useState({
    workshop: true,
    job: true,
    citizenship: true,
  });
  const isInitializingRef = useRef(true);

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const capturePhoto = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setTempPhoto(imageSrc);
      setShowCamera(false);
    }
  };

  const cancelCamera = () => setShowCamera(false);
  const openCamera = () => {
    setCameraReady(false);
    setCameraError(null);
    setShowCamera(true);
  };

  const uploadPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result);
      const preview = new Image();
      preview.onload = () => {
        setTempPhoto(source);
      };
      preview.onerror = () =>
        setModalError(
          "Не удалось открыть изображение. Выберите фото в формате JPEG, PNG или WebP.",
        );
      preview.src = source;
    };
    reader.onerror = () =>
      setModalError("Не удалось прочитать фото. Попробуйте ещё раз.");
    reader.readAsDataURL(file);
  };

  const departmentId = watch("factoryDepartment");
  const citizenshipTypeId = watch("factoryCitizenshipType");

  // Load the employee and reference lists together; failed loading must not expose an empty editor.
  useEffect(() => {
    dispatch(pathSet({ path: "/FactoryPerson" }));
    dispatch(
      titleSet({
        title: isEdit ? "Редактирование сотрудника" : "Создание сотрудника",
      }),
    );
    dispatch(visibleSet({ visible: true }));
    let cancelled = false;
    let initializationTimer: ReturnType<typeof setTimeout> | undefined;
    isInitializingRef.current = true;
    setLoading(true);
    setLoadError(null);
    const load = async () => {
      const result = await callApi(
        get<PersonalityFactoryEditModel & PersonalityFactoryAddModel>(
          isEdit
            ? `/PersonalityFactory/persons/${id}`
            : "/PersonalityFactory/addmodel",
        ),
      );
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(getFriendlyErrorMessage(result.error));
        setLoading(false);
        return;
      }
      const model = result.data;
      const person = model.factoryPerson;
      if (isEdit && !person) {
        setLoadError("Сотрудник не найден.");
        setLoading(false);
        return;
      }
      setOptions({
        departments: model.factoryDepartments ?? [],
        workshops: model.factoryWorkshops ?? [],
        jobTitles: model.factoryJobTitles ?? [],
        entities: model.factoryEntities ?? [],
        documentTypes: model.factoryDocumentTypes ?? [],
        banks: model.factoryBanks ?? [],
        skudGroups: model.factorySKUDGroups ?? [],
        citizenshipTypes: model.factoryCitizenshipTypes ?? [],
        citizenships: model.factoryCitizenships ?? [],
      });
      const citizenship = model.factoryCitizenships?.find(
        (item) => item.id === person?.factoryCitizenship,
      );
      reset(
        person
          ? {
              ...person,
              factoryCitizenshipType:
                citizenship?.citizenshipTypeId ?? person.factoryCitizenshipType,
              birthdate: person.birthdate?.split("T")[0],
              passportDate: person.passportDate?.split("T")[0],
              hostelChekin: person.hostelChekin?.split("T")[0],
              hostelCheckOut: person.hostelCheckOut?.split("T")[0],
              hiringDate: person.hiringDate?.split("T")[0],
              dismissedDate: person.dismissedDate?.split("T")[0],
            }
          : {},
      );
      setPhoto(person?.photo ?? null);
      setInitialPhoto(person?.photo ?? null);
      setDisabled({
        workshop: !person?.factoryDepartment,
        job: !person?.factoryWorkshop,
        citizenship: !person?.factoryCitizenshipType && !citizenship,
      });
      setIsSecurity(model.isFactorySecurity ?? false);
      setLoading(false);
      initializationTimer = setTimeout(() => {
        isInitializingRef.current = false;
      }, 0);
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(initializationTimer);
    };
  }, [id, isEdit, dispatch, reset, retry]);
  const loadWorkshops = async (nextDepartmentId: number | undefined) => {
    setOptions((o) => ({ ...o, workshops: [], jobTitles: [] }));
    setDisabled((d) => ({ ...d, workshop: true, job: true }));
    setValue("factoryWorkshop", undefined);
    setValue("factoryJobTitle", undefined);

    if (!nextDepartmentId) {
      return;
    }

    const res = await callApi(
      get<Option[]>(`/PersonalityFactory/workshops/${nextDepartmentId}`),
    );
    const workshops = normalizeOptions(res.ok ? res.data : []);
    setOptions((o) => ({ ...o, workshops }));
    setDisabled((d) => ({ ...d, workshop: workshops.length === 0 }));
  };

  const loadJobTitles = async (
    nextDepartmentId: number | undefined,
    nextWorkshopId: number | undefined,
  ) => {
    setOptions((o) => ({ ...o, jobTitles: [] }));
    setDisabled((d) => ({ ...d, job: true }));
    setValue("factoryJobTitle", undefined);

    if (!nextDepartmentId || !nextWorkshopId) {
      return;
    }

    const res = await callApi(
      get<Option[]>(
        `/PersonalityFactory/jobtitles?department=${nextDepartmentId}&workshop=${nextWorkshopId}`,
      ),
    );
    const jobTitles = normalizeOptions(res.ok ? res.data : []);
    setOptions((o) => ({ ...o, jobTitles }));
    setDisabled((d) => ({ ...d, job: jobTitles.length === 0 }));

    if (jobTitles.length === 1) {
      setValue("factoryJobTitle", jobTitles[0].id, { shouldDirty: true });
    }
  };

  const handleDepartmentChange = (nextDepartmentId: number | undefined) => {
    void loadWorkshops(nextDepartmentId);
  };

  const handleWorkshopChange = (nextWorkshopId: number | undefined) => {
    const currentDepartmentId = getValues("factoryDepartment");
    const nextDepartmentId = currentDepartmentId
      ? Number(currentDepartmentId)
      : undefined;
    void loadJobTitles(nextDepartmentId, nextWorkshopId);
  };

  /*
   * Зависимые списки загружаются непосредственно обработчиками Select.
   * Это гарантирует, что запрос отправляется в тот же момент, когда пользователь
   * выбирает значение, независимо от синхронизации watch() в react-hook-form.
   */
  useEffect(() => {
    if (isInitializingRef.current) return;
    if (!departmentId) {
      setOptions((o) => ({ ...o, workshops: [], jobTitles: [] }));
      setDisabled((d) => ({ ...d, workshop: true, job: true }));
      setValue("factoryWorkshop", undefined);
      setValue("factoryJobTitle", undefined);
    }
  }, [departmentId, setValue]);

  // Загрузка гражданств
  useEffect(() => {
    if (isInitializingRef.current) return;
    if (!citizenshipTypeId) {
      setOptions((o) => ({ ...o, citizenships: [] }));
      setDisabled((d) => ({ ...d, citizenship: true }));
      setValue("factoryCitizenship", undefined);
      return;
    }
    callApi(
      get<Option[]>(`/PersonalityFactory/citizenships/${citizenshipTypeId}`),
    ).then((res) => {
      setOptions((o) => ({
        ...o,
        citizenships: res.ok && res.data ? res.data : [],
      }));
      setDisabled((d) => ({ ...d, citizenship: !res.ok || !res.data?.length }));
    });
  }, [citizenshipTypeId, setValue]);

  const onlyRussian = (v: string) =>
    v.replace(/[a-zA-Z0-9.,]/g, "").replace(/\s+/g, " ");
  const onlyDigits = (v: string) => v.replace(/[^\d]/g, "");

  const formatPhone = (v: string) => {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 8)
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  };

  const formatCard = (v: string) => {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return "";
    return digits.slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const getSelectPlaceholder = (label: string, dis?: boolean) => {
    if (dis && label === "Участок") return "Сначала выберите отдел";
    if (dis && label === "Должность") return "Сначала выберите участок";
    if (dis && label === "Гражданство")
      return "Сначала выберите тип гражданства";
    return `Выберите: ${label.toLocaleLowerCase("ru-RU")}`;
  };

  const renderNumberSelect = (
    field: { value: unknown; onChange: (value: unknown) => void },
    opts: Option[],
    label: string,
    dis?: boolean,
    onValueChange?: (value: number | undefined) => void,
    required = false,
  ) => (
    <Select
      key={`${activeTab}-${label}-${dis ? "disabled" : "enabled"}-${opts.map((option) => option.id).join("-")}`}
      label={required ? `${label} *` : label}
      {...field}
      value={field.value != null ? String(field.value) : ""}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
        const value =
          e.target.value !== "" ? Number(e.target.value) : undefined;
        field.onChange(value);
        onValueChange?.(value);
      }}
      options={opts.map((o) => ({ value: String(o.id), label: o.name }))}
      disabled={dis || saving}
      placeholder={getSelectPlaceholder(label, dis)}
      search
    />
  );

  // Обязательные поля карточки (в БД NOT NULL) и вкладка, на которой каждое из них лежит.
  const requiredFieldTabs: Partial<Record<keyof FactoryPersonWithNav, number>> = {
    surname: 0,
    name: 0,
    birthdate: 0,
    factoryEntity: 0,
    hiringDate: 0,
    factoryCitizenshipType: 1,
    factoryCitizenship: 1,
    factoryDocumentType: 1,
    passport: 1,
  };

  // Если ошибки только на скрытой вкладке — переключаемся на неё, иначе пользователь их не увидит.
  const onInvalid = (formErrors: FieldErrors<Partial<FactoryPersonWithNav>>) => {
    const tabs = Object.keys(formErrors).map(
      (name) => requiredFieldTabs[name as keyof FactoryPersonWithNav] ?? 0,
    );
    if (tabs.length && !tabs.includes(activeTab)) setActiveTab(Math.min(...tabs));
  };

  const withFieldError = (
    name: keyof FactoryPersonWithNav,
    control: React.ReactNode,
  ) => {
    const message = errors[name]?.message;
    return (
      <div className={`${styles.field} ${message ? styles.invalid : ""}`}>
        {control}
        {message ? (
          <p className={styles.fieldError} role="alert">
            {String(message)}
          </p>
        ) : null}
      </div>
    );
  };

  const onSubmit = async (data: Partial<FactoryPersonWithNav>) => {
    if (saving) return;
    setSaving(true);
    setModalError(null);
    try {
      const payload = {
        ...data,
        id: isEdit ? Number(id) : undefined,
        factoryDepartment: data.factoryDepartment
          ? Number(data.factoryDepartment)
          : null,
        factoryWorkshop: data.factoryWorkshop
          ? Number(data.factoryWorkshop)
          : null,
        factoryJobTitle: data.factoryJobTitle
          ? Number(data.factoryJobTitle)
          : null,
        factoryCitizenshipType: data.factoryCitizenshipType
          ? Number(data.factoryCitizenshipType)
          : null,
        factoryCitizenship: data.factoryCitizenship
          ? Number(data.factoryCitizenship)
          : null,
        factoryEntity: data.factoryEntity ? Number(data.factoryEntity) : null,
        factoryDocumentType: data.factoryDocumentType
          ? Number(data.factoryDocumentType)
          : null,
        factoryBanks: data.factoryBanks ? Number(data.factoryBanks) : null,
        skudGroupId: data.skudGroupId ? Number(data.skudGroupId) : null,
        cardNumber: data.cardNumber ?? null,
        passCardNumber: data.passCardNumber?.trim() || null,
        passportDate: data.passportDate ? data.passportDate : null,
        birthdate: data.birthdate ? data.birthdate : null,
        hostelChekin: data.hostelChekin ? data.hostelChekin : null,
        hostelCheckOut: data.hostelCheckOut ? data.hostelCheckOut : null,
        hiringDate: data.hiringDate ? data.hiringDate : null,
        dismissedDate: data.dismissedDate ? data.dismissedDate : null,
        photo: photo ?? null,
      };

      const result = isEdit
        ? await callApi(put("/PersonalityFactory/persons", payload))
        : await callApi(post("/PersonalityFactory/persons", payload));
      if (!result.ok) {
        setModalError(getFriendlyErrorMessage(result.error));
        return;
      }

      navigate("/FactoryPerson");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = isDirty || photo !== initialPhoto;
  const changeTab = (next: number) => {
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  if (loadingPresence.visible) {
    return (
      <div className={styles.loadingState}>
        <LoadingSpinner
          size={96}
          label={
            isEdit
              ? "Загружаем данные сотрудника…"
              : "Подготавливаем форму сотрудника…"
          }
          exiting={loadingPresence.exiting}
        />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className={styles.loadError}>
        <p role="alert">{loadError}</p>
        <Button onClick={() => setRetry((value) => value + 1)}>
          Повторить загрузку
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        className={styles.editor}
        aria-busy={saving}
      >
        <fieldset className={styles.layout} disabled={saving}>
          <aside
            className={styles.profile}
            aria-labelledby="factory-photo-title"
          >
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}>
                <BadgeOutlinedIcon />
              </span>
              <div>
                <h2 id="factory-photo-title">Фото и пропуск</h2>
                <p>Идентификация сотрудника</p>
              </div>
            </div>
            <div className={styles.photoFrame}>
              {photo ? (
                <img
                  src={photo}
                  className={styles.photo}
                  alt="Фото сотрудника"
                />
              ) : (
                <div
                  className={styles.photoPlaceholder}
                  role="img"
                  aria-label="Фото не добавлено"
                >
                  <PersonOutlineIcon aria-hidden="true" />
                  <span>Фото не добавлено</span>
                </div>
              )}
            </div>
            {!isSecurity && (
              <div className={styles.photoActions}>
                <Button
                  size="md"
                  onClick={openCamera}
                  aria-label="С камеры"
                  title="Снять фото с камеры"
                  className={styles.cameraButton}
                >
                  <PhotoCameraOutlinedIcon className={styles.cameraGlyph} />
                </Button>
                <Button
                  size="md"
                  onClick={() => fileInputRef.current?.click()}
                  leadingIcon={<FileUploadOutlinedIcon />}
                >
                  Загрузить
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={uploadPhoto}
                  aria-label="Загрузить фото"
                />
              </div>
            )}
            <div className={styles.accessFields}>
              <Controller
                name="skudGroupId"
                control={control}
                render={({ field }) =>
                  renderNumberSelect(field, options.skudGroups, "Группа СКУД")
                }
              />
              <Input
                label="Номер пропуска"
                maxLength={6}
                placeholder="6 символов"
                {...register("passCardNumber")}
                disabled={isSecurity}
              />
            </div>
            {isSecurity && (
              <p className={styles.securityNote}>
                <LockOutlinedIcon aria-hidden="true" />
                Часть данных доступна только для просмотра
              </p>
            )}
          </aside>

          <div className={styles.workspace}>
            <div
              className={styles.tabs}
              role="tablist"
              aria-label="Разделы карточки сотрудника"
            >
              {[
                { title: "Сотрудник", icon: <PersonOutlineIcon /> },
                {
                  title: "Документы и реквизиты",
                  icon: <DescriptionOutlinedIcon />,
                },
              ].map((tab, index) => (
                <button
                  key={tab.title}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`factory-tab-${index}`}
                  aria-selected={activeTab === index}
                  aria-controls={`factory-panel-${index}`}
                  tabIndex={activeTab === index ? 0 : -1}
                  className={styles.tab}
                  onClick={() => setActiveTab(index)}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      changeTab(
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 1
                            : 1 - index,
                      );
                    }
                  }}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {tab.title}
                </button>
              ))}
            </div>

            <div
              className={styles.panel}
              id="factory-panel-0"
              role="tabpanel"
              aria-labelledby="factory-tab-0"
              hidden={activeTab !== 0}
            >
              <section
                className={styles.section}
                aria-labelledby="factory-personal-title"
              >
                <div className={styles.sectionHeading}>
                  <span className={styles.sectionIcon}>
                    <PersonOutlineIcon />
                  </span>
                  <div>
                    <h2 id="factory-personal-title">Личные данные</h2>
                    <p>ФИО и контакты сотрудника</p>
                  </div>
                </div>
                <div className={styles.gridThree}>
                  {withFieldError(
                    "surname",
                    <Input
                      label="Фамилия *"
                      maxLength={50}
                      disabled={isSecurity}
                      {...register("surname", {
                        validate: (value) =>
                          isSecurity || Boolean(value?.trim()) || "Укажите фамилию.",
                      })}
                      onChange={(event) =>
                        setValue("surname", onlyRussian(event.target.value), {
                          shouldDirty: true,
                          shouldValidate: isSubmitted,
                        })
                      }
                    />,
                  )}
                  {withFieldError(
                    "name",
                    <Input
                      label="Имя *"
                      maxLength={50}
                      disabled={isSecurity}
                      {...register("name", {
                        validate: (value) =>
                          isSecurity || Boolean(value?.trim()) || "Укажите имя.",
                      })}
                      onChange={(event) =>
                        setValue("name", onlyRussian(event.target.value), {
                          shouldDirty: true,
                          shouldValidate: isSubmitted,
                        })
                      }
                    />,
                  )}
                  <Input
                    label="Отчество"
                    maxLength={50}
                    disabled={isSecurity}
                    {...register("patronymic")}
                    onChange={(event) =>
                      setValue("patronymic", onlyRussian(event.target.value), {
                        shouldDirty: true,
                      })
                    }
                  />
                </div>
                <div className={styles.gridTwo}>
                  {withFieldError(
                    "birthdate",
                    <Input
                      label="Дата рождения *"
                      type="date"
                      {...register("birthdate", {
                        required: "Укажите дату рождения.",
                      })}
                    />,
                  )}
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="Телефон"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder="9XX-XXX-XX-XX"
                        value={formatPhone(field.value ?? "")}
                        onChange={(event) =>
                          field.onChange(onlyDigits(event.target.value))
                        }
                        maxLength={13}
                      />
                    )}
                  />
                </div>
              </section>
              <section
                className={styles.section}
                aria-labelledby="factory-work-title"
              >
                <div className={styles.sectionHeading}>
                  <span className={styles.sectionIcon}>
                    <WorkOutlineIcon />
                  </span>
                  <div>
                    <h2 id="factory-work-title">Работа на заводе</h2>
                    <p>Подразделение, должность и период работы</p>
                  </div>
                </div>
                <div className={styles.gridThree}>
                  <Controller
                    name="factoryDepartment"
                    control={control}
                    render={({ field }) =>
                      renderNumberSelect(
                        field,
                        options.departments,
                        "Отдел",
                        false,
                        handleDepartmentChange,
                      )
                    }
                  />
                  <Controller
                    name="factoryWorkshop"
                    control={control}
                    render={({ field }) =>
                      renderNumberSelect(
                        field,
                        options.workshops,
                        "Участок",
                        disabled.workshop,
                        handleWorkshopChange,
                      )
                    }
                  />
                  <Controller
                    name="factoryJobTitle"
                    control={control}
                    render={({ field }) =>
                      renderNumberSelect(
                        field,
                        options.jobTitles,
                        "Должность",
                        disabled.job,
                      )
                    }
                  />
                  <Controller
                    name="factoryEntity"
                    control={control}
                    rules={{ required: "Выберите юр. лицо." }}
                    render={({ field }) =>
                      withFieldError(
                        "factoryEntity",
                        renderNumberSelect(
                          field,
                          options.entities,
                          "Юр. лицо",
                          false,
                          undefined,
                          true,
                        ),
                      )
                    }
                  />
                  {withFieldError(
                    "hiringDate",
                    <Input
                      label="Дата приема на работу *"
                      type="date"
                      {...register("hiringDate", {
                        required: "Укажите дату приема на работу.",
                      })}
                    />,
                  )}
                  <Input
                    label="Дата увольнения"
                    type="date"
                    {...register("dismissedDate")}
                  />
                </div>
              </section>
            </div>

            <div
              className={styles.panel}
              id="factory-panel-1"
              role="tabpanel"
              aria-labelledby="factory-tab-1"
              hidden={activeTab !== 1}
            >
              <section
                className={styles.section}
                aria-labelledby="factory-documents-title"
              >
                <div className={styles.sectionHeading}>
                  <span className={styles.sectionIcon}>
                    <DescriptionOutlinedIcon />
                  </span>
                  <div>
                    <h2 id="factory-documents-title">
                      Документы и гражданство
                    </h2>
                  </div>
                </div>
                <div className={styles.gridThree}>
                  <Controller
                    name="factoryCitizenshipType"
                    control={control}
                    rules={{ required: "Выберите тип гражданства." }}
                    render={({ field }) =>
                      withFieldError(
                        "factoryCitizenshipType",
                        renderNumberSelect(
                          field,
                          options.citizenshipTypes,
                          "Тип гражданства",
                          false,
                          undefined,
                          true,
                        ),
                      )
                    }
                  />
                  <Controller
                    name="factoryCitizenship"
                    control={control}
                    rules={{ required: "Выберите гражданство." }}
                    render={({ field }) =>
                      withFieldError(
                        "factoryCitizenship",
                        renderNumberSelect(
                          field,
                          options.citizenships,
                          "Гражданство",
                          disabled.citizenship,
                          undefined,
                          true,
                        ),
                      )
                    }
                  />
                  <Controller
                    name="factoryDocumentType"
                    control={control}
                    rules={{ required: "Выберите тип документа." }}
                    render={({ field }) =>
                      withFieldError(
                        "factoryDocumentType",
                        renderNumberSelect(
                          field,
                          options.documentTypes,
                          "Тип документа",
                          false,
                          undefined,
                          true,
                        ),
                      )
                    }
                  />
                </div>
                <div className={styles.gridTwo}>
                  {withFieldError(
                    "passport",
                    <Input
                      label="Паспорт *"
                      maxLength={25}
                      disabled={isSecurity}
                      {...register("passport", {
                        validate: (value) =>
                          isSecurity || Boolean(value?.trim()) || "Укажите паспорт.",
                      })}
                    />,
                  )}
                  <Input
                    label="Дата выдачи паспорта"
                    type="date"
                    {...register("passportDate")}
                  />
                </div>
              </section>
              <div className={styles.detailsRow}>
                <section
                  className={styles.section}
                  aria-labelledby="factory-payment-title"
                >
                  <div className={styles.sectionHeading}>
                    <span className={styles.sectionIcon}>
                      <CreditCardOutlinedIcon />
                    </span>
                    <div>
                      <h2 id="factory-payment-title">Банковские реквизиты</h2>
                    </div>
                  </div>
                  {!isEdit && (
                    <Controller
                      name="factoryBanks"
                      control={control}
                      render={({ field }) =>
                        renderNumberSelect(field, options.banks, "Банк")
                      }
                    />
                  )}
                  <Controller
                    name="cardNumber"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="Номер банковской карты"
                        inputMode="numeric"
                        placeholder="0000 0000 0000 0000"
                        value={formatCard(field.value ?? "")}
                        onChange={(event) =>
                          field.onChange(onlyDigits(event.target.value))
                        }
                        disabled={isSecurity}
                        maxLength={19}
                      />
                    )}
                  />
                </section>
                <section
                  className={styles.section}
                  aria-labelledby="factory-housing-title"
                >
                  <div className={styles.sectionHeading}>
                    <span className={styles.sectionIcon}>
                      <HomeOutlinedIcon />
                    </span>
                    <div>
                      <h2 id="factory-housing-title">Проживание</h2>
                    </div>
                  </div>
                  <Input
                    label="Дата въезда"
                    type="date"
                    {...register("hostelChekin")}
                  />
                  <Input
                    label="Дата выезда"
                    type="date"
                    {...register("hostelCheckOut")}
                  />
                </section>
              </div>
            </div>
          </div>
        </fieldset>
        <footer className={styles.footer}>
          <span
            className={styles.saveState}
            role="status"
            data-dirty={hasChanges || undefined}
          >
            {hasChanges ? (
              <span className={styles.dirtyDot} />
            ) : (
              <CheckCircleOutlineIcon aria-hidden="true" />
            )}
            {saving
              ? "Сохраняем данные…"
              : hasChanges
                ? "Есть несохранённые изменения"
                : isEdit
                  ? "Все изменения сохранены"
                  : "Новый сотрудник"}
          </span>
          <div className={styles.actions}>
            <Button
              disabled={saving}
              onClick={() => navigate("/FactoryPerson")}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={isEdit && !hasChanges}
              leadingIcon={<SaveOutlinedIcon />}
            >
              {isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </footer>
      </form>

      <Modal
        isOpen={showCamera}
        onClose={cancelCamera}
        title="Фото сотрудника"
        size="md"
      >
        <div className={styles.cameraFrame}>
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "user" }}
            className={styles.webcam}
            onLoadedData={() => setCameraReady(true)}
            onUserMediaError={() =>
              setCameraError(
                "Камера недоступна. Проверьте разрешение браузера или загрузите фото из файла.",
              )
            }
          />
          {!cameraReady && !cameraError && (
            <div className={styles.cameraStatus}>
              <LoadingSpinner size={48} label="Подключаем камеру…" />
            </div>
          )}
        </div>
        {cameraError && (
          <p className={styles.errorText} role="alert">
            {cameraError}
          </p>
        )}
        <div className={styles.modalActions}>
          <Button onClick={cancelCamera}>Отмена</Button>
          <Button
            variant="primary"
            disabled={!cameraReady || !!cameraError}
            onClick={capturePhoto}
            leadingIcon={<PhotoCameraOutlinedIcon />}
          >
            Снять фото
          </Button>
        </div>
      </Modal>
      {tempPhoto && (
        <FactoryPersonPhotoCrop
          image={tempPhoto}
          onClose={() => setTempPhoto(null)}
          onSave={(value) => {
            setPhoto(value);
            setTempPhoto(null);
          }}
        />
      )}
      <Modal
        isOpen={!!modalError}
        onClose={() => setModalError(null)}
        title="Ошибка"
        size="sm"
      >
        <p className={styles.errorText} role="alert">
          {modalError}
        </p>
        <div className={styles.modalActions}>
          <Button onClick={() => setModalError(null)}>Понятно</Button>
        </div>
      </Modal>
    </div>
  );
}
