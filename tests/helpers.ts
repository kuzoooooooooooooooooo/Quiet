import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function seedWorkspace(page: Page, data: unknown) {
  await page.route('**/test-bootstrap', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html></html>' }),
  );
  await page.goto('/test-bootstrap');
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('quiet-workspace');
        request.onupgradeneeded = () => {
          for (const name of ['workspace', 'attachments'])
            if (!request.result.objectStoreNames.contains(name))
              request.result.createObjectStore(
                name,
                name === 'attachments' ? { keyPath: 'hash' } : undefined,
              );
        };
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(data, 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    data,
  );
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
}

// Persistence tests now navigate explicitly: every new app instance starts on Home.
export async function resumeProject(page: Page) {
  await expect(page.getByRole('main')).toBeVisible();
  if (!(await page.locator('.home-page').count())) return;
  const context = await page.evaluate(
    () =>
      new Promise<{ id: string; tab: string; doc: string | null; language: string } | null>(
        (resolve) => {
          const request = indexedDB.open('quiet-workspace');
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction('workspace'),
              read = tx.objectStore('workspace').get('current');
            read.onsuccess = () => {
              const w = read.result,
                p = w?.projects?.find((p: { id: string }) => p.id === w.context?.projectId);
              resolve(
                p
                  ? {
                      id: p.id,
                      tab: w.context.tab,
                      doc:
                        w.documents.find((d: { id: string }) => d.id === w.context.documentId)
                          ?.title ?? null,
                      language: localStorage.getItem('quiet.language') ?? 'uk',
                    }
                  : null,
              );
            };
            tx.oncomplete = () => db.close();
          };
        },
      ),
  );
  if (!context) return;
  const mobile = (page.viewportSize()?.width ?? 1440) <= 600;
  if (mobile) await page.locator('.mobile-menu').click();
  await page.locator(`.project-link[data-context-id="${context.id}"]`).click();
  const labels =
    context.language === 'en'
      ? { documents: 'Documents', tasks: 'Tasks', materials: 'Materials' }
      : { documents: 'Документи', tasks: 'Завдання', materials: 'Матеріали' };
  if (context.tab in labels)
    await page
      .getByRole('button', { name: new RegExp('^' + labels[context.tab as keyof typeof labels]) })
      .click();
  if (context.tab === 'documents' && context.doc)
    await page.locator('.document-list-item').filter({ hasText: context.doc }).click();
}

export async function settingsSection(
  page: Page,
  section: 'general' | 'appearance' | 'editor' | 'keyboard' | 'updates',
) {
  await page.locator(`.settings-nav [data-section="${section}"]`).click();
}
