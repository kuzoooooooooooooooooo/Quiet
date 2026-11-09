import { useSyncExternalStore } from 'react';

// Source-language keys keep this small catalog readable without a runtime dependency.
const english = {
  'Запис видалено.': 'Record deleted.',
  Видалити: 'Delete',
  'Вибери файли загальним розміром до 100 МБ.':
    'Select files with a combined size of up to 100 MB.',
  'Модулі проєкту': 'Project modules',
  'Стандартний набір': 'Standard set',
  'Порожній проєкт': 'Empty project',
  'Приховані модулі зберігають вміст.': 'Hidden modules keep their content.',
  'Фрагменти коду': 'Code snippets',
  Таблиці: 'Tables',
  'Новий фрагмент': 'New snippet',
  'Новий фрагмент коду': 'Untitled snippet',
  'Нова таблиця': 'New table',
  'Мова коду': 'Code language',
  'Копіювати код': 'Copy code',
  'Скопійовано.': 'Copied.',
  'Не вдалося скопіювати.': 'Could not copy.',
  Стовпець: 'Column',
  'Додати стовпець': 'Add column',
  'Додати рядок': 'Add row',
  'Видалити рядок': 'Delete row',
  'Видалити стовпець': 'Delete column',
  'Експорт CSV': 'Export CSV',
  Сортування: 'Sort',
  'Власний порядок': 'Manual order',
  'За назвою': 'By name',
  'Спочатку нові': 'Newest first',
  Вище: 'Move up',
  Нижче: 'Move down',
  Дошка: 'Board',
  Список: 'List',
  'У роботі': 'In progress',
  'Стан завдання': 'Task status',
  'Вибрати {title}': 'Select {title}',
  'Вибрати всі файли': 'Select all files',
  'Завантажити вибрані': 'Download selected',
  'Видалити вибрані': 'Delete selected',
  'Вибрані файли буде видалено.': 'The selected files will be deleted.',
  'Перетягни файли сюди': 'Drop files here',
  'Створити модуль': 'Enable a module',
  'Модуль прихований': 'Module is hidden',
  Увімкнути: 'Enable',
  'Клітинка {row}, {column}': 'Cell {row}, {column}',
  'Назва таблиці': 'Table title',
  'Назва фрагмента': 'Snippet title',
  Код: 'Code',
  'Перемістити до {stage}': 'Move to {stage}',
  'Дії запису': 'Record actions',

  'Слайд {current} з {total}': 'Slide {current} of {total}',
  'Наступний слайд': 'Next slide',
  'Попередній слайд': 'Previous slide',
  'Не вдалося завантажити файл.': 'Could not download the file.',
  'Для цього типу файлу доступне завантаження.': 'You can download this file type.',
  'Не вдалося відкрити перегляд цього файлу. Його можна завантажити.':
    'Could not preview this file. You can download it.',
  'Відкриваємо файл…': 'Opening file…',
  Зображення: 'Image',
  Переглянути: 'Preview',
  'Максимальний розмір файлу — 25 МБ.': 'Maximum file size is 25 MB.',
  'Не вдалося зберегти фон.': 'Could not save the background preference.',
  Океан: 'Ocean',
  Лаванда: 'Lavender',
  Ліс: 'Forest',
  Світанок: 'Dawn',
  Стандартний: 'Default',
  Фон: 'Background',
  Пошук: 'Search',
  'Некоректна нотатка.': 'Invalid note.',
  'Нотатку видалено.': 'Note deleted.',
  'Видалити нотатку': 'Delete note',
  'Дії нотатки': 'Note actions',
  'Текст нотатки': 'Note content',
  'Назва нотатки': 'Note title',
  'Створити нотатку': 'New note',
  'Нова нотатка': 'Untitled note',
  Нотатка: 'Note',
  Нотатки: 'Notes',
  Навігація: 'Navigation',
  Головна: 'Home',
  'Повернути до роботи': 'Mark incomplete',
  'Позначити виконаним': 'Mark complete',
  'Завантажити файл': 'Download file',
  Відкрити: 'Open',
  'Стиснуто до {size}': 'Stored as {size}',
  'Форматований текст': 'Formatted text',
  'Завантажити HTML': 'Download HTML',
  'Прибрати форматування': 'Clear formatting',
  'Повторити дію': 'Redo edit',
  'Скасувати дію': 'Undo edit',
  Праворуч: 'Align right',
  'По центру': 'Align center',
  Ліворуч: 'Align left',
  'Нумерований список': 'Numbered list',
  'Маркований список': 'Bulleted list',
  Підкреслення: 'Underline',
  Курсив: 'Italic',
  Жирний: 'Bold',
  'Заголовок 3': 'Heading 3',
  'Заголовок 2': 'Heading 2',
  'Заголовок 1': 'Heading 1',
  'Звичайний текст': 'Normal text',
  'Стиль тексту': 'Text style',
  'Розмір тексту': 'Text size',
  Шрифт: 'Font',
  'Форматування тексту': 'Text formatting',
  Перейменувати: 'Rename',
  Дії: 'Actions',
  Оновлення: 'Updates',
  'Оновлення доступні у Windows-додатку.': 'Updates are available in the Windows app.',
  'Ця збірка не налаштована для оновлень.': 'This build is not configured for updates.',
  'Перевіряємо оновлення…': 'Checking for updates…',
  'Завантажуємо оновлення…': 'Downloading update…',
  'Зберігаємо зміни та встановлюємо оновлення…': 'Saving changes and installing the update…',
  'Оновлення встановлено. Запусти Quiet знову.': 'Update installed. Open Quiet again.',
  'Не вдалося завершити оновлення. Спробуй знову.': 'Could not complete the update. Try again.',
  'Встановлено найновішу версію.': 'You have the latest version.',
  'Доступна версія {version}.': 'Version {version} is available.',
  'Перевіряй і встановлюй нові версії тут.': 'Check for and install new versions here.',
  'Після збереження змін додаток перезапуститься.':
    'The app will restart after saving your changes.',
  'Завантажити та встановити': 'Download and install',
  'Перевірити оновлення': 'Check for updates',
  'Відкласти оновлення': 'Dismiss update',
  Деталі: 'Details',
  'Згорнути панель': 'Collapse sidebar',
  'Розгорнути панель': 'Expand sidebar',
  'Згорнути / розгорнути бічну панель': 'Toggle sidebar',
  'Не вдалося зберегти вигляд панелі.': 'Could not save the sidebar preference.',
  Створити: 'Create',
  'Редагувати назву проєкту': 'Rename project',
  'Редагувати завдання {title}': 'Edit task {title}',
  'Завдання видалено.': 'Task deleted.',
  'Документ видалено.': 'Document deleted.',
  'Матеріал видалено.': 'Material deleted.',
  'Відновлено.': 'Restored.',
  'Проєкт більше не існує.': 'The project no longer exists.',
  'Дії документа': 'Document actions',
  'Видалити «{name}» з усіма документами, завданнями й матеріалами?':
    'Delete “{name}” and all its documents, tasks, and materials?',
  Зелений: 'Green',
  Синій: 'Blue',
  Помаранчевий: 'Orange',
  Фіолетовий: 'Purple',
  Б: 'B',
  КБ: 'KB',
  МБ: 'MB',
  Закрити: 'Close',
  'Назва проєкту': 'Project name',
  'Над чим працюємо?': 'What are you working on?',
  'Короткий опис': 'Description',
  'необов’язково': 'optional',
  'Яка головна ціль?': 'What is the main goal?',
  Колір: 'Color',
  Скасувати: 'Cancel',
  Зберегти: 'Save',
  'Створити проєкт': 'Create project',
  'Вкажи повне посилання з https:// або http://.':
    'Enter a full URL starting with https:// or http://.',
  Посилання: 'Link',
  Назва: 'Name',
  'Щоб було легко знайти': 'Give it a memorable name',
  'Додати посилання': 'Add link',
  'Видалити завдання': 'Delete task',
  'Видалити завдання {title}': 'Delete task {title}',
  'Пошук у workspace': 'Search workspace',
  'Проєкти, документи, завдання…': 'Projects, documents, tasks…',
  'Швидкі дії': 'Quick actions',
  'Шукай за назвою або вмістом — у всіх проєктах одразу.':
    'Search titles and content across all projects.',
  Проєкт: 'Project',
  Документ: 'Document',
  Завдання: 'Tasks',
  Матеріал: 'Material',
  'Нічого не знайшлося': 'No results',
  'Спробуй інше слово або коротший запит.': 'Try another word or a shorter search.',
  обрати: 'select',
  відкрити: 'open',
  закрити: 'close',
  'Спочатку збережи зміни або завантаж резервну копію.':
    'Save your changes or export a backup before closing.',
  'Не вдалося підключити захист незбережених змін.':
    'Could not enable protection for unsaved changes.',
  'Без назви': 'Untitled',
  'Не вдалося завантажити: {error}': 'Download failed: {error}',
  'Резервну копію завантажено.': 'Backup downloaded.',
  'Максимальний розмір резервної копії — 50 МБ.': 'The maximum backup size is 50 MB.',
  'Імпорт скасовано: {error}': 'Import canceled: {error}',
  'Для цієї версії розмір файлу обмежений 5 МБ.': 'Files are limited to 5 MB in this version.',
  'Не вдалося прочитати файл.': 'Could not read the file.',
  'Файл додано до проєкту.': 'File added to the project.',
  'Не вдалося відкрити workspace': 'Could not open the workspace',
  'Наявні дані не перезаписано.': 'Your existing data has not been overwritten.',
  'Спробувати знову': 'Try again',
  'Завантаження…': 'Loading…',
  'Закрити бічну панель': 'Close sidebar',
  Проєкти: 'Projects',
  'Знайти будь-що': 'Search anything',
  ПРОЄКТИ: 'PROJECTS',
  'Новий проєкт': 'New project',
  'Резервні копії': 'Backups',
  Налаштування: 'Settings',
  'Відкрити проєкти': 'Open projects',
  'Дані зберігаються лише на цьому пристрої': 'Data is stored only on this device',
  'Зберігаємо…': 'Saving…',
  'Не збережено': 'Not saved',
  'Збережено на пристрої': 'Saved on this device',
  'Не вдалося зберегти: {error}': 'Could not save: {error}',
  Повторити: 'Retry',
  'Завантажити копію': 'Download backup',
  'Робоча область': 'Workspace',
  'Меню проєкту': 'Project menu',
  'Закрити меню': 'Close menu',
  'Редагувати проєкт': 'Edit project',
  'Видалити проєкт': 'Delete project',
  'Розділи проєкту': 'Project sections',
  'Немає завдань': 'No tasks yet',
  'Додати завдання': 'Add task',
  Документи: 'Documents',
  'Створити документ': 'Create document',
  'Немає документів': 'No documents yet',
  'Новий документ': 'New document',
  Матеріали: 'Materials',
  'Немає матеріалів': 'No materials yet',
  'Відкрити матеріали': 'Open materials',
  'Додати матеріали': 'Add materials',
  'Виконано {done} із {total}': '{done} of {total} completed',
  'Нове завдання': 'New task',
  'Що потрібно зробити?': 'What needs to be done?',
  Додати: 'Add',
  'Фільтр завдань': 'Filter tasks',
  Усі: 'All',
  'До роботи': 'To do',
  Виконані: 'Completed',
  'Ще немає виконаних завдань': 'No completed tasks yet',
  'Немає активних завдань': 'No active tasks',
  'Виконані завдання з’являться тут.': 'Completed tasks will appear here.',
  'Додай наступну дію у полі вище.': 'Add a task using the field above.',
  'Документи проєкту': 'Project documents',
  Редактор: 'Editor',
  Перегляд: 'Preview',
  'Завантажити Markdown': 'Download Markdown',
  'Видалити документ': 'Delete document',
  'Назва документа': 'Document title',
  'Змінено {date} · {words}': 'Edited {date} · {words}',
  'Відкриваємо документ…': 'Opening document…',
  'Вміст документа': 'Document content',
  'Текст документа (Markdown)': 'Document text (Markdown)',
  'Матеріали проєкту': 'Project materials',
  Файл: 'File',
  'Відкрити {title}': 'Open {title}',
  'Завантажити {title}': 'Download {title}',
  'Видалити матеріал {title}': 'Delete material {title}',
  'Файли до 5 МБ · Зберігаються локально · Без завантаження на сервер':
    'Files up to 5 MB · Stored locally · No server upload',
  'Закрити повідомлення': 'Dismiss notification',
  'Видалити проєкт?': 'Delete project?',
  'Видалити «{name}» та всі документи, завдання й матеріали? Цю дію не можна скасувати.':
    'Delete “{name}” and all its documents, tasks, and materials? This cannot be undone.',
  'Спочатку завантажити резервну копію': 'Download a backup first',
  Залишити: 'Keep',
  'Проєкт видалено.': 'Project deleted.',
  'Видалити документ?': 'Delete document?',
  '«{name}» буде видалено без можливості відновлення.': '“{name}” will be permanently deleted.',
  Тема: 'Theme',
  Світла: 'Light',
  Темна: 'Dark',
  Системна: 'System',
  'Тему застосовано, але зберегти вибір на пристрої не вдалося.':
    'Theme applied, but your preference could not be saved on this device.',
  'Клавіатурні скорочення': 'Keyboard shortcuts',
  'Дані зберігаються на цьому пристрої. Завантаж копію, щоб мати запасний примірник або перенести workspace в інший браузер чи desktop-додаток.':
    'Your data is stored on this device. Export a backup to keep a copy or move your workspace to another browser or the desktop app.',
  'Експортувати workspace': 'Export workspace',
  'Усі проєкти, документи, завдання й файли · JSON':
    'All projects, documents, tasks, and files · JSON',
  'Відновити з копії': 'Restore from backup',
  'Замінить поточні дані після підтвердження': 'Replaces your current data after confirmation',
  'Автоматичної синхронізації між пристроями поки немає.':
    'Automatic sync between devices is not available yet.',
  'Відновити workspace?': 'Restore workspace?',
  'У копії: {projects}, {documents}, {tasks}. Поточні дані буде замінено.':
    'This backup contains {projects}, {documents}, and {tasks}. Your current data will be replaced.',
  'Завантажити поточні дані перед заміною': 'Download current data before replacing it',
  'Workspace відновлено з копії.': 'Workspace restored from backup.',
  Відновити: 'Restore',
  Повернути: 'Undo',
  'Навігація результатами пошуку': 'Navigate search results',
  'Відкрити результат / додати завдання': 'Open result / add task',
  'Закрити вікно': 'Close dialog',
  'Перейти до наступного елемента': 'Move to the next control',
  Огляд: 'Overview',
  'Непідтримуваний формат резервної копії.': 'Unsupported backup format.',
  'У копії відсутні необхідні дані.': 'Required data is missing from the backup.',
  'Забагато записів у резервній копії.': 'The backup contains too many records.',
  'Некоректні або повторювані ідентифікатори.': 'Invalid or duplicate identifiers.',
  'Некоректні дані проєкту.': 'Invalid project data.',
  'Запис не належить існуючому проєкту або не має назви.':
    'A record has no title or belongs to a missing project.',
  'Некоректний документ.': 'Invalid document.',
  'Некоректне завдання.': 'Invalid task.',
  'Некоректний матеріал.': 'Invalid material.',
  'Посилання має починатися з https:// або http://.': 'Links must start with https:// or http://.',
  'Некоректний вкладений файл.': 'Invalid attached file.',
  'Некоректний стан робочої області.': 'Invalid workspace context.',
  Виконано: 'Completed',
  'Не вдалося відкрити сховище.': 'Could not open local storage.',
  'Закрий інші вкладки Quiet і спробуй знову.': 'Close other Quiet tabs and try again.',
  'Збереження перервано.': 'Saving was interrupted.',
  'Не вдалося відкрити посилання.': 'Could not open the link.',
  Мова: 'Language',
  'Мову застосовано, але зберегти вибір не вдалося.':
    'Language applied, but your preference could not be saved.',
  Вигляд: 'Appearance',
} as const;

export type Message = keyof typeof english;
export type Language = 'uk' | 'en';
const storageKey = 'quiet.language';
const isLanguage = (value: unknown): value is Language => value === 'uk' || value === 'en';
function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(storageKey);
    return isLanguage(saved) ? saved : 'uk';
  } catch {
    return 'uk';
  }
}
let language = readLanguage();
const subscribers = new Set<() => void>();
function applyLanguage() {
  document.documentElement.lang = language;
}
applyLanguage();
window.addEventListener('storage', (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  language = readLanguage();
  applyLanguage();
  subscribers.forEach((notify) => notify());
});

export function t(key: Message, params: Record<string, string | number> = {}): string {
  const text = language === 'en' ? english[key] : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}

export function getLocaleTag() {
  return language === 'uk' ? 'uk-UA' : 'en-GB';
}
const countForms = {
  project: { uk: ['проєкт', 'проєкти', 'проєктів', 'проєкту'], en: ['project', 'projects'] },
  document: {
    uk: ['документ', 'документи', 'документів', 'документа'],
    en: ['document', 'documents'],
  },
  task: { uk: ['завдання', 'завдання', 'завдань', 'завдання'], en: ['task', 'tasks'] },
  material: {
    uk: ['матеріал', 'матеріали', 'матеріалів', 'матеріалу'],
    en: ['material', 'materials'],
  },
  word: { uk: ['слово', 'слова', 'слів', 'слова'], en: ['word', 'words'] },
} as const;
const pluralRules = { uk: new Intl.PluralRules('uk'), en: new Intl.PluralRules('en') };
export function formatCount(kind: keyof typeof countForms, value: number): string {
  const rule = pluralRules[language].select(value);
  const index =
    language === 'en'
      ? rule === 'one'
        ? 0
        : 1
      : rule === 'one'
        ? 0
        : rule === 'few'
          ? 1
          : rule === 'many'
            ? 2
            : 3;
  return `${new Intl.NumberFormat(getLocaleTag()).format(value)} ${countForms[kind][language][index]}`;
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}
function snapshot() {
  return language;
}
function selectLanguage(value: Language): boolean {
  language = value;
  applyLanguage();
  subscribers.forEach((notify) => notify());
  try {
    localStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}
export function useLanguage() {
  return { language: useSyncExternalStore(subscribe, snapshot), selectLanguage };
}
