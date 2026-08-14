import { Suspense, useEffect, useState, type ReactNode } from "react";
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
} from "./App/routes";
import StartupScreen from "./Components/StartupScreen/StartupScreen";
import "@fontsource-variable/roboto-condensed";
import "./styles/design-tokens.css";

const bootStartedAt = (window as Window & { __officeBootStartedAt?: number }).__officeBootStartedAt
  ?? performance.now();

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
  const [startupError, setStartupError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    if (initialized) {
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;

    const bootstrapSession = async () => {
      if (token) {
        setAccessToken(token);
        setStartupError(null);
        dispatch(setAuthInitialized(true));
        return;
      }

      let session;
      try {
        session = await refreshSession();
      } catch {
        if (cancelled) {
          return;
        }

        setStartupError("Сервер временно недоступен. Сессия сохранена, повторяем подключение…");
        retryTimer = window.setTimeout(() => {
          setRetryAttempt((current) => current + 1);
        }, 5_000);
        return;
      }

      if (cancelled) {
        return;
      }

      if (session?.responseCode === 1 && session.token) {
        setStartupError(null);
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
      setStartupError(null);
      if (location.pathname !== "/Login") {
        navigate("/Login", { replace: true });
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [dispatch, initialized, location.pathname, navigate, retryAttempt, token]);

  if (!startupError) {
    return initialized
      ? null
      : <StartupScreen message="Проверяем сессию…" startedAt={bootStartedAt} />;
  }

  return (
    <StartupScreen
      message={startupError}
      error
      onRetry={() => {
        setStartupError(null);
        setRetryAttempt((current) => current + 1);
      }}
    />
  );
}

function RouteFallback() {
  return <StartupScreen message="Загружаем раздел…" />;
}

function withRouteSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

const initialPath = window.location.pathname === "/" || window.location.pathname === ""
  ? "/Main"
  : window.location.pathname;

const root = createRoot(document.getElementById("root")!);

function renderApplication() {
  root.render(
    <Provider store={store}>
      <PersistGate
        loading={<StartupScreen message="Восстанавливаем настройки…" startedAt={bootStartedAt} />}
        persistor={persistor}
      >
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
}

root.render(<StartupScreen message="Загружаем интерфейс…" startedAt={bootStartedAt} />);

void Promise.all([
  warmUpFonts(),
  preloadRouteForPath(initialPath) ?? Promise.resolve(),
])
  .then(renderApplication)
  .catch(() => {
    root.render(
      <StartupScreen
        message="Не удалось загрузить интерфейс. Проверьте соединение и попробуйте ещё раз."
        error
        onRetry={() => window.location.reload()}
      />,
    );
  });
