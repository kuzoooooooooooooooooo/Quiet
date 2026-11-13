import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function useEnglish(page: Page) {
  await page.goto('/');
  await expect(page.locator('.home-project-list')).toBeEmpty();
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
  await expect(page.locator('.home-project-list')).toBeEmpty();
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
  await page.getByRole('textbox', { name: 'Document content' }).fill('SQLite\n\nМій перший крок');
  await expect(page.locator('.document-meta')).toContainText('4 words');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.rich-content')).toContainText('SQLite');
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).fill('To do');
  await expect(page.getByRole('button', { name: /Зібрати прототип/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).press('Enter');
  await page.getByRole('checkbox', { name: 'Зібрати прототип', exact: true }).click();
  await expect(page.getByText('1 of 1 completed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('uk');
  await page.getByRole('button', { name: 'Закрити', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мій продукт', exact: true })).toBeVisible();
  await page.locator('.completed-tasks > summary').click();
  await expect(page.getByRole('checkbox', { name: 'Зібрати прототип', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Документи/ }).click();
  await expect(page.getByRole('textbox', { name: 'Назва документа' })).toHaveValue('Власний план');
  await expect(page.getByRole('textbox', { name: 'Вміст документа' })).toHaveText(
    'SQLite\n\nМій перший крок',
    { useInnerText: true },
  );
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
