import { t } from './i18n';
import { emptyWorkspace, validateWorkspace } from './model';
import type { Workspace } from './model';
import { openDatabase } from './localDatabase';
import { prepareAttachments, pruneAttachments } from './attachments';

export const isDesktop = '__TAURI_INTERNALS__' in window;

async function read(): Promise<unknown> {
  if (isDesktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('load_workspace');
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace', 'readonly');
    const request = tx.objectStore('workspace').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(workspace: Workspace): Promise<void> {
  if (isDesktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_workspace', { workspace });
    return;
  }
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite');
    tx.objectStore('workspace').put(workspace, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error(t('Збереження перервано.')));
  });
}

let queue = Promise.resolve();
export function saveWorkspace(workspace: Workspace): Promise<void> {
  const operation = queue.catch(() => undefined).then(() => write(workspace));
  queue = operation;
  return operation;
}

export async function loadWorkspace(): Promise<Workspace> {
  const data = await read();
  if (data === undefined || data === null) {
    const empty = emptyWorkspace();
    await saveWorkspace(empty);
    return empty;
  }
  const validated = validateWorkspace(data, true);
  const migrated = await prepareAttachments(validated);
  if (validated.materials.some((m) => m.kind === 'file' && m.url.startsWith('data:')))
    await saveWorkspace(migrated);
  // GC is optional maintenance; failure must never hide a valid workspace.
  await pruneAttachments(migrated).catch(() => undefined);
  return migrated;
}

export async function openExternal(url: string): Promise<void> {
  if (isDesktop) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else window.open(url, '_blank', 'noopener,noreferrer');
}

export async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  const name = filename.replace(/[\\/:*?"<>|]/g, '_');
  if (isDesktop) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({ defaultPath: name });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
