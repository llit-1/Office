import { useCallback, useRef, useState, type CSSProperties } from "react";
import Cropper, { type Area } from "react-easy-crop";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import Button from "../../Components/Button/Button";
import Modal from "../../Components/Modal/Modal";
import styles from "./FactoryPersonPhotoCrop.module.css";

type Props = {
  image: string;
  onClose: () => void;
  onSave: (photo: string) => void;
};
const clampZoom = (value: number) => Math.min(3, Math.max(1, value));

// Keep frequent pointer/zoom updates inside this dialog, away from the employee form.
export default function FactoryPersonPhotoCrop({
  image,
  onClose,
  onSave,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<Area | null>(null);
  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    area.current = pixels;
    setReady(true);
  }, []);
  const updateZoom = useCallback(
    (value: number) => setZoom(clampZoom(value)),
    [],
  );
  const nudgeZoom = (delta: number) =>
    setZoom((value) => clampZoom(Math.round((value + delta) * 100) / 100));
  const percent = Math.round(zoom * 100);

  const save = async () => {
    const pixels = area.current;
    if (!pixels || saving) return;
    setSaving(true);
    setError(null);
    try {
      const source = new Image();
      await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = reject;
        source.src = image;
      });
      const canvas = document.createElement("canvas");
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(
        source,
        pixels.x,
        pixels.y,
        pixels.width,
        pixels.height,
        0,
        0,
        pixels.width,
        pixels.height,
      );
      onSave(canvas.toDataURL("image/jpeg"));
    } catch {
      setError("Не удалось обработать фото. Попробуйте другое изображение.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Кадрирование фото"
      size="md"
    >
      <div className={styles.cropBody} aria-busy={saving}>
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          minZoom={1}
          maxZoom={3}
          zoomSpeed={0.35}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={updateZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className={styles.zoomControl}>
        <div className={styles.zoomHeader}>
          <label htmlFor="factory-photo-zoom">Масштаб фото</label>
          <output htmlFor="factory-photo-zoom">{percent}%</output>
        </div>
        <div className={styles.zoomRow}>
          <Button
            className={styles.zoomButton}
            aria-label="Уменьшить масштаб"
            disabled={saving || zoom <= 1}
            onClick={() => nudgeZoom(-0.1)}
          >
            <RemoveIcon />
          </Button>
          <input
            id="factory-photo-zoom"
            className={styles.zoomRange}
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
            disabled={saving}
            aria-valuetext={`${percent}%`}
            style={{ "--zoom-fill": `${(zoom - 1) * 50}%` } as CSSProperties}
          />
          <Button
            className={styles.zoomButton}
            aria-label="Увеличить масштаб"
            disabled={saving || zoom >= 3}
            onClick={() => nudgeZoom(0.1)}
          >
            <AddIcon />
          </Button>
        </div>
        <p className={styles.hint}>
          Перетащите фото, чтобы выбрать область кадра.
        </p>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="primary"
          onClick={() => void save()}
          loading={saving}
          disabled={!ready}
        >
          Применить фото
        </Button>
      </div>
    </Modal>
  );
}
