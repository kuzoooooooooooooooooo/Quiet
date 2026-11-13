import { settingsSection } from './helpers';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});
async function save(page: Page) {
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
}
async function project(page: Page, name: string, modules?: string[]) {
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  if (modules) {
    await page.getByRole('button', { name: 'Empty project', exact: true }).click();
    for (const m of modules) await page.getByRole('checkbox', { name: m, exact: true }).check();
  }
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function modules(page: Page) {
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit project', exact: true }).click();
}
async function tab(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('button', { name: new RegExp('^' + name) })
    .click();
}

test('empty and standard kits; hidden modules preserve content, search and edit do not lose data', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Custom', []);
  await expect(
    page.getByRole('navigation', { name: 'Project sections' }).getByRole('button'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['New table']);
  await page.keyboard.press('Escape');
  await modules(page);
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Documents', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await tab(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Project thought');
  await page.getByRole('textbox', { name: 'Note content' }).fill('Hidden content survives');
  await save(page);
  await modules(page);
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Project sections' })
      .getByRole('button', { name: /^Notes/ }),
  ).toHaveCount(0);
  await save(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('Hidden content');
  await page.getByRole('textbox', { name: 'Search workspace' }).press('Enter');
  await expect(page.getByText('Module is hidden', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enable', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Hidden content survives',
    { useInnerText: true },
  );
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator('.notes-layout')).toHaveCount(0);
  await project(page, 'Standard');
  await expect(
    page.getByRole('navigation', { name: 'Project sections' }).getByRole('button'),
  ).toHaveCount(4);
});

test('project snippets, tables and notes persist independently and are searchable; deletion supports undo', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Work', ['Notes', 'Code snippets', 'Tables']);
  await tab(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('   ');
  await page.getByRole('textbox', { name: 'Note content' }).fill('Personal project note');
  await tab(page, 'Code snippets');
  await page.getByRole('button', { name: 'New snippet', exact: true }).click();
  await page.getByRole('textbox', { name: 'Snippet title' }).fill('Rust example');
  await page.getByRole('combobox', { name: 'Code language' }).selectOption('rust');
  await page
    .getByRole('textbox', { name: 'Code', exact: true })
    .fill('fn main() { println!("hello"); }');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'fn main() { println!("hello"); }',
  );
  await tab(page, 'Tables');
  await page.getByRole('button', { name: 'New table', exact: true }).click();
  await page.getByRole('button', { name: 'Create table', exact: true }).click();
  await page.getByRole('textbox', { name: 'Table title' }).fill('Comparison');
  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  await page.getByRole('textbox', { name: 'Cell 1, 1', exact: true }).fill('SQLite');
  await page.getByRole('textbox', { name: 'Cell 1, 2', exact: true }).fill('local');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect(await readFile((await (await pending).path())!, 'utf8')).toContain('"SQLite","local"');
  await save(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.locator('.project-link').filter({ hasText: 'Work' }).click();
  await expect(page.getByRole('textbox', { name: 'Cell 1, 1' })).toHaveValue('SQLite');
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('println');
  await page.getByRole('textbox', { name: 'Search workspace' }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'Code', exact: true })).toHaveValue(
    'fn main() { println!("hello"); }',
  );
  await page.locator('.kit-list button').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.snippet-code')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Code', exact: true })).toContainText('println');
});

test('task board shares records with list and remembers each project view and ordering', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Board');
  await tab(page, 'Tasks');
  for (const title of ['Zulu', 'Alpha', 'Middle']) {
    await page.getByRole('textbox', { name: 'New task', exact: true }).fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('name');
  await expect(page.locator('.task-row .inline-name-button > span')).toHaveText([
    'Alpha',
    'Middle',
    'Zulu',
  ]);
  await page.locator('.task-row').filter({ hasText: 'Zulu' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
  await expect(page.locator('.task-row .inline-name-button > span')).toHaveText([
    'Alpha',
    'Zulu',
    'Middle',
  ]);
  await page
    .locator('.task-view-controls')
    .getByRole('button', { name: 'Board', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Task status Zulu', exact: true }).selectOption('doing');
  await expect(page.locator('.board-column').nth(1)).toContainText('Zulu');
  await page.getByRole('combobox', { name: 'Task status Alpha', exact: true }).selectOption('done');
  await expect(page.getByRole('checkbox', { name: 'Alpha', exact: true })).toBeChecked();
  await project(page, 'Other');
  await page.locator('.project-link').filter({ hasText: 'Board' }).click();
  await expect(page.locator('.task-board')).toBeVisible();
  await save(page);
  await page.reload();
  await expect(page.locator('.home-page')).toBeVisible();
  await page.locator('.project-link').filter({ hasText: 'Board' }).click();
  await expect(page.locator('.board-column').nth(1)).toContainText('Zulu');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Alpha', exact: true })).toBeHidden();
  await page.locator('.completed-tasks > summary').click();
  await expect(page.locator('.task-row .inline-name-button > span')).toHaveText([
    'Zulu',
    'Middle',
    'Alpha',
  ]);
});

test('multiple file upload, drag-and-drop, ZIP originals, batch delete and undo', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Files');
  await tab(page, 'Materials');
  await page.locator('input[type=file]').setInputFiles([
    { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('Original one') },
    { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('Original two') },
  ]);
  await expect(page.locator('.material-row')).toHaveCount(2);
  const data = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(['Dropped file'], 'dropped.txt', { type: 'text/plain' }));
    return d;
  });
  await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.locator('.material-row')).toHaveCount(3);
  await save(page);
  await page.getByRole('checkbox', { name: 'Select all files', exact: true }).check();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('Files.zip');
  const zip = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(zip)).toHaveLength(3);
  expect(strFromU8(zip['same.txt'])).toBe('Original one');
  expect(strFromU8(zip['same (2).txt'])).toBe('Original two');
  expect(strFromU8(zip['dropped.txt'])).toBe('Dropped file');
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete selected', exact: true })
    .click();
  await expect(page.locator('.material-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(3);
  await save(page);
});
test('new modules, board and full-window backgrounds fit mobile and both themes', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Mobile', ['Notes', 'Code snippets', 'Tables', 'Tasks']);
  await tab(page, 'Tables');
  await page.getByRole('button', { name: 'New table', exact: true }).click();
  await page.getByRole('button', { name: 'Create table', exact: true }).click();
  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await tab(page, 'Tasks');
  await page
    .locator('.task-view-controls')
    .getByRole('button', { name: 'Board', exact: true })
    .click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settingsSection(page, 'appearance');
  await page.getByRole('radio', { name: 'Ocean', exact: true }).check();
  await settingsSection(page, 'appearance');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
