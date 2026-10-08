import { lazy, Suspense, useEffect } from "react";
import { useDispatch } from "react-redux";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import StatePanel from "../../Components/StatePanel/StatePanel";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { getOrdersBootstrap } from "./orders.api";
import OrdersListPage from "./OrdersListPage";
import { useActor, useLoader } from "./useOrdersBase";
import styles from "./Orders.module.css";

const OrderEditorPage = lazy(() => import("./OrderEditorPage"));
const OrdersSettingsPage = lazy(() => import("./OrdersSettingsPage"));

type View =
  | { kind: "list" | "settings" }
  | { kind: "editor"; mode: "new" | "edit"; param: string };

function resolveView(pathname: string): View | null {
  const [section = "", param = ""] = pathname.replace(/^\/orders\/?/i, "").split("/");
  const key = section.toLowerCase();
  if (!key) return { kind: "list" };
  if (key === "settings") return { kind: key };
  // new/:id вкладки, edit/:id заказа
  if ((key === "new" || key === "edit") && Number(param) > 0) return { kind: "editor", mode: key, param };
  return null;
}

const tabs = [
  { kind: "list", label: "Заказы", path: "/Orders" },
  { kind: "settings", label: "Настройки", path: "/Orders/settings" },
];

export default function Orders() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const actor = useActor();
  const base = useLoader(getOrdersBootstrap);
  const view = resolveView(pathname);
  const editing = view?.kind === "editor";

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: editing ? "/Orders" : "/Main" }));
    // заголовок редактора уточняет сам редактор, когда узнаёт тип и номер заказа
    dispatch(titleSet({ title: editing ? "Заказ" : "Заказы ТТ" }));
  }, [dispatch, editing]);

  if (!view) return <Navigate to="/Orders" replace />;
  if (view.kind === "settings" && !actor.permissions.canConfigure) return <Navigate to="/Orders" replace />;

  if (!base.data) {
    return base.error ? (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Раздел заказов недоступен"
        text="Не удалось загрузить типы заказов и торговые точки. Проверьте соединение и повторите."
        action={<Button variant="primary" onClick={() => void base.reload()}>Повторить</Button>}
      />
    ) : (
      <div className={styles.loading}><LoadingSpinner size={96} label="Загружаем заказы…" /></div>
    );
  }

  const fallback = <div className={styles.loading}><LoadingSpinner size={56} /></div>;

  if (view.kind === "editor") {
    return (
      <Suspense fallback={fallback}>
        <OrderEditorPage key={`${view.mode}:${view.param}`} base={base.data} actor={actor} mode={view.mode} param={view.param} />
      </Suspense>
    );
  }

  return (
    <div className={styles.page}>
      {/* вкладки нужны только тому, у кого есть вторая — «Настройки» */}
      {actor.permissions.canConfigure ? (
        <div className={styles.tabs}>
          <TabNavigation
            items={tabs.map((tab) => tab.label)}
            activeIndex={tabs.findIndex((tab) => tab.kind === view.kind)}
            onChange={(index) => navigate(tabs[index].path)}
          />
        </div>
      ) : null}
      {view.kind === "list" ? (
        <OrdersListPage base={base.data} actor={actor} />
      ) : (
        <Suspense fallback={fallback}>
          <OrdersSettingsPage base={base.data} actor={actor} onBaseChange={base.reload} />
        </Suspense>
      )}
    </div>
  );
}
