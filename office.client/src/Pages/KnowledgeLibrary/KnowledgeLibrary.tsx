import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import { useDispatch, useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";
import FileTypeIcon from "../../Components/FileTypeIcon/FileTypeIcon";
import { FILE_KIND_LABEL, getFileKind } from "../../Components/FileTypeIcon/fileTypes";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../Components/Modal/Modal";
import { getFriendlyErrorMessage } from "../../Services/api";
import type { RootState } from "../../Store";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import {
  addKnowledgeFavorite,
  browseKnowledgeSection,
  getKnowledgeAdminSections,
  getKnowledgeFavorites,
  getKnowledgeMediaTicket,
  getKnowledgeRecent,
  getKnowledgeRoles,
  getKnowledgeSections,
  knowledgeCoverUrl,
  knowledgeFolderIconUrl,
  knowledgeMediaUrl,
  knowledgeOnlineViewerUrl,
  removeKnowledgeFavorite,
  searchKnowledgeSection,
} from "./knowledgeLibrary.api";
import type {
  KnowledgeAdminSection,
  KnowledgeEntry,
  KnowledgePersonalEntry,
  KnowledgeRole,
  KnowledgeSection,
} from "./knowledgeLibrary.types";
import {
  formatKnowledgeDate,
  formatKnowledgeFileSize,
  getKnowledgeBackPath,
  getKnowledgeBreadcrumbs,
  getKnowledgeLibraryHref,
  getKnowledgePathSegments,
  getKnowledgePreviewType,
  isKnowledgeVisibleFile,
} from "./knowledgeLibrary.utils";
import KnowledgeLibrarySectionModal from "./KnowledgeLibrarySectionModal";
import styles from "./KnowledgeLibrary.module.css";

const OfficeViewer = lazy(() => import("../../Components/OfficeViewer/OfficeViewer"));

function EntryPath({ entry, sectionTitle }: { entry: { relativePath: string }; sectionTitle: string }) {
  const segments = getKnowledgePathSegments(entry.relativePath);
  const full = [sectionTitle, ...segments].join(" / ");
  return (
    <span className={styles.entryPath} title={full}>
      <FolderOpenRoundedIcon />
      {segments.length ? segments.join(" / ") : "Корень раздела"}
    </span>
  );
}

function PersonalCard({
  entry,
  isFavorite,
  opening,
  busy,
  onOpen,
  onToggleFavorite,
}: {
  entry: KnowledgePersonalEntry;
  isFavorite: boolean;
  opening: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className={styles.personalCard}>
      <button type="button" className={styles.personalCardMain} disabled={opening} onClick={onOpen} title={entry.name}>
        <FileTypeIcon extension={entry.extension} className={styles.personalCardIcon} />
        <strong className={styles.personalCardName}>{entry.name}</strong>
      </button>
      <button
        type="button"
        className={`${styles.personalStar} ${isFavorite ? styles.starActive : ""}`}
        disabled={busy}
        aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
        title={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
        onClick={onToggleFavorite}
      >
        {isFavorite ? <StarRoundedIcon /> : <StarBorderRoundedIcon />}
      </button>
    </div>
  );
}

const MAX_RECENT_CARDS = 6;

const shouldHandleKnowledgeNavigation = (event: React.MouseEvent<HTMLAnchorElement>) =>
  event.button === 0
  && !event.ctrlKey
  && !event.metaKey
  && !event.shiftKey
  && !event.altKey;

export default function KnowledgeLibrary() {
  const dispatch = useDispatch();
  const roles = useSelector((state: RootState) => state.userData.roles);
  const canManage = roles.includes("KnowledgeLibraryAdmin");
  const [params, setParams] = useSearchParams();
  const sectionId = params.get("section");
  const currentPath = params.get("path") ?? "";

  const [sections, setSections] = useState<KnowledgeSection[]>([]);
  const [adminSections, setAdminSections] = useState<KnowledgeAdminSection[]>([]);
  const [availableRoles, setAvailableRoles] = useState<KnowledgeRole[]>([]);
  const [activeSection, setActiveSection] = useState<KnowledgeSection | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchNameMatches, setSearchNameMatches] = useState<KnowledgeEntry[]>([]);
  const [searchContentMatches, setSearchContentMatches] = useState<KnowledgeEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<KnowledgeEntry | null>(null);
  const [previewTicket, setPreviewTicket] = useState<string | null>(null);
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null);
  const [previewSectionTitle, setPreviewSectionTitle] = useState<string>("Раздел");
  const [useFallbackViewer, setUseFallbackViewer] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<KnowledgeAdminSection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recentEntries, setRecentEntries] = useState<KnowledgePersonalEntry[]>([]);
  const [favoriteEntries, setFavoriteEntries] = useState<KnowledgePersonalEntry[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const personalAreaRef = useRef<HTMLElement | null>(null);
  const [personalAreaMaxHeight, setPersonalAreaMaxHeight] = useState<number>();

  useEffect(() => {
    dispatch(titleSet({ title: activeSection?.title ?? "Библиотека знаний" }));
    dispatch(pathSet({ path: getKnowledgeBackPath(sectionId, currentPath) }));
    dispatch(visibleSet({ visible: true }));
  }, [activeSection?.title, currentPath, dispatch, sectionId]);

  const loadSections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (canManage) {
        const [sectionData, roleData] = await Promise.all([getKnowledgeAdminSections(), getKnowledgeRoles()]);
        setAdminSections(sectionData);
        setSections(sectionData);
        setAvailableRoles(roleData.filter((role) => role.role !== "KnowledgeLibraryAdmin"));
      } else {
        const data = await getKnowledgeSections();
        setSections(data);
        setAdminSections([]);
        setAvailableRoles([]);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Не удалось загрузить разделы библиотеки."));
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  const loadPersonal = useCallback(async () => {
    try {
      const [recent, favorites] = await Promise.all([getKnowledgeRecent(), getKnowledgeFavorites()]);
      setRecentEntries(recent);
      setFavoriteEntries(favorites);
      setFavoriteIds(new Set(favorites.map((item) => item.id)));
    } catch {
      // Недавние/избранное — вспомогательный блок, ошибку не показываем поверх основной библиотеки.
    }
  }, []);

  useEffect(() => {
    void loadPersonal();
  }, [loadPersonal]);

  // Колонка "Недавние/Избранное" не должна раздувать страницу вниз: считаем, сколько места
  // реально осталось до низа окна, и ограничиваем этим высоту колонки — дальше скроллятся
  // уже списки внутри блоков, а не вся страница.
  useEffect(() => {
    const updateMaxHeight = () => {
      // Ниже 1180px колонка уходит вниз под сетку разделов и превращается в горизонтальную
      // раскладку (см. медиа-запросы в CSS) — там ограничение по высоте только мешает,
      // страница должна скроллиться целиком как обычно.
      if (window.innerWidth <= 1180) {
        setPersonalAreaMaxHeight(undefined);
        return;
      }
      const el = personalAreaRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = Math.round(window.innerHeight - top - 16);
      setPersonalAreaMaxHeight(Math.max(available, 240));
    };
    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);
    return () => window.removeEventListener("resize", updateMaxHeight);
  }, [sectionId, recentEntries.length, favoriteEntries.length]);

  const toggleFavorite = async (entrySectionId: string, entry: { id: string }) => {
    const isFavorite = favoriteIds.has(entry.id);
    setFavoriteBusyId(entry.id);
    try {
      if (isFavorite) {
        await removeKnowledgeFavorite(entrySectionId, entry.id);
      } else {
        await addKnowledgeFavorite(entrySectionId, entry.id);
      }
      await loadPersonal();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Не удалось изменить избранное."));
    } finally {
      setFavoriteBusyId(null);
    }
  };

  useEffect(() => {
    if (!sectionId) {
      setActiveSection(null);
      setEntries([]);
      void loadSections();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    browseKnowledgeSection(sectionId, currentPath)
      .then((data) => {
        if (cancelled) return;
        setActiveSection(data.section);
        setEntries(data.entries);
      })
      .catch((err) => {
        if (!cancelled) setError(getFriendlyErrorMessage(err, "Не удалось открыть папку."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentPath, loadSections, sectionId]);

  useEffect(() => {
    if (!sectionId || search.trim().length < 2) {
      setSearchNameMatches([]);
      setSearchContentMatches([]);
      setSearching(false);
      return;
    }

    // searching выставляем сразу (а не по истечении debounce), иначе на короткое время
    // между вводом запроса и стартом самого запроса нечего показывать, кроме пустого
    // состояния — а оно ложное, ведь поиск ещё не выполнялся.
    setSearching(true);
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      searchKnowledgeSection(sectionId, search.trim())
        .then((data) => {
          if (cancelled) return;
          setSearchNameMatches(data.nameMatches);
          setSearchContentMatches(data.contentMatches);
        })
        .catch((err) => { if (!cancelled) setError(getFriendlyErrorMessage(err, "Ошибка поиска.")); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search, sectionId]);

  const breadcrumbs = useMemo(() => getKnowledgeBreadcrumbs(currentPath), [currentPath]);
  const searchActive = search.trim().length >= 2;
  const sectionTitle = activeSection?.title ?? "Раздел";
  const previewType = preview ? getKnowledgePreviewType(preview.extension) : null;
  const showFallbackOffice = previewType === "office" || (previewType === "office-online" && useFallbackViewer);
  const visibleFolders = useMemo(() => entries.filter((entry) => entry.isDirectory), [entries]);
  const visibleFiles = useMemo(
    () => entries.filter((entry) => !entry.isDirectory && isKnowledgeVisibleFile(entry.extension)),
    [entries],
  );
  const visibleNameMatches = useMemo(
    () => searchNameMatches.filter((entry) => isKnowledgeVisibleFile(entry.extension)),
    [searchNameMatches],
  );
  const visibleContentMatches = useMemo(
    () => searchContentMatches.filter((entry) => isKnowledgeVisibleFile(entry.extension)),
    [searchContentMatches],
  );
  const nothingFound = searchActive
    ? visibleNameMatches.length === 0 && visibleContentMatches.length === 0
    : visibleFolders.length === 0 && visibleFiles.length === 0;
  const displayedRecent = useMemo(() => recentEntries.slice(0, MAX_RECENT_CARDS), [recentEntries]);

  const openPath = (path: string) => {
    if (!sectionId) return;
    setSearch("");
    setParams(path ? { section: sectionId, path } : { section: sectionId });
  };

  const openLibraryHome = () => {
    setSearch("");
    setParams({});
  };

  const openEntry = async (entry: KnowledgeEntry) => {
    if (entry.isDirectory) {
      openPath(entry.relativePath);
      return;
    }
    setOpeningId(entry.id);
    setError(null);
    try {
      const { ticket } = await getKnowledgeMediaTicket(sectionId!, entry.id);
      const previewType = getKnowledgePreviewType(entry.extension);
      if (previewType === "download") {
        const anchor = document.createElement("a");
        anchor.href = knowledgeMediaUrl(ticket, true);
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
        return;
      }
      setPreviewTicket(ticket);
      setPreview(entry);
      setPreviewSectionId(sectionId);
      setPreviewSectionTitle(activeSection?.title ?? "Раздел");
      setUseFallbackViewer(false);
      setPreviewFullscreen(false);
      void loadPersonal();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Не удалось открыть файл."));
    } finally {
      setOpeningId(null);
    }
  };

  const openPersonalEntry = async (entry: KnowledgePersonalEntry) => {
    setOpeningId(entry.id);
    setError(null);
    try {
      const { ticket } = await getKnowledgeMediaTicket(entry.sectionId, entry.id);
      const previewType = getKnowledgePreviewType(entry.extension);
      if (previewType === "download") {
        const anchor = document.createElement("a");
        anchor.href = knowledgeMediaUrl(ticket, true);
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
        return;
      }
      setPreviewTicket(ticket);
      setPreview({
        id: entry.id,
        name: entry.name,
        relativePath: entry.relativePath,
        extension: entry.extension,
        isDirectory: false,
        size: entry.size,
        lastWriteTimeUtc: entry.lastWriteTimeUtc,
        hasIcon: false,
        matchCount: null,
      });
      setPreviewSectionId(entry.sectionId);
      setPreviewSectionTitle(entry.sectionTitle);
      setUseFallbackViewer(false);
      setPreviewFullscreen(false);
      void loadPersonal();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Не удалось открыть файл."));
    } finally {
      setOpeningId(null);
    }
  };

  const openCreateSection = () => {
    setEditingSection(null);
    setEditorOpen(true);
    setError(null);
  };

  const openSectionSettings = (section: KnowledgeAdminSection) => {
    setEditingSection(section);
    setEditorOpen(true);
    setError(null);
  };

  const handleSectionChanged = async (message: string) => {
    setNotice(message);
    await loadSections();
  };

  const renderFileSection = (title: string, files: KnowledgeEntry[], showPath: boolean, showMatchCount = false) => (
    <div className={styles.fileSection} key={title}>
      <h3>{title} <span>{files.length}</span></h3>
      <div className={styles.fileList}>
        <div className={`${styles.fileListHeader} ${showMatchCount ? styles.fileListWithMatch : ""}`}>
          <span>Название</span>
          <span>Тип</span>
          {showMatchCount && <span className={styles.fileMatchCountHeader}>Совпадений</span>}
          <span>Изменён</span>
          <span>Размер</span>
          <span />
          <span />
        </div>
        {files.map((entry) => {
          const opening = openingId === entry.id;
          const isFavorite = favoriteIds.has(entry.id);
          return (
            <div
              className={`${styles.fileRow} ${showMatchCount ? styles.fileListWithMatch : ""}`}
              key={entry.id}
              role="button"
              tabIndex={0}
              aria-disabled={opening}
              onClick={() => { if (!opening) void openEntry(entry); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!opening) void openEntry(entry);
                }
              }}
            >
              <span className={styles.fileName}>
                <FileTypeIcon extension={entry.extension} showBadge />
                <span className={styles.fileNameBody}>
                  <strong>{entry.name}</strong>
                  {showPath && <EntryPath entry={entry} sectionTitle={sectionTitle} />}
                </span>
              </span>
              <span className={styles.fileLocation}>{FILE_KIND_LABEL[getFileKind(entry.extension)]}</span>
              {showMatchCount && (
                <span className={styles.fileMatchCount} title={`Слово встречается в файле ${entry.matchCount} раз`}>
                  {entry.matchCount}
                </span>
              )}
              <span className={styles.fileDate}>{formatKnowledgeDate(entry.lastWriteTimeUtc)}</span>
              <span className={styles.fileSize}>{formatKnowledgeFileSize(entry.size)}</span>
              <span className={styles.fileControls}>
                <button
                  type="button"
                  className={`${styles.fileStar} ${isFavorite ? styles.starActive : ""}`}
                  disabled={favoriteBusyId === entry.id}
                  aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                  title={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                  onClick={(event) => { event.stopPropagation(); void toggleFavorite(sectionId!, entry); }}
                >
                  {isFavorite ? <StarRoundedIcon /> : <StarBorderRoundedIcon />}
                </button>
                <span className={styles.fileAction}><ChevronRightRoundedIcon /></span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (loading && !sections.length && !activeSection) {
    return (
      <main className={styles.libraryLoadingState}>
        <LoadingSpinner size={96} label="Загружаем библиотеку знаний…" />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {!sectionId ? (
          <>
          {error && <div className={styles.error}>{error}</div>}
          {notice && <div className={styles.notice}>{notice}</div>}
          <div className={styles.homeLayout}>
          <div className={styles.homeMain}>
          {!loading && sections.length === 0 && !canManage ? (
            <div className={styles.empty}>
              <MenuBookRoundedIcon />
              <h2>Доступных разделов пока нет</h2>
              <p>Администратор может добавить первый раздел и назначить доступ по ролям.</p>
            </div>
          ) : (
            <section className={styles.sections} aria-label="Разделы библиотеки">
              <div className={styles.sectionGrid}>
                {canManage && (
                  <button
                    type="button"
                    className={`${styles.sectionCard} ${styles.addSectionCard}`}
                    onClick={openCreateSection}
                  >
                    <span className={styles.addIcon} aria-hidden="true">+</span>
                    <span>Добавить раздел</span>
                  </button>
                )}
                {sections.map((section) => {
                  const adminSection = adminSections.find((item) => item.id === section.id);
                  const isInactive = Boolean(adminSection && !adminSection.isActive);
                  return (
                    <article
                      className={`${styles.sectionCard} ${isInactive ? styles.inactiveSection : ""}`}
                      key={section.id}
                    >
                      <Link
                        to={getKnowledgeLibraryHref(section.id)}
                        className={`${styles.sectionOpenButton} ${canManage && adminSection ? styles.sectionOpenButtonManaged : ""}`}
                        onClick={(event) => {
                          if (!shouldHandleKnowledgeNavigation(event)) return;
                          event.preventDefault();
                          setParams({ section: section.id });
                        }}
                      >
                        <span className={styles.sectionIcon}>
                          {section.hasCover ? <img src={knowledgeCoverUrl(section.id)} alt="" /> : <MenuBookRoundedIcon />}
                        </span>
                        <span className={styles.sectionCardBody}>
                          <span className={styles.sectionTitleRow}>
                            <strong>{section.title}</strong>
                            {isInactive && <span className={styles.inactiveBadge}>Отключён</span>}
                          </span>
                          {section.description && <small>{section.description}</small>}
                        </span>
                      </Link>
                      {canManage && adminSection && (
                        <button
                          type="button"
                          className={styles.settingsCard}
                          onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); openSectionSettings(adminSection); }}
                          aria-label={`Настройки раздела ${section.title}`}
                        >
                          <SettingsRoundedIcon className={styles.settingsIcon} />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          </div>
          {(recentEntries.length > 0 || favoriteEntries.length > 0) && (
            <aside
              className={styles.personalArea}
              ref={personalAreaRef}
              style={personalAreaMaxHeight ? { maxHeight: personalAreaMaxHeight - 20 } : undefined}
            >
              {favoriteEntries.length > 0 && (
                <div className={styles.personalBlock}>
                  <div className={styles.personalHeader}>
                    <StarRoundedIcon />
                    <h3>Избранное</h3>
                  </div>
                  <div className={styles.personalStrip}>
                    {favoriteEntries.map((entry) => (
                      <PersonalCard
                        key={entry.id}
                        entry={entry}
                        isFavorite
                        opening={openingId === entry.id}
                        busy={favoriteBusyId === entry.id}
                        onOpen={() => void openPersonalEntry(entry)}
                        onToggleFavorite={() => void toggleFavorite(entry.sectionId, entry)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {recentEntries.length > 0 && (
                <div className={`${styles.personalBlock} ${styles.personalBlockStable}`}>
                  <div className={styles.personalHeader}>
                    <HistoryRoundedIcon />
                    <h3>Недавние</h3>
                  </div>
                  <div className={styles.personalStrip}>
                    {displayedRecent.map((entry) => (
                      <PersonalCard
                        key={entry.id}
                        entry={entry}
                        isFavorite={favoriteIds.has(entry.id)}
                        opening={openingId === entry.id}
                        busy={favoriteBusyId === entry.id}
                        onOpen={() => void openPersonalEntry(entry)}
                        onToggleFavorite={() => void toggleFavorite(entry.sectionId, entry)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}
          </div>
          </>
        ) : (
          <>
          <header className={styles.browserHeader}>
            <div className={styles.browserTitleRow}>
              <label className={styles.searchBox}>
                <SearchRoundedIcon />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск во всех вложенных папках и файлах"
                />
                {searching && <span className={styles.searchPulse} />}
                {search.length > 0 && (
                  <button
                    type="button"
                    className={styles.searchClear}
                    aria-label="Очистить поиск"
                    title="Очистить поиск"
                    onClick={() => setSearch("")}
                  >
                    <ClearRoundedIcon fontSize="small" />
                  </button>
                )}
              </label>
            </div>
            <nav className={styles.breadcrumbs} aria-label="Путь к папке">
              <Link
                to={getKnowledgeLibraryHref()}
                onClick={(event) => { if (shouldHandleKnowledgeNavigation(event)) { event.preventDefault(); openLibraryHome(); } }}
              >Библиотека знаний</Link>
              <span><span aria-hidden="true">/</span><Link
                to={getKnowledgeLibraryHref(sectionId)}
                onClick={(event) => { if (shouldHandleKnowledgeNavigation(event)) { event.preventDefault(); openPath(""); } }}
              >{activeSection?.title ?? "Раздел"}</Link></span>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.path}><span aria-hidden="true">/</span><Link
                  to={getKnowledgeLibraryHref(sectionId, crumb.path)}
                  onClick={(event) => { if (shouldHandleKnowledgeNavigation(event)) { event.preventDefault(); openPath(crumb.path); } }}
                >{crumb.label}</Link></span>
              ))}
            </nav>
          </header>

          {error && <div className={styles.error}>{error}</div>}
          {loading || (searchActive && searching) ? (
            <div className={styles.contentLoader}><LoadingSpinner /></div>
          ) : nothingFound ? (
            <div className={styles.emptyCompact}>
              {searchActive ? "По вашему запросу ничего не найдено" : "В этой папке пока нет доступных файлов"}
            </div>
          ) : (
            <section className={styles.browserContent} aria-label={searchActive ? "Результаты поиска" : "Содержимое папки"}>
              {!searchActive && visibleFolders.length > 0 && (
                <div className={styles.folderSection}>
                  <h3>Папки <span>{visibleFolders.length}</span></h3>
                  <div className={styles.folderGrid}>
                    {visibleFolders.map((entry) => (
                      <Link
                        className={styles.folderCard}
                        to={getKnowledgeLibraryHref(sectionId, entry.relativePath)}
                        key={entry.id}
                        onClick={(event) => {
                          if (!shouldHandleKnowledgeNavigation(event)) return;
                          event.preventDefault();
                          void openEntry(entry);
                        }}
                      >
                        {entry.hasIcon
                          ? <img className={styles.folderCardIcon} src={knowledgeFolderIconUrl(sectionId!, entry.id)} alt="" />
                          : <FileTypeIcon extension="" isDirectory />}
                        <span className={styles.folderCardBody}>
                          <strong>{entry.name}</strong>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {searchActive ? (
                <>
                  {visibleNameMatches.length > 0 && renderFileSection("Совпадения по названию", visibleNameMatches, true)}
                  {visibleContentMatches.length > 0 && renderFileSection("Совпадения по содержимому", visibleContentMatches, true, true)}
                </>
              ) : (
                visibleFiles.length > 0 && renderFileSection("Файлы", visibleFiles, false)
              )}
            </section>
          )}
          </>
        )}
      </div>

      {canManage && (
        <KnowledgeLibrarySectionModal
          isOpen={editorOpen}
          section={editingSection}
          roles={availableRoles}
          onClose={() => setEditorOpen(false)}
          onChanged={handleSectionChanged}
        />
      )}

      <Modal
        isOpen={Boolean(preview)}
        onClose={() => { setPreview(null); setPreviewTicket(null); setPreviewSectionId(null); setUseFallbackViewer(false); setPreviewFullscreen(false); }}
        title={preview ? (
          <span className={styles.previewTitle}>
            <FileTypeIcon extension={preview.extension} className={styles.previewTitleIcon} />
            <span className={styles.previewTitleBody}>
              <strong>{preview.name}</strong>
              <EntryPath entry={preview} sectionTitle={previewSectionTitle} />
            </span>
          </span>
        ) : undefined}
        size="lg"
        panelClassName={`${styles.previewPanel} ${previewFullscreen ? styles.previewPanelFullscreen : ""}`}
        headerClassName={styles.previewHeader}
        bodyClassName={`${styles.previewBody} ${showFallbackOffice ? styles.previewBodyOffice : ""}`}
        titleClassName={styles.previewModalTitle}
        closeButtonClassName={styles.previewClose}
        headerActions={preview && previewTicket ? (
          <>
            <button
              type="button"
              className={`${styles.previewSwap} ${styles.previewFullscreenToggle}`}
              aria-label={previewFullscreen ? "Свернуть окно" : "На весь экран"}
              title={previewFullscreen ? "Свернуть окно" : "На весь экран"}
              onClick={() => setPreviewFullscreen((value) => !value)}
            >
              {previewFullscreen ? <FullscreenExitRoundedIcon fontSize="small" /> : <FullscreenRoundedIcon fontSize="small" />}
            </button>
            {previewType === "office-online" && (
              <button
                type="button"
                className={styles.previewSwap}
                aria-label={useFallbackViewer ? "Открыть в Office Online" : "Не открывается? Показать во встроенном просмотрщике"}
                title={useFallbackViewer ? "Открыть в Office Online" : "Не открывается? Показать во встроенном просмотрщике"}
                onClick={() => setUseFallbackViewer((value) => !value)}
              >
                <SwapHorizRoundedIcon fontSize="small" />
              </button>
            )}
            <button
              type="button"
              className={`${styles.previewFavorite} ${favoriteIds.has(preview.id) ? styles.starActive : ""}`}
              disabled={favoriteBusyId === preview.id}
              aria-label={favoriteIds.has(preview.id) ? "Убрать из избранного" : "Добавить в избранное"}
              title={favoriteIds.has(preview.id) ? "Убрать из избранного" : "Добавить в избранное"}
              onClick={() => void toggleFavorite(previewSectionId ?? sectionId!, preview)}
            >
              {favoriteIds.has(preview.id) ? <StarRoundedIcon fontSize="small" /> : <StarBorderRoundedIcon fontSize="small" />}
            </button>
            <a className={styles.previewDownload} href={knowledgeMediaUrl(previewTicket, true)} title="Скачать">
              <DownloadRoundedIcon fontSize="small"/>
            </a>
          </>
        ) : null}
      >
        {preview && previewTicket && previewType === "image" && (
          <img className={styles.previewImage} src={knowledgeMediaUrl(previewTicket)} alt={preview.name} />
        )}
        {preview && previewTicket && previewType === "video" && (
          <video className={styles.previewVideo} src={knowledgeMediaUrl(previewTicket)} controls autoPlay />
        )}
        {preview && previewTicket && previewType === "pdf" && (
          <iframe className={styles.previewFrame} src={knowledgeMediaUrl(previewTicket)} title={preview.name} />
        )}
        {preview && previewTicket && previewType === "office-online" && !useFallbackViewer && (
          <iframe
            className={styles.previewFrame}
            src={knowledgeOnlineViewerUrl(previewTicket, preview.name)}
            title={preview.name}
          />
        )}
        {preview && previewTicket && showFallbackOffice && (
          <Suspense fallback={<div className={styles.previewLoader}><LoadingSpinner /></div>}>
            <OfficeViewer
              url={knowledgeMediaUrl(previewTicket)}
              downloadUrl={knowledgeMediaUrl(previewTicket, true)}
              extension={preview.extension}
              fileName={preview.name}
            />
          </Suspense>
        )}
      </Modal>
    </main>
  );
}
