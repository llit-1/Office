import { memo, useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import { formatQuantity } from "../orders.format";
import { normalizeQuantity, type QuantityBounds } from "../orders.rules";
import styles from "./QuantityStepper.module.css";

interface QuantityStepperProps {
  value: number;
  bounds: QuantityBounds;
  /** Для подписи кнопок: «Багет зерновой». */
  name: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** Количество позиции: кнопки шагают кратностью, ручной ввод округляется до допустимого. */
function QuantityStepper({ value, bounds, name, onChange, disabled = false }: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => { setDraft(null); }, [value]);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(",", ".").replace(/\s/g, ""));
    setDraft(null);
    const next = draft.trim() === "" ? 0 : normalizeQuantity(parsed, bounds);
    if (next !== value) onChange(next);
  };

  const single = bounds.max <= bounds.min;

  return (
    <div className={styles.stepper} data-disabled={disabled || undefined}>
      <button
        type="button"
        className={styles.button}
        aria-label={value - bounds.step <= 0 ? `Убрать «${name}» из заказа` : `Уменьшить количество «${name}»`}
        disabled={disabled}
        onClick={() => onChange(normalizeQuantity(value - bounds.step, bounds))}
      >
        <RemoveRoundedIcon />
      </button>
      <input
        className={styles.input}
        type="text"
        inputMode="decimal"
        aria-label={`Количество «${name}»`}
        value={draft ?? formatQuantity(value)}
        disabled={disabled || single}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
        }}
      />
      <button
        type="button"
        className={styles.button}
        aria-label={`Увеличить количество «${name}»`}
        disabled={disabled || value >= bounds.max}
        onClick={() => onChange(normalizeQuantity(value + bounds.step, bounds))}
      >
        <AddRoundedIcon />
      </button>
    </div>
  );
}

export default memo(QuantityStepper);
