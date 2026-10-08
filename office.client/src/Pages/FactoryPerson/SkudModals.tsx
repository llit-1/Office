import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Button from "../../Components/Button/Button";
import Checkbox from "../../Components/Checkbox/Checkbox";
import Input from "../../Components/Input/Input";
import Modal from "../../Components/Modal/Modal";
import Select from "../../Components/Select/Select";
import { getFactoryStructureErrorMessage } from "./factoryStructureApi";
import {
  deleteSkudController,
  deleteSkudGroup,
  deleteSkudReader,
  saveSkudController,
  saveSkudGroup,
  saveSkudReader,
  type SkudController,
  type SkudData,
  type SkudGroup,
  type SkudReader,
} from "./skudApi";
import styles from "./FactoryStructure.module.css";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Сохранение/удаление с общей обработкой ошибки и блокировкой кнопок. */
function useSubmitState() {
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState("");

  const run = async (kind: "save" | "delete", action: () => Promise<unknown>, onDone: () => void, fallback: string) => {
    if (busy) return;
    setBusy(kind);
    setError("");
    try {
      await action();
      onDone();
    } catch (err) {
      setError(getFactoryStructureErrorMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  return { busy, error, setError, run };
}

type FooterProps = {
  isCreate: boolean;
  busy: "save" | "delete" | null;
  /** Причина, по которой удалить нельзя; null — можно. */
  deleteBlockedReason: string | null;
  onDelete: () => void;
  onClose: () => void;
};

function ModalFooter({ isCreate, busy, deleteBlockedReason, onDelete, onClose }: FooterProps) {
  return (
    <>
      {!isCreate && deleteBlockedReason ? <p className={styles.hint}>{deleteBlockedReason}</p> : null}
      <div className={`${styles.actions} ${isCreate ? "" : styles.actionsSplit}`}>
        {!isCreate ? (
          <Button
            variant="danger"
            onClick={onDelete}
            loading={busy === "delete"}
            disabled={Boolean(deleteBlockedReason) || busy === "save"}
          >
            Удалить
          </Button>
        ) : null}
        <div className={styles.actionsGroup}>
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>Отмена</Button>
          <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy === "delete"}>
            {isCreate ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </div>
    </>
  );
}

function Field({ error, children }: { error?: string; children: ReactNode }) {
  return (
    <div className={`${styles.field} ${error ? styles.invalid : ""}`}>
      {children}
      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </div>
  );
}

const toIntOrNull = (value: string) => (value.trim() === "" || !/^-?\d+$/.test(value.trim()) ? null : Number(value));

// ===================== Группа =====================

type GroupModalProps = {
  /** undefined — окно закрыто, null — новая группа. */
  group: SkudGroup | null | undefined;
  data: SkudData;
  onClose: () => void;
  onSaved: () => void;
};

export function SkudGroupModal({ group, data, onClose, onSaved }: GroupModalProps) {
  const isOpen = group !== undefined;
  const isCreate = group === null;
  const [name, setName] = useState("");
  const [readerIds, setReaderIds] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const { busy, error, setError, run } = useSubmitState();

  useEffect(() => {
    if (!isOpen) return;
    setName(group?.name ?? "");
    setReaderIds(new Set(group?.readerIds ?? []));
    setSubmitted(false);
    setError("");
  }, [group, isOpen, setError]);

  // Считыватели по контроллерам; без контроллера — отдельным блоком в конце.
  const blocks = useMemo(() => {
    const result = data.controllers
      .map((controller) => ({
        key: `c${controller.id}`,
        title: controller.name,
        subtitle: controller.ip,
        readers: data.readers.filter((reader) => reader.controllerId === controller.id),
      }))
      .filter((block) => block.readers.length > 0);
    const orphans = data.readers.filter(
      (reader) => reader.controllerId == null || !data.controllers.some((c) => c.id === reader.controllerId),
    );
    if (orphans.length) result.push({ key: "none", title: "Без контроллера", subtitle: "", readers: orphans });
    return result;
  }, [data.controllers, data.readers]);

  const toggle = (ids: number[], checked: boolean) =>
    setReaderIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });

  const nameError = submitted && !name.trim() ? "Укажите название группы." : "";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    void run(
      "save",
      () => saveSkudGroup(group?.id ?? null, { name: name.trim(), readerIds: [...readerIds] }),
      onSaved,
      "Не удалось сохранить группу.",
    );
  };

  const deleteBlockedReason = !group
    ? null
    : group.persons > 0
      ? `Удалить нельзя: группа назначена сотрудникам (${group.persons}).`
      : group.historyRows > 0
        ? "Удалить нельзя: группа есть в истории изменений сотрудников."
        : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isCreate ? "Новая группа СКУД" : "Группа СКУД"} size="md">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Field error={nameError}>
          <Input
            label="Название *"
            value={name}
            maxLength={50}
            disabled={busy !== null}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div className={styles.readerPicker}>
          <p className={styles.readerPickerTitle}>
            Считыватели, через которые пускают группу: выбрано {readerIds.size} из {data.readers.length}
          </p>
          {blocks.map((block) => {
            const ids = block.readers.map((reader) => reader.id);
            const allChecked = ids.every((id) => readerIds.has(id));
            return (
              <fieldset key={block.key} className={styles.readerBlock} disabled={busy !== null}>
                <legend className={styles.readerBlockTitle}>
                  <Checkbox
                    size="sm"
                    label={
                      <>
                        <strong>{block.title}</strong>
                        {block.subtitle ? <span className={styles.muted}> · {block.subtitle}</span> : null}
                      </>
                    }
                    checked={allChecked}
                    onChange={(event) => toggle(ids, event.target.checked)}
                  />
                </legend>
                <div className={styles.readerList}>
                  {block.readers.map((reader) => (
                    <Checkbox
                      key={reader.id}
                      size="sm"
                      label={reader.name}
                      checked={readerIds.has(reader.id)}
                      onChange={(event) => toggle([reader.id], event.target.checked)}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>

        {group && group.persons > 0 ? (
          <p className={styles.warning}>
            Изменение состава сразу меняет доступ всех сотрудников группы ({group.persons}).
          </p>
        ) : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <ModalFooter
          isCreate={isCreate}
          busy={busy}
          deleteBlockedReason={deleteBlockedReason}
          onClose={onClose}
          onDelete={() => group && void run("delete", () => deleteSkudGroup(group.id), onSaved, "Не удалось удалить группу.")}
        />
      </form>
    </Modal>
  );
}

// ===================== Считыватель =====================

type ReaderModalProps = {
  reader: SkudReader | null | undefined;
  data: SkudData;
  onClose: () => void;
  onSaved: () => void;
};

type ReaderForm = {
  name: string;
  ip: string;
  controllerId: string;
  relay: string;
  commandType: string;
  commandTime: string;
  securityMonitor: string;
};

const readerToForm = (reader: SkudReader | null | undefined): ReaderForm => ({
  name: reader?.name ?? "",
  ip: reader?.ip ?? "",
  controllerId: reader?.controllerId != null ? String(reader.controllerId) : "",
  relay: reader ? String(reader.relay) : "",
  commandType: reader ? String(reader.commandType) : "",
  commandTime: reader ? String(reader.commandTime) : "",
  securityMonitor: reader?.securityMonitor ?? "",
});

export function SkudReaderModal({ reader, data, onClose, onSaved }: ReaderModalProps) {
  const isOpen = reader !== undefined;
  const isCreate = reader === null;
  const [form, setForm] = useState<ReaderForm>(readerToForm(null));
  const [templateId, setTemplateId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { busy, error, setError, run } = useSubmitState();

  useEffect(() => {
    if (!isOpen) return;
    setForm(readerToForm(reader));
    setTemplateId("");
    setSubmitted(false);
    setError("");
  }, [isOpen, reader, setError]);

  const set = (key: keyof ReaderForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  // Новый считыватель удобнее всего настроить по образцу соседнего: те же контроллер, реле и команды.
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const source = data.readers.find((item) => String(item.id) === id);
    if (!source) return;
    setForm((prev) => ({
      ...readerToForm(source),
      name: prev.name,
      ip: prev.ip,
    }));
  };

  const errors = submitted
    ? {
        name: form.name.trim() ? "" : "Укажите название.",
        ip: !form.ip.trim() || IPV4.test(form.ip.trim()) ? "" : "IP в формате 192.168.0.1.",
        relay: toIntOrNull(form.relay) == null ? "Укажите число." : "",
        commandType: toIntOrNull(form.commandType) == null ? "Укажите число." : "",
        commandTime: toIntOrNull(form.commandTime) == null ? "Укажите число." : "",
      }
    : { name: "", ip: "", relay: "", commandType: "", commandTime: "" };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const relay = toIntOrNull(form.relay);
    const commandType = toIntOrNull(form.commandType);
    const commandTime = toIntOrNull(form.commandTime);
    const ip = form.ip.trim();
    if (!form.name.trim() || (ip && !IPV4.test(ip)) || relay == null || commandType == null || commandTime == null) return;

    void run(
      "save",
      () =>
        saveSkudReader(reader?.id ?? null, {
          name: form.name.trim(),
          ip: ip || null,
          controllerId: form.controllerId ? Number(form.controllerId) : null,
          relay,
          commandType,
          commandTime,
          securityMonitor: form.securityMonitor.trim() || null,
        }),
      onSaved,
      "Не удалось сохранить считыватель.",
    );
  };

  const deleteBlockedReason =
    reader && reader.groups > 0 ? `Удалить нельзя: считыватель входит в группы СКУД (${reader.groups}).` : null;

  const disabled = busy !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isCreate ? "Новый считыватель" : "Считыватель"} size="md">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {isCreate ? (
          <Field>
            <Select
              label="Скопировать настройки из"
              options={data.readers.map((item) => ({ value: String(item.id), label: item.name }))}
              placeholder="Не копировать"
              value={templateId}
              search
              disabled={disabled}
              onChange={(event) => applyTemplate(event.target.value)}
            />
          </Field>
        ) : null}
        <Field error={errors.name}>
          <Input label="Название *" value={form.name} maxLength={60} disabled={disabled} onChange={(e) => set("name")(e.target.value)} />
        </Field>
        <div className={styles.formGrid}>
          <Field>
            <Select
              label="Контроллер"
              options={[
                { value: "", label: "Без контроллера" },
                ...data.controllers.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.ip}` })),
              ]}
              value={form.controllerId}
              disabled={disabled}
              onChange={(event) => set("controllerId")(event.target.value)}
            />
          </Field>
          <Field error={errors.ip}>
            <Input label="IP-адрес" value={form.ip} maxLength={15} placeholder="192.168.0.1" disabled={disabled} onChange={(e) => set("ip")(e.target.value)} />
          </Field>
          <Field error={errors.relay}>
            <Input label="Реле *" type="number" inputMode="numeric" value={form.relay} disabled={disabled} onChange={(e) => set("relay")(e.target.value)} />
          </Field>
          <Field error={errors.commandType}>
            <Input label="Тип команды *" type="number" inputMode="numeric" value={form.commandType} disabled={disabled} onChange={(e) => set("commandType")(e.target.value)} />
          </Field>
          <Field error={errors.commandTime}>
            <Input label="Время команды *" type="number" inputMode="numeric" value={form.commandTime} disabled={disabled} onChange={(e) => set("commandTime")(e.target.value)} />
          </Field>
          <Field>
            <Input label="Монитор охраны (URL)" value={form.securityMonitor} maxLength={50} disabled={disabled} onChange={(e) => set("securityMonitor")(e.target.value)} />
          </Field>
        </div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <ModalFooter
          isCreate={isCreate}
          busy={busy}
          deleteBlockedReason={deleteBlockedReason}
          onClose={onClose}
          onDelete={() => reader && void run("delete", () => deleteSkudReader(reader.id), onSaved, "Не удалось удалить считыватель.")}
        />
      </form>
    </Modal>
  );
}

// ===================== Контроллер =====================

type ControllerModalProps = {
  controller: SkudController | null | undefined;
  onClose: () => void;
  onSaved: () => void;
};

export function SkudControllerModal({ controller, onClose, onSaved }: ControllerModalProps) {
  const isOpen = controller !== undefined;
  const isCreate = controller === null;
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [type, setType] = useState("");
  const [pwd, setPwd] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { busy, error, setError, run } = useSubmitState();

  useEffect(() => {
    if (!isOpen) return;
    setName(controller?.name ?? "");
    setIp(controller?.ip ?? "");
    setType(controller ? String(controller.type) : "");
    setPwd("");
    setSubmitted(false);
    setError("");
  }, [controller, isOpen, setError]);

  const errors = submitted
    ? {
        name: name.trim() ? "" : "Укажите название.",
        ip: IPV4.test(ip.trim()) ? "" : "IP в формате 192.168.0.1.",
        type: toIntOrNull(type) == null ? "Укажите число." : "",
        pwd: (isCreate && !pwd.trim()) || (pwd.trim() && toIntOrNull(pwd) == null) ? "Пароль — число." : "",
      }
    : { name: "", ip: "", type: "", pwd: "" };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const typeValue = toIntOrNull(type);
    const pwdValue = toIntOrNull(pwd);
    if (!name.trim() || !IPV4.test(ip.trim()) || typeValue == null) return;
    if ((isCreate && pwdValue == null) || (pwd.trim() && pwdValue == null)) return;

    void run(
      "save",
      () => saveSkudController(controller?.id ?? null, { name: name.trim(), ip: ip.trim(), type: typeValue, pwd: pwdValue }),
      onSaved,
      "Не удалось сохранить контроллер.",
    );
  };

  const deleteBlockedReason =
    controller && controller.readers > 0 ? `Удалить нельзя: к контроллеру привязаны считыватели (${controller.readers}).` : null;

  const disabled = busy !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isCreate ? "Новый контроллер" : "Контроллер"} size="sm">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Field error={errors.name}>
          <Input label="Название *" value={name} maxLength={50} disabled={disabled} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field error={errors.ip}>
          <Input label="IP-адрес *" value={ip} maxLength={15} placeholder="192.168.0.1" disabled={disabled} onChange={(e) => setIp(e.target.value)} />
        </Field>
        <Field error={errors.type}>
          <Input label="Тип *" type="number" inputMode="numeric" value={type} disabled={disabled} onChange={(e) => setType(e.target.value)} />
        </Field>
        <Field error={errors.pwd}>
          <Input
            label={isCreate ? "Пароль *" : "Пароль"}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder={isCreate ? "" : "Оставьте пустым, чтобы не менять"}
            value={pwd}
            disabled={disabled}
            onChange={(e) => setPwd(e.target.value)}
          />
        </Field>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <ModalFooter
          isCreate={isCreate}
          busy={busy}
          deleteBlockedReason={deleteBlockedReason}
          onClose={onClose}
          onDelete={() => controller && void run("delete", () => deleteSkudController(controller.id), onSaved, "Не удалось удалить контроллер.")}
        />
      </form>
    </Modal>
  );
}
