import type { ReactNode } from "react";
import styles from "./StatePanel.module.css";

type StatePanelProps = {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "error";
};

/** Пустое состояние, «ничего не найдено» или ошибка внутри рабочей области. */
export default function StatePanel({ icon, title, text, action, tone = "default" }: StatePanelProps) {
  return (
    <div className={styles.state} role={tone === "error" ? "alert" : undefined}>
      {icon ? <span className={styles.icon} data-tone={tone} aria-hidden="true">{icon}</span> : null}
      <h3 className={styles.title}>{title}</h3>
      {text ? <p className={styles.text}>{text}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
