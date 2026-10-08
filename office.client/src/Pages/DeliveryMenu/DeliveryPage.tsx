import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import type { RootState } from "../../Store";
import { deliveryMenuRoles, deliveryRequestRoles, hasAnyRole } from "./sectionRoles";
import DeliveryMenuPage from "./DeliveryMenuPage";
import DeliveryRequestsPage from "./DeliveryRequestsPage";
import styles from "./SectionPage.module.css";

export default function DeliveryPage() {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = [
    { label: "Меню доставки", path: "/Delivery/menu", roles: deliveryMenuRoles, Page: DeliveryMenuPage },
    { label: "Запросы", path: "/Delivery/requests", roles: deliveryRequestRoles, Page: DeliveryRequestsPage },
  ].filter((tab) => hasAnyRole(roles, tab.roles));
  const activeIndex = Math.max(0, tabs.findIndex((tab) => pathname.toLowerCase().startsWith(tab.path.toLowerCase())));
  const ActivePage = tabs[activeIndex]?.Page;
  return <>
    <div className={styles.tabs}>
      <TabNavigation items={tabs.map((tab) => tab.label)} activeIndex={activeIndex}
        onChange={(index) => navigate(tabs[index].path)} />
    </div>
    {ActivePage && <ActivePage />}
  </>;
}
