import { useLocation, useNavigate } from "react-router-dom";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import TabOutlinedIcon from "@mui/icons-material/TabOutlined";
import type { Actor } from "./orders.api";
import type { OrdersBootstrap } from "./orders.types";
import CatalogSection from "./components/settings/CatalogSection";
import DeliveryDaysSection from "./components/settings/DeliveryDaysSection";
import TypesSection from "./components/settings/TypesSection";
import styles from "./OrdersSettings.module.css";

export interface SettingsSectionProps {
  base: OrdersBootstrap;
  actor: Actor;
  /** Перечитать вкладки, ТТ и дни доставки после сохранения. */
  onBaseChange: () => Promise<void> | void;
}

const sections = [
  { key: "types", label: "Вкладки", hint: "Приём и доставка", Icon: TabOutlinedIcon, Section: TypesSection },
  { key: "days", label: "Дни доставки", hint: "День для каждой ТТ", Icon: EventRepeatOutlinedIcon, Section: DeliveryDaysSection },
  { key: "catalog", label: "Каталог", hint: "Группы и позиции", Icon: Inventory2OutlinedIcon, Section: CatalogSection },
];

export default function OrdersSettingsPage(props: SettingsSectionProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const key = pathname.split("/")[3]?.toLowerCase() ?? "";
  const active = sections.find((section) => section.key === key) ?? sections[0];
  const ActiveSection = active.Section;

  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Разделы настроек">
        {sections.map(({ key: sectionKey, label, hint, Icon }) => (
          <button
            key={sectionKey}
            type="button"
            className={styles.navItem}
            aria-current={active.key === sectionKey ? "page" : undefined}
            onClick={() => navigate(`/Orders/settings/${sectionKey}`)}
          >
            <Icon aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className={styles.content}>
        <ActiveSection {...props} />
      </div>
    </div>
  );
}
