import { useMemo } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import type { OfficeRole } from "../../Interfaces/Users";
import { menuParts } from "../../menuParts/menuParts";
import { BASE_ACCESS, groupRolesBySection, NO_SECTION, shortRoleName } from "./roleConflicts";
import styles from "./RoleSectionsPicker.module.css";

interface RoleSectionsPickerProps {
  roles: OfficeRole[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}

interface Choice {
  role: OfficeRole;
  label: string;
}

/** Разделы ролей называются как пункты меню — порядок и иконки берём оттуда. */
const MENU = new Map(menuParts.map((part, index) => [part.name.toLocaleLowerCase("ru-RU"), { index, Icon: part.Icon }]));
const menuOf = (section: string) => MENU.get(section.toLocaleLowerCase("ru-RU"));

/** «Доступ» к разделу — первым, остальные по алфавиту. */
const toChoices = (roles: OfficeRole[], section: string): Choice[] =>
  roles
    .map((role) => ({ role, label: shortRoleName(role.name, section) }))
    .sort((left, right) =>
      left.label === BASE_ACCESS ? -1 : right.label === BASE_ACCESS ? 1 : left.label.localeCompare(right.label, "ru"));

/**
 * Роли группы строками по разделам меню. Обычные роли — плашки «+ / ✓», взаимоисключающие —
 * переключатель «одна из»: выбор снимает соседнюю роль, повторный клик снимает выбор.
 */
export default function RoleSectionsPicker({ roles, selectedIds, onChange, disabled = false }: RoleSectionsPickerProps) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const sections = useMemo(
    () =>
      groupRolesBySection(roles)
        .map((section) => ({
          name: section.name,
          Icon: (menuOf(section.name)?.Icon ?? ShieldOutlinedIcon) as SvgIconComponent,
          order: section.name === NO_SECTION ? Number.MAX_SAFE_INTEGER : (menuOf(section.name)?.index ?? Number.MAX_SAFE_INTEGER - 1),
          independent: toChoices(section.independent, section.name),
          exclusive: section.exclusive.map((set) => ({ key: set.key, choices: toChoices(set.roles, section.name) })),
        }))
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, "ru")),
    [roles],
  );

  const toggle = (id: number, rivals: Choice[] = []) => {
    if (selected.has(id)) {
      onChange(selectedIds.filter((value) => value !== id));
      return;
    }
    const rivalIds = new Set(rivals.map((choice) => choice.role.id));
    onChange([...selectedIds.filter((value) => !rivalIds.has(value)), id]);
  };

  if (sections.length === 0) return <p className={styles.empty}>Ролей пока нет</p>;

  return (
    <div className={styles.list}>
      {sections.map(({ name, Icon, independent, exclusive }) => {
        const active = [...independent, ...exclusive.flatMap((set) => set.choices)].some((choice) => selected.has(choice.role.id));
        return (
          <div key={name} className={`${styles.row} ${active ? styles.rowActive : ""} ${exclusive.length ? styles.rowChoice : ""}`} role="group" aria-label={name}>
            <div className={styles.title}>
              <Icon aria-hidden="true" />
              <span>{name}</span>
            </div>
            <div className={styles.options}>
              {exclusive.map(({ key, choices }) => {
                const chosen = choices.filter((choice) => selected.has(choice.role.id));
                return (
                  <div key={key} className={styles.choiceWrap}>
                    <div className={styles.segmented} role="group" aria-label={`${name}: одна на выбор`} title="Можно выбрать только одну">
                      {choices.map((choice) => {
                        const on = selected.has(choice.role.id);
                        return (
                          <label key={choice.role.id} className={`${styles.segment} ${on ? styles.on : ""}`} title={choice.role.description || choice.role.name}>
                            <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(choice.role.id, choices)} />
                            <span className={styles.dot} aria-hidden="true" />
                            <span>{choice.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {/* такое могло остаться с тех пор, когда противоречия не проверялись */}
                    {chosen.length > 1 ? (
                      <p className={styles.warning} role="alert">
                        <WarningAmberRoundedIcon aria-hidden="true" />
                        Выбраны сразу {chosen.map((choice) => `«${choice.label}»`).join(" и ")} — оставьте одну.
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {independent.map((choice) => {
                const on = selected.has(choice.role.id);
                return (
                  <label key={choice.role.id} className={`${styles.chip} ${on ? styles.on : ""}`} title={choice.role.description || choice.role.name}>
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(choice.role.id)} />
                    {on ? <CheckRoundedIcon aria-hidden="true" /> : <AddRoundedIcon aria-hidden="true" />}
                    <span>{choice.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
