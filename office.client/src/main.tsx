import { Suspense, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Provider, useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";
import { NotificationsProvider } from "@toolpad/core";
import App from "./App/App";
import store, { persistor, RootState } from "./Store/index";
import { login, logout, setAuthInitialized } from "./Store/authSlice";
import { clearUserData } from "./Store/userDataSlice";
import { refreshSession, setAccessToken } from "./Services/api";
import { warmUpFonts } from "./fontBootstrap";
import RequireAuth from "./App/RequireAuth";
import {
  preloadRouteForPath,
  protectedRoutes,
  publicRoutes,
  renderConfiguredRoute,
  warmRouteModuleCache,
} from "./App/routes";
import { preloadImage } from "./App/assetPreload";
import { menuParts } from "./menuParts/menuParts";
import LoadingSpinner from "./Components/LoadingSpinner/LoadingSpinner";
import "./styles/design-tokens.css";

try {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || savedTheme === "light") {
    document.documentElement.setAttribute("data-theme", savedTheme);
  } else {
    document.documentElement.setAttribute("data-theme", "light");
  }
} catch {
  document.documentElement.setAttribute("data-theme", "light");
}

function StartupChecker() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const token = useSelector((s: RootState) => s.auth.token);
  const initialized = useSelector((s: RootState) => s.auth.initialized);

  useEffect(() => {
    if (initialized) {
      return;
    }

    let cancelled = false;

    const bootstrapSession = async () => {
      if (token) {
        setAccessToken(token);
        dispatch(setAuthInitialized(true));
        return;
      }

      if (location.pathname === "/Login") {
        setAccessToken(null);
        dispatch(clearUserData());
        dispatch(logout());
        dispatch(setAuthInitialized(true));
        return;
      }

      const session = await refreshSession();
      if (cancelled) {
        return;
      }

      if (session?.responseCode === 1 && session.token) {
        setAccessToken(session.token);
        dispatch(
          login({
            id: session.id,
            token: session.token,
            fullName: session.fullName ?? null,
            position: session.position ?? null,
          }),
        );
        return;
      }

      setAccessToken(null);
      dispatch(clearUserData());
      dispatch(logout());
      dispatch(setAuthInitialized(true));
      navigate("/Login", { replace: true });
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [dispatch, initialized, location.pathname, navigate, token]);

  return null;
}

function RouteFallback() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}>
      <LoadingSpinner />
    </div>
  );
}

function withRouteSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

async function bootstrapStaticAssets() {
  const tileImages = menuParts.map((part) => part.img).filter(Boolean);
  await Promise.all(tileImages.map((src) => preloadImage(src)));
}

const initialPath = window.location.pathname === "/" || window.location.pathname === ""
  ? "/Main"
  : window.location.pathname;

void Promise.all([
  warmUpFonts(),
  preloadRouteForPath(initialPath) ?? Promise.resolve(),
  bootstrapStaticAssets(),
]).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <BrowserRouter>
          <NotificationsProvider
            slotProps={{
              snackbar: {
                anchorOrigin: { vertical: "top", horizontal: "right" },
              },
            }}
          >
            <StartupChecker />
            <Routes>
              <Route path="/" element={<RequireAuth><App /></RequireAuth>}>
                {protectedRoutes.map((route) => renderConfiguredRoute(route, withRouteSuspense))}
              </Route>

              {publicRoutes.map((route) => renderConfiguredRoute(route, withRouteSuspense))}
            </Routes>
          </NotificationsProvider>
        </BrowserRouter>
      </PersistGate>
    </Provider>,
  );

  void warmRouteModuleCache();
});
