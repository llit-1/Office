import React from "react";
import styles from "./LoadingSpinner.module.css";

export interface LoadingSpinnerProps {
  size?: number;
  color?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size, color }) => {
  return (
    <div className={styles.spinnerOverlay} role="status" aria-label="loading">
      <div className={styles.ring} style={{ width: size, height: size, borderTopColor: color }}/>
    </div>
  );
};

export default LoadingSpinner;
