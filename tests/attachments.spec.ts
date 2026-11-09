import { resumeProject } from './helpers';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});
async function start(page: Page) {
  await page.goto('/');
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Files');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page.getByRole('button', { name: /^Materials/ }).click();
}
async function inspect(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        files: { hash: string; codec: string; size: number; storedSize: number }[];
        urls: string[];
      }>((resolve, reject) => {
        const request = indexedDB.open('quiet-workspace');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['workspace', 'attachments']);
          const rows = tx.objectStore('attachments').getAll();
          const workspace = tx.objectStore('workspace').get('current');
          tx.oncomplete = () => {
            resolve({
              files: rows.result.map(({ hash, codec, size, storedSize }) => ({
                hash,
                codec,
                size,
                storedSize,
              })),
              urls: workspace.result.materials.map((m: { url: string }) => m.url),
            });
            db.close();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}
async function saved(page: Page) {
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
}

test('attachments use compressed binary storage, deduplicate and export original bytes', async ({
  page,
}) => {
  await start(page);
  const original = Buffer.from('Repeated text for lossless compression.\n'.repeat(4000));
  for (const name of ['first.txt', 'same.txt']) {
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name, mimeType: 'text/plain', buffer: original });
    await expect(page.locator('.material-row')).toContainText([name]);
    await saved(page);
  }
  const state = await inspect(page);
  expect(state.files).toHaveLength(1);
  expect(state.files[0].codec).toBe('gzip');
  expect(state.files[0].storedSize).toBeLessThan(original.length / 5);
  expect(state.urls[0]).toMatch(/^attachment:/);
  expect(state.urls[0]).toBe(state.urls[1]);
  await page.reload();
  await resumeProject(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download first.txt', exact: true }).click();
  expect(await readFile((await (await pending).path())!)).toEqual(original);
});

test('incompressible and empty files round-trip with no extra compression overhead', async ({
  page,
}) => {
  await start(page);
  const input = randomBytes(65536);
  for (const [name, buffer] of [
    ['random.bin', input],
    ['empty.bin', Buffer.alloc(0)],
  ] as const) {
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
    await expect(page.locator('.material-row')).toContainText([name]);
    await saved(page);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download ${name}`, exact: true }).click();
    expect(await readFile((await (await pending).path())!)).toEqual(buffer);
  }
  const state = await inspect(page);
  for (const file of state.files) {
    expect(file.codec).toBe('raw');
    expect(file.storedSize).toBe(file.size);
  }
});

test('version-one IndexedDB files migrate without losing legacy documents or attachments', async ({
  page,
}) => {
  const date = '2026-11-07T10:00:00Z';
  const bytes = Buffer.from('Legacy file!\n'.repeat(500));
  const fixture = {
    version: 1,
    projects: [{ id: 'p', name: 'Legacy', description: '', tone: 'green', createdAt: date }],
    documents: [
      {
        id: 'd',
        projectId: 'p',
        title: 'Old notes',
        content: '# Original Markdown',
        updatedAt: date,
      },
    ],
    tasks: [],
    materials: [
      {
        id: 'm',
        projectId: 'p',
        title: 'legacy.txt',
        kind: 'file',
        url: 'data:application/octet-stream;base64,' + bytes.toString('base64'),
        size: bytes.length,
        createdAt: date,
      },
    ],
    context: { projectId: 'p', tab: 'materials', documentId: null },
  };
  await page.route('**/legacy-bootstrap', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html></html>' }),
  );
  await page.goto('/legacy-bootstrap');
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('quiet-workspace', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('workspace');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(data, 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    fixture,
  );
  await page.goto('/');
  await resumeProject(page);
  await expect(page.getByRole('heading', { name: 'Legacy', exact: true })).toBeVisible();
  await saved(page);
  const state = await inspect(page);
  expect(state.files).toHaveLength(1);
  expect(state.urls[0]).toMatch(/^attachment:/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download legacy.txt', exact: true }).click();
  expect(await readFile((await (await pending).path())!)).toEqual(bytes);
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.getByRole('textbox', { name: 'Document content' })).toHaveValue(
    '# Original Markdown',
  );
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Formatted text' }).click();
  await expect(
    page
      .getByRole('textbox', { name: 'Document content' })
      .getByRole('heading', { name: 'Original Markdown' }),
  ).toBeVisible();
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(page.getByRole('textbox', { name: 'Document content' })).toHaveAttribute(
    'contenteditable',
    'true',
  );
});

test('corrupt file contents are reported without downloading damaged bytes', async ({ page }) => {
  await start(page);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('valid data') });
  await expect(page.locator('.material-row')).toHaveCount(1);
  await saved(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('quiet-workspace');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('attachments', 'readwrite');
          const store = tx.objectStore('attachments');
          const all = store.getAll();
          all.onsuccess = () => {
            const row = all.result[0];
            row.blob = new Blob(['corrupted!']);
            store.put(row);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await page.getByRole('button', { name: 'Download test.txt', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Download failed/ })).toBeVisible();
  expect(downloaded).toBe(false);
});
