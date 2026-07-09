import { useEffect, useMemo, useState } from "react";
import { useNotifications } from "@toolpad/core";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import type { AdDirectoryUser } from "../../../Interfaces/Users";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, del, get, post, put } from "../../../Services/api";
import type { SensorChatDetails, SensorChatFormState, SensorChatRow, SensorRow } from "../sensors.types";
import { defaultSensorChatFormState, getAdUserLabel } from "../sensors.utils";
import SensorChatModal from "./SensorChatModal";
import styles from "../Sensors.module.css";

interface SensorChatsTabProps {
  sensors: SensorRow[];
}

const tableStateKey = "sensor-chats-list";

export default function SensorChatsTab({ sensors }: SensorChatsTabProps) {
  const notifications = useNotifications();

  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [rows, setRows] = useState<SensorChatRow[]>([]);
  const [users, setUsers] = useState<AdDirectoryUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [saving, setSaving] = useState(false);
  const [editingChat, setEditingChat] = useState<SensorChatRow | null>(null);
  const [form, setForm] = useState<SensorChatFormState>(defaultSensorChatFormState);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const adUsersByLogin = useMemo(
    () => new Map(users.map((user) => [user.login, user])),
    [users],
  );

  const loadChats = async () => {
    setLoading(true);

    const chatsResult = await callApi(get<SensorChatRow[]>("/Sensors/chats"), { notifications });

    setLoading(false);

    if (chatsResult.ok) {
      setRows(chatsResult.data);
    }
  };

  const loadUsers = async () => {
    if (usersLoaded || usersLoading) {
      return;
    }

    setUsersLoading(true);

    const usersResult = await callApi(get<AdDirectoryUser[]>("/User/ad-users"), { notifications });

    setUsersLoading(false);

    if (usersResult.ok) {
      setUsers(usersResult.data);
      setUsersLoaded(true);
    }
  };

  useEffect(() => {
    void loadChats();
  }, []);

  const resetModalState = () => {
    setModalOpen(false);
    setModalMode("create");
    setEditingChat(null);
    setForm(defaultSensorChatFormState);
    setDeleteConfirmOpen(false);
  };

  const openCreateModal = () => {
    setModalMode("create");
    setEditingChat(null);
    setForm(defaultSensorChatFormState);
    setDeleteConfirmOpen(false);
    setModalOpen(true);
    void loadUsers();
  };

  const openEditModal = async (row: SensorChatRow) => {
    setModalMode("edit");
    setEditingChat(row);
    setDeleteConfirmOpen(false);

    const result = await callApi(get<SensorChatDetails>(`/Sensors/chats/${row.id}`), { notifications });
    if (!result.ok) {
      return;
    }

    setForm({
      name: result.data.name,
      roomIds: result.data.roomIds,
      userLogins: result.data.userLogins,
    });
    setModalOpen(true);
    void loadUsers();
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      roomIds: form.roomIds,
      userLogins: form.userLogins,
      userDisplayNames: Object.fromEntries(
        form.userLogins.map((login) => [login, getAdUserLabel(adUsersByLogin.get(login) ?? { login, fullName: login, position: null })]),
      ),
    };

    const result =
      modalMode === "create"
        ? await callApi(post<SensorChatDetails>("/Sensors/chats", payload), {
            notifications,
            successMessage: "Чат добавлен",
          })
        : await callApi(put<SensorChatDetails>(`/Sensors/chats/${editingChat?.id}`, payload), {
            notifications,
            successMessage: "Чат сохранён",
          });

    setSaving(false);

    if (!result.ok) {
      return;
    }

    resetModalState();
    await loadChats();
  };

  const handleDelete = async () => {
    if (!editingChat || saving) {
      return;
    }

    setSaving(true);

    const result = await callApi(del(`/Sensors/chats/${editingChat.id}`), {
      notifications,
      successMessage: "Чат удалён",
    });

    setSaving(false);

    if (!result.ok) {
      return;
    }

    resetModalState();
    await loadChats();
  };

  const canSave = form.name.trim().length > 0 && form.roomIds.length > 0 && form.userLogins.length > 0;

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        includesNormalized(
          `${row.name} ${row.sensorsSummary ?? ""} ${row.sensorsCount} ${row.usersCount}`,
          debouncedSearchText,
        ),
      ),
    [debouncedSearchText, rows],
  );

  const columns: Column<SensorChatRow>[] = useMemo(
    () => [
      { key: "name", label: "Чат" },
      {
        label: "Датчики",
        render: (row) => (
          <div className={styles.rulesTableCell}>
            <strong>{row.sensorsCount} шт.</strong>
            <span>
              {row.sensorsSummary
                ? `${row.sensorsSummary}${row.hasMoreSensors ? "..." : ""}`
                : "Датчики не выбраны"}
            </span>
          </div>
        ),
        sortValue: (row) => row.sensorsCount,
        filterValue: (row) => row.sensorsCount,
      },
      {
        label: "Участники",
        render: (row) => `${row.usersCount} чел.`,
        sortValue: (row) => row.usersCount,
        filterValue: (row) => row.usersCount,
      },
    ],
    [],
  );

  return (
    <section className={`${styles.contentSection} ${styles.rulesTabSection}`}>
      <GenericTable<SensorChatRow>
        data={filteredRows}
        columns={columns}
        loading={loading}
        addOption
        onAddClick={openCreateModal}
        onRowClick={(row) => void openEditModal(row)}
        wrapperClassName={styles.chatsTableWrapper}
        tableStateKey={tableStateKey}
        searchPlaceholder="Поиск по названию чата"
        searchText={searchText}
        onSearchTextChange={setSearchText}
        highlightQuery={debouncedSearchText}
      />

      <SensorChatModal
        isOpen={modalOpen}
        mode={modalMode}
        form={form}
        sensors={sensors}
        users={users}
        usersLoading={usersLoading}
        editingChat={editingChat}
        saving={saving}
        deleteConfirmOpen={deleteConfirmOpen}
        canSave={canSave}
        onClose={() => {
          if (saving) {
            return;
          }

          resetModalState();
        }}
        onChange={setForm}
        onSave={() => void handleSave()}
        onDeleteClick={() => setDeleteConfirmOpen(true)}
        onDeleteCancel={() => {
          if (saving) {
            return;
          }

          setDeleteConfirmOpen(false);
        }}
        onDeleteConfirm={() => void handleDelete()}
      />
    </section>
  );
}
