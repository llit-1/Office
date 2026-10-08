import { useEffect, useState, useMemo } from "react";
import { useDispatch } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./AccessEditor.module.css";
import AccessEditor, { AccessEditorHeading } from "./AccessEditor";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
import { MultiplySelect } from "../../Components/MultiplySelect/MultiplySelect";
import { useForm } from "react-hook-form";
import type { UseFormSetError } from "react-hook-form";
import { useNotifications } from "@toolpad/core";
import {
  callApi,
  get,
  post,
  put,
  del,
  getFriendlyErrorMessage,
} from "../../Services/api";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import type { OfficeGroup, OfficeRole } from "../../Interfaces/Users";

const DEFAULTS: OfficeGroup = {
  id: 0,
  name: "",
  officeRole: [],
  officeUser: [],
};

// То, что реально приходит с бэка при загрузке группы (по твоему описанию)
type OfficeGroupModel = {
  officeGroup: OfficeGroup;
  officeRoles: OfficeRole[]; // справочник всех ролей
};

// Адаптер, чтобы не использовать any
function asApiSetError(setError: UseFormSetError<OfficeGroup>) {
  return setError as unknown as UseFormSetError<Record<string, unknown>>;
}

export default function GroupEdit() {
  const { id } = useParams<{ id: string }>();
  const isCreate = !id || id === "new";

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const notifications = useNotifications();

  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);

  const {
    register,
    reset,
    watch,
    handleSubmit,
    setValue,
    setError,
    formState: { isDirty, errors },
  } = useForm<OfficeGroup>({
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });

  // Справочник ролей для выбора
  const [availableRoles, setAvailableRoles] = useState<OfficeRole[]>([]);

  // Выбранные роли группы (из формы)
  const groupRoles = watch("officeRole");

  // selectedKeys для MultiplySelect
  const selectedRoleIds = useMemo(
    () => groupRoles.map((r) => r.id),
    [groupRoles],
  );

  // Обновляем выбранные роли в форме по массиву id
  const onRolesChange = (ids: Array<string | number>) => {
    const nextSelectedRoles = availableRoles.filter((r) => ids.includes(r.id));
    setValue("officeRole", nextSelectedRoles, { shouldDirty: true });
  };

  // Заголовок/кнопка назад
  useEffect(() => {
    dispatch(pathSet({ path: "/Users" }));
    dispatch(
      titleSet({
        title: isCreate ? "Создание группы" : "Редактирование группы",
      }),
    );
    dispatch(visibleSet({ visible: true }));
  }, [dispatch, isCreate]);

  // Загрузка данных (группа + справочник ролей)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPageLoading(true);
      setLoadError(null);
      if (isCreate) {
        reset(DEFAULTS);
        // Для создания всё равно нужен справочник ролей:
        const rolesRes = await callApi(get<OfficeRole[]>("/User/roles"), {
          notifications,
        });
        if (cancelled) return;
        if (rolesRes.ok) setAvailableRoles(rolesRes.data ?? []);
        else setLoadError(getFriendlyErrorMessage(rolesRes.error));
        setPageLoading(false);
        return;
      }

      if (!id) return;

      setPageLoading(true);

      const result = await callApi(
        get<OfficeGroupModel>(`/User/groups/${id}`),
        {
          notifications,
          setError: asApiSetError(setError),
        },
      );

      if (cancelled) return;

      if (result.ok && result.data) {
        // 1) кладём группу в форму
        reset({
          ...result.data.officeGroup,
          officeRole: result.data.officeGroup.officeRole ?? [],
        });

        // 2) кладём справочник ролей (если бэк отдаёт вместе с группой)
        setAvailableRoles(result.data.officeRoles ?? []);
      } else {
        setLoadError(
          result.ok
            ? "Не удалось загрузить группу."
            : getFriendlyErrorMessage(result.error),
        );
      }

      setPageLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id, isCreate, notifications, reset, setError, retry]);

  const onSubmit = async (model: OfficeGroup) => {
    setSaving(true);
    setSaveError(null);

    // Лучше отправлять минимально необходимое.
    // Если твой бэк реально принимает OfficeGroup целиком — можешь оставить model.
    const payload: OfficeGroup = {
      id: model.id,
      name: model.name,
      // роли оставляем только как {id}, чтобы не тащить лишнее
      officeRole: (model.officeRole ?? []).map(
        (r) => ({ id: r.id }) as OfficeRole,
      ),
      // пользователей не трогаем при редактировании группы
      officeUser: [],
    };

    const result = await callApi(
      isCreate
        ? post<OfficeGroup>("/User/groups", payload)
        : put<OfficeGroup>("/User/groups", payload),
      {
        notifications,
        setError: asApiSetError(setError),
        successMessage: isCreate ? "Группа создана" : "Группа сохранена",
      },
    );

    setSaving(false);
    if (result.ok) navigate("/Users");
    else setSaveError(getFriendlyErrorMessage(result.error));
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  const onDelete = () => {
    if (isCreate || !id) return;
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (isCreate || !id) return;
    setConfirmOpen(false);
    setSaving(true);
    setSaveError(null);

    const result = await callApi(del(`/User/groups/${id}`), {
      notifications,
      successMessage: "Группа удалена",
    });

    setSaving(false);
    if (result.ok) navigate("/Users");
    else setSaveError(getFriendlyErrorMessage(result.error));
  };

  if (pageLoading)
    return (
      <div className={styles.loadingState}>
        <LoadingSpinner label="Загружаем данные…" />
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
    <>
      <AccessEditor
        onSubmit={handleSubmit(onSubmit)}
        onCancel={() => navigate("/Users")}
        onDelete={onDelete}
        saving={saving}
        isDirty={isDirty}
        isCreate={isCreate}
        error={saveError}
      >
        <section className={styles.sidebar}>
          <AccessEditorHeading
            icon={<GroupsOutlinedIcon />}
            title="Группа доступа"
            description="Название и назначение группы"
          />
          <div>
            <Input
              label="Название группы *"
              {...register("name", { required: "Название обязательно" })}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "group-name-error" : undefined}
            />
            {errors.name && (
              <p
                className={styles.fieldError}
                id="group-name-error"
                role="alert"
              >
                {errors.name.message}
              </p>
            )}
          </div>
        </section>
        <section className={styles.section}>
          <AccessEditorHeading
            icon={<ShieldOutlinedIcon />}
            title="Роли группы"
            description="Выберите права, которые получат участники"
          />
          <div className={styles.picker}>
            <MultiplySelect
              label="Поиск роли"
              items={availableRoles}
              getKey={(role) => role.id}
              getLabel={(role) => role.name || String(role.id)}
              selectedKeys={selectedRoleIds}
              onChange={onRolesChange}
              disabled={saving}
            />
          </div>
        </section>
      </AccessEditor>
      <ConfirmModal
        isOpen={confirmOpen}
        title="Подтвердите удаление"
        message="Вы уверены, что хотите удалить группу?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        panelClassName={styles.confirmModalPanel}
      />
    </>
  );
}
