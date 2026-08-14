import { useEffect, useRef, useState } from "react";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import Modal from "../../../Components/Modal/Modal";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import type { DeliveryGroup, DeliveryGroupPayload } from "../deliveryMenu.types";
import { getImageBase64, getImageSource, readImageFile } from "../deliveryMenu.utils";
import styles from "../DeliveryMenu.module.css";

interface CategoryModalProps {
  isOpen: boolean;
  category: DeliveryGroup | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: DeliveryGroupPayload) => void;
}

export default function CategoryModal({
  isOpen,
  category,
  saving,
  onClose,
  onSubmit,
}: CategoryModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(category?.yaName ?? "");
    setImage(getImageBase64(category?.image));
    setPreview(getImageSource(category?.image));
    setError(null);
  }, [category, isOpen]);

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
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Укажите название категории.");
      return;
    }
    if (!image) {
      setError("Добавьте изображение категории.");
      return;
    }

    onSubmit({
      id: category?.id,
      yaName: normalizedName,
      items: [],
      imgUpdated: new Date().toISOString(),
      actual: category?.actual ?? 1,
      image,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={category ? "Редактирование категории" : "Новая категория"}
      size="md"
      panelClassName={styles.formModalPanel}
      bodyClassName={styles.formModalBody}
    >
      <div className={styles.categoryFormLayout}>
        <button
          type="button"
          className={styles.imagePicker}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="Предпросмотр категории" />
          ) : (
            <span className={styles.imagePickerPlaceholder}>
              <AddPhotoAlternateRoundedIcon />
              <strong>Добавить обложку</strong>
              <small>JPG, PNG или WebP · до 8 МБ</small>
            </span>
          )}
          <span className={styles.imagePickerOverlay}>{preview ? "Заменить изображение" : "Выбрать изображение"}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => void handleImage(event.target.files?.[0])}
        />

        <div className={styles.formStack}>
          <div className={styles.fieldWithCounter}>
            <Input
              label="Название категории"
              value={name}
              maxLength={100}
              autoFocus
              placeholder="Например, Горячие блюда"
              onChange={(event) => setName(event.target.value)}
            />
            <small>{name.length}/100</small>
          </div>
        </div>
      </div>

      {error && <div className={styles.formError}>{error}</div>}

      <div className={styles.modalActions}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving}>
          {saving ? "Сохраняем…" : category ? "Сохранить изменения" : "Создать категорию"}
        </Button>
      </div>
    </Modal>
  );
}
