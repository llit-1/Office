import type { ReactNode } from "react";
import styles from "./StatusBadge.module.css";

export type StatusTone = "success" | "danger" | "info" | "warning" | "neutral";

type StatusBadgeProps = {
  tone?: StatusTone;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
};

/** Компактный статус объекта. Цвет всегда дублируется текстом. */
export default function StatusBadge({ tone = "neutral", icon, title, children }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} title={title}>
      {icon}
      {children}
    </span>
  );
}
