import { resumeProject } from './helpers';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});

async function project(page: Page, name = 'Research') {
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
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await project(page);
}
async function quick(page: Page, name: string) {
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
async function task(page: Page, title: string) {
  await quick(page, 'New task');
  await page.getByRole('textbox', { name: 'New task', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}
async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
}

test('inline names save on Enter and blur, cancel on Escape, and reject empty names', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Rename project', exact: true });
  await expect(name).toBeFocused();
  await name.fill('Product research');
  await name.press('Enter');
  await expect(page.getByRole('heading', { name: 'Product research', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  await name.fill('Discard me');
  await name.press('Escape');
  await expect(page.getByRole('heading', { name: 'Product research', exact: true })).toBeVisible();
  await task(page, 'Draft');
  await page.getByRole('button', { name: 'Edit task Draft', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit task Draft', exact: true }).fill('Write the brief');
  await page.getByRole('textbox', { name: 'Edit task Draft', exact: true }).press('Tab');
  await expect(page.getByRole('checkbox', { name: 'Write the brief', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit task Write the brief', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit task Write the brief', exact: true }).fill('  ');
  await page
    .getByRole('textbox', { name: 'Edit task Write the brief', exact: true })
    .press('Enter');
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(page.getByRole('heading', { name: 'Product research', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Write the brief', exact: true })).toBeVisible();
});

test('quick creation is available from every section and supports keyboard navigation', async ({
  page,
}) => {
  await start(page);
  const create = page.getByRole('button', { name: 'Create', exact: true });
  await create.focus();
  await create.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'New task', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'New document', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await task(page, 'Next step');
  await create.focus();
  await create.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Document title' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Document title' }).fill('Notes');
  await quick(page, 'Add link');
  await page
    .getByRole('textbox', { name: 'Link', exact: true })
    .fill('https://example.com/research');
  await page.getByRole('dialog').getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(page.getByRole('button', { name: /example.com.*example.com/ })).toBeVisible();
  await create.click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'source.txt', mimeType: 'text/plain', buffer: Buffer.from('Source') });
  await expect(page.getByRole('button', { name: /source.txt.*B/ })).toBeVisible();
  await saved(page);
});

test('undoing a task deletion preserves subsequent edits and the original order', async ({
  page,
}) => {
  await start(page);
  await task(page, 'First');
  await task(page, 'Second');
  await page.getByRole('button', { name: 'Delete task First', exact: true }).click();
  await expect(page.getByText('Task deleted.', { exact: true })).toBeVisible();
  await task(page, 'Third');
  await page.getByRole('button', { name: 'Edit task Second', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit task Second', exact: true }).fill('Second, edited');
  await page.getByRole('textbox', { name: 'Edit task Second', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.task-row .inline-name-button > span')).toHaveText([
    'First',
    'Second, edited',
    'Third',
  ]);
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(page.locator('.task-row .inline-name-button > span')).toHaveText([
    'First',
    'Second, edited',
    'Third',
  ]);
});

test('document and binary attachment undo restore content without dropping new documents', async ({
  page,
}) => {
  await start(page);
  await quick(page, 'New document');
  await page.getByRole('textbox', { name: 'Document title' }).fill('Original');
  await page.getByRole('textbox', { name: 'Document content' }).fill('Keep this exact text.');
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download HTML', exact: true }).click();
  expect(await readFile((await (await download).path())!, 'utf8')).toContain(
    'Keep this exact text.',
  );
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete document', exact: true }).click();
  await quick(page, 'New document');
  await page.getByRole('textbox', { name: 'Document title' }).fill('Newer');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document content' })).toHaveText(
    'Keep this exact text.',
  );
  await expect(page.getByRole('button', { name: 'Newer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Materials/ }).click();
  const bytes = Buffer.from([0, 255, 1, 128, 42]);
  await page
    .locator('input[type=file]:not([data-document-upload])')
    .first()
    .setInputFiles({ name: 'sample.bin', mimeType: 'application/octet-stream', buffer: bytes });
  await page.getByRole('button', { name: 'Delete material sample.bin', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sample.bin', exact: true }).click();
  expect(await readFile((await (await file).path())!)).toEqual(bytes);
});

test('project undo restores all its records and preserves work created after deletion', async ({
  page,
}) => {
  await start(page);
  await task(page, 'Original task');
  await quick(page, 'New document');
  await page.getByRole('textbox', { name: 'Document title' }).fill('Original document');
  await page.getByRole('textbox', { name: 'Document content' }).fill('Original content');
  await quick(page, 'Add link');
  await page.getByRole('textbox', { name: 'Link', exact: true }).fill('https://example.com');
  await page.getByRole('dialog').getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete project', exact: true })
    .click();
  await project(page, 'Another project');
  await task(page, 'New task');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /example.com.*example.com/ })).toBeVisible();
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.getByRole('textbox', { name: 'Document content' })).toHaveText(
    'Original content',
  );
  await page.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Original task', exact: true })).toBeVisible();
  await page.locator('.project-link').filter({ hasText: 'Another project' }).click();
  await expect(page.getByRole('checkbox', { name: 'New task', exact: true })).toBeVisible();
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(page.locator('.project-link')).toHaveCount(2);
});

test('undo stays available while focused and expires after leaving it', async ({ page }) => {
  await page.clock.install();
  await start(page);
  await task(page, 'Temporary');
  await page.getByRole('button', { name: 'Delete task Temporary', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).focus();
  await page.clock.fastForward(20_000);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'New task', exact: true }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(10_000);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.clock.fastForward(3_000);
  await expect(page.locator('.undo-notice')).toHaveCount(0);
});
