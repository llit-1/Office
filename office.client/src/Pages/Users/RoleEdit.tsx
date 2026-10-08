import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./AccessEditor.module.css";
import AccessEditor, { AccessEditorHeading } from "./AccessEditor";
import Textarea from "../../Components/Textarea/Textarea";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
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
import type { OfficeRole } from "../../Interfaces/Users";

const DEFAULTS: OfficeRole = {
  id: 0,
  name: "",
  description: "",
  role: "",
  officeGroup: [],
};

// адаптер, чтобы не писать setError as any
function asApiSetError(setError: UseFormSetError<OfficeRole>) {
  return setError as unknown as UseFormSetError<Record<string, unknown>>;
}

export default function RoleEdit() {
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
    handleSubmit,
    setError,
    formState: { isDirty, errors },
  } = useForm<OfficeRole>({
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });

  useEffect(() => {
    dispatch(pathSet({ path: "/Users" }));
    dispatch(
      titleSet({ title: isCreate ? "Создание роли" : "Редактирование роли" }),
    );
    dispatch(visibleSet({ visible: true }));
  }, [dispatch, isCreate]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPageLoading(true);
      setLoadError(null);
      if (isCreate) {
        reset(DEFAULTS);
        setPageLoading(false);
        return;
      }

      if (!id) return;

      setPageLoading(true);

      const result = await callApi(get<OfficeRole>(`/User/roles/${id}`), {
        notifications,
        setError: asApiSetError(setError),
      });

      if (cancelled) return;

      if (result.ok && result.data) {
        // на всякий случай гарантируем массив
        reset({
          ...result.data,
          officeGroup: result.data.officeGroup ?? [],
        });
      } else {
        setLoadError(
          result.ok
            ? "Не удалось загрузить роль."
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

  const onSubmit = async (model: OfficeRole) => {
    setSaving(true);
    setSaveError(null);

    // лучше отправлять только поля роли, без навигаций (если бэк их не ждёт)
    const payload: OfficeRole = {
      id: model.id,
      role: model.role,
      name: model.name,
      description: model.description ?? "",
      officeGroup: [], // не тащим навигацию в запрос (частая причина 400/циклов)
    };

    const result = await callApi(
      isCreate
        ? post<OfficeRole>("/User/roles", payload)
        : put<OfficeRole>("/User/roles", payload),
      {
        notifications,
        setError: asApiSetError(setError),
        successMessage: isCreate ? "Роль создана" : "Роль сохранена",
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

    const result = await callApi(del(`/User/roles/${id}`), {
      notifications,
      successMessage: "Роль удалена",
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
            icon={<ShieldOutlinedIcon />}
            title="Идентификатор роли"
            description="Код права доступа в системе"
          />
          <div>
            <Input
              label="Код роли *"
              {...register("role", { required: "Код роли обязателен" })}
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? "role-code-error" : undefined}
            />
            {errors.role && (
              <p
                className={styles.fieldError}
                id="role-code-error"
                role="alert"
              >
                {errors.role.message}
              </p>
            )}
          </div>
        </section>
        <section className={styles.section}>
          <AccessEditorHeading
            icon={<DescriptionOutlinedIcon />}
            title="Описание роли"
            description="Понятное название и доступные возможности"
          />
          <div className={styles.fields}>
            <div>
              <Input
                label="Название роли *"
                {...register("name", { required: "Название обязательно" })}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "role-name-error" : undefined}
              />
              {errors.name && (
                <p
                  className={styles.fieldError}
                  id="role-name-error"
                  role="alert"
                >
                  {errors.name.message}
                </p>
              )}
            </div>
            <Textarea
              label="Описание роли"
              wrapperClassName={styles.description}
              {...register("description")}
            />
          </div>
        </section>
      </AccessEditor>
      <ConfirmModal
        isOpen={confirmOpen}
        title="Подтвердите удаление"
        message="Вы уверены, что хотите удалить роль?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        panelClassName={styles.confirmModalPanel}
      />
    </>
  );
}
