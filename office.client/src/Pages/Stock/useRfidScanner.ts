import { useEffect, useRef } from "react";
import { OBJECT_CODE_LENGTH, isEditableTarget, toObjectCode } from "./stock.utils";

// Сканер вводит символы с интервалом в миллисекунды; длинная пауза означает ручной ввод.
const KEY_GAP_RESET_MS = 500;
const SCANNER_SYMBOL = /^[0-9a-zA-Zа-яА-ЯёЁ]$/;

/**
 * Перехватывает ввод RFID-сканера, который работает как клавиатура и завершает код клавишей Enter.
 * Поля ввода и открытые модальные окна получают клавиатуру как обычно.
 */
export default function useRfidScanner(enabled: boolean, onScan: (code: string) => void) {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;

    let buffer = "";
    let lastKeyAt = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;

      if (isEditableTarget(event.target) || document.querySelector('[aria-modal="true"]')) {
        buffer = "";
        return;
      }

      const now = Date.now();
      if (now - lastKeyAt > KEY_GAP_RESET_MS) buffer = "";
      lastKeyAt = now;

      if (event.key === "Enter") {
        const code = buffer.length === OBJECT_CODE_LENGTH ? toObjectCode(buffer) : null;
        buffer = "";
        if (code) {
          event.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      if (SCANNER_SYMBOL.test(event.key)) {
        buffer += event.key;
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
