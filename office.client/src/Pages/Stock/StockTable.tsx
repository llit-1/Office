import { useDispatch } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import styles from "./StockTable.module.css"
import SettingsIcon from '@mui/icons-material/Settings';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import { del, get, post, put } from "../../Services/api";
import Modal from "../../Components/Modal/Modal";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import Input from "../../Components/Input/Input";
import Button from "../../Components/Button/Button";
import { Toggle } from "../../Components/Toggle/Toggle";
import { useNotifications } from "@toolpad/core";

type WarehouseCategory = {
    id: number | null;
    name: string | null;
    parent: number | null;
    actual: number;
    img?: number[] | null;
};

const StockTable = () => {

    const [category, setCategory] = useState<WarehouseCategory | null>(null);
    const [subCategories, setSubCategories] = useState<WarehouseCategory[]>([]);
    const [activeSubCategory, setActiveSubCategory] = useState<WarehouseCategory | null>(null);
    const [subItems, setSubItems] = useState<WarehouseCategory[]>([]);
    const [isCategoryLoading, setIsCategoryLoading] = useState<boolean>(true);
    const [isItemsLoading, setIsItemsLoading] = useState<boolean>(false);
    const [itemsError, setItemsError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<WarehouseCategory | null>(null);
    const [formName, setFormName] = useState("");
    const [formActual, setFormActual] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [editContext, setEditContext] = useState<"sub" | "item">("sub");
    const [parentId, setParentId] = useState<number | null>(null);

  const dispatch = useDispatch();
  const notifications = useNotifications();
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get("id");
  const nameParam = searchParams.get("name");
  const pathParam = searchParams.get("path");
  const categoryId = idParam ? Number(idParam) : null;

  useEffect(() => {
        dispatch(pathSet({ path: "/Stock" }));
        dispatch(visibleSet({ visible: true }));
        const titleName = category?.name ?? (nameParam ? decodeURIComponent(nameParam) : "");
        dispatch(titleSet({ title: titleName ? `Структура категории: ${titleName}` : "Структура категории" }));
  },[dispatch, category?.name, nameParam]);

  useEffect(() => {
        const load = async () => {
            if (!categoryId || Number.isNaN(categoryId)) {
                setCategory(null);
                setSubCategories([]);
                setActiveSubCategory(null);
                setSubItems([]);
                setIsCategoryLoading(false);
                notifications.show("Категория не выбрана", { severity: "error", autoHideDuration: 3000 });
                return;
            }

            setIsCategoryLoading(true);
            setActiveSubCategory(null);
            setSubItems([]);

            try {
                const loadedCategory = await get<WarehouseCategory>(`/stock/categories/${categoryId}`);
                setCategory(loadedCategory ?? null);
                const children = await get<WarehouseCategory[]>(`/stock/categories/${categoryId}/children`);
                setSubCategories(children ?? []);
            } catch {
                setCategory(null);
                setSubCategories([]);
                notifications.show("Не удалось загрузить категорию.", { severity: "error", autoHideDuration: 3000 });
            } finally {
                setIsCategoryLoading(false);
            }
        };

        load();
  }, [categoryId]);

  useEffect(() => {
        if (!pathParam || subCategories.length === 0) return;
        if (activeSubCategory) return;

        const decoded = decodeURIComponent(pathParam);
        const parts = decoded.split(" / ").map((p) => p.trim()).filter(Boolean);
        if (parts.length < 2) return;

        const targetName = parts[1];
        const target = subCategories.find((c) => (c.name ?? "").trim() === targetName);
        if (target) {
            loadSubItems(target);
        }
  }, [pathParam, subCategories, activeSubCategory]);

  const loadSubItems = async (categoryItem: WarehouseCategory) => {
        if (!categoryItem.id) return;
        setActiveSubCategory(categoryItem);
        setIsItemsLoading(true);
        setItemsError(null);
        try {
            const children = await get<WarehouseCategory[]>(`/stock/categories/${categoryItem.id}/children`);
            setSubItems(children ?? []);
        } catch {
            setSubItems([]);
            notifications.show("Не удалось загрузить подкатегории.", { severity: "error", autoHideDuration: 3000 });
        } finally {
            setIsItemsLoading(false);
        }
  };

  const openCreateSubCategory = () => {
        if (!categoryId || Number.isNaN(categoryId)) {
            notifications.show("Категория не выбрана", { severity: "error", autoHideDuration: 3000 });
            return;
        }
        setEditContext("sub");
        setParentId(categoryId);
        setSelectedCategory(null);
        setFormName("");
        setFormActual(true);
        setIsSettingsOpen(true);
  };

  const openCreateItem = () => {
        if (!activeSubCategory?.id) return;
        setEditContext("item");
        setParentId(activeSubCategory.id);
        setSelectedCategory(null);
        setFormName("");
        setFormActual(true);
        setIsSettingsOpen(true);
  };

  const openEdit = (categoryItem: WarehouseCategory, context: "sub" | "item") => {
        setEditContext(context);
        setParentId(categoryItem.parent ?? null);
        setSelectedCategory(categoryItem);
        setFormName(categoryItem.name ?? "");
        setFormActual(categoryItem.actual === 1);
        setIsSettingsOpen(true);
  };

  const closeSettingsModal = useCallback(() => {
        if (isSaving) return;
        setIsSettingsOpen(false);
        setSelectedCategory(null);
        setIsDeleteOpen(false);
  }, [isSaving]);

  const refreshLists = async (context: "sub" | "item") => {
        if (context === "sub") {
            if (!categoryId || Number.isNaN(categoryId)) return;
            const children = await get<WarehouseCategory[]>(`/stock/categories/${categoryId}/children`);
            setSubCategories(children ?? []);
        } else if (context === "item") {
            if (!activeSubCategory?.id) return;
            const children = await get<WarehouseCategory[]>(`/stock/categories/${activeSubCategory.id}/children`);
            setSubItems(children ?? []);
        }
  };

  const handleSave = async () => {
        const name = formName.trim();
        if (!name) {
            notifications.show("Введите название категории", { severity: "error", autoHideDuration: 3000 });
            return;
        }

        const payload = {
            name,
            parent: selectedCategory?.parent ?? parentId ?? null,
            actual: formActual ? 1 : 0,
            img: null,
        };

        try {
            if (selectedCategory?.id != null) {
                await put(`/stock/categories/${selectedCategory.id}`, payload);
            } else {
                await post("/stock/categories", payload);
            }

            await refreshLists(editContext);
            closeSettingsModal();
        } catch {
            notifications.show("Не удалось сохранить категорию.", { severity: "error", autoHideDuration: 3000 });
        } finally {
            setIsSaving(false);
        }
  };

  const handleDelete = async () => {
        if (!selectedCategory?.id) return;
        setIsSaving(true);
        try {
            await del(`/stock/categories/${selectedCategory.id}`);
            if (editContext === "sub" && activeSubCategory?.id === selectedCategory.id) {
                setActiveSubCategory(null);
                setSubItems([]);
            }
            await refreshLists(editContext);
            setIsDeleteOpen(false);
            closeSettingsModal();
        } catch {
            notifications.show("Не удалось удалить категорию.", { severity: "error", autoHideDuration: 3000 });
        } finally {
            setIsSaving(false);
        }
  };

  return (
    <>
    <div className={styles.wrapper}>
        <div className={styles.stockTable}>

            { isCategoryLoading ? (
                <>
                    <div className={styles.loading}> <LoadingSpinner /> </div>
                </>) : (
                <>
                    <div className={styles.stockTableSubCategories}>
                        <div className={`${styles.stockTableSubCategoriesItem} ${styles.addCategory}`} onClick={openCreateSubCategory}> + </div>
                        <div className={styles.itemsScroll}>
                            {subCategories.map((subCategory, index) => (
                                <div
                                    key={subCategory.id ?? `${subCategory.name ?? "subcategory"}-${index}`}
                                    className={`${styles.stockTableSubCategoriesItem} ${activeSubCategory?.id === subCategory.id ? styles.active : ""}`}
                                    onClick={() => loadSubItems(subCategory)}
                                >
                                    <div className={styles.name}>{subCategory.name ?? ""}</div>
                                    <div
                                        className={styles.settingsCard}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openEdit(subCategory, "sub");
                                        }}
                                    >
                                        <SettingsIcon className={styles.settingsIcon} />
                                        <span className={styles.settingsText}>Настройки</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            

            <div className={styles.stockTableItems}>

                { activeSubCategory ? (
                    <>
                        <div className={`${styles.stockTableSubCategoriesItem} ${styles.addCategory}`} onClick={openCreateItem}> + </div>
                        {isItemsLoading ? (
                            <div className={styles.loading}> <LoadingSpinner /> </div>
                        ) : (
                            <>
                            <div className={styles.itemsScroll}>
                                {subItems.map((subItem, index) => (
                                    <div
                                        key={subItem.id ?? `${subItem.name ?? "item"}-${index}`}
                                        className={styles.stockTableSubCategoriesItem}
                                    >
                                        <div className={styles.name}>{subItem.name ?? ""}</div>
                                        <div
                                            className={styles.settingsCard}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                openEdit(subItem, "item");
                                            }}
                                        >
                                            <SettingsIcon className={styles.settingsIcon} />
                                            <span className={styles.settingsText}>Настройки</span>
                                        </div>
                                    </div>
                                ))}
                                {itemsError ? (
                                    <div className={styles.gettingStarted}>
                                        <p>{itemsError}</p>
                                    </div>
                                ) : null}
                            </div>
                            </>
                            
                        )}
                    </>
                ) : (
                    <>
                        <div className={styles.gettingStarted}>
                        <UndoRoundedIcon className={styles.getStartedIcon} />
                        <p>Для начала выберите подкатегорию</p>
                        </div>
                    </>
                )}

                
            </div>
        </div>
    </div>
    <Modal
        isOpen={isSettingsOpen}
        onClose={closeSettingsModal}
        title={selectedCategory ? "Настройки категории" : "Создание категории"}
        size="sm"
    >
        <div className={styles.modalContent}>
            <div className={styles.modalInputs}>
                <Input
                    label="Название категории"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                />

                <Toggle
                    label="Активность"
                    checked={formActual}
                    onChange={(value) => setFormActual(Boolean(value))}
                    containerClassName={styles.modalToggle}
                />
            </div>

            <div className={styles.modalButtons}>
                { selectedCategory && (
                    <Button variant="danger" onClick={() => setIsDeleteOpen(true)} disabled={isSaving}>Удалить</Button>
                )}

                { selectedCategory ? (
                    <Button variant="primary" onClick={handleSave} loading={isSaving}>Сохранить</Button>
                ) : (
                    <Button variant="primary" onClick={handleSave} loading={isSaving}>Создать</Button>
                )}
            </div>
        </div>
    </Modal>

    <ConfirmModal
        isOpen={isDeleteOpen}
        title="Удалить категорию?"
        message={`Вы уверены, что хотите удалить категорию "${selectedCategory?.name ?? ""}"?`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        panelClassName={styles.confirmModalPanel}
    />
    </>
  )
}

export default StockTable
