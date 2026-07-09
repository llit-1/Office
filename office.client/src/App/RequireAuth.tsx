import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import { RootState } from "../Store/index";

interface RequireAuthProps {
  children: React.ReactElement;
}

const RequireAuth = ({ children }: RequireAuthProps) => {
  const token = useSelector((s: RootState) => s.auth.token);
  const initialized = useSelector((s: RootState) => s.auth.initialized);
  const location = useLocation();

  if (!initialized) {
    return null;
  }

  if (!token) {
    return <Navigate to="/Login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth;
