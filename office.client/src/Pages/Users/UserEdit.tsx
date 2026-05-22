import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { UseFormSetError } from "react-hook-form";
import { useNotifications } from "@toolpad/core";
import SearchIcon from "@mui/icons-material/Search";

import styles from "./UserEdit.module.css";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import Input from "../../Components/Input/Input";
import { MultiplySelect } from "../../Components/MultiplySelect/MultiplySelect";
import Toggle from "../../Components/Toggle/Toggle";
import ConnectField from "../../Components/ConnectField/ConnectField";
import Modal from "../../Components/Modal/Modal";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import { callApi, get, put } from "../../Services/api";

import type {
  OfficeGroup,
  OfficeUser,
  FactoryPerson,
  Personality,
  Location,
} from "../../Interfaces/Users";
import Select from "../../Components/Select/Select";

/**
 * Формат ответа с бэка (по Swagger)
 */
type OfficeUserModel = {
  officeUser: OfficeUser;
  locations: Location[] | null;     // справочник всех локаций
  officeGroups: OfficeGroup[] | null; // справочник всех групп
};

/**
 * Что храним в react-hook-form
 * (делаем удобные/не-null массивы и отдельный флаг isTT для UI)
 */
type FormValues = {
  officeUser: OfficeUser;
  locations: Location[];
  officeGroups: OfficeGroup[];
  ttBinding: string;
  isTT: boolean;
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

  officeGroup: number[];   // ID групп
  locations: string[];     // GUID локаций

  defaultLocations: number;
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

  return {
    officeUser: {
      ...user,
      locations: userLocations,
      officeGroup: userGroups,
    },
    locations: allLocations,
    officeGroups: allGroups,
    ttBinding: userLocations.length === 0 ? "allTT" : "manualTT",
    isTT: userLocations.length > 0,
  };
}


function asApiSetError(setError: UseFormSetError<FormValues>) {
  return setError as unknown as UseFormSetError<Record<string, unknown>>;
}

export default function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const isCreate = !id || id === "new";

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const notifications = useNotifications();

  const [pageLoading, setPageLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingGlobal, setSearchLoadingGlobal] = useState(false);

  const {
    register,
    reset,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { isDirty },
  } = useForm<FormValues>({
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });

  /**
   * WATCH (подписки на значения формы)
   * Для простоты читаем все, что используем в UI.
   */
  const actual = watch("officeUser.actual");
  const personalitiesGuid = watch("officeUser.personalitiesGuid");
  const factoryPersonId = watch("officeUser.factoryPersonId");

  const isTt = watch("isTT");

  const ttBinding = watch("ttBinding");

  const allGroups = watch("officeGroups");
  const userGroups = watch("officeUser.officeGroup");

  const allLocations = watch("locations");
  const userLocations = watch("officeUser.locations");

  /**
   * Подготовка "selectedKeys" для MultiplySelect (группы)
   * MultiplySelect работает по ключам, поэтому из объектов делаем список id.
   */
  const selectedGroupIds = useMemo(
    () => userGroups.map((g) => g.id),
    [userGroups]
  );

  /**
   * Когда MultiplySelect вернул новый список id,
   * превращаем его обратно в массив объектов OfficeGroup и кладем в форму.
   */
  const onGroupsChange = (ids: Array<string | number>) => {
    const nextSelectedGroups = allGroups.filter((g) => ids.includes(g.id));
    setValue("officeUser.officeGroup", nextSelectedGroups, { shouldDirty: true });
  };

  /**
   * Для локаций — аналогично (ключ у Location: guid)
   */
  const selectedLocationGuids = useMemo(
    () => userLocations.map((l) => l.guid),
    [userLocations]
  );

  const onLocationsChange = (guids: Array<string | number>) => {
    // guids приходят как (string | number), но guid у нас string — приведем к string
    const guidStrings = guids.map(String);
    const nextSelectedLocations = allLocations.filter((l) =>
      guidStrings.includes(l.guid)
    );

    setValue("officeUser.locations", nextSelectedLocations, { shouldDirty: true });
  };

  // When ttBinding switches to allTT, clear selected locations and block selection
  useEffect(() => {
    if (ttBinding === "allTT") {
      setValue("officeUser.locations", [], { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttBinding]);

  // Auto-select allTT when there are no user locations
  useEffect(() => {
    if (!userLocations || userLocations.length === 0) {
      setValue("ttBinding", "allTT", { shouldDirty: false });
    } else {
      setValue("ttBinding", "manualTT", { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocations]);

  /**
   * Настройка заголовка/кнопки "назад" при открытии страницы
   */
  useEffect(() => {
    dispatch(pathSet({ path: "/Users" }));
    dispatch(
      titleSet({
        title: isCreate ? "Создание пользователя" : "Редактирование пользователя",
      })
    );
    dispatch(visibleSet({ visible: true }));
  }, [dispatch, isCreate]);

  /**
   * Загрузка пользователя (если редактирование)
   */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (isCreate) {
        reset(DEFAULTS);
        return;
      }
      if (!id) return;

      setPageLoading(true);

      const result = await callApi(get<OfficeUserModel>(`/User/users/${id}`), {
        notifications,
        setError: asApiSetError(setError),
      });

      if (cancelled) return;

      if (result?.ok && result.data) {
        reset(modelToForm(result.data));
      }

      setPageLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id, isCreate, notifications, reset, setError]);

  /**
   * debounce поиска внутри модалки
   */
  useEffect(() => {
    if (!open) return;

    setSearchLoading(true);

    const t = setTimeout(async () => {
      try {
        // await api.get(`/persons/search?q=${encodeURIComponent(searchText)}`)
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [open, searchText]);

  /**
   * debounce глобального поиска
   */
  useEffect(() => {
    if (!open) return;
    if (!searchText) return;

    setSearchLoadingGlobal(true);

    const t = setTimeout(async () => {
      try {
        // await api.get(`/persons/search-global?q=${encodeURIComponent(searchText)}`)
      } finally {
        setSearchLoadingGlobal(false);
      }
    }, 1400);

    return () => clearTimeout(t);
  }, [open, searchText]);

  const onSubmit = async (form: FormValues) => {
    setSaving(true);

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
      locations: form.officeUser.locations.map((l) => l.guid),

      defaultLocations: 0, // если есть поле
    };

    const result = await callApi(put("/User/users", payload), {
      notifications,
      setError: asApiSetError(setError),
      successMessage: "Пользователь сохранён",
    });

    setSaving(false);

    if (result.ok) navigate("/Users");
  };

  const onCancel = () => navigate("/Users");

  /**
   * Выбор сотрудника в модалке (пример логики)
   * Если выбрали Personality — сбрасываем FactoryPerson и наоборот.
   */
  const selectPersonality = (guid: string, p?: Personality | null) => {
    setValue("officeUser.personalitiesGuid", guid, { shouldDirty: true });
    setValue("officeUser.factoryPersonId", null, { shouldDirty: true });

    setValue("officeUser.personality", p ?? null, { shouldDirty: true });
    setValue("officeUser.factoryPerson", null, { shouldDirty: true });

    setOpen(false);
  };

  const selectFactoryPerson = (personId: number, fp?: FactoryPerson | null) => {
    setValue("officeUser.factoryPersonId", personId, { shouldDirty: true });
    setValue("officeUser.personalitiesGuid", null, { shouldDirty: true });

    setValue("officeUser.factoryPerson", fp ?? null, { shouldDirty: true });
    setValue("officeUser.personality", null, { shouldDirty: true });

    setOpen(false);
  };

  if (pageLoading) {
    return (
      <div className={styles.loadingSpinner}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={styles.userEditWrapper}>
      <div className={styles.userEditForm}>
        <form>
          <div className={styles.leftBlock}>
            <div className={styles.userInfoBlock}>
              <label className={styles.blockLabel}>Данные пользователя</label>

              <Input
                label="Логин"
                {...register("officeUser.login", { required: "Логин обязателен" })}
              />

              <Input
                label="Фамилия"
                {...register("officeUser.surname", {
                  required: "Фамилия обязательна",
                })}
              />

              <Input
                label="Имя"
                {...register("officeUser.name", { required: "Имя обязательно" })}
              />


              <Input label="Отчество" {...register("officeUser.patronymic")} />

              <Input label="Должность" {...register("officeUser.position")} disabled={true} />

              <div className={styles.togglesWrapper}>
                <Toggle
                  label="Активность"
                  checked={actual === 1}
                  onChange={(v: boolean) =>
                    setValue("officeUser.actual", v ? 1 : 0, {
                      shouldDirty: true,
                    })
                  }
                />

                <Toggle
                  label="Является ТТ"
                  checked={isTt}
                  onChange={(v: boolean) =>
                    setValue("isTT", v, { shouldDirty: true })
                  }
                />
              </div>

              <Select
                label="Тип привязки ТТ"
                options={[
                  { value: "allTT", label: "Все ТТ" },
                  { value: "manualTT", label: "Выбрать ТТ" },
                ]}
                disabled={!isTt}
                value={ttBinding}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setValue("ttBinding", String(e.target.value), { shouldDirty: true })
                }
              />

              

            </div>

            <div className={styles.groups}>
              <label className={styles.blockLabel}>Заметки по заявке пользователя</label>
            </div>
          </div>

          <div className={styles.groups}>
            <label className={styles.blockLabel}>Группы</label>

            <MultiplySelect
              items={allGroups}
              getKey={(g) => g.id}
              getLabel={(g) => g.name ?? `Группа ${g.id}`}
              selectedKeys={selectedGroupIds}
              onChange={onGroupsChange}
            />
          </div>

          {isTt && (
            <div className={styles.groups}>
              <label className={styles.blockLabel}>Привязка ТТ</label>

              <MultiplySelect
                items={allLocations}
                getKey={(l) => l.guid}
                getLabel={(l) => l.name ?? l.guid}
                selectedKeys={selectedLocationGuids}
                onChange={onLocationsChange}
                disabled={ttBinding === "allTT"}
              />
            </div>
          )}

          {!isTt && (
            <div className={styles.groups}>
              <label className={styles.blockLabel}>Привязка к сотруднику</label>
              <div className={styles.connectWrapper}>
                <ConnectField
                  label="Personality"
                  checked={Boolean(personalitiesGuid)}
                  onClick={() => setOpen(true)}
                />
                <ConnectField
                  label="FactoryPerson"
                  checked={factoryPersonId != null}
                  onClick={() => setOpen(true)}
                />
              </div>
            </div>
          )}

          <Modal
            isOpen={open}
            onClose={() => setOpen(false)}
            title="Привязка к сотруднику"
            size="md"
          >
            {searchLoading ? (
              <div className={styles.loadingSpinner}>
                <LoadingSpinner />
              </div>
            ) : (
              <div className={styles.modalForConnectPerson}>
                <div className={styles.rec}>
                  <p>Рекомендация</p>
                  <div
                    className={styles.recCard}
                    onClick={() =>
                      selectPersonality(
                        "00000000-0000-0000-0000-000000000000",
                        null
                      )
                    }
                  >
                    Кургузов Владислав Сергеевич
                  </div>
                </div>

                <div className={styles.globalSearch}>
                  <p>Глобальный поиск</p>
                  <div className={styles.searchGlobalInput}>
                    <span>
                      <SearchIcon />
                    </span>
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Поиск..."
                    />
                  </div>

                  <div className={styles.searchResults}>
                    {searchLoadingGlobal ? (
                      <div className={styles.loadingSpinner}>
                        <LoadingSpinner />
                      </div>
                    ) : (
                      <>
                        <div
                          className={styles.recCard}
                          onClick={() => selectFactoryPerson(123, null)}
                        >
                          Иванов Иван Иванович
                        </div>
                        <div
                          className={styles.recCard}
                          onClick={() => selectFactoryPerson(124, null)}
                        >
                          Петров Петр Петрович
                        </div>
                        <div
                          className={styles.recCard}
                          onClick={() =>
                            selectPersonality(
                              "11111111-1111-1111-1111-111111111111",
                              null
                            )
                          }
                        >
                          Кургузов Владислав Сергеевич
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Modal>
        </form>
      </div>

      <div className={styles.userEditFooter}>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Отмена
        </button>

        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSubmit(onSubmit)}
          disabled={saving || (!isDirty && !isCreate)}
        >
          {saving ? <LoadingSpinner size={24} color="white" /> : "Сохранить"}
        </button>
      </div>
    </div>
  );
}