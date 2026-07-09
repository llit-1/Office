import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import { callApi, get, getFriendlyErrorMessage, put } from "../../Services/api";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import styles from "./TTEdit.module.css";

type LocationTypeOption = {
  guid: string;
  name: string;
};

type TTEditModel = {
  locationGuid: string;
  versionGuid: string;
  name: string;
  address: string | null;
  rkCode: number | null;
  aggregatorsCode: number | null;
  obd: number | null;
  versionStartDate: string | null;
  versionEndDate: string | null;
  actual: number;
  locationTypeGuid: string | null;
  locationTypes: LocationTypeOption[];
};

type TTFormValues = {
  name: string;
  address: string;
  rkCode: string;
  aggregatorsCode: string;
  obd: string;
  versionStartDate: string;
  versionEndDate: string;
  locationTypeGuid: string;
};

function toInputDate(value: string | null) {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value;
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function TTEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [locationTypes, setLocationTypes] = useState<LocationTypeOption[]>([]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<TTFormValues>({
    defaultValues: {
      name: "",
      address: "",
      rkCode: "",
      aggregatorsCode: "",
      obd: "",
      versionStartDate: "",
      versionEndDate: "",
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
      setErrorText(null);

      const result = await callApi(get<TTEditModel>(`/TT/${id}`));
      if (!cancelled) {
        if (result.ok) {
          const data = result.data;
          setLocationTypes(data.locationTypes ?? []);
          reset({
            name: data.name ?? "",
            address: data.address ?? "",
            rkCode: data.rkCode != null ? String(data.rkCode) : "",
            aggregatorsCode: data.aggregatorsCode != null ? String(data.aggregatorsCode) : "",
            obd: data.obd != null ? String(data.obd) : "",
            versionStartDate: toInputDate(data.versionStartDate),
            versionEndDate: toInputDate(data.versionEndDate),
            locationTypeGuid: data.locationTypeGuid ?? "",
          });
        } else {
          setErrorText(getFriendlyErrorMessage(result.error));
        }
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!id) return;

    setSaving(true);
    setErrorText(null);

    const payload = {
      name: values.name,
      address: values.address,
      rkCode: toNullableNumber(values.rkCode),
      aggregatorsCode: toNullableNumber(values.aggregatorsCode),
      obd: toNullableNumber(values.obd),
      versionStartDate: values.versionStartDate || null,
      versionEndDate: values.versionEndDate || null,
      locationTypeGuid: values.locationTypeGuid || null,
    };

    const result = await callApi(put(`/TT/${id}`, payload));
    setSaving(false);

    if (!result.ok) {
      setErrorText(getFriendlyErrorMessage(result.error));
      return;
    }

    navigate("/TT");
  });

  return (
    <div className={styles.wrapper}>
      {loading ? (
        <div className={styles.loadingState}>
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className={styles.formCard}>
            {errorText ? <div className={styles.errorBanner}>{errorText}</div> : null}

            <div className={styles.grid}>
              <Input label="Название" {...register("name", { required: true })} />
              <Controller
                name="locationTypeGuid"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    label="Тип ТТ"
                    value={field.value}
                    onChange={field.onChange}
                    options={locationTypes.map((item) => ({ value: item.guid, label: item.name }))}
                    placeholder="Выберите тип"
                    search
                  />
                )}
              />

              <Input label="Адрес" {...register("address")} />
              <Input label="Код RK" inputMode="numeric" {...register("rkCode")} />
              <Input label="Код ТТ" inputMode="numeric" {...register("aggregatorsCode")} />
              <Input label="Код OBD" inputMode="numeric" {...register("obd")} />
              <Input label="Дата открытия" type="date" {...register("versionStartDate")} />
              <Input label="Дата закрытия" type="date" {...register("versionEndDate")} />
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={() => navigate("/TT")}>
              Отмена
            </button>

            <button type="button" className={styles.saveButton} onClick={() => void onSubmit()} disabled={saving || !isDirty}>
              {saving ? <LoadingSpinner size={22} color="white" /> : "Сохранить"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
