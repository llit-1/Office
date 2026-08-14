import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@toolpad/core";
import { Toggle } from "../../Components/Toggle/Toggle";
import { del, get, post, put } from "../../Services/api";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../Components/Modal/Modal";
import Input from "../../Components/Input/Input";
import Button from "../../Components/Button/Button";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import styles from "./Stock.module.css";

type WarehouseCategory = {
  id: number | null;
  name: string | null;
  parent: number | null;
  actual: number;
  img?: number[] | null;
};

type SearchItem = {
  id: number;
  text: string;
};

const StockStructurePage = () => {
  const [searchText, setSearchText] = useState("");
  const [mainCategories, setMainCategories] = useState<WarehouseCategory[]>([]);
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<WarehouseCategory | null>(null);
  const [formName, setFormName] = useState("");
  const [formActual, setFormActual] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const notifications = useNotifications();
  const navigate = useNavigate();

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const url = onlyActive ? "/stock/categories?actual=1" : "/stock/categories";
      const data = await get<WarehouseCategory[]>(url);
      setMainCategories((data ?? []).filter((c) => c.parent == null));
    } catch {
      setMainCategories([]);
      notifications.show("Не удалось загрузить категории.", { severity: "error", autoHideDuration: 3000 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [onlyActive]);

  useEffect(() => {
    const loadSearch = async () => {
      const q = searchText.trim();
      if (!q || !isSearchOpen) {
        setSearchItems([]);
        return;
      }

      setIsSearchLoading(true);
      try {
        const data = await get<SearchItem[]>(`/stock/search-items?query=${encodeURIComponent(q)}`);
        setSearchItems(Array.isArray(data) ? data : []);
      } catch {
        setSearchItems([]);
        notifications.show("Не удалось выполнить поиск.", { severity: "error", autoHideDuration: 3000 });
      } finally {
        setIsSearchLoading(false);
      }
    };

    loadSearch();
  }, [searchText, isSearchOpen, notifications]);

  const openCreateModal = () => {
    setSelectedCategory(null);
    setFormName("");
    setFormActual(true);
    setIsSettingsOpen(true);
  };

  const openEditModal = (category: WarehouseCategory) => {
    setSelectedCategory(category);
    setFormName(category.name ?? "");
    setFormActual(category.actual === 1);
    setIsSettingsOpen(true);
  };

  const closeSettingsModal = useCallback(() => {
    if (isSaving) return;
    setIsSettingsOpen(false);
    setSelectedCategory(null);
    setIsDeleteOpen(false);
  }, [isSaving]);

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      notifications.show("Введите название категории", { severity: "error", autoHideDuration: 3000 });
      return;
    }

    setIsSaving(true);
    try {
      if (selectedCategory?.id != null) {
        await put(`/stock/categories/${selectedCategory.id}`, {
          name,
          parent: null,
          actual: formActual ? 1 : 0,
          img: null,
        });
      } else {
        await post("/stock/categories", {
          name,
          parent: null,
          actual: formActual ? 1 : 0,
          img: null,
        });
      }

      await loadCategories();
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
      await loadCategories();
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
      <div className={styles.structureControls}>
        <div className={styles.table_search}>
          <span>
            <SearchIcon />
          </span>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => setIsSearchOpen(true)}
            onBlur={() => setTimeout(() => setIsSearchOpen(false), 150)}
            placeholder="Поиск..."
          />
          {isSearchOpen && (
            <div
              className={styles.searchDropdown}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
            >
              {isSearchLoading ? (
                <div className={styles.searchItemMuted}> <LoadingSpinner /> </div>
              ) : (
                <>
                  {searchItems.length === 0 ? (
                    <div className={styles.searchItemMuted}>Ничего не найдено</div>
                  ) : (
                    searchItems.map((item) => (
                      <div
                        key={`search-${item.id}-${item.text}`}
                        className={styles.searchItem}
                        onClick={() => {
                          const path = item.text ? encodeURIComponent(item.text) : "";
                          navigate(`/StockTable?id=${item.id}${path ? `&path=${path}` : ""}`);
                          setIsSearchOpen(false);
                        }}
                      >
                        {item.text}
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <label className={styles.activeFilter} htmlFor="stock-only-active">
          <span className={styles.activeFilterLabel}>Только активные</span>
          <input
            id="stock-only-active"
            className={styles.activeFilterInput}
            type="checkbox"
            checked={onlyActive}
            onChange={(event) => setOnlyActive(event.target.checked)}
          />
          <span className={styles.activeFilterTrack} aria-hidden="true">
            <span className={styles.activeFilterThumb} />
          </span>
        </label>
      </div>

      {isLoading ? <div className={styles.loaderWrapper}><LoadingSpinner size={96} label="Загружаем структуру склада…" /></div> : (
        <div className={styles.contentWrapper}>
          <div className={`${styles.card} ${styles.addCard}`} onClick={openCreateModal}>
            +
          </div>
          {mainCategories
            .filter((category) => {
              const q = searchText.trim().toLowerCase();
              if (!q) return true;
              return (category.name ?? "").toLowerCase().includes(q);
            })
            .map((category, index) => (
              <div
                key={category.id ?? `${category.name ?? "category"}-${index}`}
                onClick={() => {
                  if (category.id == null) return;
                  const name = category.name ? encodeURIComponent(category.name) : "";
                  navigate(`/StockTable?id=${category.id}${name ? `&name=${name}` : ""}`);
                }}
                className={`${styles.card} ${category.actual === 1 ? styles.activeCard : styles.nonActiveCard}`}
              >
                <div
                  className={styles.settingsCard}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openEditModal(category);
                  }}
                >
                  <SettingsIcon className={styles.settingsIcon} />
                  <span className={styles.settingsText}>Настройки</span>
                </div>

                {category.name ?? ""}
              </div>
            ))}
        </div>
      )}

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
            {selectedCategory && (
              <Button variant="danger" onClick={() => setIsDeleteOpen(true)} disabled={isSaving}>Удалить</Button>
            )}

            {selectedCategory ? (
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
  );
};

export default StockStructurePage;
