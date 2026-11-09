import { resumeProject, seedWorkspace } from './helpers';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Налаштування', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Налаштування' })).toBeVisible();
}

test('fresh workspace stays empty on reload and creates only user content', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await expect(page.locator('.project-link')).toHaveCount(0);
  await expect(page.getByText('Місце для важливого.', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await page.getByRole('button', { name: 'Створити проєкт', exact: true }).click();
  await page.getByLabel('Назва проєкту').fill('Власний проєкт');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Створити проєкт', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Власний проєкт', exact: true })).toBeVisible();
  await expect(page.locator('.task-row,.document-card,.material-row')).toHaveCount(0);
  await expect(page.locator('.focus-banner,.sidebar-note,.workspace-footnote')).toHaveCount(0);
  await page.getByRole('button', { name: 'Меню проєкту', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Видалити проєкт', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Видалити проєкт', exact: true })
    .click();
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await expect(page.getByText('Проєкт видалено.', { exact: true })).toBeVisible();
  // Confirm the deletion reached durable storage before opening a new app instance.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('quiet-workspace');
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction('workspace', 'readonly');
              const read = tx.objectStore('workspace').get('current');
              read.onsuccess = () => resolve(read.result.projects.length);
              read.onerror = () => reject(read.error);
              tx.oncomplete = () => db.close();
            };
            request.onerror = () => reject(request.error);
          }),
      ),
    )
    .toBe(0);
  await page.reload();
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await expect(page.locator('.project-link')).toHaveCount(0);
});

test('light and dark appearance apply to the app and persist across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'Системна' })).toBeChecked();
  await page.getByRole('radio', { name: 'Темна', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(37, 36, 42)');
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(27, 26, 32)',
  );
  await page.getByRole('button', { name: 'Закрити', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'Темна', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Світла', exact: true }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('system appearance tracks OS changes while explicit appearance stays fixed', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'Системна' })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Темна', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Системна' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'Системна' })).toBeChecked();
});

test('appearance changes preserve existing documents and the selected project', async ({
  page,
}) => {
  const fixture = {
    version: 1,
    projects: [
      {
        id: 'old-project',
        name: 'Існуючий проєкт',
        description: '',
        tone: 'blue',
        createdAt: '2026-11-07T10:00:00Z',
      },
    ],
    documents: [
      {
        id: 'old-doc',
        projectId: 'old-project',
        title: 'Важливі записи',
        content: 'Мій власний текст',
        updatedAt: '2026-11-07T10:00:00Z',
      },
    ],
    tasks: [],
    materials: [],
    context: { projectId: 'old-project', tab: 'documents', documentId: 'old-doc' },
  };
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await seedWorkspace(page, fixture);
  await resumeProject(page);
  await openSettings(page);
  await page.getByRole('radio', { name: 'Темна', exact: true }).check();
  await page.getByRole('button', { name: 'Закрити', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Збережено на пристрої' })).toBeVisible();
  await page.reload();
  await resumeProject(page);
  await expect(page.getByRole('heading', { name: 'Існуючий проєкт' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Вміст документа' })).toHaveValue(
    'Мій власний текст',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
