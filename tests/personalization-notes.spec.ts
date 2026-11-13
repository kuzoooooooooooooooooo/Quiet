import { test, expect } from '@playwright/test';
import { seedWorkspace, settingsSection } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});
test('settings show one category at a time and keep choices across navigation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await settingsSection(page, 'appearance');
  await expect(page.locator('[data-section="appearance"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Lake', exact: true }).check();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await settingsSection(page, 'editor');
  await page.getByRole('checkbox', { name: 'Automatic text formatting' }).check();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await settingsSection(page, 'keyboard');
  await expect(page.locator('.shortcut-row')).toHaveCount(6);
  await settingsSection(page, 'updates');
  await expect(page.locator('.update-settings')).toBeVisible();
  await settingsSection(page, 'appearance');
  await expect(page.getByRole('radio', { name: 'Lake', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-background', 'lake');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.home-project-list')).toBeEmpty();
});

test('legacy notes preserve literal text and lines; formatting, undo, search and reload work', async ({
  page,
}) => {
  const stamp = '2026-11-13T10:00:00Z';
  const literal = '<b>Literal markup</b>\nSecond line\n\nLast line';
  await seedWorkspace(page, {
    version: 1,
    notes: [{ id: 'old', title: 'Legacy', content: literal, createdAt: stamp, updatedAt: stamp }],
    projects: [],
    documents: [],
    tasks: [],
    materials: [],
    context: { projectId: null, tab: 'overview', documentId: null },
  });
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Note content' });
  await expect(note).toHaveText(literal, { useInnerText: true });
  await expect(note.locator('b,strong')).toHaveCount(0);
  await note.focus();
  await note.press('Control+a');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(note.locator('b,strong')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(note.locator('b,strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
  await page.reload();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('Second line');
  await page.getByRole('textbox', { name: 'Search workspace' }).press('Enter');
  await expect(note).toHaveText(literal, { useInnerText: true });
  await expect(note.locator('b,strong')).not.toHaveCount(0);
  const downgrade = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const request = indexedDB.open('quiet-workspace', 3);
        request.onerror = () => resolve(request.error?.name ?? 'unknown');
        request.onsuccess = () => {
          request.result.close();
          resolve('opened');
        };
      }),
  );
  expect(downgrade).toBe('VersionError');
});

test('typing shortcuts apply to personal and project notes, and switching them off preserves formatting', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settingsSection(page, 'editor');
  await page.getByRole('checkbox', { name: 'Automatic text formatting' }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Note content' });
  await note.pressSequentially('**Personal bold**');
  await expect(note.locator('b,strong')).toHaveText('Personal bold');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Project notes');
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('button', { name: /^Notes/ })
    .click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await note.pressSequentially('## ');
  await note.pressSequentially('Project heading');
  await expect(note.locator('h2')).toHaveText('Project heading');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settingsSection(page, 'editor');
  await page.getByRole('checkbox', { name: 'Automatic text formatting' }).uncheck();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(note.locator('h2')).toHaveText('Project heading');
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
  await page.reload();
  await page.locator('.home-project').click();
  await expect(note.locator('h2')).toHaveText('Project heading');
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(note.locator('b,strong')).toHaveText('Personal bold');
});

test('settings and note toolbar fit a narrow screen in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const section of ['general', 'appearance', 'editor', 'keyboard', 'updates'] as const) {
    await settingsSection(page, section);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  }
  await settingsSection(page, 'general');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('uk');
  await settingsSection(page, 'appearance');
  await page.getByRole('radio', { name: 'Хвиля', exact: true }).check();
  await page.getByRole('button', { name: 'Закрити', exact: true }).click();
  await page.getByRole('button', { name: 'Відкрити проєкти', exact: true }).click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Нотатки', exact: true }).click();
  await page.getByRole('button', { name: 'Створити нотатку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Текст нотатки' }).fill('Власна нотатка');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
