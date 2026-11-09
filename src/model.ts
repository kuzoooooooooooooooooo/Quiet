import { t as translate } from './i18n';
import { attachmentLimit } from './attachmentLimits';
import { documentText } from './documentHtml';
import type { Message } from './i18n';
export type Tab = 'overview' | 'documents' | 'tasks' | 'materials';
export type Tone = 'green' | 'blue' | 'orange' | 'violet';
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  tone: Tone;
  createdAt: string;
}
export interface Document {
  id: string;
  projectId: string;
  title: string;
  content: string;
  format?: 'markdown' | 'html';
  updatedAt: string;
}
export interface Task {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
  createdAt: string;
}
export interface Material {
  id: string;
  projectId: string;
  title: string;
  kind: 'link' | 'file';
  url: string;
  size: number;
  storedSize?: number;
  fileType?: string;
  createdAt: string;
}
export interface Workspace {
  version: 1;
  notes: Note[];
  projects: Project[];
  documents: Document[];
  tasks: Task[];
  materials: Material[];
  context: { projectId: string | null; tab: Tab; documentId: string | null };
}

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const tabs: { id: Tab; label: Message }[] = [
  { id: 'overview', label: 'Огляд' },
  { id: 'documents', label: 'Документи' },
  { id: 'tasks', label: 'Завдання' },
  { id: 'materials', label: 'Матеріали' },
];

export function emptyWorkspace(): Workspace {
  return {
    version: 1,
    notes: [],
    projects: [],
    documents: [],
    tasks: [],
    materials: [],
    context: { projectId: null, tab: 'overview', documentId: null },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown) => isText(v) && Number.isFinite(Date.parse(v));

export function validateWorkspace(input: unknown, allowStoredFiles = false): Workspace {
  if (!isObject(input) || input.version !== 1 || !isObject(input.context))
    throw new Error(translate('Непідтримуваний формат резервної копії.'));
  const { projects, documents, tasks, materials, context } = input;
  const notes = input.notes ?? [];
  if (!Array.isArray(notes)) throw new Error(translate('Некоректна нотатка.'));
  if (![projects, documents, tasks, materials].every(Array.isArray))
    throw new Error(translate('У копії відсутні необхідні дані.'));
  const rows = [
    ...notes,
    ...(projects as unknown[]),
    ...(documents as unknown[]),
    ...(tasks as unknown[]),
    ...(materials as unknown[]),
  ];
  if (rows.length > 50_000) throw new Error(translate('Забагато записів у резервній копії.'));
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isObject(row) || !isText(row.id) || !row.id || ids.has(row.id))
      throw new Error(translate('Некоректні або повторювані ідентифікатори.'));
    ids.add(row.id);
  }
  for (const note of notes) {
    if (
      !isObject(note) ||
      !isText(note.title) ||
      !note.title.trim() ||
      !isText(note.content) ||
      !isDate(note.createdAt) ||
      !isDate(note.updatedAt)
    )
      throw new Error(translate('Некоректна нотатка.'));
  }
  const projectIds = new Set<string>();
  for (const p of projects as unknown[]) {
    if (
      !isObject(p) ||
      !isText(p.name) ||
      !p.name.trim() ||
      !isText(p.description) ||
      !['green', 'blue', 'orange', 'violet'].includes(p.tone as string) ||
      !isDate(p.createdAt)
    )
      throw new Error(translate('Некоректні дані проєкту.'));
    projectIds.add(p.id as string);
  }
  for (const row of [
    ...(documents as unknown[]),
    ...(tasks as unknown[]),
    ...(materials as unknown[]),
  ]) {
    if (
      !isObject(row) ||
      !isText(row.projectId) ||
      !projectIds.has(row.projectId) ||
      !isText(row.title) ||
      !row.title.trim()
    )
      throw new Error(translate('Запис не належить існуючому проєкту або не має назви.'));
  }
  for (const d of documents as Record<string, unknown>[])
    if (
      !isText(d.content) ||
      !isDate(d.updatedAt) ||
      (d.format !== undefined && !['markdown', 'html'].includes(d.format as string))
    )
      throw new Error(translate('Некоректний документ.'));
  for (const t of tasks as Record<string, unknown>[])
    if (typeof t.done !== 'boolean' || !isDate(t.createdAt))
      throw new Error(translate('Некоректне завдання.'));
  for (const m of materials as Record<string, unknown>[]) {
    if (
      !isText(m.url) ||
      !isText(m.title) ||
      !isDate(m.createdAt) ||
      !Number.isSafeInteger(m.size) ||
      (m.size as number) < 0 ||
      !['file', 'link'].includes(m.kind as string)
    )
      throw new Error(translate('Некоректний матеріал.'));
    if (m.kind === 'link' && !safeUrl(m.url))
      throw new Error(translate('Посилання має починатися з https:// або http://.'));
    if (
      m.kind === 'file' &&
      ((!/^data:application\/octet-stream;base64,[A-Za-z0-9+/]*={0,2}$/.test(m.url) &&
        !(allowStoredFiles && /^attachment:[a-f0-9]{64}$/.test(m.url))) ||
        (m.size as number) > attachmentLimit)
    )
      throw new Error(translate('Некоректний вкладений файл.'));
  }
  if (
    !tabs.some((t) => t.id === context.tab) ||
    !(context.projectId === null || projectIds.has(context.projectId as string)) ||
    !(
      context.documentId === null ||
      (documents as Document[]).some(
        (d) => d.id === context.documentId && d.projectId === context.projectId,
      )
    )
  )
    throw new Error(translate('Некоректний стан робочої області.'));
  return { ...input, notes } as unknown as Workspace;
}

export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export type SearchResult = {
  id: string;
  projectId: string | null;
  kind: 'project' | 'document' | 'task' | 'material' | 'note';
  title: string;
  detail: string;
};
export function searchWorkspace(workspace: Workspace, query: string): SearchResult[] {
  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const rows: SearchResult[] = [
    ...workspace.notes.map((note) => ({
      id: note.id,
      projectId: null,
      kind: 'note' as const,
      title: note.title,
      detail: note.content,
    })),
    ...workspace.projects.map((p) => ({
      id: p.id,
      projectId: p.id,
      kind: 'project' as const,
      title: p.name,
      detail: p.description,
    })),
    ...workspace.documents.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      kind: 'document' as const,
      title: d.title,
      detail: documentText(d),
    })),
    ...workspace.tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      kind: 'task' as const,
      title: t.title,
      detail: t.done ? translate('Виконано') : translate('До роботи'),
    })),
    ...workspace.materials.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      kind: 'material' as const,
      title: m.title,
      detail: m.kind === 'link' ? m.url : translate('Файл'),
    })),
  ];
  return rows
    .filter((r) =>
      terms.every((term) =>
        `${r.title} ${r.detail}`.normalize('NFKC').toLocaleLowerCase().includes(term),
      ),
    )
    .sort(
      (a, b) =>
        Number(b.title.toLocaleLowerCase().includes(terms.join(' '))) -
        Number(a.title.toLocaleLowerCase().includes(terms.join(' '))),
    )
    .slice(0, 40);
}
