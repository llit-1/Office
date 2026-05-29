import { describe, expect, it } from "vitest";
import { getAvailableMenuParts, hasRequiredRole } from "../../App/access";
import type { MenuPart } from "../../menuParts/menuParts";

describe("access helpers", () => {
  it("allows access when no role is required", () => {
    expect(hasRequiredRole([], undefined)).toBe(true);
  });

  it("allows access when the user has the required role", () => {
    expect(hasRequiredRole(["Calculator", "Admin"], "Calculator")).toBe(true);
  });

  it("denies access when the user does not have the required role", () => {
    expect(hasRequiredRole(["Admin"], "Calculator")).toBe(false);
  });

  it("filters menu parts by required role", () => {
    const parts = [
      { name: "Main", path: "/Main" },
      { name: "Calculator", path: "/Calculator", requiredRole: "Calculator" },
      { name: "Salary", path: "/Salary", requiredRole: "Salary" },
    ] as MenuPart[];

    expect(getAvailableMenuParts(parts, ["Calculator"])).toEqual([
      parts[0],
      parts[1],
    ]);
  });
});
