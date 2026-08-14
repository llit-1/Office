import { lazy, type ComponentProps, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { Route, matchPath, type NavigateFunction, type NavigateOptions } from "react-router-dom";
import RequireRole from "./RequireRole";
import Login from "../Pages/Login/Login";
import Main from "../Pages/Main/Main";

type RequiredRole = ComponentProps<typeof RequireRole>["requiredRole"];

export interface AppRouteConfig {
  path: string;
  page: string;
  role?: RequiredRole;
  children?: AppRouteConfig[];
}

const pageModules = import.meta.glob([
  "../Pages/**/*.tsx",
  "!../Pages/Login/Login.tsx",
  "!../Pages/Main/Main.tsx",
  "!../Pages/Main/Tile.tsx",
]);
const pageCache = new Map<string, LazyExoticComponent<ComponentType>>();
const pagePromiseCache = new Map<string, Promise<{ default: ComponentType }>>();
const eagerPages: Record<string, ComponentType> = {
  "Login/Login": Login,
  "Main/Main": Main,
};

function loadPage(page: string): ComponentType | LazyExoticComponent<ComponentType> {
  const eagerPage = eagerPages[page];
  if (eagerPage) return eagerPage;

  const cached = pageCache.get(page);
  if (cached) return cached;

  const modulePath = `../Pages/${page}.tsx`;
  const importer = pageModules[modulePath];
  if (!importer) {
    throw new Error(`Route page module not found: ${modulePath}`);
  }

  const Page = lazy(importer as () => Promise<{ default: ComponentType }>);
  pageCache.set(page, Page);
  return Page;
}

function getPageImporter(page: string): () => Promise<{ default: ComponentType }> {
  const modulePath = `../Pages/${page}.tsx`;
  const importer = pageModules[modulePath];
  if (!importer) {
    throw new Error(`Route page module not found: ${modulePath}`);
  }

  return importer as () => Promise<{ default: ComponentType }>;
}

export function preloadPage(page: string): Promise<{ default: ComponentType }> {
  const eagerPage = eagerPages[page];
  if (eagerPage) return Promise.resolve({ default: eagerPage });

  const cachedPromise = pagePromiseCache.get(page);
  if (cachedPromise) return cachedPromise;

  const promise = getPageImporter(page)();
  pagePromiseCache.set(page, promise);
  return promise;
}

function buildRouteElement(route: AppRouteConfig): ReactNode {
  const Page = loadPage(route.page);
  const content = <Page />;

  if (!route.role) return content;

  return <RequireRole requiredRole={route.role}>{content}</RequireRole>;
}

export function renderConfiguredRoute(
  route: AppRouteConfig,
  withRouteSuspense: (element: ReactNode) => ReactNode,
): ReactNode {
  return (
    <Route key={`${route.path}:${route.page}`} path={route.path} element={withRouteSuspense(buildRouteElement(route))}>
      {route.children?.map((child) => renderConfiguredRoute(child, withRouteSuspense))}
    </Route>
  );
}

export const protectedRoutes: AppRouteConfig[] = [
  { path: "Main", page: "Main/Main" },
  {
    path: "Calculator",
    page: "Calculator/Calculator",
    role: "Calculator",
    children: [
      { path: "SelectCategory", page: "Calculator/CalculatorCategories" },
      { path: "SelectTT", page: "Calculator/CalculatorSelectTT" },
      { path: "Calculate/:Location", page: "Calculator/Calculate" },
    ],
  },
  { path: "TT", page: "TT/TT", role: "Location" },
  { path: "/TT/Edit/:id", page: "TT/TTEdit", role: "Location" },
  { path: "Users", page: "Users/Users", role: "Users" },
  { path: "/Users/Edit", page: "Users/UserEdit", role: "Users" },
  { path: "/Users/Edit/:id", page: "Users/UserEdit", role: "Users" },
  { path: "/Groups/Edit", page: "Users/GroupEdit", role: "Users" },
  { path: "/Groups/Edit/:id", page: "Users/GroupEdit", role: "Users" },
  { path: "/Roles/Edit", page: "Users/RoleEdit", role: "Users" },
  { path: "/Roles/Edit/:id", page: "Users/RoleEdit", role: "Users" },
  { path: "Settings", page: "Settings/Settings" },
  { path: "VideoDevices", page: "VideoDevices/VideoDevices", role: "VideoDevices" },
  { path: "Sensors", page: "Sensors/Sensors", role: "Sensors" },
  { path: "Help", page: "Help/Help" },
  { path: "FactoryNX", page: "FactoryNX/FactoryNX", role: "FactoryNX" },
  { path: "Orders", page: "Orders/Orders", role: ["OrdersTT", "OrdersTTAdmin"] },
  { path: "FactoryPerson", page: "FactoryPerson/FactoryPerson", role: "FactoryPerson" },
  { path: "/FactoryPerson/Edit", page: "FactoryPerson/FactoryPersonEdit", role: "FactoryPerson" },
  { path: "/FactoryPerson/Edit/:id", page: "FactoryPerson/FactoryPersonEdit", role: "FactoryPerson" },
  { path: "/Stock", page: "Stock/Stock", role: "Stock" },
  { path: "/Stock/:tab", page: "Stock/Stock", role: "Stock" },
  { path: "/StockTable", page: "Stock/StockTable", role: "Stock" },
    { path: "/DeliveryMenu/stops", page: "DeliveryMenu/DeliveryMenuPage", role: ["MenuAuditor", "MenuAdmin"] },
    { path: "/DeliveryMenu/:groupId?", page: "DeliveryMenu/DeliveryMenuPage", role: ["MenuMarketing", "MenuAuditor", "MenuAdmin", "Menu"] },
  { path: "/Salary", page: "Salary/SalaryPage", role: "Salary" },
  { path: "/Salary/Settings", page: "Salary/SalarySettingsPage", role: "Salary" },
  { path: "/KnowledgeLibrary", page: "KnowledgeLibrary/KnowledgeLibrary", role: ["KnowledgeLibrary", "KnowledgeLibraryAdmin"] },
  { path: "Notifications", page: "Notifications/Notifications" },
  { path: "*", page: "NotFound/NotFound" },
];

export const publicRoutes: AppRouteConfig[] = [
  { path: "/Login", page: "Login/Login" },
];

interface ResolvedRouteConfig extends AppRouteConfig {
  fullPath: string;
}

function normalizeRoutePath(path: string): string {
  if (path === "*") return path;
  if (path.startsWith("/")) return path;
  return `/${path}`;
}

function joinRoutePath(parentPath: string, path: string): string {
  if (path === "*") return "*";
  if (path.startsWith("/")) return path;
  if (!parentPath || parentPath === "/") return normalizeRoutePath(path);
  return `${parentPath.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function flattenRoutes(routes: AppRouteConfig[], parentPath = ""): ResolvedRouteConfig[] {
  return routes.flatMap((route) => {
    const fullPath = joinRoutePath(parentPath, route.path);
    const current: ResolvedRouteConfig = { ...route, fullPath };
    const children = route.children ? flattenRoutes(route.children, fullPath) : [];
    return [current, ...children];
  });
}

const resolvedRoutes = flattenRoutes([...protectedRoutes, ...publicRoutes]).sort(
  (left, right) => right.fullPath.length - left.fullPath.length,
);

export function preloadRouteForPath(pathname: string): Promise<{ default: ComponentType }> | null {
  // Путь может содержать query/hash — для сопоставления маршрута они не нужны.
  const cleanPath = pathname.split(/[?#]/)[0] || pathname;
  const matchedRoute = resolvedRoutes.find((route) => {
    if (route.fullPath === "*") return false;
    return Boolean(matchPath({ path: route.fullPath, end: true }, cleanPath));
  });

  if (matchedRoute) {
    return preloadPage(matchedRoute.page);
  }

  const wildcardRoute = resolvedRoutes.find((route) => route.fullPath === "*");
  return wildcardRoute ? preloadPage(wildcardRoute.page) : null;
}

export async function navigateWithPreloadedRoute(
  navigate: NavigateFunction,
  path: string,
  options?: NavigateOptions,
): Promise<void> {
  await preloadRouteForPath(path);
  navigate(path, options);
}
