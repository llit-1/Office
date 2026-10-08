import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../../Store";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import DeliveryMenuPage from "./DeliveryMenuPage";
import DeliveryStopsPage from "./DeliveryStopsPage";
import CashMessagesPage from "./CashMessagesPage";
import CashUpdatePage from "./CashUpdatePage";
import { cashQuickRoles, cashRoles, cashUpdateRoles, hasAnyRole } from "./sectionRoles";
import styles from "./SectionPage.module.css";

export default function CashPage() {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = [
    { label: "Стопы (Яндекс)", path: "/Cash/items", roles: cashQuickRoles, Page: DeliveryMenuPage },
    { label: "Стопы (Аудит)", path: "/Cash/stops", roles: cashRoles, Page: DeliveryStopsPage },
    { label: "Сообщения на кассы", path: "/Cash/messages", roles: cashRoles, Page: CashMessagesPage },
    { label: "Обновление", path: "/Cash/update", roles: cashUpdateRoles, Page: CashUpdatePage },
  ].filter((tab) => hasAnyRole(roles, tab.roles));
  if (tabs.length === 0) return null;
  const matched = tabs.findIndex((tab) => pathname.toLowerCase().startsWith(tab.path.toLowerCase()));
  // открыта вкладка, которой у пользователя нет (например, /Cash/items при одной роли «Обновление») - на первую доступную
  if (matched < 0 && pathname.toLowerCase() !== "/cash") return <Navigate to={tabs[0].path} replace />;
  const activeIndex = Math.max(0, matched);
  const ActivePage = tabs[activeIndex].Page;
  return <div className={styles.flushPage}>
    <div className={styles.tabs}>
      <TabNavigation items={tabs.map((tab) => tab.label)} activeIndex={activeIndex}
        onChange={(index) => navigate(tabs[index].path)} />
    </div>
    <ActivePage />
  </div>;
}
