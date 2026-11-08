import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function useEnglish(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Робоча область' })).toBeEmpty();
  if ((page.viewportSize()?.width ?? 1440) <= 600)
    await page.getByRole('button', { name: 'Відкрити проєкти', exact: true }).click();
  await page.getByRole('button', { name: 'Налаштування', exact: true }).click();
  await page.getByRole('combobox', { name: 'Мова', exact: true }).selectOption('en');
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
}

async function createProject(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1440) <= 600)
    await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('English and appearance preferences persist independently and preserve an empty start', async ({
  page,
}) => {
  await useEnglish(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.locator('body').innerText()).not.toMatch(/[\u0400-\u04ff]/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('main', { name: 'Workspace', exact: true })).toBeEmpty();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('en');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('uk');
  await expect(page.getByRole('heading', { name: 'Налаштування', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('English project, document, task, preview and search flows keep user content intact', async ({
  page,
}) => {
  await useEnglish(page);
  await createProject(page, 'Мій продукт');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('textbox', { name: 'New task', exact: true }).fill('Зібрати прототип');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('0 of 1 completed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Documents/ }).click();
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Untitled');
  await page.getByRole('textbox', { name: 'Document title' }).fill('Власний план');
  await page.getByRole('textbox', { name: 'Document content' }).fill('# SQLite\n\nПерший крок');
  await expect(page.locator('.document-meta')).toContainText('4 words');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SQLite', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).fill('To do');
  await expect(page.getByRole('button', { name: /Зібрати прототип/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).press('Enter');
  await page.getByRole('checkbox', { name: 'Зібрати прототип', exact: true }).check();
  await expect(page.getByText('1 of 1 completed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('uk');
  await page.getByRole('button', { name: 'Закрити', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мій продукт', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Зібрати прототип', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Документи/ }).click();
  await expect(page.getByRole('textbox', { name: 'Назва документа' })).toHaveValue('Власний план');
  await expect(page.getByRole('textbox', { name: 'Вміст документа' })).toHaveValue(
    '# SQLite\n\nПерший крок',
  );
});

test('backup errors, restoration counts and delete confirmations are translated', async ({
  page,
}) => {
  await useEnglish(page);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.getByRole('status')).toContainText(
    'Import canceled: Unsupported backup format.',
  );
  const date = '2026-11-07T10:00:00Z';
  const workspace = {
    version: 1,
    projects: [{ id: 'p1', name: 'Research', description: '', tone: 'violet', createdAt: date }],
    documents: [1, 2].map((id) => ({
      id: `d${id}`,
      projectId: 'p1',
      title: `Document ${id}`,
      content: 'Text',
      updatedAt: date,
    })),
    tasks: [{ id: 't1', projectId: 'p1', title: 'Review', done: false, createdAt: date }],
    materials: [],
    context: { projectId: 'p1', tab: 'overview', documentId: null },
  };
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(workspace)),
    });
  await expect(page.getByRole('dialog', { name: 'Restore workspace?', exact: true })).toContainText(
    '1 project, 2 documents, and 1 task',
  );
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Delete project?', exact: true })).toContainText(
    'Delete “Research”',
  );
  expect(await page.getByRole('dialog').innerText()).not.toMatch(/[\u0400-\u04ff]/);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.locator('.document-list-heading')).toContainText('2 documents');
  await expect(page.locator('.document-meta')).toContainText('1 word');
});

test('language preference updates another open tab', async ({ page, context }) => {
  await useEnglish(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('uk');
  await expect(second.getByRole('button', { name: 'Налаштування', exact: true })).toBeVisible();
  await expect(second.locator('html')).toHaveAttribute('lang', 'uk');
});

test('English navigation and settings fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useEnglish(page);
  await createProject(page, 'Mobile project');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});
