import { t } from './i18n';
import type { Note, Project, Tab } from './model';
export const moduleIds = [
  'tasks',
  'documents',
  'materials',
  'notes',
  'snippets',
  'tables',
] as const;
export type ModuleId = (typeof moduleIds)[number];
export type Sort = 'manual' | 'name' | 'newest';
export const defaultModules: ModuleId[] = ['tasks', 'documents', 'materials'];
export const moduleLabels = {
  tasks: 'Завдання',
  documents: 'Документи',
  materials: 'Матеріали',
  notes: 'Нотатки',
  snippets: 'Фрагменти коду',
  tables: 'Таблиці',
} as const;
export interface Snippet {
  id: string;
  title: string;
  content: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}
export interface Sheet {
  id: string;
  title: string;
  columns: { id: string; title: string }[];
  rows: { id: string; cells: string[] }[];
  createdAt: string;
  updatedAt: string;
}
export interface ProjectKit {
  enabled: ModuleId[];
  notes: Note[];
  snippets: Snippet[];
  tables: Sheet[];
  preferences: {
    lastTab?: Tab;
    documentId?: string;
    taskView?: 'list' | 'board';
    sort?: Partial<Record<ModuleId, Sort>>;
    order?: Partial<Record<ModuleId, string[]>>;
    active?: Partial<Record<ModuleId, string>>;
  };
}
export function getKit(project?: Project): ProjectKit {
  return (
    project?.kit ?? {
      enabled: [...defaultModules],
      notes: [],
      snippets: [],
      tables: [],
      preferences: {},
    }
  );
}
export function enabled(project: Project, id: ModuleId) {
  return getKit(project).enabled.includes(id);
}
export function arrange<
  T extends { id: string; title: string; createdAt?: string; updatedAt?: string },
>(items: T[], kit: ProjectKit, kind: ModuleId): T[] {
  const mode = kit.preferences.sort?.[kind] ?? 'manual';
  const order = kit.preferences.order?.[kind] ?? [];
  const positions = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) =>
    mode === 'name'
      ? a.title.localeCompare(b.title)
      : mode === 'newest'
        ? (b.createdAt ?? b.updatedAt ?? '').localeCompare(a.createdAt ?? a.updatedAt ?? '')
        : (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length),
  );
}
// Validate extension data before showing or rewriting an existing workspace.
export function validateKit(value: unknown, ids: Set<string>): void {
  const object = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === 'object' && !Array.isArray(x);
  const text = (x: unknown): x is string => typeof x === 'string';
  const fail = () => {
    throw Error(t('Некоректні дані проєкту.'));
  };
  if (!object(value)) return fail();
  const k = value;
  if (
    !Array.isArray(k.enabled) ||
    k.enabled.some((x) => !moduleIds.includes(x)) ||
    new Set(k.enabled).size !== k.enabled.length
  )
    return fail();
  for (const kind of ['notes', 'snippets', 'tables'] as const) {
    if (!Array.isArray(k[kind]) || k[kind].length > 5000) return fail();
    for (const row of k[kind]) {
      if (
        !object(row) ||
        !text(row.id) ||
        !row.id ||
        ids.has(row.id) ||
        !text(row.title) ||
        !row.title.trim() ||
        !text(row.createdAt) ||
        !Number.isFinite(Date.parse(row.createdAt)) ||
        !text(row.updatedAt) ||
        !Number.isFinite(Date.parse(row.updatedAt))
      )
        return fail();
      ids.add(row.id);
      if (ids.size > 50_000) return fail();
      if (kind !== 'tables' && (!text(row.content) || row.content.length > 1_000_000))
        return fail();
      if (kind === 'snippets' && (!text(row.language) || row.language.length > 40)) return fail();
      if (kind === 'tables') {
        if (
          !Array.isArray(row.columns) ||
          !row.columns.length ||
          row.columns.length > 12 ||
          !Array.isArray(row.rows) ||
          row.rows.length > 500
        )
          return fail();
        const nested = new Set<string>();
        for (const col of row.columns) {
          if (
            !object(col) ||
            !text(col.id) ||
            !col.id ||
            nested.has(col.id) ||
            !text(col.title) ||
            !col.title.trim()
          )
            return fail();
          nested.add(col.id);
        }
        for (const r of row.rows) {
          if (
            !object(r) ||
            !text(r.id) ||
            !r.id ||
            nested.has(r.id) ||
            !Array.isArray(r.cells) ||
            r.cells.length !== row.columns.length ||
            r.cells.some((c) => !text(c) || c.length > 10000)
          )
            return fail();
          nested.add(r.id);
        }
      }
    }
  }
  if (!object(k.preferences)) return fail();
  const p = k.preferences;
  if (p.lastTab !== undefined && !['overview', ...moduleIds].includes(p.lastTab as string))
    return fail();
  if (p.documentId !== undefined && !text(p.documentId)) return fail();
  if (p.taskView !== undefined && !['list', 'board'].includes(p.taskView as string)) return fail();
  for (const key of ['sort', 'order', 'active'])
    if (p[key] !== undefined) {
      if (!object(p[key])) return fail();
      for (const [id, v] of Object.entries(p[key])) {
        if (!moduleIds.includes(id as ModuleId)) return fail();
        if (key === 'sort' && !['manual', 'name', 'newest'].includes(v as string)) return fail();
        if (key === 'order' && (!Array.isArray(v) || v.length > 50000 || v.some((x) => !text(x))))
          return fail();
        if (key === 'active' && !text(v)) return fail();
      }
    }
}
