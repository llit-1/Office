import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Checkbox from "../../Components/Checkbox/Checkbox";
import Button from "../../Components/Button/Button";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import Input from "../../Components/Input/Input";
import Modal from "../../Components/Modal/Modal";
import Toggle from "../../Components/Toggle/Toggle";
import { getFriendlyErrorMessage } from "../../Services/api";
import {
  createKnowledgeSection,
  deleteKnowledgeSection,
  knowledgeCoverUrl,
  reindexKnowledgeSection,
  testKnowledgePath,
  updateKnowledgeSection,
} from "./knowledgeLibrary.api";
import type { KnowledgeAdminSection, KnowledgeRole, KnowledgeSectionPayload } from "./knowledgeLibrary.types";
import styles from "./KnowledgeLibrarySectionModal.module.css";

interface EditorState extends KnowledgeSectionPayload { id: string | null; }

interface Props {
  isOpen: boolean;
  section: KnowledgeAdminSection | null;
  roles: KnowledgeRole[];
  onClose: () => void;
  onChanged: (message: string) => Promise<void> | void;
}

const emptyEditor: EditorState = {
  id: null,
  title: "",
  description: "",
  rootPath: "",
  isActive: true,
  availableToAll: false,
  sortOrder: 0,
  roleIds: [],
  cover: null,
};

export default function KnowledgeLibrarySectionModal({ isOpen, section, roles, onClose, onChanged }: Props) {
  const [editor, setEditor] = useState<EditorState>({ ...emptyEditor });
  const [saving, setSaving] = useState(false);
  const [testingPath, setTestingPath] = useState(false);
  const [pathResult, setPathResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEditor(section ? {
      id: section.id,
      title: section.title,
      description: section.description,
      rootPath: section.rootPath,
      isActive: section.isActive,
      availableToAll: section.availableToAll,
      sortOrder: section.sortOrder,
      roleIds: section.roleIds,
      cover: null,
    } : { ...emptyEditor });
    setError(null);
    setPathResult(null);
    setDeleteConfirmationOpen(false);
  }, [isOpen, section]);

  const existingCover = section?.hasCover ? knowledgeCoverUrl(section.id) : null;
  const localCover = useMemo(() => editor.cover ? URL.createObjectURL(editor.cover) : null, [editor.cover]);
  useEffect(() => () => { if (localCover) URL.revokeObjectURL(localCover); }, [localCover]);

  const close = () => { if (!saving) onClose(); };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor.title.trim() || !editor.rootPath.trim()) {
      setError("Заполните название и путь к сетевой папке.");
      return;
    }
    if (!editor.availableToAll && editor.roleIds.length === 0) {
      setError("Выберите роли или включите доступ для всех пользователей библиотеки.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editor.id) await updateKnowledgeSection(editor.id, editor);
      else await createKnowledgeSection(editor);
      onClose();
      await onChanged(editor.id ? "Раздел обновлён и поставлен на переиндексацию." : "Раздел создан и поставлен на индексацию.");
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Не удалось сохранить раздел."));
    } finally {
      setSaving(false);
    }
  };

  const testPath = async () => {
    if (!editor.rootPath.trim()) return;
    setTestingPath(true);
    setPathResult(null);
    setError(null);
    try {
      const result = await testKnowledgePath(editor.rootPath);
      setEditor((current) => ({ ...current, rootPath: result.normalizedPath }));
      setPathResult(result.message);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Папка недоступна."));
    } finally {
      setTestingPath(false);
    }
  };

  const remove = async () => {
    if (!section) return;
    setDeleteConfirmationOpen(false);
    setSaving(true);
    setError(null);
    try {
      await deleteKnowledgeSection(section.id);
      onClose();
      await onChanged("Раздел удалён. Файлы на сетевом диске не затронуты.");
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Не удалось удалить раздел."));
    } finally {
      setSaving(false);
    }
  };

  const reindex = async () => {
    if (!section) return;
    setSaving(true);
    setError(null);
    try {
      await reindexKnowledgeSection(section.id);
      await onChanged(`Раздел «${section.title}» поставлен в очередь на переиндексацию.`);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Не удалось запустить переиндексацию."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!deleteConfirmationOpen) close(); }}
      title={(
        <span className={styles.modalHeading}>
          <span>{section ? "Редактирование раздела" : "Новый раздел"}</span>
        </span>
      )}
      size="lg"
      panelClassName={styles.editorPanel}
      bodyClassName={styles.editorBody}
    >
      <form className={styles.form} onSubmit={save}>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.editorLayout}>
          <div className={styles.mainColumn}>
            <section className={styles.formSection}>
              <div className={styles.fields}>
                <Input label="Название раздела" maxLength={160} value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} />
                <Input label="Короткое описание" maxLength={500} value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} />
                <div className={styles.pathInput}>
                  <Input label="Путь к сетевой папке" value={editor.rootPath} placeholder="\\server\share\folder" onChange={(e) => { setEditor({ ...editor, rootPath: e.target.value }); setPathResult(null); }} />
                  <button type="button" onClick={() => void testPath()} disabled={testingPath}>{testingPath ? "Проверяем..." : "Проверить путь"}</button>
                </div>
                {pathResult && <span className={styles.pathSuccess}><CheckCircleOutlineRoundedIcon /> {pathResult}</span>}
              </div>
            </section>

            <section className={styles.formSection}>
              <header className={styles.sectionHeader}>
                <div><h4>Доступ к разделу</h4><p>Откройте раздел всем пользователям библиотеки или выберите отдельные роли.</p></div>
              </header>
              <Checkbox
                checked={editor.availableToAll}
                onChange={(e) => setEditor({ ...editor, availableToAll: e.target.checked })}
                label={<span className={styles.checkboxCopy}><strong>Все пользователи библиотеки</strong><span>Доступ для всех сотрудников с ролью KnowledgeLibrary</span></span>}
                labelClassName={styles.allRoles}
              />
              {!editor.availableToAll && (
                <>
                  <div className={styles.rolesCaption}><span>Или выберите роли</span><span>{editor.roleIds.length} выбрано</span></div>
                  <div className={styles.roleGrid}>
                    {roles.map((role) => (
                      <Checkbox
                        key={role.id}
                        checked={editor.roleIds.includes(role.id)}
                        onChange={(e) => setEditor({
                          ...editor,
                          roleIds: e.target.checked ? [...editor.roleIds, role.id] : editor.roleIds.filter((id) => id !== role.id),
                        })}
                        label={<span className={styles.checkboxCopy}><strong>{role.name}</strong><span>{role.role}</span></span>}
                        labelClassName={styles.roleOption}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.sideCard}>
              <header className={styles.sideHeader}><h4>Фото</h4><p>Отображается на карточке раздела</p></header>
              <label className={styles.coverPicker}>
                {(localCover || existingCover) ? (
                  <><img src={localCover || existingCover!} alt="Предпросмотр обложки" /><span className={styles.coverAction}>Заменить</span></>
                ) : (
                  <><ImageOutlinedIcon /><span>Выбрать файл</span></>
                )}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,.svg" onChange={(e) => setEditor({ ...editor, cover: e.target.files?.[0] ?? null })} />
              </label>
              <p className={styles.coverHint}>SVG, PNG, JPG или WEBP<br />до 5 МБ</p>
            </section>

            <section className={styles.sideCard}>
              <div className={styles.activationRow}>
                <div><h4>Раздел активен</h4><p>{editor.isActive ? "Доступен пользователям" : "Скрыт от пользователей"}</p></div>
                <Toggle checked={editor.isActive} onChange={(checked) => setEditor({ ...editor, isActive: checked })} small ariaLabel="Активность раздела" containerClassName={styles.activationToggle} />
              </div>
            </section>

            {section && (
              <button className={styles.reindexCard} type="button" onClick={() => void reindex()} disabled={saving}>
                <RefreshRoundedIcon />
                <span><strong>Обновить индекс</strong><small>Повторно прочитать файлы с диска</small></span>
              </button>
            )}
          </aside>
        </div>

        <footer className={styles.footer}>
          <div>
            {section && <Button variant="danger" leadingIcon={<DeleteOutlineRoundedIcon />} onClick={() => setDeleteConfirmationOpen(true)} disabled={saving}>Удалить</Button>}
          </div>
          <div className={styles.saveActions}>
            <Button variant="secondary" onClick={close} disabled={saving}>Отмена</Button>
            <Button variant="primary" type="submit" loading={saving}>Сохранить</Button>
          </div>
        </footer>
      </form>
    </Modal>
    <ConfirmModal
      isOpen={deleteConfirmationOpen}
      title="Удалить раздел?"
      message={`Раздел «${section?.title ?? ""}» исчезнет из библиотеки. Файлы на сетевом диске останутся без изменений.`}
      confirmLabel="Удалить"
      cancelLabel="Отмена"
      onCancel={() => setDeleteConfirmationOpen(false)}
      onConfirm={() => void remove()}
      panelClassName={styles.confirmPanel}
    />
    </>
  );
}
