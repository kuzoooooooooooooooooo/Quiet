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
import { now, safeUrl, searchWorkspace, tabs, uid, validateWorkspace } from './model';
import type {
  Document,
  Material,
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
import { useUpdater } from './useUpdater';
import UpdateSettings from './UpdateSettings';

const Markdown = lazy(() => import('./Markdown'));
const shortcutKey = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
type SaveStatus = 'saving' | 'saved' | 'error';
type ModalState =
  | { type: 'project'; project?: Project }
  | { type: 'delete-project'; project: Project }
  | { type: 'material' }
  | { type: 'backup' }
  | { type: 'import'; workspace: Workspace }
  | { type: 'shortcuts' }
  | { type: 'settings' }
  | null;
const tabIcons: Record<Tab, IconName> = {
  overview: 'grid',
  documents: 'file',
  tasks: 'circle',
  materials: 'link',
};
const resultIcons: Record<SearchResult['kind'], IconName> = {
  project: 'folder',
  document: 'file',
  task: 'circle',
  material: 'link',
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
  locked = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
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
      className={`modal ${wide ? 'wide' : ''}`}
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
  onSubmit: (name: string, description: string, tone: Tone) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [tone, setTone] = useState<Tone>(project?.tone ?? 'green');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSubmit(name.trim(), description.trim(), tone);
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
  onCreate,
}: {
  workspace: Workspace;
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => searchWorkspace(workspace, query), [workspace, query, language]);
  const projectName = (id: string) => workspace.projects.find((p) => p.id === id)?.name ?? '';
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
          placeholder={t('Проєкти, документи, завдання…')}
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
              else if (!query.trim()) onCreate();
            }
          }}
        />
      </div>
      <div className="search-results">
        {!query.trim() ? (
          <>
            <p className="eyebrow">{t('Швидкі дії')}</p>
            <button className="search-result" onClick={onCreate}>
              <Icon name="plus" />
              <span>{t('Створити проєкт')}</span>
              <kbd>↵</kbd>
            </button>
            <p className="search-hint">
              {t('Шукай за назвою або вмістом — у всіх проєктах одразу.')}
            </p>
          </>
        ) : results.length ? (
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
                  {projectName(result.projectId)} ·{' '}
                  {result.kind === 'project'
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
        ) : (
          <Empty
            icon="search"
            title={t('Нічого не знайшлося')}
            text={t('Спробуй інше слово або коротший запит.')}
          />
        )}
      </div>
      <div className="search-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t('обрати')}
        </span>
        <span>
          <kbd>Enter</kbd> {t('відкрити')}
        </span>
        <span>
          <kbd>Esc</kbd> {t('закрити')}
        </span>
      </div>
    </Modal>
  );
}

export default function App() {
  const { theme, selectTheme } = useTheme();
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
  const [notification, setNotification] = useState('');
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'done'>('all');
  const [preview, setPreview] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
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
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal, searchOpen, toggleSidebar]);

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
    setTaskTitle('');
    setTaskFilter('all');
    setPreview(false);
  }, [workspace?.context.projectId]);

  const project = workspace?.projects.find((p) => p.id === workspace.context.projectId);
  const tab = workspace?.context.tab ?? 'overview';
  const documents = workspace?.documents.filter((d) => d.projectId === project?.id) ?? [];
  const tasks = workspace?.tasks.filter((t) => t.projectId === project?.id) ?? [];
  const materials = workspace?.materials.filter((m) => m.projectId === project?.id) ?? [];
  const activeDocument =
    documents.find((d) => d.id === workspace?.context.documentId) ?? documents[0];
  const completed = tasks.filter((t) => t.done).length;
  const activeTasks = tasks.filter((t) => !t.done);
  const closeModal = () => setModal(null);

  function selectProject(id: string) {
    update((w) => ({ ...w, context: { projectId: id, tab: 'overview', documentId: null } }));
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
  function patchDocument(patch: Partial<Pick<Document, 'title' | 'content'>>) {
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
        context: { projectId: projects[0]?.id ?? null, tab: 'overview', documentId: null },
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
  async function exportBackup() {
    if (!workspace) return;
    try {
      const saved = await downloadBlob(
        new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' }),
        `quiet-backup-${now().slice(0, 10)}.json`,
      );
      if (saved) setNotification(t('Резервну копію завантажено.'));
    } catch (error) {
      setNotification(t('Не вдалося завантажити: {error}', { error: message(error) }));
    }
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error(t('Максимальний розмір резервної копії — 50 МБ.'));
      const data = validateWorkspace(JSON.parse(await file.text()));
      setModal({ type: 'import', workspace: data });
    } catch (error) {
      setNotification(t('Імпорт скасовано: {error}', { error: message(error) }));
    }
    if (importInput.current) importInput.current.value = '';
  }
  async function attachFile(file: File | undefined) {
    if (!file || !project) return;
    const projectId = project.id;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(t('Для цієї версії розмір файлу обмежений 5 МБ.'));
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(
            (reader.result as string).replace(
              /^data:[^,]*,/,
              'data:application/octet-stream;base64,',
            ),
          );
        reader.onerror = () => reject(new Error(t('Не вдалося прочитати файл.')));
        reader.readAsDataURL(file);
      });
      const material: Material = {
        id: uid(),
        projectId,
        title: file.name,
        kind: 'file',
        url,
        size: file.size,
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
  function openMaterial(material: Material) {
    if (material.kind === 'link') {
      const url = safeUrl(material.url);
      if (url) void openExternal(url).catch((error) => setNotification(message(error)));
    } else {
      const raw = atob(material.url.split(',')[1]);
      const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      download(new Blob([bytes], { type: 'application/octet-stream' }), material.title);
    }
  }
  function selectResult(result: SearchResult) {
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
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label={t('Закрити бічну панель')}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label={t('Проєкти')}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            q
          </div>
          <span className="brand-name">
            quiet<span className="brand-dot">.</span>
          </span>
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
        <div className="sidebar-section-heading">
          <span>{t('ПРОЄКТИ')}</span>
        </div>
        <nav className="project-nav">
          {workspace.projects.map((p) => (
            <button
              key={p.id}
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
            aria-label={t('Резервні копії')}
            title={t('Резервні копії')}
            onClick={() => setModal({ type: 'backup' })}
          >
            <Icon name="download" size={16} />

            <span className="rail-label">{t('Резервні копії')}</span>
          </button>
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
              <span className="breadcrumb-root">{project?.name ?? 'Workspace'}</span>
              {project && (
                <>
                  <Icon name="chevron" size={11} />
                  <span>{t(tabs.find((item) => item.id === tab)!.label)}</span>
                </>
              )}
            </button>
          </div>
          {(workspace.projects.length > 0 || status === 'error') && (
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
            <button onClick={exportBackup}>{t('Завантажити копію')}</button>
          </div>
        )}

        {!project ? (
          <main className="blank-workspace" aria-label={t('Робоча область')} />
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
                <ActionMenu
                  key={`create-${project.id}`}
                  label={t('Створити')}
                  primary
                  items={[
                    { label: t('Нове завдання'), icon: 'circle', action: focusTask },
                    { label: t('Новий документ'), icon: 'file', action: createDocument },
                    {
                      label: t('Додати посилання'),
                      icon: 'link',
                      action: () => {
                        selectTab('materials');
                        setModal({ type: 'material' });
                      },
                    },
                    {
                      label: t('Файл'),
                      icon: 'upload',
                      action: () => {
                        selectTab('materials');
                        fileInput.current?.click();
                      },
                    },
                  ]}
                />
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
              {tabs.map((item) => (
                <button
                  key={item.id}
                  className={tab === item.id ? 'active' : ''}
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => selectTab(item.id)}
                >
                  <Icon name={tabIcons[item.id]} size={16} />
                  {t(item.label)}
                  {item.id !== 'overview' &&
                    (item.id === 'documents'
                      ? documents.length
                      : item.id === 'tasks'
                        ? activeTasks.length
                        : materials.length) > 0 && (
                      <span className="tab-count">
                        {item.id === 'documents'
                          ? documents.length
                          : item.id === 'tasks'
                            ? activeTasks.length
                            : materials.length}
                      </span>
                    )}
                </button>
              ))}
            </nav>

            {tab === 'overview' && (
              <div className="overview-content">
                <div className="overview-grid">
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
                              className="document-card"
                              onClick={() => openDocument(doc.id)}
                            >
                              <span className="document-icon">
                                <Icon name="file" size={19} />
                              </span>
                              <span>
                                <strong>{doc.title}</strong>
                                <small>
                                  {doc.content
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
                </div>
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
              </div>
            )}

            {tab === 'tasks' && (
              <section className="tab-content">
                <div className="content-heading">
                  <div>
                    <h2>{t('Завдання')}</h2>
                  </div>
                  <span className="task-progress">
                    {t('Виконано {done} із {total}', { done: completed, total: tasks.length })}
                  </span>
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

            {tab === 'documents' && (
              <section className="documents-layout">
                <aside className="document-list" aria-label={t('Документи проєкту')}>
                  <div className="document-list-heading">
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
                            {
                              label: t('Завантажити Markdown'),
                              icon: 'download',
                              action: () =>
                                download(
                                  new Blob([activeDocument.content], {
                                    type: 'text/markdown;charset=utf-8',
                                  }),
                                  `${activeDocument.title}.md`,
                                ),
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
                          patchDocument({ title: event.target.value || t('Без назви') })
                        }
                      />
                      <div className="document-meta">
                        {t('Змінено {date} · {words}', {
                          date: shortDate(activeDocument.updatedAt),
                          words: formatCount(
                            'word',
                            activeDocument.content.trim().split(/\s+/).filter(Boolean).length,
                          ),
                        })}
                      </div>
                      {preview ? (
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

            {tab === 'materials' && (
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
                  <div className="material-list">
                    {materials.map((material) => (
                      <div
                        id={`item-${material.id}`}
                        key={material.id}
                        className={`material-row ${highlight === material.id ? 'highlight' : ''}`}
                      >
                        <span className="material-icon">
                          <Icon name={material.kind === 'link' ? 'link' : 'file'} size={21} />
                        </span>
                        <button className="material-open" onClick={() => openMaterial(material)}>
                          <strong>{material.title}</strong>
                          <small>
                            {material.kind === 'link'
                              ? new URL(material.url).hostname
                              : formatSize(material.size)}{' '}
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
                          onClick={() => openMaterial(material)}
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
                <p className="storage-note">
                  <Icon name="folder" size={14} />

                  {t('Файли до 5 МБ · Зберігаються локально · Без завантаження на сервер')}
                </p>
              </section>
            )}
          </main>
        )}
      </div>

      <input
        type="file"
        accept="application/json,.json"
        ref={importInput}
        hidden
        onChange={(event) => void importBackup(event.target.files?.[0])}
      />
      <input
        type="file"
        ref={fileInput}
        hidden
        onChange={(event) => void attachFile(event.target.files?.[0])}
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
          onCreate={() => {
            setSearchOpen(false);
            setModal({ type: 'project' });
          }}
        />
      )}
      {modal?.type === 'project' && (
        <Modal
          title={modal.project ? t('Редагувати проєкт') : t('Новий проєкт')}
          onClose={closeModal}
        >
          <ProjectForm
            project={modal.project}
            onClose={closeModal}
            onSubmit={(name, description, tone) => {
              const existing = modal.project;
              const p: Project = {
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
                context: { projectId: p.id, tab: 'overview', documentId: null },
              }));
              closeModal();
              setSidebarOpen(false);
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
          <button className="text-button" onClick={exportBackup}>
            <Icon name="download" size={15} />

            {t('Спочатку завантажити резервну копію')}
          </button>
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
      {modal?.type === 'backup' && (
        <Modal title={t('Резервні копії')} onClose={closeModal}>
          <p className="modal-description">
            {t(
              'Дані зберігаються на цьому пристрої. Завантаж копію, щоб мати запасний примірник або перенести workspace в інший браузер чи desktop-додаток.',
            )}
          </p>
          <div className="backup-options">
            <button onClick={exportBackup}>
              <span className="backup-icon">
                <Icon name="download" size={22} />
              </span>
              <span>
                <strong>{t('Експортувати workspace')}</strong>
                <small>{t('Усі проєкти, документи, завдання й файли · JSON')}</small>
              </span>
              <Icon name="chevron" size={17} />
            </button>
            <button onClick={() => importInput.current?.click()}>
              <span className="backup-icon">
                <Icon name="upload" size={22} />
              </span>
              <span>
                <strong>{t('Відновити з копії')}</strong>
                <small>{t('Замінить поточні дані після підтвердження')}</small>
              </span>
              <Icon name="chevron" size={17} />
            </button>
          </div>
          <p className="storage-note">
            {t('Автоматичної синхронізації між пристроями поки немає.')}
          </p>
        </Modal>
      )}
      {modal?.type === 'import' && (
        <Modal title={t('Відновити workspace?')} onClose={closeModal}>
          <p className="modal-description">
            {t('У копії: {projects}, {documents}, {tasks}. Поточні дані буде замінено.', {
              projects: formatCount('project', modal.workspace.projects.length),
              documents: formatCount('document', modal.workspace.documents.length),
              tasks: formatCount('task', modal.workspace.tasks.length),
            })}
          </p>
          <button className="text-button" onClick={exportBackup}>
            <Icon name="download" size={15} />

            {t('Завантажити поточні дані перед заміною')}
          </button>
          <div className="modal-actions">
            <button className="button secondary" onClick={closeModal}>
              {t('Скасувати')}
            </button>
            <button
              className="button primary"
              onClick={() => {
                setUndo(null);
                setWorkspace(modal.workspace);
                closeModal();
                setNotification(t('Workspace відновлено з копії.'));
              }}
            >
              {t('Відновити')}
            </button>
          </div>
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
