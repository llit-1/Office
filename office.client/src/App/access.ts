import type { MenuPart } from "../menuParts/menuParts";

export function hasRequiredRole(userRoles: string[], requiredRole?: string | string[]): boolean {
  if (!requiredRole) {
    return true;
  }

  if (Array.isArray(requiredRole)) {
    return requiredRole.some((role) => userRoles.includes(role));
  }

  return userRoles.includes(requiredRole);
}

export function getAvailableMenuParts(menuParts: MenuPart[], userRoles: string[]): MenuPart[] {
  return menuParts.filter((part) => hasRequiredRole(userRoles, part.requiredRole));
}
