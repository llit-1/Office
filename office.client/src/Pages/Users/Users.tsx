import GenericTable from "../../Components/GenericTable/GenericTable";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import styles from "./Users.module.css";

import { useState, useMemo, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { OfficeUser, OfficeGroup, OfficeRole } from "../../Interfaces/Users";
import { get } from "../../Services/api";
import { callApi } from "../../Services/api";
import { RootState } from "../../Store";
import { activeIndexSet } from "../../Store/usersTabsSlice";
import useDebouncedValue from "../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../Hooks/usePersistedSearchText";
import { includesNormalized } from "../../Components/GenericTable/searchUtils";

type Column<T> =
  | { label: string; key: keyof T }  // обычная колонка
  | { label: string; render: (row: T) => React.ReactNode; sortValue?: (row: T) => string | number };

interface TradePointFormatIssue {
  userId: number;
  login: string;
  issues: string[];
}

interface UserAttentionReason {
  userId: number;
  reason: string;
}

interface UserAttention {
  noAccess: UserAttentionReason[];
  stale: UserAttentionReason[];
}

type AttentionKey = "format" | "noAccess" | "stale";

interface AttentionChip {
  key: AttentionKey;
  label: string;
  /** userId → почему учётка попала в чип */
  reasons: Map<number, string>;
}

interface AttentionMark {
  key: AttentionKey;
  reason: string;
}

// «Все ТТ» sorts above any real count
const ALL_LOCATIONS_SORT = 1_000_000;

function userColumns(marks: Map<number, AttentionMark[]>): Column<OfficeUser>[] {
  return [
    {
      label: "Имя",
      render: (g) => (
        <span className={styles.nameCell}>
          {`${g.surname} ${g.name}`}
          {/* one dot per reason, coloured like its chip */}
          {marks.get(g.id)?.map((mark) => (
            <span
              key={mark.key}
              className={styles.issueDot}
              data-kind={mark.key}
              role="img"
              aria-label={`Требует внимания: ${mark.reason}`}
              title={mark.reason}
            />
          ))}
        </span>
      ),
      sortValue: (g) => `${g.surname} ${g.name}`,
    },
    { label: "Должность", key: "position" },
    {
      label: "ТТ",
      render: (g) => (g.defaultLocations === 1 ? "Все" : g.locations?.length ?? 0),
      sortValue: (g) => (g.defaultLocations === 1 ? ALL_LOCATIONS_SORT : g.locations?.length ?? 0),
    },
    {
      label: "Группы",
      render: (g) => g.officeGroup?.length ?? 0,
      sortValue: (g) => g.officeGroup?.length ?? 0,
    },
  ];
}

const groupColumns: Column<OfficeGroup>[] = [
  { label: "Название", key: "name" },
  { label: "Кол-во ролей", render: (g) => g.officeRole?.length ?? 0, sortValue: (g) => g.officeRole?.length ?? 0 },
];

const roleColumns: Column<OfficeRole>[] = [
  { label: "Название", key: "name" },
  { label: "Описание", key: "description" },
  { label: "Код", key: "role" },
];


export default function Users() {
  const dispatch = useDispatch();
  const activeIndex = useSelector((s: RootState) => s.usersTabs.activeIndex);
  const tableStateKey = activeIndex === 0 ? "users-list" : activeIndex === 1 ? "groups-list" : "roles-list";
  const setActiveIndexLocal = (index: number) => dispatch(activeIndexSet({ activeIndex: index }));
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [users, setUsers] = useState<OfficeUser[]>([]);
  const [groups, setGroups] = useState<OfficeGroup[]>([]);
  const [roles, setRoles] = useState<OfficeRole[]>([]);
  const [loading, setLoading] = useState(true);
  // Учётки, на которые стоит посмотреть; грузятся отдельно и не задерживают таблицу.
  const [formatIssues, setFormatIssues] = useState<TradePointFormatIssue[]>([]);
  const [attention, setAttention] = useState<UserAttention | null>(null);
  const [activeChip, setActiveChip] = useState<AttentionKey | null>(null);

  // only non-empty chips are shown
  const chips = useMemo<AttentionChip[]>(() => {
    const all: AttentionChip[] = [
      {
        key: "format",
        label: "Неверный формат ТТ",
        reasons: new Map(formatIssues.map((item) => [item.userId, `формат учётки точки: ${item.issues.join(", ")}`])),
      },
      {
        key: "noAccess",
        label: "Без доступа",
        reasons: new Map((attention?.noAccess ?? []).map((item) => [item.userId, item.reason])),
      },
      {
        key: "stale",
        label: "Не заходили 90 дней",
        reasons: new Map((attention?.stale ?? []).map((item) => [item.userId, item.reason])),
      },
    ];
    return all.filter((chip) => chip.reasons.size > 0);
  }, [formatIssues, attention]);

  const reasonsByUser = useMemo(() => {
    const result = new Map<number, AttentionMark[]>();
    for (const chip of chips) {
      for (const [userId, reason] of chip.reasons) {
        result.set(userId, [...(result.get(userId) ?? []), { key: chip.key, reason }]);
      }
    }
    return result;
  }, [chips]);

  const selectedChip = chips.find((chip) => chip.key === activeChip) ?? null;

  const getUsers = async (): Promise<OfficeUser[] | null> => {
    setLoading(true);
    const result = await callApi(get<OfficeUser[]>("/User/Users"));
    setLoading(false);
    if (result.ok) return result.data;
    return null;
  };

  const getGroups = async (): Promise<OfficeGroup[] | null> => {
    setLoading(true);
    const result = await callApi(get<OfficeGroup[]>("/User/Groups"));
    setLoading(false);
    if (result.ok) return result.data;
    return null;
  };

  const getRoles = async (): Promise<OfficeRole[] | null> => {
    setLoading(true);
    const result = await callApi(get<OfficeRole[]>("/User/Roles"));
    setLoading(false);
    if (result.ok) return result.data;
    return null;
  };

  const loadByIndex = async (index: number) => {
    if (index === 0) {
      dispatch(titleSet({ title: "Пользователи" }));
      const data = await getUsers();
      if (data) setUsers(data);
    } else if (index === 1) {
      dispatch(titleSet({ title: "Группы" }));
      const data = await getGroups();
      if (data) setGroups(data);
    } else if (index === 2) {
      dispatch(titleSet({ title: "Роли" }));
      const data = await getRoles();
      if (data) setRoles(data);
    }
  };

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    void callApi(get<TradePointFormatIssue[]>("/User/tradepoint-format")).then((result) => {
      if (!cancelled && result.ok) setFormatIssues(result.data);
    });
    void callApi(get<UserAttention>("/User/attention")).then((result) => {
      if (!cancelled && result.ok) setAttention(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadByIndex(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const handleClick = (index: number) => setActiveIndexLocal(index);

  const filteredData = useMemo(() => {
    if (activeIndex === 0) {
      return users.filter((u) =>
        (!selectedChip || selectedChip.reasons.has(u.id))
        && includesNormalized(`${u.surname ?? ""} ${u.name ?? ""}`, debouncedSearchText),
      );
    }

    if (activeIndex === 1) {
      return groups.filter((g) => includesNormalized(g.name ?? "", debouncedSearchText));
    }

    return roles.filter((r) => includesNormalized(r.name ?? "", debouncedSearchText));
  }, [debouncedSearchText, users, groups, roles, activeIndex, selectedChip]);


  return (
    <>
      <div className={styles.tt_wrapper}>
        <div className={styles.tabAndSearchWrapper}>
          <TabNavigation
            items={[
              <span className={styles.tabLabel} key="users">
                Пользователи
                {/* on the users tab the count is on the chip next to the tabs */}
                {reasonsByUser.size > 0 && activeIndex !== 0 && (
                  <span className={styles.tabCount} aria-label={`требуют внимания: ${reasonsByUser.size}`}>
                    {reasonsByUser.size}
                  </span>
                )}
              </span>,
              "Группы",
              "Роли",
            ]}
            activeIndex={activeIndex}
            onChange={handleClick}
          />
          {/* in the tab row, not above the table: a row of its own pushes the full-height table off the screen */}
          {activeIndex === 0 && chips.length > 0 && (
            <div className={styles.chips}>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={styles.issueChip}
                  data-kind={chip.key}
                  aria-pressed={activeChip === chip.key}
                  // one filter at a time: another chip replaces it, the same chip clears it
                  onClick={() => setActiveChip((current) => (current === chip.key ? null : chip.key))}
                >
                  <span className={styles.issueDot} data-kind={chip.key} aria-hidden="true" />
                  <span>{chip.label}: {chip.reasons.size}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeIndex === 0 && (
        <GenericTable<OfficeUser>
          data={filteredData as OfficeUser[]}
          columns={userColumns(reasonsByUser)}
          routeTo="/Users/Edit"
          loading={loading}
          addOption={false}
          tableStateKey="users-list"
          searchText={searchText}
          onSearchTextChange={setSearchText}
          highlightQuery={debouncedSearchText}
        />
      )}

      {activeIndex === 1 && (
        <GenericTable<OfficeGroup>
          data={filteredData as OfficeGroup[]}
          columns={groupColumns}
          routeTo="/Groups/Edit"
          loading={loading}
          addOption={true}
          tableStateKey="groups-list"
          searchText={searchText}
          onSearchTextChange={setSearchText}
          highlightQuery={debouncedSearchText}
        />
      )}

      {activeIndex === 2 && (
        <GenericTable<OfficeRole>
          data={filteredData as OfficeRole[]}
          columns={roleColumns}
          routeTo="/Roles/Edit"
          loading={loading}
          addOption={true}
          tableStateKey="roles-list"
          searchText={searchText}
          onSearchTextChange={setSearchText}
          highlightQuery={debouncedSearchText}
        />
      )}
    </>
  );
}
