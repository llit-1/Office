import { useEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "@toolpad/core";
import { useSelector } from "react-redux";
import Select from "../../Components/Select/Select";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
import Modal from "../../Components/Modal/Modal";
import Textarea from "../../Components/Textarea/Textarea";
import { get, getFriendlyErrorMessage } from "../../Services/api";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import styles from "./StockTransfer.module.css";
import type { RootState } from "../../Store";

type WarehouseHolder = {
  id: number;
  surname: string;
  name: string;
  patronymic?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  actual: number;
};

type Location = {
  guid: string;
  name: string;
  actual: number;
};

type StockSearchData = {
  holders: WarehouseHolder[];
  locations: Location[];
  categories?: WarehouseCategoryNode[];
};

type WarehouseCategoryNode = {
  id: number | null;
  name?: string | null;
  parent: number | null;
  actual?: number | null;
};

type WarehouseObjectResponse = {
  warehouseCategoriesId?: number | null;
  name?: string | null;
  warehouseCategories?: WarehouseCategoryNode | null;
  warehouseSubCategory?: { name?: string | null } | null;
  warehouseSubCategories?: { name?: string | null } | null;
  location?: { name?: string | null } | null;
};

type ExternalTokenResponse = {
  token: string;
};

type TransferDraft = {
  code: string;
  category: string;
  subCategory: string;
  name: string;
  startLocation: string;
  endLocationGuid: string | null;
  endLocationName: string;
  newHolderId: number | null;
  newHolderName: string;
  filledBy: string;
  comment: string;
};

type HolderForm = {
  surname: string;
  name: string;
  patronymic: string;
  jobTitle: string;
  department: string;
};

const emptyHolderForm: HolderForm = {
  surname: "",
  name: "",
  patronymic: "",
  jobTitle: "",
  department: "",
};

const EXTERNAL_WAREHOUSE_API = "https://warehouseapi.ludilove.ru/api";
const GET_ALL_HOLDERS_URL = `${EXTERNAL_WAREHOUSE_API}/holder/GetAllHolders`;
const POST_HOLDER_URL = `${EXTERNAL_WAREHOUSE_API}/holder/PostHolder`;
const GET_OBJECT_URL = `${EXTERNAL_WAREHOUSE_API}/objects/getObject`;
const SET_TRANSFER_HISTORY_URL = `${EXTERNAL_WAREHOUSE_API}/transfer/SetObjectHistory`;

const normalizeRfidCode = (value: string) => {
  return value
    .toUpperCase()
    .replace(/Ф/g, "A")
    .replace(/И/g, "B")
    .replace(/С/g, "C")
    .replace(/В/g, "D")
    .replace(/У/g, "E")
    .replace(/А/g, "F");
};

const isScannerChar = (key: string) => /[0-9a-zA-Zа-яА-ЯёЁ]/.test(key);

const sortHolders = (items: WarehouseHolder[]) => [...items].sort((a, b) => a.surname.localeCompare(b.surname));

const getTextOrDash = (value?: string | null) => {
  if (typeof value !== "string") return "-";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "-";
};

const getShortCode = (value: string) => value.slice(-8);

const StockTransferPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [holders, setHolders] = useState<WarehouseHolder[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [holderId, setHolderId] = useState("");
  const [locationGuid, setLocationGuid] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [comment, setComment] = useState("");

  const [drafts, setDrafts] = useState<TransferDraft[]>([]);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());

  const [isScanning, setIsScanning] = useState(false);
  const scanBufferRef = useRef("");
  const duplicateScanWarningsRef = useRef<Set<string>>(new Set());
  const warehouseTokenRef = useRef<string | null>(null);
  const categoryCacheRef = useRef<Map<number, WarehouseCategoryNode>>(new Map());

  const [isAddHolderOpen, setIsAddHolderOpen] = useState(false);
  const [holderForm, setHolderForm] = useState<HolderForm>(emptyHolderForm);

  const notifications = useNotifications();
  const authFullName = useSelector((state: RootState) => state.auth.fullName);
  const authUserId = useSelector((state: RootState) => state.auth.id);

  const getWarehouseApiToken = async (forceRefresh = false) => {
    if (!forceRefresh && warehouseTokenRef.current) {
      return warehouseTokenRef.current;
    }

    const response = await get<ExternalTokenResponse>("/stock/external/token", {
      params: { forceRefresh },
    });
    const token = response?.token?.trim();
    if (!token) {
      throw new Error("Не удалось получить токен внешней складской API.");
    }

    warehouseTokenRef.current = token;
    return token;
  };

  const requestWarehouseApi = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const send = async (forceRefresh: boolean): Promise<T> => {
      const token = await getWarehouseApiToken(forceRefresh);
      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${token}`);
      if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(url, { ...init, headers });

      if (response.status === 401 && !forceRefresh) {
        warehouseTokenRef.current = null;
        return send(true);
      }

      if (!response.ok) {
        let errorMessage = `Ошибка запроса (${response.status})`;
        try {
          const body = await response.json() as { message?: string; title?: string; detail?: string };
          errorMessage = body.message || body.title || body.detail || errorMessage;
        } catch {
          const text = await response.text();
          if (text) {
            errorMessage = text;
          }
        }
        throw new Error(errorMessage);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    };

    return send(false);
  };

  const getCategoryById = async (id: number): Promise<WarehouseCategoryNode | null> => {
    if (!Number.isFinite(id)) return null;

    const cached = categoryCacheRef.current.get(id);
    if (cached) return cached;

    try {
      const category = await get<WarehouseCategoryNode>(`/stock/categories/${id}`);
      if (category?.id != null) {
        categoryCacheRef.current.set(category.id, category);
      }
      return category ?? null;
    } catch {
      return null;
    }
  };

  const resolveCategoryPath = async (objectData: WarehouseObjectResponse) => {
    let nameNode: WarehouseCategoryNode | null = objectData.warehouseCategories ?? null;
    if (nameNode?.id != null) {
      categoryCacheRef.current.set(nameNode.id, nameNode);
    }

    if ((!nameNode || nameNode.id == null) && objectData.warehouseCategoriesId != null) {
      nameNode = categoryCacheRef.current.get(objectData.warehouseCategoriesId) ?? await getCategoryById(objectData.warehouseCategoriesId);
    }

    const name = getTextOrDash(objectData.warehouseCategories?.name ?? objectData.name ?? nameNode?.name);

    let subCategory = "-";
    let category = "-";

    const subCategoryId = nameNode?.parent ?? null;
    if (subCategoryId != null) {
      const subCategoryNode = categoryCacheRef.current.get(subCategoryId) ?? await getCategoryById(subCategoryId);
      subCategory = getTextOrDash(subCategoryNode?.name);

      const categoryId = subCategoryNode?.parent ?? null;
      if (categoryId != null) {
        const categoryNode = categoryCacheRef.current.get(categoryId) ?? await getCategoryById(categoryId);
        category = getTextOrDash(categoryNode?.name);
      }
    }

    return { category, subCategory, name };
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const data = await get<StockSearchData>("/stock/search-data");
        setLocations(Array.isArray(data?.locations) ? data.locations : []);
        const categories = Array.isArray(data?.categories) ? data.categories : [];
        const nextCategoryCache = new Map<number, WarehouseCategoryNode>();
        categories.forEach((item) => {
          if (item?.id != null) {
            nextCategoryCache.set(item.id, item);
          }
        });
        categoryCacheRef.current = nextCategoryCache;

        const fallbackHolders = Array.isArray(data?.holders) ? sortHolders(data.holders) : [];

        try {
          const externalHolders = await requestWarehouseApi<WarehouseHolder[]>(GET_ALL_HOLDERS_URL);
          setHolders(Array.isArray(externalHolders) ? sortHolders(externalHolders) : fallbackHolders);
        } catch {
          setHolders(fallbackHolders);
        }
      } catch {
        notifications.show("Не удалось загрузить данные для передачи.", { severity: "error", autoHideDuration: 3000 });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [notifications]);

  const holderOptions = useMemo(
    () =>
      holders
        .filter((holder) => holder.actual === 1)
        .map((holder) => ({
          value: String(holder.id),
          label: [holder.surname, holder.name, holder.patronymic ?? ""].filter(Boolean).join(" "),
        })),
    [holders],
  );

  const locationOptions = useMemo(
    () =>
      locations
        .filter((location) => location.actual === 1)
        .map((location) => ({ value: location.guid, label: location.name })),
    [locations],
  );

  const selectedHolder = holderOptions.find((item) => item.value === holderId) ?? null;
  const selectedLocation = locationOptions.find((item) => item.value === locationGuid) ?? null;

  const filledBy = useMemo(() => {
    return authFullName?.trim() || (authUserId ? `User #${authUserId}` : "Текущий пользователь");
  }, [authFullName, authUserId]);

  const addDraftByCode = async (raw: string, source: "manual" | "scanner" = "manual") => {
    const prepared = normalizeRfidCode(raw.trim());
    if (!prepared) return;

    const code = prepared.padStart(24, "0");
    if (code.length !== 24) {
      notifications.show("Код должен содержать 24 символа.", { severity: "error", autoHideDuration: 3000 });
      return;
    }

    if (!selectedLocation && !selectedHolder) {
      notifications.show("Выберите конечную точку или нового держателя.", { severity: "error", autoHideDuration: 3000 });
      return;
    }

    if (scannedCodes.has(code)) {
      if (source === "scanner") {
        if (!duplicateScanWarningsRef.current.has(code)) {
          duplicateScanWarningsRef.current.add(code);
          notifications.show("Этот код уже добавлен.", { severity: "warning", autoHideDuration: 7000 });
        }
      } else {
        notifications.show("Этот код уже добавлен.", { severity: "warning", autoHideDuration: 2500 });
      }
      return;
    }

    let objectData: WarehouseObjectResponse;
    try {
      objectData = await requestWarehouseApi<WarehouseObjectResponse>(`${GET_OBJECT_URL}?id=${encodeURIComponent(code)}`);
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось получить данные объекта."), {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    const categoryPath = await resolveCategoryPath(objectData);

    const draft: TransferDraft = {
      code,
      category: categoryPath.category,
      subCategory: categoryPath.subCategory,
      name: categoryPath.name,
      startLocation: getTextOrDash(objectData.location?.name),
      endLocationGuid: selectedLocation?.value ?? null,
      endLocationName: selectedLocation?.label ?? "",
      newHolderId: selectedHolder ? Number(selectedHolder.value) : null,
      newHolderName: selectedHolder?.label ?? "",
      filledBy,
      comment,
    };

    setDrafts((prev) => [...prev, draft]);
    setScannedCodes((prev) => {
      const next = new Set(prev);
      next.add(code);
      return next;
    });
    setCodeInput("");
    if (source === "manual") {
      notifications.show("Объект добавлен в таблицу передачи.", { severity: "success", autoHideDuration: 2500 });
    }
  };

  const handleAddDraft = () => {
    void addDraftByCode(codeInput, "manual");
  };

  const toggleScan = () => {
    setIsScanning((prev) => {
      const next = !prev;
      if (next) {
        duplicateScanWarningsRef.current.clear();
      }
      return next;
    });
    scanBufferRef.current = "";
  };

  useEffect(() => {
    if (!isScanning) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      if (event.key === "Enter") {
        const completed = scanBufferRef.current;
        scanBufferRef.current = "";

        if (completed.length === 24) {
          void addDraftByCode(completed, "scanner");
        }
        return;
      }

      if (event.key.length === 1 && isScannerChar(event.key)) {
        const next = (scanBufferRef.current + event.key).slice(0, 24);
        scanBufferRef.current = next;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isScanning, selectedHolder, selectedLocation, scannedCodes, comment, filledBy, notifications]);

  const updateDraftComment = (index: number, value: string) => {
    setDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, comment: value } : item)));
  };

  const clearAllFields = () => {
    setDrafts([]);
    setScannedCodes(new Set());
    setCodeInput("");
    setComment("");
    setHolderId("");
    setLocationGuid("");
    setIsScanning(false);
    scanBufferRef.current = "";
    duplicateScanWarningsRef.current.clear();
  };

  const sendTransfer = async () => {
    if (drafts.length === 0) {
      notifications.show("Добавьте хотя бы один объект.", { severity: "error", autoHideDuration: 3000 });
      return;
    }

    const payload = drafts.map((draft) => ({
      WarehouseObjectsId: draft.code,
      User: draft.filledBy,
      NewHolder: draft.newHolderId,
      Location: draft.endLocationGuid,
      DateTime: new Date().toISOString(),
      Comment: draft.comment,
      WarehouseAction: 2,
    }));

    try {
      await requestWarehouseApi(SET_TRANSFER_HISTORY_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      notifications.show("Данные успешно отправлены.", { severity: "success", autoHideDuration: 3000 });
      clearAllFields();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось отправить данные передачи."), {
        severity: "error",
        autoHideDuration: 5000,
      });
    }
  };

  const canAddHolder = holderForm.surname.trim().length > 0 && holderForm.name.trim().length > 0;

  const handleAddHolder = async () => {
    if (!canAddHolder) return;

    const surname = holderForm.surname.trim();
    const name = holderForm.name.trim();
    const patronymic = holderForm.patronymic.trim();
    const jobTitle = holderForm.jobTitle.trim();
    const department = holderForm.department.trim();

    try {
      await requestWarehouseApi(POST_HOLDER_URL, {
        method: "POST",
        body: JSON.stringify({
        Surname: surname,
        Name: name,
        Patronymic: patronymic || null,
        JobTitle: jobTitle || null,
        Department: department || null,
        Actual: 1,
        }),
      });

      const externalHolders = await requestWarehouseApi<WarehouseHolder[]>(GET_ALL_HOLDERS_URL);
      const nextHolders = Array.isArray(externalHolders) ? sortHolders(externalHolders) : [];
      setHolders(nextHolders);

      const matchedHolder = nextHolders
        .filter((holder) => {
          const holderSurname = holder.surname.trim().toLowerCase();
          const holderName = holder.name.trim().toLowerCase();
          const holderPatronymic = (holder.patronymic ?? "").trim().toLowerCase();
          return holderSurname === surname.toLowerCase()
            && holderName === name.toLowerCase()
            && holderPatronymic === patronymic.toLowerCase();
        })
        .sort((a, b) => b.id - a.id)[0];

      if (matchedHolder) {
        setHolderId(String(matchedHolder.id));
      }

      setHolderForm(emptyHolderForm);
      setIsAddHolderOpen(false);
      notifications.show("Держатель добавлен.", { severity: "success", autoHideDuration: 2500 });
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось добавить держателя."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    }
  };

  if (isLoading) {
    return <div className={styles.loaderWrapper}><LoadingSpinner size={96} label="Загружаем передачу…" /></div>;
  }

  return (
    <div className={styles.transferWrapper}>
      <div className={styles.mainFieldsWrapper}>
        <div className={styles.mainFields}>
          <Select
            label="Конечная точка"
            options={locationOptions}
            value={locationGuid}
            onChange={(e) => setLocationGuid(e.target.value)}
            placeholder="Выберите конечную точку"
            search
          />

          <div className={styles.holderSelectWrapper}>
            <Select
              label="Новый держатель"
              options={holderOptions}
              value={holderId}
              onChange={(e) => setHolderId(e.target.value)}
              placeholder="Выберите держателя"
              search
            />
            <button className={styles.addHolder} onClick={() => setIsAddHolderOpen(true)}>Добавить</button>
          </div>
        </div>

        <div className={styles.mainFields + " " + styles.codeInputSection}>
          <div className={styles.holderSelectWrapper}>
            <Input
              label="Код объекта"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              maxLength={24}
              placeholder="000000000000000000000000"
            />

            <button className={styles.addHolder} onClick={handleAddDraft}>Добавить</button>
          </div>

          <button
            className={`${styles.scanBtn} ${isScanning ? styles.scanBtnActive : ""}`}
            onClick={toggleScan}
          >
            <span>{isScanning ? "Остановить сканирование" : "Сканировать"}</span>
            {isScanning && (
              <span className={styles.scanState}>
                <span className={styles.scanStateDot}></span>
                Активно
              </span>
            )}
          </button>
        </div>
      </div>

      <div className={`${styles.mainFields} ${styles.commentSection}`}>
        <Textarea
          label="Комментарий"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Пожалуйста, укажите номер заявки или другие данные по перемещению"
        />
      </div>

      <div className={styles.mainFields}>
        <div className={styles.headerDrafts}>
          <p className={styles.colCode}>ID</p>
          <p className={styles.colCategory}>Категория</p>
          <p className={styles.colSubCategory}>Подкатегория</p>
          <p className={styles.colName}>Наименование</p>
          <p className={styles.colStartLocation}>Начальная точка</p>
          <p className={styles.colEndLocation}>Конечная точка</p>
          <p className={styles.colNewHolder}>Новый держатель</p>
          <p className={styles.colFilledBy}>Заполнил</p>
          <p className={styles.colComment}>Комментарий</p>
        </div>

        <div className={styles.bodyDrafts}>
          {drafts.length === 0 && <div className={styles.emptyDrafts}>Нет добавленных объектов</div>}

          {drafts.map((draft, index) => (
            <div className={styles.rowDrafts} key={`${draft.code}-${index}`}>
              <div className={`${styles.draftField} ${styles.colCode}`}>
                <span className={styles.draftFieldLabel}>ID</span>
                <span className={styles.draftFieldValue}>{getShortCode(draft.code)}</span>
              </div>
              <div className={`${styles.draftField} ${styles.colCategory}`}>
                <span className={styles.draftFieldLabel}>Категория</span>
                <span className={styles.draftFieldValue}>{draft.category}</span>
              </div>
              <div className={`${styles.draftField} ${styles.colSubCategory}`}>
                <span className={styles.draftFieldLabel}>Подкатегория</span>
                <span className={styles.draftFieldValue}>{draft.subCategory}</span>
              </div>
              <div className={`${styles.draftField} ${styles.colName}`}>
                <span className={styles.draftFieldLabel}>Наименование</span>
                <span className={styles.draftFieldValue}>{draft.name}</span>
              </div>
              <div className={`${styles.draftField} ${styles.colStartLocation}`}>
                <span className={styles.draftFieldLabel}>Начальная точка</span>
                <span className={styles.draftFieldValue}>{draft.startLocation}</span>
              </div>
              <div className={`${styles.draftField} ${styles.colEndLocation}`}>
                <span className={styles.draftFieldLabel}>Конечная точка</span>
                <span className={styles.draftFieldValue}>{draft.endLocationName || "-"}</span>
              </div>
              <div className={`${styles.draftField} ${styles.colNewHolder}`}>
                <span className={styles.draftFieldLabel}>Новый держатель</span>
                <span className={styles.draftFieldValue}>{draft.newHolderName || "-"}</span>
              </div>
              <div className={`${styles.draftField} ${styles.colFilledBy}`}>
                <span className={styles.draftFieldLabel}>Заполнил</span>
                <span className={styles.draftFieldValue}>{draft.filledBy}</span>
              </div>
              <label className={`${styles.draftCommentField} ${styles.colComment}`}>
                <span className={styles.draftFieldLabel}>Комментарий</span>
                <input
                  className={styles.commentRowInput}
                  value={draft.comment}
                  onChange={(e) => updateDraftComment(index, e.target.value)}
                  placeholder="Комментарий"
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.buttonsWrapper}>
        <Button variant="secondary" onClick={clearAllFields}>Очистить</Button>
        <Button variant="primary" onClick={() => void sendTransfer()}>Отправить</Button>
      </div>

      <Modal
        isOpen={isAddHolderOpen}
        onClose={() => setIsAddHolderOpen(false)}
        title="Добавление держателя"
        size="sm"
      >
        <div className={styles.addHolderModalFields}>
          <Input
            label="Фамилия"
            value={holderForm.surname}
            onChange={(e) => setHolderForm((prev) => ({ ...prev, surname: e.target.value }))}
          />
          <Input
            label="Имя"
            value={holderForm.name}
            onChange={(e) => setHolderForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="Отчество"
            value={holderForm.patronymic}
            onChange={(e) => setHolderForm((prev) => ({ ...prev, patronymic: e.target.value }))}
          />
          <Input
            label="Должность"
            value={holderForm.jobTitle}
            onChange={(e) => setHolderForm((prev) => ({ ...prev, jobTitle: e.target.value }))}
          />
          <Input
            label="Отдел"
            value={holderForm.department}
            onChange={(e) => setHolderForm((prev) => ({ ...prev, department: e.target.value }))}
          />

          <div className={styles.addHolderModalButtons}>
            <Button variant="primary" disabled={!canAddHolder} onClick={handleAddHolder}>Добавить</Button>
            <Button variant="secondary" onClick={() => setIsAddHolderOpen(false)}>Закрыть</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StockTransferPage;
