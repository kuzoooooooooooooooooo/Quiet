import { openDatabase } from './localDatabase';
import type { Material, Workspace } from './model';
import { t } from './i18n';
import { attachmentLimit } from './attachmentLimits';
const desktop = '__TAURI_INTERNALS__' in window;
const limit = attachmentLimit;
export const storedFile = /^attachment:([a-f0-9]{64})$/;
type Stored = {
  hash: string;
  codec: 'raw' | 'gzip';
  size: number;
  storedSize: number;
  blob: Blob;
  touched: number;
};
async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
async function transform(blob: Blob, decompress = false): Promise<Blob> {
  const stream = blob
    .stream()
    .pipeThrough(decompress ? new DecompressionStream('gzip') : new CompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error(t('Некоректний вкладений файл.'));
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: 'application/octet-stream' });
}
export async function storeAttachment(
  blob: Blob,
): Promise<{ url: string; size: number; storedSize: number }> {
  if (blob.size > limit) throw new Error(t('Максимальний розмір файлу — 25 МБ.'));
  const bytes = await blob.arrayBuffer();
  if (desktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ hash: string; size: number; storedSize: number }>(
      'store_attachment',
      new Uint8Array(bytes),
    );
    return { url: `attachment:${result.hash}`, size: result.size, storedSize: result.storedSize };
  }
  const hash = await digest(bytes);
  let packed = blob;
  let codec: Stored['codec'] = 'raw';
  if (blob.size > 128) {
    // Near-incompressible input can grow beyond the limit; raw storage remains valid.
    const compressed = await import('./compression')
      .then(({ compressAttachment }) => compressAttachment(bytes))
      .catch(() => blob);
    if (compressed.size < blob.size) {
      packed = compressed;
      codec = 'gzip';
    }
  }
  const entry: Stored = {
    hash,
    codec,
    size: blob.size,
    storedSize: packed.size,
    blob: packed,
    touched: Date.now(),
  };
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('attachments', 'readwrite');
    tx.objectStore('attachments').put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return { url: `attachment:${hash}`, size: entry.size, storedSize: entry.storedSize };
}
export async function readAttachment(material: Pick<Material, 'url' | 'size'>): Promise<Blob> {
  const hash = storedFile.exec(material.url)?.[1];
  if (!hash) {
    const data = material.url.split(',')[1];
    if (
      !material.url.startsWith('data:application/octet-stream;base64,') ||
      (!data && material.size !== 0)
    )
      throw new Error(t('Некоректний вкладений файл.'));
    const raw = atob(data);
    const blob = new Blob([Uint8Array.from(raw, (c) => c.charCodeAt(0))]);
    if (blob.size !== material.size || blob.size > limit)
      throw new Error(t('Некоректний вкладений файл.'));
    return blob;
  }
  let blob: Blob;
  if (desktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes = await invoke<ArrayBuffer>('load_attachment', { hash });
    blob = new Blob([bytes]);
  } else {
    const db = await openDatabase();
    const entry = await new Promise<Stored>((resolve, reject) => {
      const request = db.transaction('attachments').objectStore('attachments').get(hash);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!entry || !['raw', 'gzip'].includes(entry.codec))
      throw new Error(t('Не вдалося прочитати файл.'));
    blob = entry.codec === 'gzip' ? await transform(entry.blob, true) : entry.blob;
  }
  if (
    blob.size !== material.size ||
    blob.size > limit ||
    (await digest(await blob.arrayBuffer())) !== hash
  )
    throw new Error(t('Некоректний вкладений файл.'));
  return blob;
}
export async function prepareAttachments(workspace: Workspace): Promise<Workspace> {
  const materials: Material[] = [];
  for (const material of workspace.materials) {
    materials.push(
      material.kind === 'file' && !storedFile.test(material.url)
        ? { ...material, ...(await storeAttachment(await readAttachment(material))) }
        : material,
    );
  }
  return { ...workspace, materials };
}
// Run once at startup, when there is no in-session deletion Undo to preserve.
export async function pruneAttachments(workspace: Workspace): Promise<void> {
  if (desktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('prune_attachments');
    return;
  }
  const keep = new Set(workspace.materials.map((m) => storedFile.exec(m.url)?.[1]).filter(Boolean));
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('attachments', 'readwrite');
    const cursor = tx.objectStore('attachments').openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (row) {
        if (!keep.has(String(row.key)) && row.value.touched < Date.now() - 86400000) row.delete();
        row.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
