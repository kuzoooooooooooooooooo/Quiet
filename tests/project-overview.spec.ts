import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedWorkspace } from './helpers';
const stamp = '2026-11-13T10:00:00Z';
function data({
  tasks = 2,
  materials = 3,
  documents = 0,
  modules = ['tasks', 'materials', 'documents'],
}: { tasks?: number; materials?: number; documents?: number; modules?: string[] } = {}) {
  return {
    version: 1,
    notes: [],
    projects: [
      {
        id: 'p',
        name: 'Research poster',
        description: 'Module: Communication and Study Skills',
        tone: 'violet',
        createdAt: stamp,
        kit: { enabled: modules, notes: [], snippets: [], tables: [], preferences: {} },
      },
    ],
    tasks: Array.from({ length: tasks }, (_, i) => ({
      id: 't' + i,
      projectId: 'p',
      title: 'Task ' + i,
      done: true,
      createdAt: stamp,
    })),
    materials: Array.from({ length: materials }, (_, i) => ({
      id: 'm' + i,
      projectId: 'p',
      title: 'Reference ' + i,
      kind: 'link',
      url: 'https://example.com/ref/' + i,
      size: 0,
      createdAt: stamp,
    })),
    documents: Array.from({ length: documents }, (_, i) => ({
      id: 'd' + i,
      projectId: 'p',
      title: 'Draft ' + i,
      content: 'Visible draft text',
      format: 'html',
      updatedAt: stamp,
    })),
    context: { projectId: 'p', tab: 'overview', documentId: null },
  };
}
async function open(page: Page, workspace = data()) {
  await seedWorkspace(page, workspace);
  await page.locator('.home-project').click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});

test('overview shows materials directly, completed tasks collapse and empty documents stay compact', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('.overview-material-open strong')).toHaveText([
    'Reference 0',
    'Reference 1',
    'Reference 2',
  ]);
  await expect(page.locator('.overview-card')).toHaveCount(2);
  await expect(page.locator('.overview-tasks')).toContainText('All done');
  await expect(page.getByRole('checkbox', { name: 'Task 0', exact: true })).toBeHidden();
  await page.locator('.completed-tasks summary').click();
  await expect(page.getByRole('checkbox', { name: 'Task 0', exact: true })).toBeChecked();
  const strip = page.locator('.overview-empty-documents');
  expect((await strip.boundingBox())!.height).toBeLessThan(100);
  await strip.getByRole('button', { name: 'Add document', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'New document', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Upload document', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'New document', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document content' })).toBeVisible();
});

test('material menu acts on its own row and undo restores the overview entry', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Material actions: Reference 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Renamed source');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.overview-material-open strong')).toHaveText([
    'Reference 0',
    'Renamed source',
    'Reference 2',
  ]);
  await page.getByRole('button', { name: 'Material actions: Renamed source', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.overview-material-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.overview-material-open strong')).toHaveText([
    'Reference 0',
    'Renamed source',
    'Reference 2',
  ]);
});

test('empty and hidden modules avoid blank panels; single filled section uses available width', async ({
  page,
}) => {
  await open(page, data({ tasks: 0, materials: 0 }));
  await expect(page.locator('.overview-card')).toHaveCount(0);
  await expect(page.locator('.overview-empty')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add materials', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Link', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.reload();
  await page.locator('.home-project').click();
  await expect(page.locator('.overview-card')).toHaveCount(0);
  await open(page, data({ modules: ['materials'] }));
  await expect(page.locator('.overview-card')).toHaveCount(1);
  await expect(page.locator('.overview-grid')).toHaveClass(/single-card/);
  await expect(page.locator('.overview-tasks,.overview-documents,.overview-empty')).toHaveCount(0);
});

test('overview preview is bounded and all records remain accessible in the full section', async ({
  page,
}) => {
  await open(page, data({ materials: 7, documents: 6, tasks: 0 }));
  await expect(page.locator('.overview-material-row')).toHaveCount(4);
  await expect(page.locator('.overview-document-list .document-card')).toHaveCount(4);
  await expect(page.locator('.overview-grid')).toHaveClass(/single-card/);
  await page.getByRole('button', { name: 'All materials (7)', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(7);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'All documents (6)', exact: true }).click();
  await expect(page.locator('.document-list-item')).toHaveCount(6);
});

test('local material opens from overview and cards and menus fit mobile in both themes', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: /^Materials/ }).click();
  await page.locator('input[type=file]:not([data-document-upload])').setInputFiles({
    name: 'Local.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Local original content'),
  });
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: /^Local.txt/ }).click();
  await expect(page.locator('.text-preview')).toHaveText('Local original content');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => localStorage.setItem('quiet.theme', theme), theme);
    await page.reload();
    await page.locator('.mobile-menu').click();
    await page.locator('.project-link').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Material actions: Reference 0', exact: true }).click();
    const box = await page.getByRole('menu').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await page.keyboard.press('Escape');
  }
});
