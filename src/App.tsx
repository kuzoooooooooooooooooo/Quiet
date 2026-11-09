import InlineName from './InlineName';
import { useSidebar } from './useSidebar';
import ActionMenu from './ActionMenu';
import UndoNotice from './UndoNotice';
import type { UndoAction } from './UndoNotice';
import { restoreAt, capture, restoreMany } from './restore';
import { t, formatCount, getLocaleTag, useLanguage } from './i18n';
import type { Message, Language } from './i18n';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { now, safeUrl, searchWorkspace, tabs, uid } from './model';
import type {
  Document,
  Material,
  Note,
  Project,
  SearchResult,
  Tab,
  Task,
  Tone,
  Workspace,
} from './model';
import { downloadBlob, isDesktop, loadWorkspace, openExternal, saveWorkspace } from './storage';
import { useTheme } from './theme';
import type { Theme } from './theme';
import Notes from './Notes';
import ProjectModules, { ModulePicker, SortControl, reorder } from './ProjectModules';
import { arrange, getKit, enabled, defaultModules } from './projectKit';
import type { ProjectKit, ModuleId } from './projectKit';
import TaskBoard from './TaskBoard';
import type { Stage } from './TaskBoard';
import FilePreview from './FilePreview';
import { attachmentLimit, fileType } from './attachmentLimits';
import { backgrounds, useBackground } from './background';
import { useUpdater } from './useUpdater';
import UpdateSettings from './UpdateSettings';
import RichEditor, { RichPreview } from './RichEditor';
import { documentFile, documentText, markdownHtml } from './documentHtml';
import { readAttachment, storeAttachment } from './attachments';
import ContextMenu, { RenameForm } from './ContextMenu';
import type { ContextState, ContextAction } from './ContextMenu';

const Markdown = lazy(() => import('./Markdown'));
const shortcutKey = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
type SaveStatus = 'saving' | 'saved' | 'error';
type ModalState =
  | { type: 'project'; project?: Project }
  | { type: 'delete-project'; project: Project }
  | { type: 'material' }
  | { type: 'bulk-delete' }
  | { type: 'shortcuts' }
  | { type: 'settings' }
  | { type: 'file-preview'; material: Material }
  | {
      type: 'rename';
      kind: 'project' | 'document' | 'task' | 'material' | 'note';
      id: string;
      value: string;
    }
  | null;
const tabIcons: Record<Tab, IconName> = {
  overview: 'grid',
  documents: 'file',
  tasks: 'circle',
  materials: 'link',
  notes: 'note',
  snippets: 'file',
  tables: 'grid',
};
const resultIcons: Record<SearchResult['kind'], IconName> = {
  project: 'folder',
  document: 'file',
  task: 'circle',
  material: 'link',
  note: 'note',
  snippet: 'file',
  table: 'grid',
};
const toneNames: Record<Tone, Message> = {
  green: 'Зелений',
  blue: 'Синій',
  orange: 'Помаранчевий',
  violet: 'Фіолетовий',
};
const shortDate = (value: string) =>
  new Intl.DateTimeFormat(getLocaleTag(), { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
const formatSize = (size: number) => {
  const value = size < 1024 ? size : size < 1024 ** 2 ? Math.round(size / 1024) : size / 1024 ** 2;
  const unit = size < 1024 ? 'Б' : size < 1024 ** 2 ? 'КБ' : 'МБ';
  return (
    new Intl.NumberFormat(getLocaleTag(), { maximumFractionDigits: 1 }).format(value) +
    ' ' +
    t(unit)
  );
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = '',
  locked = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    (
      dialog.querySelector<HTMLInputElement>('input:checked') ??
      dialog.querySelector<HTMLInputElement>('input:not([type="hidden"]), textarea')
    )?.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''} ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const r = ref.current!.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        {!locked && (
          <button className="icon-button" aria-label={t('Закрити')} onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}

function ProjectForm({
  project,
  onSubmit,
  onClose,
}: {
  project?: Project;
  onSubmit: (name: string, description: string, tone: Tone, modules: ModuleId[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [tone, setTone] = useState<Tone>(project?.tone ?? 'green');
  const [modules, setModules] = useState<ModuleId[]>(
    project ? getKit(project).enabled : [...defaultModules],
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSubmit(name.trim(), description.trim(), tone, modules);
      }}
    >
      <label className="field">
        {t('Назва проєкту')}
        <input
          autoFocus
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('Над чим працюємо?')}
        />
      </label>
      <label className="field">
        {t('Короткий опис')} <span className="optional">{t('необов’язково')}</span>
        <textarea
          rows={3}
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('Яка головна ціль?')}
        />
      </label>
      <fieldset className="color-picker">
        <legend>{t('Колір')}</legend>
        {(Object.keys(toneNames) as Tone[]).map((value) => (
          <button
            type="button"
            key={value}
            aria-label={t(toneNames[value])}
            aria-pressed={tone === value}
            className={`color-swatch ${value} ${tone === value ? 'selected' : ''}`}
            onClick={() => setTone(value)}
          >
            {tone === value && <Icon name="check" size={15} />}
          </button>
        ))}
      </fieldset>
      <ModulePicker value={modules} onChange={setModules} />
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          {t('Скасувати')}
        </button>
        <button className="button primary" disabled={!name.trim()}>
          {project ? t('Зберегти') : t('Створити проєкт')}
        </button>
      </div>
    </form>
  );
}

function LinkForm({ onSubmit }: { onSubmit: (title: string, url: string) => void }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = safeUrl(url.trim());
        if (!parsed) {
          setError(t('Вкажи повне посилання з https:// або http://.'));
          return;
        }
        onSubmit(title.trim() || new URL(parsed).hostname, parsed);
      }}
    >
      <label className="field">
        {t('Посилання')}
        <input
          autoFocus
          required
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label className="field">
        {t('Назва')} <span className="optional">{t('необов’язково')}</span>
        <input
          maxLength={200}
          placeholder={t('Щоб було легко знайти')}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button primary">{t('Додати посилання')}</button>
      </div>
    </form>
  );
}

function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={25} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  onRename,
  highlight,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (value: string) => void;
  highlight: boolean;
}) {
  return (
    <div
      id={`item-${task.id}`}
      data-context-kind="task"
      data-context-id={task.id}
      tabIndex={0}
      className={`task-row ${task.done ? 'done' : ''} ${highlight ? 'highlight' : ''}`}
    >
      <button
        className={`task-checkbox ${task.done ? 'checked' : ''}`}
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.title}
        onClick={onToggle}
      >
        {task.done && <Icon name="check" size={12} />}
      </button>
      <InlineName
        value={task.title}
        label={t('Редагувати завдання {title}', { title: task.title })}
        onSave={onRename}
      />
      {task.stage === 'doing' && !task.done && <span className="task-stage">{t('У роботі')}</span>}
      <button
        className="icon-button row-delete"
        title={t('Видалити завдання')}
        aria-label={t('Видалити завдання {title}', { title: task.title })}
        onClick={onDelete}
      >
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

function Search({
  workspace,
  onSelect,
  onClose,
}: {
  workspace: Workspace;
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => searchWorkspace(workspace, query), [workspace, query, language]);
  const projectName = (id: string | null) =>
    workspace.projects.find((p) => p.id === id)?.name ?? '';
  useEffect(() => {
    document.getElementById(`search-result-${cursor}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);
  return (
    <Modal title={t('Пошук у workspace')} onClose={onClose} wide>
      <div className="search-input">
        <Icon name="search" size={22} />
        <input
          autoFocus
          aria-label={t('Пошук у workspace')}
          placeholder={t('Пошук')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setCursor((c) => Math.max(0, Math.min(c + 1, results.length - 1)));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (results[cursor]) onSelect(results[cursor]);
            }
          }}
        />
      </div>
      <div className="search-results">
        {query.trim() && results.length ? (
          results.map((result, index) => (
            <button
              key={`${result.kind}-${result.id}`}
              id={`search-result-${index}`}
              className={`search-result ${index === cursor ? 'selected' : ''}`}
              onMouseMove={() => setCursor(index)}
              onClick={() => onSelect(result)}
            >
              <span className="result-icon">
                <Icon name={resultIcons[result.kind]} />
              </span>
              <span className="result-copy">
                <strong>{result.title}</strong>
                <small>
                  {result.projectId && <>{projectName(result.projectId)} · </>}
                  {result.kind === 'snippet'
                    ? t('Фрагменти коду')
                    : result.kind === 'table'
                      ? t('Таблиці')
                      : result.kind === 'note'
                        ? t('Нотатка')
                        : result.kind === 'project'
                          ? t('Проєкт')
                          : result.kind === 'document'
                            ? t('Документ')
                            : result.kind === 'task'
                              ? t('Завдання')
                              : t('Матеріал')}
                </small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          ))
        ) : query.trim() ? (
          <Empty icon="search" title={t('Нічого не знайшлося')} text="" />
        ) : null}
      </div>
    </Modal>
  );
}

export default function App() {
  const { theme, selectTheme } = useTheme();
  const { background, selectBackground } = useBackground();
  const [view, setView] = useState<'home' | 'notes' | 'project'>('home');
  const [noteId, setNoteId] = useState<string | null>(null);
  const { collapsed, toggleSidebar } = useSidebar();
  const { language, selectLanguage } = useLanguage();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState('');
  const [writeStatus, setStatus] = useState<SaveStatus>('saved');
  const [persistedWorkspace, setPersistedWorkspace] = useState<Workspace | null>(null);
  // A new render cannot claim to be saved before its persistence effect starts.
  const status: SaveStatus =
    writeStatus === 'saved' && workspace !== persistedWorkspace ? 'saving' : writeStatus;
  const [saveError, setSaveError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const [notification, setNotification] = useState('');
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'done'>('all');
  const [preview, setPreview] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const taskInput = useRef<HTMLInputElement>(null);
  const documentTitle = useRef<HTMLInputElement>(null);
  const latestSave = useRef<Promise<void>>(Promise.resolve());
  const updater = useUpdater(!!workspace, async () => {
    let operation: Promise<void>;
    do {
      operation = latestSave.current;
      await operation;
    } while (operation !== latestSave.current);
  });
  const updateInstalling = useRef(false);
  updateInstalling.current = updater.phase === 'installing';
  const update = useCallback(
    (transform: (current: Workspace) => Workspace) =>
      setWorkspace((current) => (current ? transform(current) : current)),
    [],
  );

  useEffect(() => {
    let live = true;
    loadWorkspace()
      .then((data) => {
        if (live) setWorkspace(data);
      })
      .catch((error) => {
        if (live) setLoadError(message(error));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!workspace) return;
    let live = true;
    setStatus('saving');
    const operation = saveWorkspace(workspace);
    latestSave.current = operation;
    operation
      .then(() => {
        if (live) {
          setPersistedWorkspace(workspace);
          setStatus('saved');
          setSaveError('');
        }
      })
      .catch((error) => {
        if (live) {
          setStatus('error');
          setSaveError(message(error));
        }
      });
    return () => {
      live = false;
    };
  }, [workspace]);

  useEffect(() => {
    if (!isDesktop) return;
    let live = true;
    let stop: (() => void) | undefined;
    void import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow();
        const unlisten = await currentWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          if (updateInstalling.current) return;
          try {
            await latestSave.current;
            await currentWindow.destroy();
          } catch {
            setNotification(t('Спочатку збережи зміни або завантаж резервну копію.'));
          }
        });
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => setNotification(t('Не вдалося підключити захист незбережених змін.')));
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  useEffect(() => {
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      if (status !== 'saved') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protectUnsaved);
    return () => window.removeEventListener('beforeunload', protectUnsaved);
  }, [status]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (updateInstalling.current) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!modal) setSearchOpen((open) => !open);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.code === 'Backslash' || event.key === '\\') &&
        !modal &&
        !searchOpen
      ) {
        event.preventDefault();
        if (!toggleSidebar()) setNotification(t('Не вдалося зберегти вигляд панелі.'));
      }
      if (event.key === 'Escape') {
        setDraggingFiles(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal, searchOpen, toggleSidebar]);

  useEffect(() => {
    setSelectedFiles((current) => {
      const valid = new Set(
        [...current].filter((id) =>
          workspace?.materials.some((m) => m.id === id && m.kind === 'file'),
        ),
      );
      return valid.size === current.size ? current : valid;
    });
  }, [workspace?.materials]);
  useEffect(() => {
    if (!notification) return;
    const id = setTimeout(() => setNotification(''), 4500);
    return () => clearTimeout(id);
  }, [notification]);
  useEffect(() => {
    if (!highlight) return;
    document
      .getElementById(`item-${highlight}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const id = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(id);
  }, [highlight, workspace?.context.tab]);
  useEffect(() => {
    const reveal = () =>
      document
        .querySelector<HTMLElement>('.tabs [aria-current="page"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    reveal();
    window.addEventListener('resize', reveal);
    return () => window.removeEventListener('resize', reveal);
  }, [workspace?.context.tab, workspace?.context.projectId, view]);
  useEffect(() => {
    setTaskTitle('');
    setTaskFilter('all');
    setSelectedFiles(new Set());
    setModal((current) => (current?.type === 'bulk-delete' ? null : current));
    setPreview(false);
  }, [workspace?.context.projectId]);

  useEffect(() => {
    if (view !== 'project' || !workspace?.context.projectId) return;
    const p = workspace.projects.find((p) => p.id === workspace.context.projectId);
    if (!p) return;
    const k = getKit(p),
      { tab, documentId } = workspace.context;
    if (k.preferences.lastTab === tab && (k.preferences.documentId ?? null) === documentId) return;
    update((w) =>
      w.context.projectId !== p.id
        ? w
        : {
            ...w,
            projects: w.projects.map((x) =>
              x.id === p.id
                ? {
                    ...x,
                    kit: {
                      ...getKit(x),
                      preferences: {
                        ...getKit(x).preferences,
                        lastTab: tab,
                        documentId: documentId ?? undefined,
                      },
                    },
                  }
                : x,
            ),
          },
    );
  }, [
    workspace?.context.projectId,
    workspace?.context.tab,
    workspace?.context.documentId,
    view,
    update,
  ]);

  const project =
    view === 'project'
      ? workspace?.projects.find((p) => p.id === workspace.context.projectId)
      : undefined;
  const tab = workspace?.context.tab ?? 'overview';
  const kit = project ? getKit(project) : null;
  const documents = arrange(
    workspace?.documents.filter((d) => d.projectId === project?.id) ?? [],
    kit ?? getKit(),
    'documents',
  );
  const tasks = arrange(
    workspace?.tasks.filter((d) => d.projectId === project?.id) ?? [],
    kit ?? getKit(),
    'tasks',
  );
  const materials = arrange(
    workspace?.materials.filter((d) => d.projectId === project?.id) ?? [],
    kit ?? getKit(),
    'materials',
  );
  const activeDocument =
    documents.find((d) => d.id === workspace?.context.documentId) ?? documents[0];
  const completed = tasks.filter((t) => t.done).length;
  const activeTasks = tasks.filter((t) => !t.done);
  const closeModal = () => setModal(null);

  function writeKit(next: ProjectKit) {
    if (!project) return;
    update((w) => ({
      ...w,
      projects: w.projects.map((p) => (p.id === project.id ? { ...p, kit: next } : p)),
    }));
  }
  function moveRecord(kind: ModuleId, id: string, delta: number) {
    if (!kit) return;
    const rows =
      kind === 'documents'
        ? documents
        : kind === 'tasks'
          ? tasks
          : kind === 'materials'
            ? materials
            : kit[kind];
    writeKit(
      reorder(
        kit,
        kind,
        rows.map((r) => r.id),
        id,
        delta,
      ),
    );
  }
  function removeKitRecord(kind: 'notes' | 'snippets' | 'tables', id: string) {
    if (!kit || !project) return;
    const index = kit[kind].findIndex((row) => row.id === id),
      row = kit[kind][index],
      projectId = project.id;
    if (!row) return;
    writeKit({ ...kit, [kind]: kit[kind].filter((r) => r.id !== id) });
    rememberDeletion('Запис видалено.', (w) => ({
      ...w,
      projects: w.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              kit: {
                ...getKit(p),
                [kind]: restoreAt<
                  Note | import('./projectKit').Snippet | import('./projectKit').Sheet
                >(getKit(p)[kind], row, index),
              },
            }
          : p,
      ),
    }));
  }
  function setStage(id: string, stage: Stage) {
    setHighlight(id);
    update((w) => ({
      ...w,
      tasks: w.tasks.map((task) =>
        task.id === id
          ? { ...task, done: stage === 'done', stage: stage === 'doing' ? 'doing' : undefined }
          : task,
      ),
    }));
  }
  function bulkRemove() {
    const captured = capture(
      workspace!.materials,
      (m) => m.projectId === project?.id && m.kind === 'file' && selectedFiles.has(m.id),
    );
    update((w) => ({
      ...w,
      materials: w.materials.filter((m) => !captured.some((x) => x.item.id === m.id)),
    }));
    rememberDeletion('Матеріал видалено.', (w) => ({
      ...w,
      materials: restoreMany(
        w.materials,
        captured.filter((x) => w.projects.some((p) => p.id === x.item.projectId)),
      ),
    }));
    setSelectedFiles(new Set());
    setModal((current) => (current?.type === 'bulk-delete' ? null : current));
  }
  async function bulkDownload() {
    if (!project) return;
    setBulkBusy(true);
    try {
      const { exportFiles } = await import('./archiveExport');
      await exportFiles(
        materials.filter((m) => m.kind === 'file' && selectedFiles.has(m.id)),
        project.name,
      );
    } catch (error) {
      setNotification(message(error));
    } finally {
      setBulkBusy(false);
    }
  }
  async function attachFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) await attachFile(file);
  }
  function goHome() {
    setView('home');
    setModal(null);
    setSearchOpen(false);
    setContextMenu(null);
    setSidebarOpen(false);
  }
  function selectProject(id: string) {
    setView('project');
    update((w) => {
      const p = w.projects.find((p) => p.id === id);
      if (!p) return w;
      const prefs = getKit(p).preferences;
      const last = prefs.lastTab ?? 'overview';
      return {
        ...w,
        context: {
          projectId: id,
          tab: last === 'overview' || enabled(p, last) ? last : 'overview',
          documentId: w.documents.some((d) => d.projectId === id && d.id === prefs.documentId)
            ? prefs.documentId!
            : null,
        },
      };
    });
    setSidebarOpen(false);
  }
  function selectTab(next: Tab) {
    update((w) => ({ ...w, context: { ...w.context, tab: next } }));
  }
  function openDocument(id: string) {
    update((w) => ({ ...w, context: { ...w.context, documentId: id, tab: 'documents' } }));
    setPreview(false);
  }
  function createDocument() {
    if (!project) return;
    const doc: Document = {
      id: uid(),
      projectId: project.id,
      title: t('Без назви'),
      content: '',
      format: 'html',
      updatedAt: now(),
    };
    update((w) => ({
      ...w,
      documents: [...w.documents, doc],
      context: { ...w.context, documentId: doc.id, tab: 'documents' },
    }));
    setPreview(false);
    setTimeout(() => {
      documentTitle.current?.focus();
      documentTitle.current?.select();
    }, 0);
  }
  function patchDocument(patch: Partial<Pick<Document, 'title' | 'content' | 'format'>>) {
    if (!activeDocument) return;
    update((w) => ({
      ...w,
      documents: w.documents.map((d) =>
        d.id === activeDocument.id ? { ...d, ...patch, updatedAt: now() } : d,
      ),
    }));
  }
  function toggleTask(id: string) {
    update((w) => ({
      ...w,
      tasks: w.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  }
  function rememberDeletion(label: Message, restore: UndoAction['restore']) {
    setNotification('');
    setUndo({ id: uid(), label, restore });
  }
  function restoreDeletion() {
    if (!undo || !workspace) return;
    const restored = undo.restore(workspace);
    setUndo(null);
    if (restored === workspace) setNotification(t('Проєкт більше не існує.'));
    else {
      setWorkspace(restored);
      setNotification(t('Відновлено.'));
    }
  }
  function renameTask(id: string, title: string) {
    update((w) => ({
      ...w,
      tasks: w.tasks.map((task) => (task.id === id ? { ...task, title } : task)),
    }));
  }
  function renameProject(id: string, name: string) {
    update((w) => ({
      ...w,
      projects: w.projects.map((project) => (project.id === id ? { ...project, name } : project)),
    }));
  }
  function deleteTask(id: string) {
    const index = workspace?.tasks.findIndex((task) => task.id === id) ?? -1;
    if (!workspace || index < 0) return;
    const item = workspace.tasks[index];
    update((w) => ({ ...w, tasks: w.tasks.filter((task) => task.id !== id) }));
    rememberDeletion('Завдання видалено.', (w) =>
      w.projects.some((p) => p.id === item.projectId)
        ? { ...w, tasks: restoreAt(w.tasks, item, index) }
        : w,
    );
  }
  function deleteDocument(item: Document) {
    if (!workspace) return;
    const index = workspace.documents.findIndex((doc) => doc.id === item.id);
    update((w) => ({
      ...w,
      documents: w.documents.filter((doc) => doc.id !== item.id),
      context: {
        ...w.context,
        documentId: w.context.documentId === item.id ? null : w.context.documentId,
      },
    }));
    rememberDeletion('Документ видалено.', (w) =>
      w.projects.some((p) => p.id === item.projectId)
        ? {
            ...w,
            documents: restoreAt(w.documents, item, index),
            context:
              w.context.projectId === item.projectId
                ? { ...w.context, tab: 'documents', documentId: item.id }
                : w.context,
          }
        : w,
    );
  }
  function deleteMaterial(item: Material) {
    if (!workspace) return;
    const index = workspace.materials.findIndex((material) => material.id === item.id);
    update((w) => ({ ...w, materials: w.materials.filter((material) => material.id !== item.id) }));
    rememberDeletion('Матеріал видалено.', (w) =>
      w.projects.some((p) => p.id === item.projectId)
        ? { ...w, materials: restoreAt(w.materials, item, index) }
        : w,
    );
  }
  function deleteProject(item: Project) {
    if (!workspace) return;
    const index = workspace.projects.findIndex((p) => p.id === item.id);
    const documents = capture(workspace.documents, (doc) => doc.projectId === item.id);
    const tasks = capture(workspace.tasks, (task) => task.projectId === item.id);
    const materials = capture(workspace.materials, (material) => material.projectId === item.id);
    const context = workspace.context;
    update((w) => {
      const projects = w.projects.filter((p) => p.id !== item.id);
      return {
        ...w,
        projects,
        documents: w.documents.filter((d) => d.projectId !== item.id),
        tasks: w.tasks.filter((t) => t.projectId !== item.id),
        materials: w.materials.filter((m) => m.projectId !== item.id),
        context:
          w.context.projectId === item.id
            ? { projectId: projects[0]?.id ?? null, tab: 'overview', documentId: null }
            : w.context,
      };
    });
    rememberDeletion('Проєкт видалено.', (w) => ({
      ...w,
      projects: restoreAt(w.projects, item, index),
      documents: restoreMany(w.documents, documents),
      tasks: restoreMany(w.tasks, tasks),
      materials: restoreMany(w.materials, materials),
      context,
    }));
    closeModal();
  }
  function addTask(event: FormEvent) {
    event.preventDefault();
    if (!project || !taskTitle.trim()) return;
    const task: Task = {
      id: uid(),
      projectId: project.id,
      title: taskTitle.trim(),
      done: false,
      createdAt: now(),
    };
    update((w) => ({ ...w, tasks: [...w.tasks, task] }));
    setTaskTitle('');
    setTaskFilter('all');
  }
  function focusTask() {
    selectTab('tasks');
    setTimeout(() => taskInput.current?.focus(), 0);
  }
  function download(blob: Blob, filename: string) {
    void downloadBlob(blob, filename).catch((error) =>
      setNotification(t('Не вдалося завантажити: {error}', { error: message(error) })),
    );
  }
  async function attachFile(file: File | undefined) {
    if (!file || !project) return;
    const projectId = project.id;
    try {
      if (file.size > attachmentLimit) throw new Error(t('Максимальний розмір файлу — 25 МБ.'));
      const stored = await storeAttachment(file);
      const material: Material = {
        id: uid(),
        projectId,
        title: file.name,
        kind: 'file',
        fileType: fileType({ title: file.name }),
        ...stored,
        createdAt: now(),
      };
      update((w) =>
        w.projects.some((p) => p.id === projectId)
          ? { ...w, materials: [...w.materials, material] }
          : w,
      );
      setNotification(t('Файл додано до проєкту.'));
    } catch (error) {
      setNotification(message(error));
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  function downloadMaterial(material: Material) {
    if (material.kind === 'link') {
      const url = safeUrl(material.url);
      if (url) void openExternal(url).catch((error) => setNotification(message(error)));
    } else {
      void readAttachment(material)
        .then((blob) => downloadBlob(blob, material.title))
        .catch((error) =>
          setNotification(t('Не вдалося завантажити: {error}', { error: message(error) })),
        );
    }
  }
  function openMaterial(material: Material) {
    if (material.kind === 'link') downloadMaterial(material);
    else setModal({ type: 'file-preview', material });
  }
  function createNote() {
    const stamp = now();
    const note: Note = {
      id: uid(),
      title: t('Нова нотатка'),
      content: '',
      createdAt: stamp,
      updatedAt: stamp,
    };
    update((w) => ({ ...w, notes: [note, ...w.notes] }));
    setNoteId(note.id);
    setView('notes');
    setSidebarOpen(false);
  }
  function changeNote(id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) {
    update((w) => ({
      ...w,
      notes: w.notes.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: now() } : note,
      ),
    }));
  }
  function deleteNote(note: Note) {
    if (!workspace) return;
    const index = workspace.notes.findIndex((row) => row.id === note.id);
    update((w) => ({ ...w, notes: w.notes.filter((row) => row.id !== note.id) }));
    rememberDeletion('Нотатку видалено.', (w) => ({
      ...w,
      notes: restoreAt(w.notes, note, index),
    }));
  }
  function recordContext(target: HTMLElement, x: number, y: number) {
    if (!workspace || modal) return;
    const element = target.closest<HTMLElement>('[data-context-kind]');
    if (!element || target.closest('input,textarea,[contenteditable="true"]')) return;
    const kind = element.dataset.contextKind as
      'project' | 'document' | 'task' | 'material' | 'note';
    const id = element.dataset.contextId!;
    const item =
      kind === 'project'
        ? workspace.projects.find((row) => row.id === id)
        : kind === 'document'
          ? workspace.documents.find((row) => row.id === id)
          : kind === 'task'
            ? workspace.tasks.find((row) => row.id === id)
            : kind === 'note'
              ? workspace.notes.find((row) => row.id === id)
              : workspace.materials.find((row) => row.id === id);
    if (!item) return;
    if (kind === 'note') {
      const note = item as Note;
      setContextMenu({
        x,
        y,
        target: element,
        actions: [
          {
            label: t('Відкрити'),
            icon: 'note',
            action: () => {
              setView('notes');
              setNoteId(id);
            },
          },
          {
            label: t('Перейменувати'),
            icon: 'edit',
            action: () => setModal({ type: 'rename', kind: 'note', id, value: note.title }),
          },
          {
            label: t('Видалити нотатку'),
            icon: 'trash',
            danger: true,
            action: () => deleteNote(note),
          },
        ],
      });
      return true;
    }
    const value = 'name' in item ? item.name : item.title;
    const actions: ContextAction[] = [];
    if (kind === 'project')
      actions.push({ label: t('Відкрити'), icon: 'folder', action: () => selectProject(id) });
    if (kind === 'document')
      actions.push({
        label: t('Відкрити'),
        icon: 'file',
        action: () => {
          const doc = item as Document;
          update((w) => ({
            ...w,
            context: { projectId: doc.projectId, tab: 'documents', documentId: id },
          }));
          setView('project');
          setPreview(false);
        },
      });
    if (kind === 'material')
      actions.push({
        label: t((item as Material).kind === 'file' ? 'Переглянути' : 'Відкрити'),
        icon: (item as Material).kind === 'file' ? 'eye' : 'external',
        action: () => openMaterial(item as Material),
      });
    if (kind === 'material' && (item as Material).kind === 'file')
      actions.push({
        label: t('Завантажити файл'),
        icon: 'download',
        action: () => downloadMaterial(item as Material),
      });
    if (kind === 'task')
      actions.push({
        label: t((item as Task).done ? 'Повернути до роботи' : 'Позначити виконаним'),
        icon: 'check',
        action: () => toggleTask(id),
      });
    if (kind !== 'project') {
      const kindModule = { document: 'documents', task: 'tasks', material: 'materials' } as const;
      actions.push(
        { label: t('Вище'), icon: 'arrow', action: () => moveRecord(kindModule[kind], id, -1) },
        { label: t('Нижче'), icon: 'arrow', action: () => moveRecord(kindModule[kind], id, 1) },
      );
    }
    actions.push({
      label: t('Перейменувати'),
      icon: 'edit',
      action: () => setModal({ type: 'rename', kind, id, value }),
    });
    if (kind === 'document')
      actions.push({
        label: t(
          (item as Document).format === 'html' ? 'Завантажити HTML' : 'Завантажити Markdown',
        ),
        icon: 'download',
        action: () => {
          const file = documentFile(item as Document);
          download(file.blob, file.name);
        },
      });
    actions.push({
      label: t(
        kind === 'project'
          ? 'Видалити проєкт'
          : kind === 'document'
            ? 'Видалити документ'
            : kind === 'task'
              ? 'Видалити завдання'
              : 'Видалити матеріал {title}',
        { title: value },
      ),
      icon: 'trash',
      danger: true,
      action: () => {
        if (kind === 'project') setModal({ type: 'delete-project', project: item as Project });
        else if (kind === 'document') deleteDocument(item as Document);
        else if (kind === 'task') deleteTask(id);
        else deleteMaterial(item as Material);
      },
    });
    setContextMenu({ x, y, target: element, actions });
    return true;
  }
  function renameRecord(
    kind: 'project' | 'document' | 'task' | 'material' | 'note',
    id: string,
    value: string,
  ) {
    update((w) => ({
      ...w,
      notes:
        kind === 'note'
          ? w.notes.map((note) =>
              note.id === id ? { ...note, title: value, updatedAt: now() } : note,
            )
          : w.notes,
      projects:
        kind === 'project'
          ? w.projects.map((p) => (p.id === id ? { ...p, name: value } : p))
          : w.projects,
      documents:
        kind === 'document'
          ? w.documents.map((d) => (d.id === id ? { ...d, title: value, updatedAt: now() } : d))
          : w.documents,
      tasks:
        kind === 'task'
          ? w.tasks.map((row) => (row.id === id ? { ...row, title: value } : row))
          : w.tasks,
      materials:
        kind === 'material'
          ? w.materials.map((row) => (row.id === id ? { ...row, title: value } : row))
          : w.materials,
    }));
    closeModal();
  }

  function selectResult(result: SearchResult) {
    if (result.projectId && ['note', 'snippet', 'table'].includes(result.kind)) {
      const kind =
        result.kind === 'note' ? 'notes' : result.kind === 'snippet' ? 'snippets' : 'tables';
      setView('project');
      update((w) => ({
        ...w,
        context: { projectId: result.projectId, tab: kind, documentId: null },
        projects: w.projects.map((p) =>
          p.id === result.projectId
            ? {
                ...p,
                kit: {
                  ...getKit(p),
                  preferences: {
                    ...getKit(p).preferences,
                    active: { ...getKit(p).preferences.active, [kind]: result.id },
                  },
                },
              }
            : p,
        ),
      }));
      setSearchOpen(false);
      return;
    }
    if (result.kind === 'note') {
      setNoteId(result.id);
      setView('notes');
      setSearchOpen(false);
      return;
    }
    setView('project');
    update((w) => ({
      ...w,
      context: {
        projectId: result.projectId,
        tab:
          result.kind === 'document'
            ? 'documents'
            : result.kind === 'task'
              ? 'tasks'
              : result.kind === 'material'
                ? 'materials'
                : 'overview',
        documentId: result.kind === 'document' ? result.id : null,
      },
    }));
    setTaskFilter('all');
    setPreview(false);
    setHighlight(result.id);
    setSearchOpen(false);
  }

  if (loadError)
    return (
      <div className="boot">
        <div className="brand-mark">q</div>
        <h1>{t('Не вдалося відкрити workspace')}</h1>
        <p>{loadError}</p>
        <p className="muted">{t('Наявні дані не перезаписано.')}</p>
        <button className="button primary" onClick={() => window.location.reload()}>
          {t('Спробувати знову')}
        </button>
      </div>
    );
  if (!workspace)
    return (
      <div className="boot">
        <div className="brand-mark">q</div>
        <p>{t('Завантаження…')}</p>
      </div>
    );

  return (
    <div
      className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          if (project && enabled(project, 'materials') && !modal) setDraggingFiles(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingFiles(false);
      }}
      onDrop={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDraggingFiles(false);
          if (project && enabled(project, 'materials') && !modal) {
            selectTab('materials');
            void attachFiles(event.dataTransfer.files);
          }
        }
      }}
      onContextMenu={(event) => {
        if (recordContext(event.target as HTMLElement, event.clientX, event.clientY))
          event.preventDefault();
      }}
      onKeyDown={(event) => {
        if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
          const target = event.target as HTMLElement;
          const rect = target.getBoundingClientRect();
          if (recordContext(target, rect.left, rect.bottom)) event.preventDefault();
        }
      }}
    >
      {draggingFiles && <div className="file-drop-overlay">{t('Перетягни файли сюди')}</div>}
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label={t('Закрити бічну панель')}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label={t('Проєкти')}>
        <div className="brand">
          <button className="brand-home" aria-label="quiet" title={t('Головна')} onClick={goHome}>
            <span className="brand-mark" aria-hidden="true">
              q
            </span>
            <span className="brand-name">
              quiet<span className="brand-dot">.</span>
            </span>
          </button>
          <button
            className="icon-button sidebar-toggle"
            aria-label={collapsed ? t('Розгорнути панель') : t('Згорнути панель')}
            title={`${collapsed ? t('Розгорнути панель') : t('Згорнути панель')} (${shortcutKey} + \\)`}
            aria-pressed={collapsed}
            onClick={() => {
              if (!toggleSidebar()) setNotification(t('Не вдалося зберегти вигляд панелі.'));
            }}
          >
            <Icon name="sidebar" size={18} />
          </button>
        </div>
        <button
          className="global-search"
          aria-label={t('Знайти будь-що')}
          title={`${t('Пошук у workspace')} (${shortcutKey} K)`}
          onClick={() => setSearchOpen(true)}
        >
          <Icon name="search" size={17} />
          <span className="rail-label">{t('Знайти будь-що')}</span>
          <kbd>{shortcutKey} K</kbd>
        </button>
        <nav className="sidebar-nav" aria-label={t('Навігація')}>
          <button
            className={view === 'home' || (view === 'project' && !project) ? 'active' : ''}
            aria-current={view === 'home' || (view === 'project' && !project) ? 'page' : undefined}
            title={t('Головна')}
            onClick={goHome}
          >
            <Icon name="home" size={17} />
            <span className="rail-label">{t('Головна')}</span>
          </button>
          <button
            className={view === 'notes' ? 'active' : ''}
            aria-current={view === 'notes' ? 'page' : undefined}
            title={t('Нотатки')}
            onClick={() => {
              setView('notes');
              setSidebarOpen(false);
            }}
          >
            <Icon name="note" size={17} />
            <span className="rail-label">{t('Нотатки')}</span>
          </button>
        </nav>
        <div className="sidebar-section-heading">
          <span>{t('ПРОЄКТИ')}</span>
        </div>
        <nav className="project-nav">
          {workspace.projects.map((p) => (
            <button
              key={p.id}
              data-context-kind="project"
              data-context-id={p.id}
              title={p.name}
              aria-label={p.name}
              className={`project-link ${project?.id === p.id ? 'active' : ''}`}
              onClick={() => selectProject(p.id)}
            >
              <span className={`project-avatar ${p.tone}`} aria-hidden="true">
                {[...p.name.trim()][0]?.toLocaleUpperCase()}
              </span>
              <span className="rail-label">{p.name}</span>
              {project?.id === p.id && <Icon name="chevron" size={14} />}
            </button>
          ))}
          <button
            className="new-project-link"
            aria-label={t('Створити проєкт')}
            title={t('Створити проєкт')}
            onClick={() => setModal({ type: 'project' })}
          >
            <Icon name="plus" size={16} />

            <span className="rail-label">{t('Новий проєкт')}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            aria-label={t('Налаштування')}
            title={t('Налаштування')}
            onClick={() => {
              setSidebarOpen(false);
              setModal({ type: 'settings' });
            }}
          >
            <Icon name="settings" size={16} />

            <span className="rail-label">{t('Налаштування')}</span>
          </button>
        </div>
      </aside>

      <div className="workspace-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label={t('Відкрити проєкти')}
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <button
              className="location-jump"
              aria-label={t('Пошук у workspace')}
              title={`${t('Пошук у workspace')} (${shortcutKey} K)`}
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" size={14} />
              <span className="breadcrumb-root">
                {project?.name ?? t(view === 'notes' ? 'Нотатки' : 'Головна')}
              </span>
              {project && (
                <>
                  <Icon name="chevron" size={11} />
                  <span>{t(tabs.find((item) => item.id === tab)!.label)}</span>
                </>
              )}
            </button>
          </div>
          {(workspace.projects.length > 0 || workspace.notes.length > 0 || status === 'error') && (
            <div
              className={`save-status ${status === 'error' ? 'failed' : ''}`}
              role="status"
              title={status === 'error' ? saveError : t('Дані зберігаються лише на цьому пристрої')}
            >
              <Icon
                name={status === 'error' ? 'alert' : status === 'saving' ? 'clock' : 'check'}
                size={14}
              />
              <span>
                {status === 'saving'
                  ? t('Зберігаємо…')
                  : status === 'error'
                    ? t('Не збережено')
                    : t('Збережено на пристрої')}
              </span>
            </div>
          )}
        </header>
        {status === 'error' && (
          <div role="alert" className="save-error">
            <span>{t('Не вдалося зберегти: {error}', { error: saveError })}</span>
            <button onClick={() => setWorkspace((w) => (w ? { ...w } : w))}>
              {t('Повторити')}
            </button>
          </div>
        )}

        {view === 'notes' ? (
          <Notes
            notes={workspace.notes}
            selected={noteId}
            onSelect={setNoteId}
            onCreate={createNote}
            onChange={changeNote}
            onRename={(note) =>
              setModal({ type: 'rename', kind: 'note', id: note.id, value: note.title })
            }
            onDelete={deleteNote}
          />
        ) : !project ? (
          <main className="main-content home-page" aria-label={t('Головна')}>
            <div className="content-heading">
              <h1>{t('Головна')}</h1>
              <button
                className="button secondary"
                aria-label={t('Новий проєкт')}
                onClick={() => setModal({ type: 'project' })}
              >
                <Icon name="plus" size={16} />
                {t('Новий проєкт')}
              </button>
            </div>
            <div className="home-project-list">
              {workspace.projects.map((p) => (
                <button
                  key={p.id}
                  className="home-project"
                  data-context-kind="project"
                  data-context-id={p.id}
                  onClick={() => selectProject(p.id)}
                >
                  <span className={`project-dot ${p.tone}`} />
                  <span>
                    <strong>{p.name}</strong>
                    {p.description && <small>{p.description}</small>}
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
          </main>
        ) : (
          <main className="main-content">
            <div className="project-header">
              <div className="project-heading">
                <div className="project-label">
                  <span className={`project-dot ${project.tone}`} />
                  {t('Проєкт')}
                </div>
                <h1 aria-label={project.name}>
                  <InlineName
                    key={project.id}
                    value={project.name}
                    label={t('Редагувати назву проєкту')}
                    maxLength={120}
                    onSave={(name) => renameProject(project.id, name)}
                  />
                </h1>
                {project.description && <p>{project.description}</p>}
              </div>
              <div className="project-actions">
                {getKit(project).enabled.some((m) =>
                  ['tasks', 'documents', 'materials'].includes(m),
                ) && (
                  <ActionMenu
                    key={`create-${project.id}`}
                    label={t('Створити')}
                    primary
                    items={[
                      { label: t('Нове завдання'), icon: 'circle' as const, action: focusTask },
                      { label: t('Новий документ'), icon: 'file' as const, action: createDocument },
                      {
                        label: t('Додати посилання'),
                        icon: 'link' as const,
                        action: () => {
                          selectTab('materials');
                          setModal({ type: 'material' });
                        },
                      },
                      {
                        label: t('Файл'),
                        icon: 'upload' as const,
                        action: () => {
                          selectTab('materials');
                          fileInput.current?.click();
                        },
                      },
                    ].filter((item) =>
                      enabled(
                        project,
                        item.icon === 'circle'
                          ? 'tasks'
                          : item.icon === 'file'
                            ? 'documents'
                            : 'materials',
                      ),
                    )}
                  />
                )}
                <ActionMenu
                  key={`project-${project.id}`}
                  label={t('Меню проєкту')}
                  items={[
                    {
                      label: t('Редагувати проєкт'),
                      icon: 'edit',
                      action: () => setModal({ type: 'project', project }),
                    },
                    {
                      label: t('Видалити проєкт'),
                      icon: 'trash',
                      danger: true,
                      action: () => setModal({ type: 'delete-project', project }),
                    },
                  ]}
                />
              </div>
            </div>
            <nav className="tabs" aria-label={t('Розділи проєкту')}>
              {tabs
                .filter((item) => item.id === 'overview' || enabled(project, item.id))
                .map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id ? 'active' : ''}
                    aria-current={tab === item.id ? 'page' : undefined}
                    onClick={() => selectTab(item.id)}
                  >
                    <Icon name={tabIcons[item.id]} size={16} />
                    {t(item.label)}
                    {{
                      documents: documents.length,
                      tasks: activeTasks.length,
                      materials: materials.length,
                      notes: kit!.notes.length,
                      snippets: kit!.snippets.length,
                      tables: kit!.tables.length,
                      overview: 0,
                    }[item.id] > 0 && (
                      <span className="tab-count">
                        {
                          {
                            documents: documents.length,
                            tasks: activeTasks.length,
                            materials: materials.length,
                            notes: kit!.notes.length,
                            snippets: kit!.snippets.length,
                            tables: kit!.tables.length,
                            overview: 0,
                          }[item.id]
                        }
                      </span>
                    )}
                  </button>
                ))}
            </nav>

            {tab === 'overview' && (
              <div className="overview-content">
                <div className="overview-grid">
                  {enabled(project, 'tasks') && (
                    <>
                      {' '}
                      <section className="panel">
                        <div className="section-heading">
                          <h2>
                            <Icon name="circle" size={17} />

                            {t('Завдання')}
                          </h2>
                          <span className="muted small">
                            {completed} / {tasks.length}
                          </span>
                        </div>
                        <div className="task-preview">
                          {tasks.length ? (
                            [...activeTasks, ...tasks.filter((t) => t.done)]
                              .slice(0, 5)
                              .map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
                                  onToggle={() => toggleTask(task.id)}
                                  onDelete={() => deleteTask(task.id)}
                                  onRename={(value) => renameTask(task.id, value)}
                                  highlight={highlight === task.id}
                                />
                              ))
                          ) : (
                            <p className="inline-empty">{t('Немає завдань')}</p>
                          )}
                        </div>
                        <button className="panel-add" onClick={focusTask}>
                          <Icon name="plus" size={16} />

                          {t('Додати завдання')}
                        </button>
                      </section>
                    </>
                  )}
                  {enabled(project, 'documents') && (
                    <>
                      {' '}
                      <section className="panel">
                        <div className="section-heading">
                          <h2>
                            <Icon name="file" size={17} />

                            {t('Документи')}
                          </h2>
                          <button
                            className="icon-button"
                            aria-label={t('Створити документ')}
                            onClick={createDocument}
                          >
                            <Icon name="plus" size={17} />
                          </button>
                        </div>
                        <div className="document-preview">
                          {documents.length ? (
                            [...documents]
                              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                              .slice(0, 4)
                              .map((doc) => (
                                <button
                                  key={doc.id}
                                  data-context-kind="document"
                                  data-context-id={doc.id}
                                  className="document-card"
                                  onClick={() => openDocument(doc.id)}
                                >
                                  <span className="document-icon">
                                    <Icon name="file" size={19} />
                                  </span>
                                  <span>
                                    <strong>{doc.title}</strong>
                                    <small>
                                      {documentText(doc)
                                        .split('\n')
                                        .find((line) => line.trim() && !line.startsWith('#'))
                                        ?.trim()
                                        .replace(/[*_`]/g, '')
                                        .slice(0, 85) || shortDate(doc.updatedAt)}
                                    </small>
                                  </span>
                                  <Icon name="chevron" size={15} />
                                </button>
                              ))
                          ) : (
                            <p className="inline-empty">{t('Немає документів')}</p>
                          )}
                        </div>
                        <button className="panel-add" onClick={createDocument}>
                          <Icon name="plus" size={16} />

                          {t('Новий документ')}
                        </button>
                      </section>
                    </>
                  )}
                </div>
                {enabled(project, 'materials') && (
                  <section className="materials-summary">
                    <div className="summary-icon">
                      <Icon name="link" size={21} />
                    </div>
                    <div>
                      <h3>{t('Матеріали')}</h3>
                      <p>
                        {materials.length
                          ? formatCount('material', materials.length)
                          : t('Немає матеріалів')}
                      </p>
                    </div>
                    <button className="button secondary" onClick={() => selectTab('materials')}>
                      {materials.length ? t('Відкрити матеріали') : t('Додати матеріали')}
                      <Icon name="arrow" size={15} />
                    </button>
                  </section>
                )}
                <div className="module-launchers">
                  {tabs
                    .filter(
                      (x) =>
                        ['notes', 'snippets', 'tables'].includes(x.id) &&
                        enabled(project, x.id as ModuleId),
                    )
                    .map((x) => (
                      <button className="home-project" key={x.id} onClick={() => selectTab(x.id)}>
                        <Icon name={tabIcons[x.id]} />
                        {t(x.label)}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {tab !== 'overview' && !enabled(project, tab) && (
              <div className="empty-state">
                <p>{t('Модуль прихований')}</p>
                <button
                  className="button secondary"
                  onClick={() => writeKit({ ...kit!, enabled: [...kit!.enabled, tab] })}
                >
                  {t('Увімкнути')}
                </button>
              </div>
            )}
            {(['notes', 'snippets', 'tables'] as const).map(
              (kind) =>
                tab === kind &&
                enabled(project, kind) && (
                  <ProjectModules
                    key={project.id + kind}
                    kind={kind}
                    kit={kit!}
                    onChange={writeKit}
                    onRemove={removeKitRecord}
                    notify={setNotification}
                  />
                ),
            )}
            {tab === 'tasks' && enabled(project, 'tasks') && (
              <section className="tab-content">
                <div className="content-heading">
                  <div>
                    <h2>{t('Завдання')}</h2>
                  </div>
                  <div className="task-view-controls">
                    <div className="segmented">
                      {(['list', 'board'] as const).map((mode) => (
                        <button
                          key={mode}
                          aria-pressed={(kit!.preferences.taskView ?? 'list') === mode}
                          onClick={() =>
                            writeKit({
                              ...kit!,
                              preferences: { ...kit!.preferences, taskView: mode },
                            })
                          }
                        >
                          {t(mode === 'list' ? 'Список' : 'Дошка')}
                        </button>
                      ))}
                    </div>
                    <span className="task-progress">
                      {t('Виконано {done} із {total}', { done: completed, total: tasks.length })}
                    </span>
                  </div>
                </div>
                <form className="add-task-form" onSubmit={addTask}>
                  <Icon name="plus" size={19} />
                  <input
                    ref={taskInput}
                    aria-label={t('Нове завдання')}
                    placeholder={t('Що потрібно зробити?')}
                    maxLength={500}
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                  />
                  <button className="button primary" disabled={!taskTitle.trim()}>
                    {t('Додати')}
                  </button>
                </form>
                <div className="filter-bar" aria-label={t('Фільтр завдань')}>
                  <SortControl
                    value={kit!.preferences.sort?.tasks ?? 'manual'}
                    onChange={(sort) =>
                      writeKit({
                        ...kit!,
                        preferences: {
                          ...kit!.preferences,
                          sort: { ...kit!.preferences.sort, tasks: sort },
                        },
                      })
                    }
                  />
                  {(
                    [
                      { id: 'all', label: t('Усі') },
                      { id: 'active', label: t('До роботи') },
                      { id: 'done', label: t('Виконані') },
                    ] as const
                  ).map((filter) => (
                    <button
                      key={filter.id}
                      className={taskFilter === filter.id ? 'active' : ''}
                      aria-pressed={taskFilter === filter.id}
                      onClick={() => setTaskFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                {kit!.preferences.taskView === 'board' ? (
                  <TaskBoard
                    tasks={tasks.filter(
                      (t) => taskFilter === 'all' || (taskFilter === 'done' ? t.done : !t.done),
                    )}
                    onMove={setStage}
                    render={(task) => (
                      <TaskRow
                        task={task}
                        onToggle={() => toggleTask(task.id)}
                        onDelete={() => deleteTask(task.id)}
                        onRename={(value) => renameTask(task.id, value)}
                        highlight={highlight === task.id}
                      />
                    )}
                  />
                ) : (
                  <>
                    {' '}
                    <div className="task-list">
                      {tasks
                        .filter(
                          (t) => taskFilter === 'all' || (taskFilter === 'done' ? t.done : !t.done),
                        )
                        .map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onToggle={() => toggleTask(task.id)}
                            onDelete={() => deleteTask(task.id)}
                            onRename={(value) => renameTask(task.id, value)}
                            highlight={highlight === task.id}
                          />
                        ))}
                    </div>
                  </>
                )}
                {!tasks.filter(
                  (t) => taskFilter === 'all' || (taskFilter === 'done' ? t.done : !t.done),
                ).length && (
                  <Empty
                    icon="check"
                    title={
                      taskFilter === 'done'
                        ? t('Ще немає виконаних завдань')
                        : taskFilter === 'active'
                          ? t('Немає активних завдань')
                          : t('Немає завдань')
                    }
                    text={
                      taskFilter === 'done'
                        ? t('Виконані завдання з’являться тут.')
                        : t('Додай наступну дію у полі вище.')
                    }
                  />
                )}
              </section>
            )}

            {tab === 'documents' && enabled(project, 'documents') && (
              <section className="documents-layout">
                <aside className="document-list" aria-label={t('Документи проєкту')}>
                  <div className="document-list-heading">
                    <SortControl
                      value={kit!.preferences.sort?.documents ?? 'manual'}
                      onChange={(sort) =>
                        writeKit({
                          ...kit!,
                          preferences: {
                            ...kit!.preferences,
                            sort: { ...kit!.preferences.sort, documents: sort },
                          },
                        })
                      }
                    />
                    <span>{formatCount('document', documents.length)}</span>
                    <button
                      className="icon-button"
                      aria-label={t('Створити документ')}
                      onClick={createDocument}
                    >
                      <Icon name="plus" size={17} />
                    </button>
                  </div>
                  {documents.map((doc) => (
                    <button
                      key={doc.id}
                      data-context-kind="document"
                      data-context-id={doc.id}
                      title={doc.title}
                      className={`document-list-item ${activeDocument?.id === doc.id ? 'active' : ''}`}
                      onClick={() => openDocument(doc.id)}
                    >
                      <Icon name="file" size={17} />
                      <span>{doc.title}</span>
                    </button>
                  ))}
                </aside>
                {activeDocument ? (
                  <article className="editor">
                    <div className="editor-toolbar">
                      <span>
                        <Icon name="file" size={14} />
                        {t('Документ')}
                      </span>
                      <div className="editor-actions">
                        <div className="segmented">
                          <button
                            className={!preview ? 'active' : ''}
                            onClick={() => setPreview(false)}
                          >
                            {t('Редактор')}
                          </button>
                          <button
                            className={preview ? 'active' : ''}
                            onClick={() => setPreview(true)}
                          >
                            {t('Перегляд')}
                          </button>
                        </div>
                        <ActionMenu
                          key={activeDocument.id}
                          label={t('Дії документа')}
                          items={[
                            ...(activeDocument.format !== 'html'
                              ? [
                                  {
                                    label: t('Форматований текст'),
                                    icon: 'edit' as const,
                                    action: () => {
                                      void markdownHtml(activeDocument.content).then((content) =>
                                        patchDocument({ content, format: 'html' }),
                                      );
                                    },
                                  },
                                ]
                              : []),
                            {
                              label: t('Перейменувати'),
                              icon: 'edit',
                              action: () =>
                                setModal({
                                  type: 'rename',
                                  kind: 'document',
                                  id: activeDocument.id,
                                  value: activeDocument.title,
                                }),
                            },
                            {
                              label: t(
                                activeDocument.format === 'html'
                                  ? 'Завантажити HTML'
                                  : 'Завантажити Markdown',
                              ),
                              icon: 'download',
                              action: () => {
                                const file = documentFile(activeDocument);
                                download(file.blob, file.name);
                              },
                            },
                            {
                              label: t('Видалити документ'),
                              icon: 'trash',
                              danger: true,
                              action: () => deleteDocument(activeDocument),
                            },
                          ]}
                        />
                      </div>
                    </div>
                    <div className="writing-area">
                      <input
                        ref={documentTitle}
                        className="document-title-input"
                        aria-label={t('Назва документа')}
                        maxLength={200}
                        value={activeDocument.title}
                        onChange={(event) =>
                          patchDocument({
                            title: event.target.value.trim() ? event.target.value : t('Без назви'),
                          })
                        }
                      />
                      <div className="document-meta">
                        {t('Змінено {date} · {words}', {
                          date: shortDate(activeDocument.updatedAt),
                          words: formatCount(
                            'word',
                            documentText(activeDocument).trim().split(/\s+/).filter(Boolean).length,
                          ),
                        })}
                      </div>
                      {activeDocument.format === 'html' ? (
                        preview ? (
                          <RichPreview content={activeDocument.content} />
                        ) : (
                          <RichEditor
                            key={activeDocument.id}
                            content={activeDocument.content}
                            onChange={(content) => patchDocument({ content })}
                          />
                        )
                      ) : preview ? (
                        <Suspense fallback={<p className="muted">{t('Відкриваємо документ…')}</p>}>
                          <Markdown content={activeDocument.content} />
                        </Suspense>
                      ) : (
                        <textarea
                          className="markdown-editor"
                          aria-label={t('Вміст документа')}
                          spellCheck={false}
                          placeholder={t('Текст документа (Markdown)')}
                          value={activeDocument.content}
                          onChange={(event) => patchDocument({ content: event.target.value })}
                        />
                      )}
                    </div>
                  </article>
                ) : (
                  <Empty icon="file" title={t('Немає документів')} text="">
                    <button className="button primary" onClick={createDocument}>
                      <Icon name="plus" size={16} />

                      {t('Новий документ')}
                    </button>
                  </Empty>
                )}
              </section>
            )}

            {tab === 'materials' && enabled(project, 'materials') && (
              <section className="tab-content">
                <div className="content-heading">
                  <div>
                    <h2>{t('Матеріали проєкту')}</h2>
                  </div>
                  <div className="heading-actions">
                    <button className="button secondary" onClick={() => fileInput.current?.click()}>
                      <Icon name="upload" size={16} />

                      {t('Файл')}
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setModal({ type: 'material' })}
                    >
                      <Icon name="plus" size={16} />

                      {t('Посилання')}
                    </button>
                  </div>
                </div>
                {materials.length ? (
                  <>
                    <div className="collection-tools">
                      <SortControl
                        value={kit!.preferences.sort?.materials ?? 'manual'}
                        onChange={(sort) =>
                          writeKit({
                            ...kit!,
                            preferences: {
                              ...kit!.preferences,
                              sort: { ...kit!.preferences.sort, materials: sort },
                            },
                          })
                        }
                      />
                      <label className="select-files">
                        <input
                          type="checkbox"
                          aria-label={t('Вибрати всі файли')}
                          checked={
                            materials.some((m) => m.kind === 'file') &&
                            materials
                              .filter((m) => m.kind === 'file')
                              .every((m) => selectedFiles.has(m.id))
                          }
                          onChange={(e) =>
                            setSelectedFiles(
                              e.target.checked
                                ? new Set(
                                    materials.filter((m) => m.kind === 'file').map((m) => m.id),
                                  )
                                : new Set(),
                            )
                          }
                        />
                        {t('Вибрати всі файли')}
                      </label>
                      {selectedFiles.size > 0 && (
                        <>
                          <button
                            className="button secondary"
                            disabled={bulkBusy}
                            onClick={() => void bulkDownload()}
                          >
                            {t('Завантажити вибрані')}
                          </button>
                          <button
                            className="button secondary"
                            disabled={bulkBusy}
                            onClick={() => setModal({ type: 'bulk-delete' })}
                          >
                            {t('Видалити вибрані')}
                          </button>
                        </>
                      )}
                    </div>
                    <div className="material-list">
                      {materials.map((material) => (
                        <div
                          id={`item-${material.id}`}
                          key={material.id}
                          data-context-kind="material"
                          data-context-id={material.id}
                          tabIndex={0}
                          className={`material-row ${highlight === material.id ? 'highlight' : ''}`}
                        >
                          {material.kind === 'file' && (
                            <input
                              type="checkbox"
                              aria-label={t('Вибрати {title}', { title: material.title })}
                              checked={selectedFiles.has(material.id)}
                              onChange={(e) =>
                                setSelectedFiles((current) => {
                                  const next = new Set(current);
                                  if (e.target.checked) next.add(material.id);
                                  else next.delete(material.id);
                                  return next;
                                })
                              }
                            />
                          )}
                          <span className="material-icon">
                            <Icon name={material.kind === 'link' ? 'link' : 'file'} size={21} />
                          </span>
                          <button className="material-open" onClick={() => openMaterial(material)}>
                            <strong>{material.title}</strong>
                            <small>
                              {material.kind === 'link'
                                ? new URL(material.url).hostname
                                : `${fileType(material).toUpperCase()} · ${formatSize(material.size)}`}{' '}
                              · {shortDate(material.createdAt)}
                            </small>
                          </button>
                          <button
                            className="icon-button"
                            aria-label={
                              material.kind === 'link'
                                ? t('Відкрити {title}', { title: material.title })
                                : t('Завантажити {title}', { title: material.title })
                            }
                            onClick={() =>
                              material.kind === 'file'
                                ? downloadMaterial(material)
                                : openMaterial(material)
                            }
                          >
                            <Icon
                              name={material.kind === 'link' ? 'external' : 'download'}
                              size={16}
                            />
                          </button>
                          <button
                            className="icon-button row-delete"
                            aria-label={t('Видалити матеріал {title}', { title: material.title })}
                            onClick={() => deleteMaterial(material)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Empty icon="link" title={t('Немає матеріалів')} text="">
                    <button
                      className="button secondary"
                      onClick={() => setModal({ type: 'material' })}
                    >
                      <Icon name="plus" size={16} />

                      {t('Додати посилання')}
                    </button>
                  </Empty>
                )}
              </section>
            )}
          </main>
        )}
      </div>

      <input
        type="file"
        ref={fileInput}
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void attachFiles(event.target.files);
        }}
      />
      <div className="toast-stack">
        {undo && (
          <UndoNotice
            key={undo.id}
            action={undo}
            onUndo={restoreDeletion}
            onDismiss={() => setUndo((current) => (current?.id === undo.id ? null : current))}
          />
        )}
        {notification && (
          <div className="toast" role="status">
            <Icon name="check" size={16} />
            <span>{notification}</span>
            <button
              className="icon-button"
              aria-label={t('Закрити повідомлення')}
              onClick={() => setNotification('')}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
      </div>
      {searchOpen && (
        <Search
          workspace={workspace}
          onClose={() => setSearchOpen(false)}
          onSelect={selectResult}
        />
      )}
      {modal?.type === 'bulk-delete' && (
        <Modal title={t('Видалити вибрані')} onClose={() => setModal(null)}>
          <p>{t('Вибрані файли буде видалено.')}</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              {t('Скасувати')}
            </button>
            <button className="button danger" onClick={bulkRemove}>
              {t('Видалити вибрані')}
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === 'project' && (
        <Modal
          title={modal.project ? t('Редагувати проєкт') : t('Новий проєкт')}
          onClose={closeModal}
        >
          <ProjectForm
            project={modal.project}
            onClose={closeModal}
            onSubmit={(name, description, tone, modules) => {
              const existing = modal.project;
              const p: Project = {
                ...existing,
                kit: { ...(existing ? getKit(existing) : getKit()), enabled: modules },
                id: existing?.id ?? uid(),
                name,
                description,
                tone,
                createdAt: existing?.createdAt ?? now(),
              };
              update((w) => ({
                ...w,
                projects: existing
                  ? w.projects.map((item) => (item.id === p.id ? p : item))
                  : [...w.projects, p],
                context:
                  existing &&
                  w.context.projectId === p.id &&
                  (w.context.tab === 'overview' || modules.includes(w.context.tab))
                    ? w.context
                    : { projectId: p.id, tab: 'overview', documentId: null },
              }));
              closeModal();
              setSidebarOpen(false);
              setView('project');
            }}
          />
        </Modal>
      )}
      {modal?.type === 'delete-project' && (
        <Modal title={t('Видалити проєкт?')} onClose={closeModal}>
          <p className="modal-description">
            {t('Видалити «{name}» з усіма документами, завданнями й матеріалами?', {
              name: modal.project.name,
            })}
          </p>

          <div className="modal-actions">
            <button className="button secondary" onClick={closeModal}>
              {t('Залишити')}
            </button>
            <button className="button danger" onClick={() => deleteProject(modal.project)}>
              {t('Видалити проєкт')}
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === 'material' && (
        <Modal title={t('Додати посилання')} onClose={closeModal}>
          <LinkForm
            onSubmit={(title, url) => {
              if (!project) return;
              const material: Material = {
                id: uid(),
                projectId: project.id,
                title,
                url,
                kind: 'link',
                size: 0,
                createdAt: now(),
              };
              update((w) => ({ ...w, materials: [...w.materials, material] }));
              closeModal();
            }}
          />
        </Modal>
      )}
      {contextMenu && <ContextMenu state={contextMenu} close={closeContextMenu} />}
      {modal?.type === 'rename' && (
        <Modal title={t('Перейменувати')} onClose={closeModal}>
          <RenameForm
            key={`${modal.kind}-${modal.id}`}
            value={modal.value}
            maxLength={modal.kind === 'project' ? 120 : modal.kind === 'document' ? 200 : 500}
            save={(value) => renameRecord(modal.kind, modal.id, value)}
            cancel={closeModal}
          />
        </Modal>
      )}
      {modal?.type === 'file-preview' && (
        <Modal title={modal.material.title} onClose={closeModal} wide className="file-modal">
          <FilePreview material={modal.material} />
        </Modal>
      )}
      {modal?.type === 'settings' && (
        <Modal title={t('Налаштування')} onClose={closeModal}>
          <fieldset className="theme-picker">
            <legend>{t('Вигляд')}</legend>
            <div className="theme-options">
              {(
                [
                  { value: 'light', label: t('Світла'), icon: 'sun' },
                  { value: 'dark', label: t('Темна'), icon: 'moon' },
                  { value: 'system', label: t('Системна'), icon: 'monitor' },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`theme-option ${theme === option.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={theme === option.value}
                    onChange={() => {
                      if (!selectTheme(option.value as Theme))
                        setNotification(
                          t('Тему застосовано, але зберегти вибір на пристрої не вдалося.'),
                        );
                    }}
                  />
                  <span className={`theme-preview ${option.value}`} aria-hidden="true">
                    <span className="preview-sidebar" />
                    <span className="preview-content">
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                  <span className="theme-option-label">
                    <Icon name={option.icon} size={15} />
                    <span>{option.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="background-picker">
            <legend>{t('Фон')}</legend>
            <div className="background-options">
              {backgrounds.map((value, index) => (
                <label
                  key={value}
                  className={`background-option ${background === value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="background"
                    value={value}
                    checked={background === value}
                    onChange={() => {
                      if (!selectBackground(value)) setNotification(t('Не вдалося зберегти фон.'));
                    }}
                  />
                  <span className={`background-swatch background-${value}`} aria-hidden="true" />
                  <span>
                    {t((['Стандартний', 'Світанок', 'Ліс', 'Лаванда', 'Океан'] as const)[index])}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="language-setting">
            <span className="language-setting-label">
              <Icon name="globe" size={19} />
              <span>{t('Мова')}</span>
            </span>
            <select
              aria-label={t('Мова')}
              value={language}
              onChange={(event) => {
                if (!selectLanguage(event.target.value as Language))
                  setNotification(t('Мову застосовано, але зберегти вибір не вдалося.'));
              }}
            >
              <option value="uk">Українська</option>
              <option value="en">English</option>
            </select>
          </label>
          <button className="settings-link" onClick={() => setModal({ type: 'shortcuts' })}>
            <Icon name="keyboard" size={17} />
            <span>{t('Клавіатурні скорочення')}</span>
            <Icon name="chevron" size={15} />
          </button>
          <UpdateSettings updater={updater} />
        </Modal>
      )}
      {updater.showNotice && !modal && (
        <div className="update-notice" role="status">
          <button onClick={() => setModal({ type: 'settings' })}>
            {t('Доступна версія {version}.', { version: updater.version })}
          </button>
          <button
            className="icon-button"
            aria-label={t('Відкласти оновлення')}
            onClick={updater.dismiss}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {updater.phase === 'installing' && (
        <Modal title={t('Оновлення')} onClose={() => undefined} locked>
          <p className="modal-description" role="status">
            {t('Зберігаємо зміни та встановлюємо оновлення…')}
          </p>
        </Modal>
      )}
      {modal?.type === 'shortcuts' && (
        <Modal title={t('Клавіатурні скорочення')} onClose={closeModal}>
          <div className="shortcut-row">
            <span>{t('Згорнути / розгорнути бічну панель')}</span>
            <span>
              <kbd>Ctrl / ⌘</kbd> <kbd>\</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>{t('Пошук у workspace')}</span>
            <span>
              <kbd>Ctrl / ⌘</kbd> <kbd>K</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>{t('Навігація результатами пошуку')}</span>
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span>{t('Відкрити результат / додати завдання')}</span>
            <kbd>Enter</kbd>
          </div>
          <div className="shortcut-row">
            <span>{t('Закрити вікно')}</span>
            <kbd>Esc</kbd>
          </div>
          <div className="shortcut-row">
            <span>{t('Перейти до наступного елемента')}</span>
            <kbd>Tab</kbd>
          </div>
        </Modal>
      )}
    </div>
  );
}
