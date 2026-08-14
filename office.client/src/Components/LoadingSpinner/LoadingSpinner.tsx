import React from "react";
import styles from "./LoadingSpinner.module.css";

export interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  label?: string;
  longLabel?: string;
  exiting?: boolean;
}

const normalizeSize = (size: number) => size <= 34 ? 24 : size < 80 ? 56 : 96;

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 56, color, label, longLabel = "Почти готово…", exiting = false }) => {
  const normalizedSize = normalizeSize(size);
  const compact = normalizedSize === 24;
  const [isLongLoading, setIsLongLoading] = React.useState(false);

  React.useEffect(() => {
    if (!label) return undefined;
    setIsLongLoading(false);
    const timer = window.setTimeout(() => setIsLongLoading(true), 6000);
    return () => window.clearTimeout(timer);
  }, [label]);

  const visibleLabel = isLongLoading ? longLabel : label;

  return (
    <div
      className={`${styles.spinnerOverlay} ${compact ? styles.immediate : styles.delayed} ${visibleLabel ? styles.labelled : ""} ${exiting ? styles.exiting : ""}`}
      role="status"
      aria-live="polite"
      aria-label={visibleLabel ?? "Загрузка"}
      data-state={exiting ? "exiting" : "loading"}
    >
      <svg
        className={`${styles.loader} ${color === "white" ? styles.white : styles.primary} ${compact ? styles.compact : ""}`}
        style={{ width: normalizedSize, height: normalizedSize }}
        viewBox="0 0 112 96"
        aria-hidden="true"
      >
      <g className={styles.scene}>
        <ellipse className={styles.shadow} cx="52" cy="76" rx="25" ry="3.5" />

        <g className={styles.product}>
          <path
            className={styles.productShape}
            d="M50 24 C64 24 75 31 75 45 C75 58 66 67 55 67 C50 68 45 68 40 67 C29 67 25 58 25 45 C25 31 36 24 50 24 Z"
          >
            <animate
              attributeName="d"
              dur="2.65s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.17;0.31;0.39;0.48;0.57;0.64;1"
              keySplines=".4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1"
              values="M50 24 C64 24 75 31 75 45 C75 58 66 67 55 67 C50 68 45 68 40 67 C29 67 25 58 25 45 C25 31 36 24 50 24 Z;
                M50 24 C64 24 75 31 75 45 C75 58 66 67 55 67 C50 68 45 68 40 67 C29 67 25 58 25 45 C25 31 36 24 50 24 Z;
                M54 23 C67 24 76 32 77 45 C73 58 66 67 55 67 C50 68 45 68 41 67 C32 66 30 57 31 44 C32 31 40 23 54 23 Z;
                M50 24 C65 24 77 33 77 45 C77 56 67 65 55 66 C50 67 45 67 39 66 C27 65 23 56 23 45 C23 33 35 24 50 24 Z;
                M46 23 C60 23 68 31 69 44 C70 57 68 66 59 67 C54 68 49 68 44 67 C33 67 24 58 23 45 C24 32 33 24 46 23 Z;
                M50 21 C67 21 78 32 78 49 C78 61 74 69 62 69 C54 69 46 69 38 69 C26 69 22 61 22 49 C22 32 33 21 50 21 Z;
                M50 17 C67 17 78 31 78 50 C78 62 74 69 62 69 C54 69 46 69 38 69 C26 69 22 62 22 50 C22 31 33 17 50 17 Z;
                M50 17 C67 17 78 31 78 50 C78 62 74 69 62 69 C54 69 46 69 38 69 C26 69 22 62 22 50 C22 31 33 17 50 17 Z"
            />
          </path>
          <path className={styles.highlight} d="M35 35c4-3.4 8.5-4.8 14-4.8" />
          <g className={styles.slashes}>
            <path d="m34 34 8 10" />
            <path d="m48 29 8 11" />
            <path d="m62 34 7 10" />
          </g>
        </g>

        <path className={`${styles.impactWave} ${styles.impactLeft}`} d="M16 37c5 4 5 12 0 16" />
        <path className={`${styles.impactWave} ${styles.impactRight}`} d="M84 37c-5 4-5 12 0 16" />

        <g className={styles.flour}>
          <circle cx="20" cy="31" r="1.8" />
          <circle cx="14" cy="25" r="1.1" />
          <circle cx="80" cy="31" r="1.8" />
          <circle cx="86" cy="25" r="1.1" />
        </g>

        <g className={styles.conveyor}>
          <path d="M20 78h75" />
          <path className={styles.conveyorMarks} d="M29 82h9m9 0h9m9 0h9m9 0h9" />
        </g>
      </g>

        <g className={styles.compactBread}>
          <path d="M26 67V52c0-15 10-25 24-25s24 10 24 25v15H26Z" />
          <g>
            <path d="m37 39 7 9" />
            <path d="m50 35 7 10" />
            <path d="m63 39 6 9" />
          </g>
        </g>
      </svg>
      {visibleLabel ? <span className={styles.label}>{visibleLabel}</span> : null}
    </div>
  );
};

export default LoadingSpinner;
