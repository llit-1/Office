import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import Webcam from "react-webcam";
import Cropper from "react-easy-crop";
import Input from "../../Components/Input/Input";
import Select from "../../Components/Select/Select";
import { get, post, put, callApi } from "../../Services/api";
import { FactoryPersonWithNav } from "../../Interfaces/Users";
import styles from "./FactoryPerson.module.css";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../Components/Modal/Modal";
import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";

interface Option {
  id: number;
  name: string;
  citizenshipTypeId?: number;
}

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

  const { register, handleSubmit, control, setValue, watch, reset } = useForm<Partial<FactoryPersonWithNav>>();

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

  const [disabled, setDisabled] = useState({ workshop: true, job: true, citizenship: true });
  const isInitializingRef = useRef(true);

  const webcamRef = useRef<Webcam>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const onCropComplete = useCallback((_: unknown, croppedPx: { x: number; y: number; width: number; height: number }) => {
    setCroppedAreaPixels(croppedPx);
  }, []);

  const capturePhoto = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setTempPhoto(imageSrc);
      setShowCamera(false);
      setShowCrop(true);
    }
  };

  const cancelCamera = () => setShowCamera(false);

  const cancelCrop = () => {
    setTempPhoto(null);
    setShowCrop(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const saveCroppedPhoto = async () => {
    if (!tempPhoto || !croppedAreaPixels) return;

    const image = new Image();
    image.src = tempPhoto;
    await new Promise(res => (image.onload = res));

    const canvas = document.createElement("canvas");
    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      image,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );

    setPhoto(canvas.toDataURL("image/jpeg"));
    setTempPhoto(null);
    setShowCrop(false);
  };

  const departmentId = watch("factoryDepartment");
  const citizenshipTypeId = watch("factoryCitizenshipType");

  // Загрузка основных данных
  useEffect(() => {
    dispatch(pathSet({ path: "/FactoryPerson" }));
    dispatch(titleSet({ title: isEdit ? "Редактирование сотрудника" : "Создание сотрудника" }));
    dispatch(visibleSet({ visible: true }));

    if (isEdit) {
      callApi(get<PersonalityFactoryEditModel>(`/PersonalityFactory/persons/${id}`)).then(res => {
        if (!res.ok) return;
        const model = res.data as PersonalityFactoryEditModel;
        setLoading(false);
        const person = model.factoryPerson;

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

        if (person) {
          // Вычисляем factoryCitizenshipType из citizenship
          const citizenship = model.factoryCitizenships?.find(c => c.id === person.factoryCitizenship);
          
          // Преобразуем даты из ISO формата в yyyy-MM-dd
          const personWithCitizenshipType = {
            ...person,
            factoryCitizenshipType: citizenship?.citizenshipTypeId ?? person.factoryCitizenshipType,
            birthdate: person.birthdate ? person.birthdate.split('T')[0] : undefined,
            passportDate: person.passportDate ? person.passportDate.split('T')[0] : undefined,
            hostelChekin: person.hostelChekin ? person.hostelChekin.split('T')[0] : undefined,
            hostelCheckOut: person.hostelCheckOut ? person.hostelCheckOut.split('T')[0] : undefined,
            hiringDate: person.hiringDate ? person.hiringDate.split('T')[0] : undefined,
            dismissedDate: person.dismissedDate ? person.dismissedDate.split('T')[0] : undefined,
          };
          
          reset(personWithCitizenshipType);
          setPhoto(person.photo ?? null);
          setDisabled({ workshop: !person.factoryDepartment, job: !person.factoryWorkshop, citizenship: false });
        }

        setIsSecurity(model.isFactorySecurity ?? false);
        
        // Отключаем инициализацию после микротаска, чтобы дать возможность reset() отработать
        const timeoutId = setTimeout(() => {
          isInitializingRef.current = false;
        }, 0);
        return () => clearTimeout(timeoutId);
      });
    } else {
      callApi(get<PersonalityFactoryAddModel>("/PersonalityFactory/addmodel")).then(res => {
        if (!res.ok) return;
        const model = res.data as PersonalityFactoryAddModel;
        setLoading(false);
        setOptions(o => ({
          ...o,
          departments: model.factoryDepartments ?? [],
          citizenshipTypes: model.factoryCitizenshipTypes ?? [],
          entities: model.factoryEntities ?? [],
          documentTypes: model.factoryDocumentTypes ?? [],
          banks: model.factoryBanks ?? [],
          skudGroups: model.factorySKUDGroups ?? [],
        }));
        
        const timeoutId = setTimeout(() => {
          isInitializingRef.current = false;
        }, 0);
        return () => clearTimeout(timeoutId);
      });
    }
  }, [id, isEdit, dispatch, reset]);

  // Загрузка участков
  useEffect(() => {
    if (isInitializingRef.current) return;
    if (!departmentId) {
      setOptions(o => ({ ...o, workshops: [], jobTitles: [] }));
      setDisabled(d => ({ ...d, workshop: true, job: true }));
      setValue("factoryWorkshop", undefined);
      setValue("factoryJobTitle", undefined);
      return;
    }
    callApi(get<Option[]>(`/PersonalityFactory/workshops/${departmentId}`)).then(res => {
      setOptions(o => ({ ...o, workshops: res.ok && res.data ? res.data : [] }));
      setDisabled(d => ({ ...d, workshop: !res.ok || !res.data?.length }));
    });
  }, [departmentId, setValue]);

  const workshopId = watch("factoryWorkshop");

  // Управление доступностью должности при выборе участка
  useEffect(() => {
    if (isInitializingRef.current) return;
    if (!workshopId) {
      setDisabled(d => ({ ...d, job: true }));
      setValue("factoryJobTitle", undefined);
      return;
    }
    // Загружаем должности для выбранного участка и отдела
    callApi(get<Option[]>(`/PersonalityFactory/jobtitles?department=${departmentId}&workshop=${workshopId}`)).then(res => {
      setOptions(o => ({ ...o, jobTitles: res.ok && res.data ? res.data : [] }));
      setDisabled(d => ({ ...d, job: !res.ok || !res.data?.length }));
    });
  }, [workshopId, departmentId, setValue]);

  // Загрузка гражданств
  useEffect(() => {
    if (isInitializingRef.current) return;
    if (!citizenshipTypeId) {
      setOptions(o => ({ ...o, citizenships: [] }));
      setDisabled(d => ({ ...d, citizenship: true }));
      setValue("factoryCitizenship", undefined);
      return;
    }
    callApi(get<Option[]>(`/PersonalityFactory/citizenships/${citizenshipTypeId}`)).then(res => {
      setOptions(o => ({ ...o, citizenships: res.ok && res.data ? res.data : [] }));
      setDisabled(d => ({ ...d, citizenship: !res.ok || !res.data?.length }));
    });
  }, [citizenshipTypeId, setValue]);

  const onlyRussian = (v: string) => v.replace(/[a-zA-Z0-9.,]/g, "").replace(/\s+/g, " ");
  const onlyDigits = (v: string) => v.replace(/[^\d]/g, "");
  
  const formatPhone = (v: string) => {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  };

  const formatCard = (v: string) => {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return "";
    return digits.slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const renderNumberSelect = (field: { value: unknown; onChange: (value: unknown) => void }, opts: Option[], label: string, dis?: boolean) => (
    <Select
      label={label}
      {...field}
      value={field.value != null ? String(field.value) : ""}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => field.onChange(e.target.value !== "" ? Number(e.target.value) : undefined)}
      options={opts.map(o => ({ value: String(o.id), label: o.name }))}
      disabled={dis}
    />
  );

  const onSubmit = async (data: Partial<FactoryPersonWithNav>) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        id: isEdit ? Number(id) : undefined,
        factoryDepartment: data.factoryDepartment ? Number(data.factoryDepartment) : null,
        factoryWorkshop: data.factoryWorkshop ? Number(data.factoryWorkshop) : null,
        factoryJobTitle: data.factoryJobTitle ? Number(data.factoryJobTitle) : null,
        factoryCitizenshipType: data.factoryCitizenshipType ? Number(data.factoryCitizenshipType) : null,
        factoryCitizenship: data.factoryCitizenship ? Number(data.factoryCitizenship) : null,
        factoryEntity: data.factoryEntity ? Number(data.factoryEntity) : null,
        factoryDocumentType: data.factoryDocumentType ? Number(data.factoryDocumentType) : null,
        factoryBanks: data.factoryBanks ? Number(data.factoryBanks) : null,
        skudGroupId: data.skudGroupId ? Number(data.skudGroupId) : null,
        cardNumber: data.cardNumber ?? null,
        passCardNumber: data.passCardNumber ?? null,
        passportDate: data.passportDate ? data.passportDate : null,
        birthdate: data.birthdate ? data.birthdate : null,
        hostelChekin: data.hostelChekin ? data.hostelChekin : null,
        hostelCheckOut: data.hostelCheckOut ? data.hostelCheckOut : null,
        hiringDate: data.hiringDate ? data.hiringDate : null,
        dismissedDate: data.dismissedDate ? data.dismissedDate : null,
        photo: photo ?? null,
      };

      if (isEdit) await callApi(put("/PersonalityFactory/persons", payload));
      else await callApi(post("/PersonalityFactory/persons", payload));

      navigate("/FactoryPerson");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <form onSubmit={handleSubmit(onSubmit)} className={styles.formWrapper}>
        <div className={styles.blockHandler}>
          <label className={styles.blockLabel}>Данные сотрудника</label>
          <div className={styles.blocksContainer}>

            {loading ? (
                <div className={styles.loadingSpinnerContainer}>
                  <LoadingSpinner size={34} />
                </div>
            ) : (
              <>
            <div className={styles.block}>
              <Input label="Фамилия" disabled={isSecurity} {...register("surname")} onChange={e => setValue("surname", onlyRussian(e.target.value))}/>
              <Input label="Имя" disabled={isSecurity} {...register("name")} onChange={e => setValue("name", onlyRussian(e.target.value))}/>
              <Input label="Отчество" disabled={isSecurity} {...register("patronymic")} onChange={e => setValue("patronymic", onlyRussian(e.target.value))}/>
              <Input label="Дата рождения" type="date" {...register("birthdate")}/>
              <Input label="Паспорт" disabled={isSecurity} {...register("passport")} onChange={e => setValue("passport", onlyDigits(e.target.value))}/>
              <Input label="Дата выдачи паспорта" type="date" {...register("passportDate")}/>

              <Controller name="factoryDepartment" control={control} render={({ field }) => renderNumberSelect(field, options.departments, "Отдел")}/>
              <Controller name="factoryWorkshop" control={control} render={({ field }) => renderNumberSelect(field, options.workshops, "Участок", disabled.workshop)}/>
              <Controller name="factoryJobTitle" control={control} render={({ field }) => renderNumberSelect(field, options.jobTitles, "Должность", disabled.job)}/>
            </div>

            <div className={styles.block}>
              <Controller name="factoryCitizenshipType" control={control} render={({ field }) => renderNumberSelect(field, options.citizenshipTypes, "Тип гражданства")}/>
              <Controller name="factoryCitizenship" control={control} render={({ field }) => renderNumberSelect(field, options.citizenships, "Гражданство", disabled.citizenship)}/>
              <Controller name="factoryEntity" control={control} render={({ field }) => renderNumberSelect(field, options.entities, "Юр. лицо")}/>
              <Controller name="factoryDocumentType" control={control} render={({ field }) => renderNumberSelect(field, options.documentTypes, "Тип документа")}/>
              <Controller name="skudGroupId" control={control} render={({ field }) => renderNumberSelect(field, options.skudGroups, "Группа СКУД")}/>
              {!isEdit && <Controller name="factoryBanks" control={control} render={({ field }) => renderNumberSelect(field, options.banks, "Банк")}/>}

              <Controller name="cardNumber" control={control} render={({ field }) => (
                <Input
                  label="Номер банковской карты"
                  value={formatCard(field.value ?? "")}
                  onChange={e => field.onChange(onlyDigits(e.target.value))}
                  disabled={isSecurity}
                  maxLength={19}
                />
              )}/>
              <div className={styles.dateInputs}>
                <Input label="Дата въезда" type="date" {...register("hostelChekin")}/>
                <Input label="Дата выезда" type="date" {...register("hostelCheckOut")}/>
              </div>
              <div className={styles.dateInputs}>
                <Input label="Дата приема на работу" type="date" {...register("hiringDate")}/>
                <Input label="Дата увольнения" type="date" {...register("dismissedDate")}/>
              </div>
              <Controller name="phone" control={control} render={({ field }) => (
                <Input 
                  label="Телефон"
                  value={formatPhone(field.value ?? "")}
                  onChange={e => field.onChange(onlyDigits(e.target.value))}
                  maxLength={13}
                />
              )}/>
            </div>
            </>
          )} 
          </div>
          
        
        </div>

        <div className={styles.photoBlock}>
          <label className={styles.blockLabel}>Фото</label>

          {loading ? (
              <LoadingSpinner size={34} />
            ) : (
              <>
                {!showCamera && !showCrop && (
                  <>
                    <img
                      src={photo ?? "../../../public/img/user.svg"}
                      className={styles.photo}
                      alt="photo"
                    />
                    {!isSecurity && (
                      <button
                        type="button"
                        className={styles.addPhotoButtonAccept}
                        onClick={() => setShowCamera(true)}
                      >
                        {photo ? "Изменить фото" : "Добавить фото"}
                      </button>
                    )}
                  </>
                )}

                {showCamera && (
                  <>
                    <Webcam
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      videoConstraints={{ facingMode: "user" }}
                      width={550}
                      height={550}
                      className={styles.webcam}
                    />
                    <div className={styles.cropFooter}>
                      <button
                        type="button"
                        className={styles.addPhotoButtonCancel}
                        onClick={cancelCamera}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className={styles.addPhotoButtonAccept}
                        onClick={capturePhoto}
                      >
                        Снять фото
                      </button>
                    </div>
                  </>
                )}

                {showCrop && tempPhoto && (
                  <div className={styles.cropModal}>
                    <div className={styles.cropBody}>
                      <Cropper
                        image={tempPhoto}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                      />
                    </div>
                    <div className={styles.cropFooter}>
                      <button
                        type="button"
                        className={styles.addPhotoButtonCancel}
                        onClick={cancelCrop}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className={styles.addPhotoButtonAccept}
                        onClick={saveCroppedPhoto}
                      >
                        Сохранить
                      </button>
                    </div>
                  </div>
                )}

                <Input
                  label="Номер пропуска"
                  {...register("passCardNumber")}
                  disabled={isSecurity}
                />
              </>
            )}
        </div>
        

        {modalError && (
          <Modal isOpen={!!modalError} onClose={() => setModalError(null)} title="Ошибка" size="sm">
            <p>{modalError}</p>
          </Modal>
        )}
      </form>

      <div className={styles.userEditFooter}>
        <button type="submit" className={styles.saveButton} onClick={handleSubmit(onSubmit)}>{saving ? <LoadingSpinner size={24} color="white"/> : (isEdit ? "Сохранить" : "Добавить")}</button>
      </div>
    </div>
  );
}
