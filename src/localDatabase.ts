import { t } from './i18n';
let database: Promise<IDBDatabase> | undefined;
export function openDatabase(): Promise<IDBDatabase> {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('quiet-workspace', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace');
      if (!db.objectStoreNames.contains('attachments'))
        db.createObjectStore('attachments', { keyPath: 'hash' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      database = undefined;
      reject(request.error ?? new Error(t('Не вдалося відкрити сховище.')));
    };
    request.onblocked = () => {
      database = undefined;
      reject(new Error(t('Закрий інші вкладки Quiet і спробуй знову.')));
    };
  }));
}
