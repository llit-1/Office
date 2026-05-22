import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useNotifications } from "@toolpad/core";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import Modal from "../../Components/Modal/Modal";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import Checkbox from "../../Components/Checkbox/Checkbox";
import Input from "../../Components/Input/Input";
import Select from "../../Components/Select/Select";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { del, get, getFriendlyErrorMessage, post, put } from "../../Services/api";
import styles from "./Salary.module.css";
import {
  BaseRuleItem,
  ExperienceRuleItem,
  JobTitleItem,
  LocationRuleItem,
  ProductionSettingsResponse,
  SalaryLocation,
  SalarySettingsBaseResponse,
  SettingsListResponse,
  formatPeriod,
  isStrictValidPeriod,
} from "./salaryShared";

type SettingsTab = "base" | "location" | "experience" | "production";
type DeleteTarget = { kind: "base" | "location" | "experience"; id: number } | null;

type BaseRuleForm = {
  ruleId?: number;
  mainJobGuid: string;
  realJobGuid: string;
  baseRate: string;
  hasExperience: boolean;
  hasLocation: boolean;
  partTimer: boolean;
  begin: string;
  end: string;
};

type LocationRuleForm = {
  ruleId?: number;
  locationRkCode: string;
  bam: string;
  begin: string;
  end: string;
};

type ExperienceRuleForm = {
  ruleId?: number;
  expMin: string;
  expMax: string;
  bonus: string;
  begin: string;
  end: string;
};

const emptyBaseForm: BaseRuleForm = {
  mainJobGuid: "",
  realJobGuid: "",
  baseRate: "",
  hasExperience: false,
  hasLocation: false,
  partTimer: false,
  begin: "",
  end: "",
};

const emptyLocationForm: LocationRuleForm = {
  locationRkCode: "",
  bam: "",
  begin: "",
  end: "",
};

const emptyExperienceForm: ExperienceRuleForm = {
  expMin: "",
  expMax: "",
  bonus: "",
  begin: "",
  end: "",
};

const SalarySettingsPage = () => {
  const dispatch = useDispatch();
  const notifications = useNotifications();

  const [activeTab, setActiveTab] = useState<SettingsTab>("base");
  const [isLoading, setIsLoading] = useState(true);

  const [baseData, setBaseData] = useState<SalarySettingsBaseResponse | null>(null);
  const [locationRules, setLocationRules] = useState<SettingsListResponse<LocationRuleItem>>({ items: [] });
  const [experienceRules, setExperienceRules] = useState<SettingsListResponse<ExperienceRuleItem>>({ items: [] });
  const [productionRules, setProductionRules] = useState<ProductionSettingsResponse>({ items: [], message: "" });

  const [isBaseModalOpen, setIsBaseModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isExperienceModalOpen, setIsExperienceModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const [baseForm, setBaseForm] = useState<BaseRuleForm>(emptyBaseForm);
  const [locationForm, setLocationForm] = useState<LocationRuleForm>(emptyLocationForm);
  const [experienceForm, setExperienceForm] = useState<ExperienceRuleForm>(emptyExperienceForm);

  useEffect(() => {
    dispatch(pathSet({ path: "/Salary" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Настройка правил расчета ставки" }));
  }, [dispatch]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const [base, locations, experience, production] = await Promise.all([
        get<SalarySettingsBaseResponse>("/salary/settings/base"),
        get<SettingsListResponse<LocationRuleItem>>("/salary/settings/location-rules"),
        get<SettingsListResponse<ExperienceRuleItem>>("/salary/settings/experience-rules"),
        get<ProductionSettingsResponse>("/salary/settings/production-rules"),
      ]);

      setBaseData(base);
      setLocationRules(locations);
      setExperienceRules(experience);
      setProductionRules(production);
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось загрузить настройки зарплаты."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const jobTitleOptions = useMemo(
    () => [
      { value: "", label: "Не выбрано" },
      ...((baseData?.jobTitles ?? []) as JobTitleItem[]).map((item) => ({
        value: item.guid,
        label: item.name,
      })),
    ],
    [baseData?.jobTitles],
  );

  const locationOptions = useMemo(
    () => [
      { value: "", label: "Не выбрано" },
      ...((baseData?.locations ?? []) as SalaryLocation[])
        .filter((item) => item.rkCode != null)
        .map((item) => ({
          value: String(item.rkCode),
          label: item.name,
        })),
    ],
    [baseData?.locations],
  );

  const jobNameByGuid = useMemo(() => {
    const map = new Map<string, string>();
    (baseData?.jobTitles ?? []).forEach((item) => {
      map.set(item.guid, item.name);
    });
    return map;
  }, [baseData?.jobTitles]);

  const locationNameByRkCode = useMemo(() => {
    const map = new Map<string, string>();
    (baseData?.locations ?? []).forEach((item) => {
      if (item.rkCode != null) {
        map.set(String(item.rkCode), item.name);
      }
    });
    return map;
  }, [baseData?.locations]);

  const openCreateBaseModal = () => {
    setBaseForm(emptyBaseForm);
    setIsBaseModalOpen(true);
  };

  const openEditBaseModal = (item: BaseRuleItem) => {
    setBaseForm({
      ruleId: item.ruleId ?? undefined,
      mainJobGuid: item.mainJob?.guid ?? "",
      realJobGuid: item.realJob?.guid ?? "",
      baseRate: item.bsm ?? "",
      hasExperience: item.exk === "1",
      hasLocation: item.bak === "1",
      partTimer: item.partTimer,
      begin: item.begin?.slice(0, 10) ?? "",
      end: item.end?.slice(0, 10) ?? "",
    });
    setIsBaseModalOpen(true);
  };

  const openCreateLocationModal = () => {
    setLocationForm(emptyLocationForm);
    setIsLocationModalOpen(true);
  };

  const openEditLocationModal = (item: LocationRuleItem) => {
    setLocationForm({
      ruleId: item.ruleId,
      locationRkCode: item.location?.rkCode != null ? String(item.location.rkCode) : "",
      bam: String(item.bam ?? ""),
      begin: item.begin?.slice(0, 10) ?? "",
      end: item.end?.slice(0, 10) ?? "",
    });
    setIsLocationModalOpen(true);
  };

  const openCreateExperienceModal = () => {
    setExperienceForm(emptyExperienceForm);
    setIsExperienceModalOpen(true);
  };

  const openEditExperienceModal = (item: ExperienceRuleItem) => {
    setExperienceForm({
      ruleId: item.ruleId,
      expMin: item.exPmin == null ? "" : String(item.exPmin),
      expMax: item.exPmax == null ? "" : String(item.exPmax),
      bonus: String(item.exM ?? ""),
      begin: item.begin?.slice(0, 10) ?? "",
      end: item.end?.slice(0, 10) ?? "",
    });
    setIsExperienceModalOpen(true);
  };

  const handleSaveBaseRule = async () => {
    if (!isStrictValidPeriod(baseForm.begin, baseForm.end)) {
      notifications.show('Период должен быть минимум 1 день: дата "По" должна быть позже даты "С".', {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    if (!baseForm.partTimer && (!baseForm.mainJobGuid || !baseForm.realJobGuid)) {
      notifications.show("Для обычного правила выберите основную должность и категорию из табеля.", {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    if (!baseForm.baseRate.trim()) {
      notifications.show("Укажите базовую ставку.", {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    const payload = {
      ruleId: baseForm.ruleId ?? 0,
      mainJob: !baseForm.partTimer && baseForm.mainJobGuid
        ? { guid: baseForm.mainJobGuid, name: jobNameByGuid.get(baseForm.mainJobGuid) ?? "" }
        : null,
      realJob: !baseForm.partTimer && baseForm.realJobGuid
        ? { guid: baseForm.realJobGuid, name: jobNameByGuid.get(baseForm.realJobGuid) ?? "" }
        : null,
      bsm: baseForm.baseRate.trim(),
      bak: baseForm.hasLocation ? "1" : "0",
      exk: baseForm.hasExperience ? "1" : "0",
      begin: baseForm.begin,
      end: baseForm.end,
      partTimer: baseForm.partTimer,
    };

    try {
      setIsSaving(true);
      if (baseForm.ruleId) {
        await put(`/salary/settings/base-rules/${baseForm.ruleId}`, payload);
      } else {
        await post("/salary/settings/base-rules", payload);
      }
      setIsBaseModalOpen(false);
      await loadSettings();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось сохранить правило ставки."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLocationRule = async () => {
    if (!locationForm.locationRkCode) {
      notifications.show("Выберите ТТ.", {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    if (!isStrictValidPeriod(locationForm.begin, locationForm.end)) {
      notifications.show('Период должен быть минимум 1 день: дата "По" должна быть позже даты "С".', {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    const payload = {
      ruleId: locationForm.ruleId ?? 0,
      location: {
        rkCode: Number(locationForm.locationRkCode),
        name: locationNameByRkCode.get(locationForm.locationRkCode) ?? "",
      },
      bam: Number(locationForm.bam || 0),
      begin: locationForm.begin,
      end: locationForm.end,
    };

    try {
      setIsSaving(true);
      if (locationForm.ruleId) {
        await put(`/salary/settings/location-rules/${locationForm.ruleId}`, payload);
      } else {
        await post("/salary/settings/location-rules", payload);
      }
      setIsLocationModalOpen(false);
      await loadSettings();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось сохранить правило особой локации."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveExperienceRule = async () => {
    if (!isStrictValidPeriod(experienceForm.begin, experienceForm.end)) {
      notifications.show('Период должен быть минимум 1 день: дата "По" должна быть позже даты "С".', {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    if (!experienceForm.expMin.trim() && !experienceForm.expMax.trim()) {
      notifications.show("Заполните хотя бы одно значение стажа.", {
        severity: "error",
        autoHideDuration: 3500,
      });
      return;
    }

    const payload = {
      ruleId: experienceForm.ruleId ?? 0,
      exPmin: experienceForm.expMin.trim() ? Number(experienceForm.expMin) : null,
      exPmax: experienceForm.expMax.trim() ? Number(experienceForm.expMax) : null,
      exM: Number(experienceForm.bonus || 0),
      begin: experienceForm.begin,
      end: experienceForm.end,
    };

    try {
      setIsSaving(true);
      if (experienceForm.ruleId) {
        await put(`/salary/settings/experience-rules/${experienceForm.ruleId}`, payload);
      } else {
        await post("/salary/settings/experience-rules", payload);
      }
      setIsExperienceModalOpen(false);
      await loadSettings();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось сохранить правило стажа."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    const urlByKind = {
      base: `/salary/settings/base-rules/${deleteTarget.id}`,
      location: `/salary/settings/location-rules/${deleteTarget.id}`,
      experience: `/salary/settings/experience-rules/${deleteTarget.id}`,
    };

    try {
      setIsSaving(true);
      await del(urlByKind[deleteTarget.kind]);
      setDeleteTarget(null);
      setIsBaseModalOpen(false);
      setIsLocationModalOpen(false);
      setIsExperienceModalOpen(false);
      await loadSettings();
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, "Не удалось удалить правило."), {
        severity: "error",
        autoHideDuration: 3500,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMessage = deleteTarget?.kind === "base"
    ? "Удалить правило ставки?"
    : deleteTarget?.kind === "location"
      ? "Удалить правило особой локации?"
      : "Удалить правило стажа?";

  return (
    <div className={styles.page}>

      <div className={styles.tabsCard}>
        <TabNavigation
          items={["Конструктор ставки", "Особые локации", "Стаж", "Выработка"]}
          activeIndex={["base", "location", "experience", "production"].indexOf(activeTab)}
          onChange={(index) => setActiveTab(["base", "location", "experience", "production"][index] as SettingsTab)}
        />
      </div>

      {isLoading ? (
        <div className={styles.centerState}>
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {activeTab === "base" && (
            <section className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionMeta}>{baseData?.loadError || `Правил: ${baseData?.baseRules.length ?? 0}`}</p>
                </div>
                <button className={styles.primaryButton} type="button" onClick={openCreateBaseModal}>Добавить</button>
              </div>

              {baseData?.baseRules.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Основная должность</th>
                        <th>Категория из табеля</th>
                        <th>Ставка</th>
                        <th>Стаж</th>
                        <th>Локация</th>
                        <th>Период</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baseData.baseRules.map((item) => (
                        <tr key={`${item.ruleId}-${item.begin}`} className={styles.clickableRow} onClick={() => openEditBaseModal(item)}>
                          <td>{item.mainJob?.name ?? "Парт-таймер"}</td>
                          <td>{item.realJob?.name ?? "-"}</td>
                          <td>{item.bsm || "-"}</td>
                          <td>{item.exk === "1" ? "+" : "-"}</td>
                          <td>{item.bak === "1" ? "+" : "-"}</td>
                          <td>{formatPeriod(item.begin, item.end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>Правила пока не заведены.</div>
              )}
            </section>
          )}

          {activeTab === "location" && (
            <section className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionMeta}>{locationRules.loadError || `Правил: ${locationRules.items.length}`}</p>
                </div>
                <button className={styles.primaryButton} type="button" onClick={openCreateLocationModal}>Добавить</button>
              </div>

              {locationRules.items.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>ТТ</th>
                        <th>Тариф</th>
                        <th>Период</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locationRules.items.map((item) => (
                        <tr key={`${item.ruleId}-${item.begin}`} className={styles.clickableRow} onClick={() => openEditLocationModal(item)}>
                          <td>{item.location?.name ?? "-"}</td>
                          <td>{item.bam}</td>
                          <td>{formatPeriod(item.begin, item.end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>Правила особых локаций не найдены.</div>
              )}
            </section>
          )}

          {activeTab === "experience" && (
            <section className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionMeta}>{experienceRules.loadError || `Правил: ${experienceRules.items.length}`}</p>
                </div>
                <button className={styles.primaryButton} type="button" onClick={openCreateExperienceModal}>Добавить</button>
              </div>

              {experienceRules.items.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Стаж</th>
                        <th>Доплата</th>
                        <th>Период</th>
                      </tr>
                    </thead>
                    <tbody>
                      {experienceRules.items.map((item) => (
                        <tr key={`${item.ruleId}-${item.begin}`} className={styles.clickableRow} onClick={() => openEditExperienceModal(item)}>
                          <td>{item.exPmax != null ? `от ${item.exPmin ?? 0} до ${item.exPmax}` : `от ${item.exPmin ?? 0}`}</td>
                          <td>{item.exM}</td>
                          <td>{formatPeriod(item.begin, item.end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>Правила стажа не найдены.</div>
              )}
            </section>
          )}

          {activeTab === "production" && (
            <section className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionMeta}>Вкладка перенесена как заготовка из исходного проекта.</p>
                </div>
              </div>

              {productionRules.items.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Категория</th>
                        <th>Длительность</th>
                        <th>Смены</th>
                        <th>Доплата</th>
                        <th>Период</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productionRules.items.map((item, index) => (
                        <tr key={`${item.category}-${index}`}>
                          <td>{item.category}</td>
                          <td>{item.duration}</td>
                          <td>{item.shifts}</td>
                          <td>{item.bonus}</td>
                          <td>{formatPeriod(item.begin ?? null, item.end ?? null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>{productionRules.message}</div>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        isOpen={isBaseModalOpen}
        onClose={() => setIsBaseModalOpen(false)}
        title={baseForm.ruleId ? "Редактирование правила" : "Добавление правила"}
        size="lg"
        panelClassName={styles.salarySettingsModalPanel}
        headerClassName={styles.salarySettingsModalHeader}
        bodyClassName={styles.salarySettingsModalBody}
        titleClassName={styles.salarySettingsModalTitle}
        closeButtonClassName={styles.salarySettingsModalClose}
      >
        <div className={`${styles.modalGrid} ${styles.modalGridSingleColumn}`}>
          <Select
            label="Основная должность"
            options={jobTitleOptions}
            value={baseForm.mainJobGuid}
            onChange={(event) => setBaseForm((current) => ({ ...current, mainJobGuid: event.target.value }))}
            search
            disabled={baseForm.partTimer || isSaving}
          />
          <Select
            label="Категория из табеля"
            options={jobTitleOptions}
            value={baseForm.realJobGuid}
            onChange={(event) => setBaseForm((current) => ({ ...current, realJobGuid: event.target.value }))}
            search
            disabled={baseForm.partTimer || isSaving}
          />
          <Input label="Ставка" type="number" min="0" value={baseForm.baseRate} onChange={(event) => setBaseForm((current) => ({ ...current, baseRate: event.target.value }))} />
          <div className={styles.checksBlock}>
            <Checkbox
              label="Стаж"
              checked={baseForm.hasExperience}
              onChange={(event) => setBaseForm((current) => ({ ...current, hasExperience: event.target.checked }))}
              labelClassName={styles.checkboxItem}
            />
            <Checkbox
              label="Локация"
              checked={baseForm.hasLocation}
              onChange={(event) => setBaseForm((current) => ({ ...current, hasLocation: event.target.checked }))}
              labelClassName={styles.checkboxItem}
            />
            <Checkbox
              label="Парт-таймер"
              checked={baseForm.partTimer}
              onChange={(event) =>
                setBaseForm((current) => ({
                  ...current,
                  partTimer: event.target.checked,
                  mainJobGuid: event.target.checked ? "" : current.mainJobGuid,
                  realJobGuid: event.target.checked ? "" : current.realJobGuid,
                }))
              }
              labelClassName={styles.checkboxItem}
            />
          </div>
          <Input label="Период с" type="date" value={baseForm.begin} onChange={(event) => setBaseForm((current) => ({ ...current, begin: event.target.value }))} />
          <Input label="Период по" type="date" value={baseForm.end} onChange={(event) => setBaseForm((current) => ({ ...current, end: event.target.value }))} />
        </div>
        <div className={styles.modalActions}>
          {baseForm.ruleId && (
            <button className={styles.dangerButton} type="button" disabled={isSaving} onClick={() => setDeleteTarget({ kind: "base", id: baseForm.ruleId! })}>
              Удалить
            </button>
          )}
          <button className={styles.primaryButton} type="button" disabled={isSaving} onClick={handleSaveBaseRule}>
            {isSaving ? "Сохранение..." : baseForm.ruleId ? "Сохранить" : "Создать"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        title={locationForm.ruleId ? "Редактирование особой локации" : "Добавление особой локации"}
        size="lg"
        panelClassName={styles.salarySettingsModalPanel}
        headerClassName={styles.salarySettingsModalHeader}
        bodyClassName={styles.salarySettingsModalBody}
        titleClassName={styles.salarySettingsModalTitle}
        closeButtonClassName={styles.salarySettingsModalClose}
      >
        <div className={`${styles.modalGrid} ${styles.modalGridSingleColumn}`}>
          <Select
            label="ТТ"
            options={locationOptions}
            value={locationForm.locationRkCode}
            onChange={(event) => setLocationForm((current) => ({ ...current, locationRkCode: event.target.value }))}
            search
          />
          <Input label="Тариф" type="number" min="0" value={locationForm.bam} onChange={(event) => setLocationForm((current) => ({ ...current, bam: event.target.value }))} />
          <Input label="Период с" type="date" value={locationForm.begin} onChange={(event) => setLocationForm((current) => ({ ...current, begin: event.target.value }))} />
          <Input label="Период по" type="date" value={locationForm.end} onChange={(event) => setLocationForm((current) => ({ ...current, end: event.target.value }))} />
        </div>
        <div className={styles.modalActions}>
          {locationForm.ruleId && (
            <button className={styles.dangerButton} type="button" disabled={isSaving} onClick={() => setDeleteTarget({ kind: "location", id: locationForm.ruleId! })}>
              Удалить
            </button>
          )}
          <button className={styles.primaryButton} type="button" disabled={isSaving} onClick={handleSaveLocationRule}>
            {isSaving ? "Сохранение..." : locationForm.ruleId ? "Сохранить" : "Создать"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isExperienceModalOpen}
        onClose={() => setIsExperienceModalOpen(false)}
        title={experienceForm.ruleId ? "Редактирование стажа" : "Добавление стажа"}
        size="lg"
        panelClassName={styles.salarySettingsModalPanel}
        headerClassName={styles.salarySettingsModalHeader}
        bodyClassName={styles.salarySettingsModalBody}
        titleClassName={styles.salarySettingsModalTitle}
        closeButtonClassName={styles.salarySettingsModalClose}
      >
        <div className={`${styles.modalGrid} ${styles.modalGridSingleColumn}`}>
          <Input label="Стаж от" type="number" min="0" value={experienceForm.expMin} onChange={(event) => setExperienceForm((current) => ({ ...current, expMin: event.target.value }))} />
          <Input label="Стаж до" type="number" min="0" value={experienceForm.expMax} onChange={(event) => setExperienceForm((current) => ({ ...current, expMax: event.target.value }))} />
          <Input label="Доплата" type="number" min="0" value={experienceForm.bonus} onChange={(event) => setExperienceForm((current) => ({ ...current, bonus: event.target.value }))} />
          <Input label="Период с" type="date" value={experienceForm.begin} onChange={(event) => setExperienceForm((current) => ({ ...current, begin: event.target.value }))} />
          <Input label="Период по" type="date" value={experienceForm.end} onChange={(event) => setExperienceForm((current) => ({ ...current, end: event.target.value }))} />
        </div>
        <div className={styles.modalActions}>
          {experienceForm.ruleId && (
            <button className={styles.dangerButton} type="button" disabled={isSaving} onClick={() => setDeleteTarget({ kind: "experience", id: experienceForm.ruleId! })}>
              Удалить
            </button>
          )}
          <button className={styles.primaryButton} type="button" disabled={isSaving} onClick={handleSaveExperienceRule}>
            {isSaving ? "Сохранение..." : experienceForm.ruleId ? "Сохранить" : "Создать"}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget != null}
        title="Удаление"
        message={deleteMessage}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        confirmLabel={isSaving ? "Удаление..." : "Удалить"}
        cancelLabel="Отмена"
      />
    </div>
  );
};

export default SalarySettingsPage;
