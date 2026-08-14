import { useEffect, useRef, useState } from "react";
import LoadingSpinner from "../LoadingSpinner/LoadingSpinner";
import Button from "../Button/Button";
import styles from "./StartupScreen.module.css";

interface StartupScreenProps {
  message: string;
  error?: boolean;
  onRetry?: () => void;
  delayMs?: number;
  startedAt?: number;
}

const DEFAULT_REVEAL_DELAY_MS = 500;

const getNow = () => performance.now();

const StartupScreen = ({
  message,
  error = false,
  onRetry,
  delayMs = DEFAULT_REVEAL_DELAY_MS,
  startedAt,
}: StartupScreenProps) => {
  const mountedAt = useRef(getNow());
  const revealAt = (startedAt ?? mountedAt.current) + delayMs;
  const [visible, setVisible] = useState(() => error || delayMs <= 0 || getNow() >= revealAt);

  useEffect(() => {
    if (error || delayMs <= 0) {
      setVisible(true);
      return;
    }

    const remainingDelay = revealAt - getNow();
    if (remainingDelay <= 0) {
      setVisible(true);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), remainingDelay);
    return () => window.clearTimeout(timer);
  }, [delayMs, error, revealAt]);

  return (
    <div
      className={`${styles.screen} ${visible ? styles.visible : styles.hidden}`}
      role={error ? "alert" : "status"}
      aria-hidden={visible ? undefined : true}
      aria-live={error ? "assertive" : "polite"}
    >
      <div className={styles.card}>
        {!error && <LoadingSpinner size={96} label={message} />}
        {error && <p className={styles.errorMessage}>{message}</p>}
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            Повторить сейчас
          </Button>
        )}
      </div>
    </div>
  );
};

export default StartupScreen;
