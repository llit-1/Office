import type { OfficeGroup, OfficeRole } from "../../Interfaces/Users";

/**
 * Взаимоисключающие роли — те же правила, что на сервере (RoleConflicts.cs):
 * из ролей с одинаковым exclusiveKey группе, а пользователю — по всем его группам, можно дать только одну.
 */

export const NO_SECTION = "Без раздела";

export interface GrantedRole {
  role: OfficeRole;
  group: string;
}

export interface RoleConflict {
  first: GrantedRole;
  second: GrantedRole;
}

/** Пустой ключ — роль ни с чем не конфликтует. */
export const normalizeKey = (value: string | null | undefined) => {
  const key = value?.trim().toLocaleLowerCase("ru-RU");
  return key ? key : null;
};

function allConflicts(roles: GrantedRole[]): RoleConflict[] {
  const byKey = new Map<string, GrantedRole[]>();
  const conflicts: RoleConflict[] = [];
  for (const granted of roles) {
    const key = normalizeKey(granted.role.exclusiveKey);
    if (!key) continue;
    const earlier = byKey.get(key) ?? [];
    earlier.filter((other) => other.role.id !== granted.role.id).forEach((other) => conflicts.push({ first: other, second: granted }));
    byKey.set(key, [...earlier, granted]);
  }
  return conflicts;
}

/** Первая пара противоречащих ролей или null. Одна и та же роль из разных групп противоречием не считается. */
export const findRoleConflict = (roles: GrantedRole[]): RoleConflict | null => allConflicts(roles)[0] ?? null;

type UserGroup = Pick<OfficeGroup, "name" | "officeRole">;

const grantedByGroups = (groups: UserGroup[]) =>
  groups.flatMap((group) => (group.officeRole ?? []).map((role) => ({ role, group: group.name })));

/** Роли пользователя из всех его групп. */
export const findUserConflict = (groups: UserGroup[]) => findRoleConflict(grantedByGroups(groups));

const rolePair = ({ first, second }: RoleConflict) =>
  [first.role.id, second.role.id].sort((left, right) => left - right).join(":");

/** Первое противоречие, которого не было до правки: старые не мешают посторонним изменениям. */
export function findNewUserConflict(before: UserGroup[], after: UserGroup[]): RoleConflict | null {
  const known = new Set(allConflicts(grantedByGroups(before)).map(rolePair));
  return allConflicts(grantedByGroups(after)).find((conflict) => !known.has(rolePair(conflict))) ?? null;
}

export function describeConflict({ first, second }: RoleConflict) {
  return first.group === second.group
    ? `Роли «${first.role.name}» и «${second.role.name}» взаимоисключающие: в группе «${first.group}» может быть только одна из них.`
    : `Роли «${first.role.name}» (группа «${first.group}») и «${second.role.name}» (группа «${second.group}») взаимоисключающие: у пользователя может быть только одна из них.`;
}

export interface RoleSection {
  name: string;
  /** Роли, которые можно отмечать независимо друг от друга. */
  independent: OfficeRole[];
  /** Наборы взаимоисключающих ролей: из каждого — не больше одной. */
  exclusive: { key: string; roles: OfficeRole[] }[];
}

const byName = (left: OfficeRole, right: OfficeRole) => left.name.localeCompare(right.name, "ru");

/** Роли по разделам: разделы по алфавиту, «Без раздела» — последним. */
export function groupRolesBySection(roles: OfficeRole[]): RoleSection[] {
  const sections = new Map<string, RoleSection>();
  for (const role of roles) {
    const name = role.section?.trim() || NO_SECTION;
    let section = sections.get(name);
    if (!section) {
      section = { name, independent: [], exclusive: [] };
      sections.set(name, section);
    }
    const key = normalizeKey(role.exclusiveKey);
    if (!key) {
      section.independent.push(role);
      continue;
    }
    const set = section.exclusive.find((candidate) => candidate.key === key);
    if (set) set.roles.push(role);
    else section.exclusive.push({ key, roles: [role] });
  }
  for (const section of sections.values()) {
    section.independent.sort(byName);
    section.exclusive.forEach((set) => set.roles.sort(byName));
    // набор из одной роли выбирать не из чего — это обычная галочка
    section.independent.push(...section.exclusive.filter((set) => set.roles.length === 1).flatMap((set) => set.roles));
    section.independent.sort(byName);
    section.exclusive = section.exclusive.filter((set) => set.roles.length > 1);
  }
  return [...sections.values()].sort((left, right) =>
    left.name === NO_SECTION ? 1 : right.name === NO_SECTION ? -1 : left.name.localeCompare(right.name, "ru"));
}

/** Подпись роли, которая просто открывает раздел (её название совпадает с разделом). */
export const BASE_ACCESS = "Доступ";

/**
 * Название роли внутри своего раздела без повтора раздела: «Отчёты - Выручка» → «Выручка»,
 * «Заказы ТТ Админ» → «Админ», «Калькулятор» в разделе «Калькулятор» → «Доступ».
 * Префикс через « - » сравнивается по началу слова, чтобы «Кассы - …» сокращались в разделе «Касса».
 */
export function shortRoleName(name: string, section: string) {
  if (section === NO_SECTION) return name;
  const lower = (value: string) => value.trim().toLocaleLowerCase("ru-RU");
  if (lower(name) === lower(section)) return BASE_ACCESS;
  if (lower(name).startsWith(`${lower(section)} `)) {
    const rest = name.trim().slice(section.trim().length).replace(/^[\s-]+/, "");
    if (rest) return rest;
  }
  const at = name.indexOf(" - ");
  if (at <= 0) return name;
  const rest = name.slice(at + 3).trim();
  return rest && lower(name.slice(0, at)).slice(0, 4) === lower(section).slice(0, 4) ? rest : name;
}
