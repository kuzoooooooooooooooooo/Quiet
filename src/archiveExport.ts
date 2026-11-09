import type { Material } from './model';
import { readAttachment } from './attachments';
import { downloadBlob } from './storage';
import { t } from './i18n';
export async function exportFiles(files: Material[], projectName: string) {
  if (!files.length) return;
  if (files.reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024)
    throw Error(t('Вибери файли загальним розміром до 100 МБ.'));
  const used = new Set<string>();
  const parts: { name: string; bytes: ArrayBuffer }[] = [];
  for (const file of files) {
    const base = file.title.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+$/, 'file') || 'file';
    let name = base,
      index = 2;
    while (used.has(name.toLocaleLowerCase())) {
      const dot = base.lastIndexOf('.');
      name =
        dot > 0 ? base.slice(0, dot) + ` (${index++})` + base.slice(dot) : base + ` (${index++})`;
    }
    used.add(name.toLocaleLowerCase());
    parts.push({ name, bytes: await (await readAttachment(file)).arrayBuffer() });
  }
  const worker = new Worker(new URL('./archiveExport.worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    const zip = await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ bytes?: ArrayBuffer }>) =>
        e.data.bytes
          ? resolve(new Blob([e.data.bytes], { type: 'application/zip' }))
          : reject(Error(t('Не вдалося завантажити файл.')));
      worker.onerror = () => reject(Error(t('Не вдалося завантажити файл.')));
      worker.postMessage(
        { files: parts },
        parts.map((p) => p.bytes),
      );
    });
    return await downloadBlob(zip, projectName + '.zip');
  } finally {
    worker.terminate();
  }
}
