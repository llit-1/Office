import type { ReactNode } from "react";
import StatePanel from "../../../Components/StatePanel/StatePanel";
import StatusBadge, { type StatusTone } from "../../../Components/StatusBadge/StatusBadge";
import shared from "../StockShared.module.css";

export type StockTone = StatusTone;

export const StockBadge = StatusBadge;
export const StockState = StatePanel;

export function ScannerStatus({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${shared.scanner} ${className ?? ""}`} role="status">
      <span className={shared.scannerDot} aria-hidden="true" />
      {children}
    </div>
  );
}

export function historyActionTone(actionId: number): StockTone {
  if (actionId === 1) return "success";
  if (actionId === 2) return "info";
  if (actionId === 3) return "danger";
  return "neutral";
}
