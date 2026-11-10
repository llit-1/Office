import { describe, expect, it } from "vitest";
import type { OfficeRole } from "../../Interfaces/Users";
import { describeConflict, findNewUserConflict, findUserConflict, groupRolesBySection, NO_SECTION, shortRoleName } from "../../Pages/Users/roleConflicts";

const role = (id: number, name: string, section: string | null, exclusiveKey: string | null = null): OfficeRole =>
  ({ id, name, role: `R${id}`, description: "", officeGroup: [], section, exclusiveKey });

const ordersAdmin = role(1, "Заказы ТТ Админ", "Заказы ТТ", "orders");
const ordersAll = role(2, "Заказы - Все позиции", "Заказы ТТ", "orders");
const ordersOwn = role(3, "Заказы - Собственное управление", "Заказы ТТ", " Orders ");
const profit = role(4, "Отчёты - Выручка", "Отчёты");
const admin = role(5, "Админ", null);

describe("взаимоисключающие роли", () => {
  it("находит две роли одного ключа — в одной группе и у пользователя из разных групп", () => {
    const inGroup = findUserConflict([{ name: "Офис", officeRole: [ordersAdmin, profit, ordersAll] }]);
    expect(inGroup && describeConflict(inGroup)).toBe("Роли «Заказы ТТ Админ» и «Заказы - Все позиции» взаимоисключающие: в группе «Офис» может быть только одна из них.");

    // ключ сравнивается без пробелов и регистра
    const across = findUserConflict([{ name: "Офис", officeRole: [ordersAdmin] }, { name: "ТТ", officeRole: [ordersOwn] }]);
    expect(across && describeConflict(across)).toBe(
      "Роли «Заказы ТТ Админ» (группа «Офис») и «Заказы - Собственное управление» (группа «ТТ») взаимоисключающие: у пользователя может быть только одна из них.",
    );
  });

  it("не считает противоречием одну и ту же роль из двух групп и роли без ключа", () => {
    expect(findUserConflict([{ name: "А", officeRole: [ordersAll, profit] }, { name: "Б", officeRole: [ordersAll, profit, admin] }])).toBeNull();
  });

  it("новым считает только то противоречие, которого не было до правки", () => {
    const office = { name: "Офис", officeRole: [ordersAdmin] };
    const shops = { name: "ТТ", officeRole: [ordersOwn] };
    const reports = { name: "Отчёты", officeRole: [profit] };
    const all = { name: "Все позиции", officeRole: [ordersAll] };

    expect(findNewUserConflict([office, shops], [office, shops, reports])).toBeNull();
    const added = findNewUserConflict([office, shops], [office, shops, all]);
    expect(added?.second.role.id).toBe(ordersAll.id);
  });

  it("собирает роли по разделам: взаимоисключающие — отдельным набором, без раздела — последними", () => {
    const lonely = role(6, "Датчики", "Датчики", "sensors");
    expect(groupRolesBySection([admin, profit, ordersOwn, lonely, ordersAdmin, ordersAll])).toEqual([
      // набор из одной роли — обычная галочка
      { name: "Датчики", independent: [lonely], exclusive: [] },
      { name: "Заказы ТТ", independent: [], exclusive: [{ key: "orders", roles: [ordersAll, ordersOwn, ordersAdmin] }] },
      { name: "Отчёты", independent: [profit], exclusive: [] },
      { name: NO_SECTION, independent: [admin], exclusive: [] },
    ]);
  });
});

describe("короткое название роли в разделе", () => {
  it("убирает повтор раздела, только если префикс — это раздел", () => {
    expect(shortRoleName("Отчёты - Выручка", "Отчёты")).toBe("Выручка");
    expect(shortRoleName("Кассы - Аудитор", "Касса")).toBe("Аудитор");
    expect(shortRoleName("Заказы - Все позиции", "Заказы ТТ")).toBe("Все позиции");
    expect(shortRoleName("NX - Видеонаблюдение", "Видео на ТТ")).toBe("NX - Видеонаблюдение");
    expect(shortRoleName("Заказы ТТ Админ", "Заказы ТТ")).toBe("Админ");
    expect(shortRoleName("Калькулятор", "Калькулятор")).toBe("Доступ");
    expect(shortRoleName("Отчёты - Выручка", NO_SECTION)).toBe("Отчёты - Выручка");
  });
});
