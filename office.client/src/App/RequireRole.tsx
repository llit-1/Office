import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../Store";
import { hasRequiredRole } from "./access";

interface RequireRoleProps {
  children: ReactElement;
  requiredRole: string;
}

const RequireRole = ({ children, requiredRole }: RequireRoleProps) => {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const location = useLocation();

  if (!hasRequiredRole(roles, requiredRole)) {
    return <Navigate to="/Main" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireRole;
