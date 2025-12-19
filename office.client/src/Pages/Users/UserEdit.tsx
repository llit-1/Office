import { useLocation } from "react-router-dom";
import styles from "./UserEdit.module.css";
import { useEffect, useState, useMemo } from "react";
import { useDispatch } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { pathSet } from "../../Store/stateForBackButtonSlice";
import Input from "../../Components/Input/Input";
import { MultiplySelect } from "../../Components/MultiplySelect/MultiplySelect";
import Toggle from "../../Components/Toggle/Toggle";
import ConnectField from "../../Components/ConnectField/ConnectField";
import Modal from "../../Components/Modal/Modal";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import SearchIcon from "@mui/icons-material/Search";
import { callApi, post } from "../../Services/api";
import { useForm } from "react-hook-form";
import { useNotifications } from '@toolpad/core';

interface User {
  login?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  role?: string;
  tt?: string;
  userType?: string;
  status?: string;
}

type FormValues = {
  login: string;
  lastName: string;
  firstName: string;
  middleName: string;
  role: string;
  userType?: string;
  status?: string;
  isTt?: boolean;
};

export default function UserEdit() {
  const location = useLocation();
  const user = useMemo(() => (location.state as User) ?? {}, [location.state]);
  const dispatch = useDispatch();
  const [open, setOpen] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const notifications = useNotifications();

  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({
    defaultValues: useMemo(() => ({
      login: user.login ?? "",
      lastName: user.lastName ?? "",
      firstName: user.firstName ?? "",
      middleName: user.middleName ?? "",
      role: user.role ?? "",
      userType: user.userType ?? "",
      status: user.status ?? "",
      isTt: !!user.tt,
    }), [user]),
  });

  useEffect(() => {
    dispatch(pathSet({ path: "/Users" }));
    dispatch(titleSet({ title: "Пользователи" }));
  }, [dispatch]);

  // placeholder for notifications integration

  useEffect(() => {
    // reset form when user prop changes
    reset({
      login: user.login ?? "",
      lastName: user.lastName ?? "",
      firstName: user.firstName ?? "",
      middleName: user.middleName ?? "",
      role: user.role ?? "",
      userType: user.userType ?? "",
      status: user.status ?? "",
      isTt: !!user.tt,
    });
  }, [user, reset]);

  // debounce search input in modal
  useEffect(() => {
    if (!open) return;
    if (!searchText) return;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        // placeholder: call search API
        // await api.get(`/persons/search?q=${encodeURIComponent(searchText)}`)
      } catch {
        // ignore for now
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [searchText, open]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const result = await callApi(post("/users", data), {
      notifications,
      setError,
      successMessage: "Пользователь сохранён",
    });
    if (!result.ok) {
      // error already handled by callApi (notifications + field errors)
    }
    setLoading(false);
  };

  const isTt = watch("isTt");

  return (
    <div className={styles.userEditWrapper}>
      <div className={styles.userEditForm}>
        <form onSubmit={handleSubmit(onSubmit)}>

          <div className={styles.leftBlock}>

            <div className={styles.userInfoBlock}>
              <label className={styles.blockLabel}>Данные пользователя</label>
              <Input label="Логин" {...register("login", { required: true })} />
              {errors.login && <div className={styles.fieldError}>{errors.login.message}</div>}
              <Input label="Фамилия" {...register("lastName", { required: true })} />
              {errors.lastName && <div className={styles.fieldError}>{errors.lastName.message}</div>}
              <Input label="Имя" {...register("firstName", { required: true })} />
              {errors.firstName && <div className={styles.fieldError}>{errors.firstName.message}</div>}
              <Input label="Отчество" {...register("middleName")} />
              {errors.middleName && <div className={styles.fieldError}>{errors.middleName.message}</div>}
              <div className={styles.togglesWrapper}>
                <Toggle
                  label="Активность"
                  checked={user.status === "Активен" ? true : false}
                  // no binding to form here; could be controlled if needed
                />
                <Toggle
                  label="Является ТТ"
                  checked={isTt}
                  onChange={(v: boolean) => setValue("isTt", v)}
                />
              </div>
            </div>

            {!isTt && (
              <div className={styles.groups}>
                  <label className={styles.blockLabel}>Привязка к сотруднику</label>
                  <div className={styles.connectWrapper}>
                    <ConnectField label="Personality" checked={false} onClick={() => setOpen(true)} />
                    <ConnectField label="FactoryPerson" checked={true} onClick={() => setOpen(true)} />
                  </div>
              </div>
            )}

          </div>

          <div className={styles.groups}>
            <label className={styles.blockLabel}>Группы</label>
            <MultiplySelect />
          </div>

          {isTt && (
            <div className={styles.groups}>
              <label className={styles.blockLabel}>Привязка ТТ</label>
              <MultiplySelect />
            </div>
          )}

          <Modal
            isOpen={open}
            onClose={() => setOpen(false)}
            title="Привязка к сотруднику"
            size="md"
          >
              { searchLoading ? (
                <div className={styles.loadingSpinner}>
                  <LoadingSpinner />
                </div>
              ) : (
                <div className={styles.modalForConnectPerson}>
                  <div className={styles.rec}>
                    <p>Рекомендация</p>
                    <div className={styles.recCard}>
                      Кургузов Владислав Сергеевич
                    </div>
                  </div>

                  <div className={styles.globalSearch}>
                    <p>Глобальный поиск</p>
                    <div className={styles.searchGlobalInput}>
                      <span><SearchIcon /></span>
                      <input
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Поиск..."
                      />
                    </div>
                  </div>
                </div>
              )}
          </Modal>
        </form>
      </div>

      <div className={styles.userEditFooter}>
        <button type="button" className={styles.cancelButton}>Отмена</button>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSubmit(onSubmit)}
          disabled={loading}
        >
          {loading ? <LoadingSpinner size={24} color="white"/> : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
