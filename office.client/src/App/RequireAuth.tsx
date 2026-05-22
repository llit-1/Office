import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../Store/index";
import { Navigate, useLocation } from "react-router-dom";

interface RequireAuthProps {
  children: React.ReactElement;
}

const RequireAuth = ({ children }: RequireAuthProps) => {
  const tokenFromStore = useSelector((s: RootState) => s.auth.token);
  const location = useLocation();

  // keep localStorage and store keys in sync; if there is a mismatch, prefer cleared state
  useEffect(() => {
    // normalize keys: remove legacy/authToken if present when not needed
    try {
      const lsToken = localStorage.getItem("token");
      const legacy = localStorage.getItem("authToken");
      if (!lsToken && legacy) {
        // Move legacy token to current key
        localStorage.setItem("token", legacy);
        localStorage.removeItem("authToken");
      }
    } catch {
      // ignore
    }
  }, []);

  const token = tokenFromStore || (() => { try { return localStorage.getItem("token"); } catch { return null; } })();

  if (!token) {
    // if user is already on Login, don't redirect loop (Login route is outside RequireAuth)
    return <Navigate to="/Login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth;
