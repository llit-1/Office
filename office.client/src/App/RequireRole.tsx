import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../Store";
import { hasRequiredRole } from "./access";

interface RequireRoleProps {
  children: ReactElement;
  requiredRole: string | string[];
}

const RequireRole = ({ children, requiredRole }: RequireRoleProps) => {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const userDataLoaded = useSelector((state: RootState) => state.userData.loaded);
  const token = useSelector((state: RootState) => state.auth.token);
  const location = useLocation();

  if (!token || !userDataLoaded) {
    return null;
  }

  if (!hasRequiredRole(roles, requiredRole)) {
    return <Navigate to="/Main" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireRole;
