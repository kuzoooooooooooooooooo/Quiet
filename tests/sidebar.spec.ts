import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});

async function project(page: Page, name = 'Notes') {
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Workspace', exact: true })).toBeEmpty();
  await project(page);
}

test('collapsing preserves the document, caret and saved context after reload', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New document', exact: true }).click();
  await page.getByRole('textbox', { name: 'Document title', exact: true }).fill('Working notes');
  const content = page.getByRole('textbox', { name: 'Document content', exact: true });
  await content.fill('Keep this text and its cursor position.');
  await content.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 5);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  await expect(content).toBeFocused();
  expect(await content.evaluate(() => window.getSelection()?.anchorOffset)).toBe(5);
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  await expect(page.getByRole('textbox', { name: 'Document title', exact: true })).toHaveValue(
    'Working notes',
  );
  await expect(content).toHaveText('Keep this text and its cursor position.');
  await expect(page.locator('.sidebar')).toHaveCSS('width', '56px');
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-collapsed/);
});

test('compact rail keeps project creation, project navigation, search and settings accessible', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Workspace', exact: true })).toBeEmpty();
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await project(page, 'Notes');
  await project(page, 'Code');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  await expect(page.locator('.project-link .rail-label').first()).not.toBeVisible();
  await page.getByRole('button', { name: 'Search anything', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).fill('Code');
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Code', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Backups', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Search workspace', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search workspace', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
});

test('mobile drawer stays readable after a desktop collapse and preserves the desktop preference', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await expect(page.locator('.project-link .rail-label').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.sidebar')).toHaveCSS('width', '56px');
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
});

test('shortcut respects open dialogs and sidebar controls follow the chosen language', async ({
  page,
}) => {
  await start(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-collapsed/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('uk');
  await page.getByRole('button', { name: 'Закрити', exact: true }).click();
  await page.getByRole('button', { name: 'Розгорнути панель', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Згорнути панель', exact: true })).toBeVisible();
});
