import type { MenuPart } from "../menuParts/menuParts";

export function hasRequiredRole(userRoles: string[], requiredRole?: string): boolean {
  return !requiredRole || userRoles.includes(requiredRole);
}

export function getAvailableMenuParts(menuParts: MenuPart[], userRoles: string[]): MenuPart[] {
  return menuParts.filter((part) => hasRequiredRole(userRoles, part.requiredRole));
}
