import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./RoleEdit.module.css";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Input from "../../Components/Input/Input";
import { useForm } from "react-hook-form";
import type { UseFormSetError } from "react-hook-form";
import { useNotifications } from "@toolpad/core";
import { callApi, get, post, put, del } from "../../Services/api";
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

  const [pageLoading, setPageLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { isDirty },
  } = useForm<OfficeRole>({
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });

  useEffect(() => {
    dispatch(pathSet({ path: "/Users" }));
    dispatch(
      titleSet({ title: isCreate ? "Создание роли" : "Редактирование роли" })
    );
    dispatch(visibleSet({ visible: true }));
  }, [dispatch, isCreate]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (isCreate) {
        reset(DEFAULTS);
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
      }

      setPageLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id, isCreate, notifications, reset, setError]);

  const onSubmit = async (model: OfficeRole) => {
    setSaving(true);

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
      }
    );

    setSaving(false);

    if (result.ok) navigate("/Users");
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

    const result = await callApi(del(`/User/roles/${id}`), {
      notifications,
      successMessage: "Роль удалена",
    });

    setSaving(false);

    if (result.ok) navigate("/Users");
  };

  if (pageLoading) {
    return (
      <div className={styles.loadingSpinner}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={styles.roleEditWrapper}>
      <div className={styles.groups}>
        <label className={styles.blockLabel}>Основные данные</label>
        <div className={styles.userInfoBlock}>
          <Input
            label="Код роли"
            {...register("role", { required: "Код роли обязателен" })}
          />
          <Input
            label="Название роли"
            {...register("name", { required: "Название обязательно" })}
          />
          <Input label="Описание роли" {...register("description")} />
        </div>
      </div>

      <div className={styles.userEditFooter}>
        {!isCreate && (
          <button
            type="button"
            onClick={onDelete}
            className={styles.buttonDelete}
            disabled={saving}
          >
            {saving ? <LoadingSpinner size={24} color="white" /> : "Удалить"}
          </button>
        )}

        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSubmit(onSubmit)}
          disabled={saving || (!isDirty && !isCreate)}
        >
          {saving ? (
            <LoadingSpinner size={24} color="white" />
          ) : isCreate ? (
            "Создать"
          ) : (
            "Сохранить"
          )}
        </button>
      </div>
      <ConfirmModal
        isOpen={confirmOpen}
        title={"Подтвердите удаление"}
        message={"Вы уверены, что хотите удалить роль?"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        sx={{maxWidth: "420px"}}
      />
    </div>
  );
}
