import { useEffect, useMemo, useRef, useState } from "react";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Modal from "../../../Components/Modal/Modal";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../../Components/Select/Select";
import Textarea from "../../../Components/Textarea/Textarea";
import Toggle from "../../../Components/Toggle/Toggle";
import type { DeliveryItem, DeliveryItemPayload, RkMenuOption } from "../deliveryMenu.types";
import {
  formatMeasureUnit,
  formatRkPrice,
  getImageBase64,
  getImageSource,
  readImageFile,
  toDisplayPrice,
} from "../deliveryMenu.utils";
import styles from "../DeliveryMenu.module.css";

interface ItemModalProps {
  isOpen: boolean;
  groupId: number;
  item: DeliveryItem | null;
  sourceItems: RkMenuOption[];
  sourceLoading: boolean;
  existingCodes: Set<number>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: DeliveryItemPayload) => void;
}

const MEASURE_UNITS = ["гр", "мл"] as const;
type MeasureUnit = (typeof MEASURE_UNITS)[number];

export default function ItemModal({
  isOpen,
  groupId,
  item,
  sourceItems,
  sourceLoading,
  existingCodes,
  saving,
  onClose,
  onSubmit,
}: ItemModalProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceSearch, setSourceSearch] = useState("");
  const [rkcode, setRkcode] = useState<number | null>(null);
  const [rkName, setRkName] = useState("");
  const [yeName, setYeName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [measure, setMeasure] = useState(100);
  const [measureUnit, setMeasureUnit] = useState<MeasureUnit>("гр");
  const [image, setImage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [actual, setActual] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSourceSearch("");
    setRkcode(item?.rkcode ?? null);
    setRkName(item?.rkName ?? "");
    setYeName(item?.yeName ?? "");
    setDescription(item?.description ?? "");
    setPrice(item?.price ?? 0);
    setMeasure(item?.measure ?? 100);
    setMeasureUnit(formatMeasureUnit(item?.measureUnit));
    setImage(getImageBase64(item?.image));
    setPreview(getImageSource(item?.image));
    setActual(item?.actual ?? 1);
    setError(null);
  }, [isOpen, item]);

  const filteredSourceItems = useMemo(() => {
    const query = sourceSearch.trim().toLocaleLowerCase("ru-RU");
    const filtered = query
      ? sourceItems.filter((sourceItem) =>
          `${sourceItem.name} ${sourceItem.code} ${sourceItem.categoryPath}`.toLocaleLowerCase("ru-RU").includes(query),
        )
      : sourceItems;
    return filtered.slice(0, 120);
  }, [sourceItems, sourceSearch]);

  const selectSourceItem = (sourceItem: RkMenuOption) => {
    if (existingCodes.has(sourceItem.code)) return;
    setRkcode(sourceItem.code);
    setRkName(sourceItem.name);
    setYeName(sourceItem.name);
    setPrice(toDisplayPrice(sourceItem.price));
    setError(null);
  };

  const handleImage = async (file?: File) => {
    if (!file) return;
    try {
      const result = await readImageFile(file);
      setImage(result.base64);
      setPreview(result.preview);
      setError(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Не удалось загрузить изображение.");
    }
  };

  const handleSubmit = () => {
    if (rkcode === null || !rkName.trim()) {
      setError("Выберите позицию из меню R-Keeper.");
      return;
    }
    if (!yeName.trim()) {
      setError("Укажите название позиции для витрины.");
      return;
    }
    if (!description.trim()) {
      setError("Добавьте описание позиции.");
      return;
    }
    if (!measureUnit.trim()) {
      setError("Укажите единицу измерения.");
      return;
    }
    if (!image) {
      setError("Добавьте изображение позиции.");
      return;
    }

    onSubmit({
      rkcode,
      yeGroup: groupId,
      rkName: rkName.trim(),
      yeName: yeName.trim(),
      description: description.trim(),
      price: Math.max(0, Math.round(Number(price) || 0)),
      measure: Math.max(1, Math.round(Number(measure) || 1)),
      measureUnit: measureUnit.trim(),
      imageHash: "",
      actual,
      image,
      stops: item?.stops ?? [],
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item ? "Редактирование позиции" : "Новая позиция"}
      size="lg"
      panelClassName={`${styles.itemModalPanel} ${item ? styles.itemModalPanelEdit : ""}`}
      bodyClassName={styles.itemModalBody}
    >
      <div className={`${styles.itemFormLayout} ${item ? styles.itemFormLayoutEdit : ""}`}>
        {!item && (
          <section className={styles.sourcePanel}>
            <div className={styles.sectionHeading}>
              <div>
                <span>Шаг 1</span>
                <strong>Позиция из R-Keeper</strong>
              </div>
              <span className={styles.sourceCount}>{sourceItems.length}</span>
            </div>

            <label className={styles.searchField}>
              <SearchRoundedIcon />
              <input
                value={sourceSearch}
                placeholder="Название, код или категория"
                onChange={(event) => setSourceSearch(event.target.value)}
              />
            </label>

            <div className={styles.sourceList}>
              {sourceLoading ? (
                <div className={styles.sourceLoading}><LoadingSpinner /></div>
              ) : filteredSourceItems.length === 0 ? (
                <div className={styles.sourceEmpty}>Ничего не найдено</div>
              ) : (
                filteredSourceItems.map((sourceItem) => {
                  const alreadyAdded = existingCodes.has(sourceItem.code);
                  const selected = rkcode === sourceItem.code;
                  return (
                    <button
                      type="button"
                      key={sourceItem.code}
                      className={`${styles.sourceItem} ${selected ? styles.sourceItemSelected : ""}`}
                      disabled={alreadyAdded}
                      onClick={() => selectSourceItem(sourceItem)}
                    >
                      <span className={styles.sourceItemText}>
                        <strong>{sourceItem.name}</strong>
                        <small>{sourceItem.categoryPath}</small>
                      </span>
                      <span className={styles.sourceItemMeta}>
                        <b>{formatRkPrice(sourceItem.price)}</b>
                        <small>{alreadyAdded ? "Уже добавлена" : `#${sourceItem.code}`}</small>
                      </span>
                      {selected && <CheckRoundedIcon className={styles.sourceCheck} />}
                    </button>
                  );
                })
              )}
            </div>
          </section>
        )}

        <section className={`${styles.itemEditorPanel} ${item ? styles.itemEditorPanelPlain : ""}`}>
          {!item && (
            <div className={styles.sectionHeading}>
              <div>
                <span>Шаг 2</span>
                <strong>Оформление позиции</strong>
              </div>
              {rkcode !== null && <span className={styles.rkBadge}>RK #{rkcode}</span>}
            </div>
          )}

          <div className={styles.editorScrollArea}>
            <div className={styles.editorTopGrid}>
              <button
                type="button"
                className={`${styles.imagePicker} ${styles.itemImagePicker} ${preview ? styles.imagePickerWithPreview : ""}`}
                onClick={() => imageInputRef.current?.click()}
              >
                {preview ? (
                  <img src={preview} alt="Предпросмотр позиции" />
                ) : (
                  <span className={styles.imagePickerPlaceholder}>
                    <AddPhotoAlternateRoundedIcon />
                    <strong>Добавить фото блюда</strong>
                    <small>Горизонтальное изображение до 8 МБ</small>
                  </span>
                )}
                <span className={styles.imagePickerOverlay}>{preview ? "Изменить фото" : "Выбрать фото"}</span>
              </button>

              <div className={styles.editorTopFields}>
                <Input
                  label="Название на витрине"
                  value={yeName}
                  maxLength={100}
                  placeholder="Название для Яндекс Еды и Delivery Club"
                  onChange={(event) => setYeName(event.target.value)}
                />

                <Textarea
                  label="Описание"
                  value={description}
                  rows={3}
                  placeholder="Состав, вкус и особенности блюда"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => void handleImage(event.target.files?.[0])}
            />

            <div className={styles.formGrid}>
              <Input
                label="Количество"
                type="number"
                min="1"
                step="1"
                value={measure}
                onChange={(event) => setMeasure(Number(event.target.value))}
              />

              <Select
                label="Единица измерения"
                value={measureUnit}
                options={MEASURE_UNITS.map((unit) => ({ value: unit, label: unit }))}
                onChange={(event) => setMeasureUnit(event.target.value as MeasureUnit)}
              />

              <Input
                label="Название в R-Keeper"
                value={rkName}
                readOnly
                placeholder="Сначала выберите позицию"
              />

              <Input
                label="Цена R-Keeper, ₽"
                type="number"
                min="0"
                step="0.01"
                value={price}
                readOnly
              />
            </div>

            <div className={styles.itemActualControl}>
              <div>
                <strong>Позиция активна</strong>
                <small>Активная позиция отображается в меню и доступна для заказа.</small>
              </div>
              <Toggle
                checked={actual === 1}
                onChange={(checked) => setActual(checked ? 1 : 0)}
                ariaLabel="Позиция активна"
              />
            </div>
          </div>
        </section>
      </div>

      {error && <div className={styles.formError}>{error}</div>}

      <div className={styles.modalActions}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving}>
          {saving ? "Сохраняем…" : item ? "Сохранить изменения" : "Добавить позицию"}
        </Button>
      </div>
    </Modal>
  );
}
