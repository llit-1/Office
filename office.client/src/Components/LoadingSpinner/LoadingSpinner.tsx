import React from "react";
import styles from "./LoadingSpinner.module.css";

export interface LoadingSpinnerProps {
  size?: number;
  color?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size, color }) => {
  const sizeClassName =
    size === 24
      ? styles.ringSize24
      : size === 34
        ? styles.ringSize34
        : styles.ringSize48;

  const colorClassName = color === "white" ? styles.ringColorWhite : styles.ringColorPrimary;

  return (
    <div className={styles.spinnerOverlay} role="status" aria-label="loading">
      <div className={`${styles.ring} ${sizeClassName} ${colorClassName}`} />
    </div>
  );
};

export default LoadingSpinner;
