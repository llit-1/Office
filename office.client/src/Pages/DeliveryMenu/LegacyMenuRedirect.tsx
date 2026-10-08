import { useSelector } from "react-redux";
import { Navigate, useLocation, useParams } from "react-router-dom";
import type { RootState } from "../../Store";
import { cashQuickRoles, deliveryMenuRoles, hasAnyRole } from "./sectionRoles";

export default function LegacyMenuRedirect() {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const { groupId } = useParams();
  const location = useLocation();
  if (location.pathname.toLowerCase().endsWith("/stops")) return <Navigate to={roles.includes("MenuAuditor") ? "/Cash/stops" : "/Delivery"} replace />;
  if (hasAnyRole(roles, deliveryMenuRoles)) return <Navigate to={groupId ? `/Delivery/menu/${groupId}` : "/Delivery/menu"} replace />;
  // Аудитору «Стопы (Яндекс)» недоступны — ведём на его стоп-лист.
  if (!hasAnyRole(roles, cashQuickRoles)) return <Navigate to="/Cash/stops" replace />;
  return <Navigate to={groupId ? `/Cash/items/${groupId}` : "/Cash/items"} replace />;
}
