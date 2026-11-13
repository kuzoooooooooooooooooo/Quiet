import { settingsSection } from './helpers';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});
async function files(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Preview project');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page.getByRole('button', { name: /^Materials/ }).click();
}
function archive(parts: Record<string, string>) {
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(parts).map(([path, text]) => [path, strToU8(text)]))),
  );
}
async function attach(page: import('@playwright/test').Page, name: string, buffer: Buffer) {
  await page
    .locator('input[type=file]')
    .setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect(page.locator('.material-row').filter({ hasText: name })).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
  await page.locator('.material-row').filter({ hasText: name }).locator('.material-open').click();
}

test('plain notes are separate, persist, search, rename, delete and undo; launch and brand open Home', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator('.notes-layout')).toHaveCount(0);
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Travel');
  await page.getByRole('textbox', { name: 'Note content' }).fill('Plain text\nKyoto research');
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
  await page.getByRole('button', { name: 'quiet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByText('Travel', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.search-results button,kbd,footer')).toHaveCount(0);
  expect(await dialog.locator('.search-results').evaluate((el) => el.clientHeight)).toBe(0);
  await page.getByRole('textbox', { name: 'Search workspace' }).press('Enter');
  await expect(dialog).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('Kyoto');
  await page.getByRole('textbox', { name: 'Search workspace' }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Plain text\nKyoto research',
    { useInnerText: true },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Travel');
  await page.locator('.note-item').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Weekend');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Weekend');
  await page.locator('.note-item').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete note', exact: true }).click();
  await expect(page.locator('.notes-layout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
    'Plain text\nKyoto research',
    { useInnerText: true },
  );
});
test('backgrounds persist separately from theme and removed UI stays absent', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settingsSection(page, 'appearance');
  await page.getByRole('radio', { name: 'Lavender', exact: true }).check();
  await settingsSection(page, 'appearance');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-background', 'lavender');
  await expect(page.getByText('Check and install new versions here.', { exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-background', 'lavender');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Backups', exact: true })).toHaveCount(0);
  await expect(page.locator('.home-project-list')).toBeEmpty();
});

test('DOCX preview renders text, formatting and tables locally; original download is unchanged', async ({
  page,
}) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://localhost:1420') &&
      !request.url().startsWith('blob:') &&
      !request.url().startsWith('data:')
    )
      calls.push(request.url());
  });
  await files(page);
  const bytes = archive({
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Local document</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  });
  await attach(page, 'sample.docx', bytes);
  await expect(page.locator('.docx-preview h1')).toHaveText('Local document');
  await expect(page.locator('.docx-preview h1 span')).toHaveCSS('font-weight', '700');
  await expect(page.locator('.docx-preview td')).toHaveText('Table cell');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file', exact: true }).click();
  expect((await readFile((await (await pending).path())!)).equals(bytes)).toBe(true);
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.material-row')).toContainText('DOCX');
  await expect(page.locator('.material-row')).not.toContainText('Stored as');
});

test('PPTX follows presentation order and releases the previous slide on navigation', async ({
  page,
}) => {
  await files(page);
  const slide = (text: string) =>
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="8000000" cy="2000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="3200"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const bytes = archive({
    'ppt/presentation.xml':
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml': slide('Second slide'),
    'ppt/slides/slide2.xml': slide('First slide'),
  });
  await attach(page, 'slides.pptx', bytes);
  await expect(page.locator('.slide-stage')).toHaveText('First slide');
  await expect(page.getByText('Slide 1 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next slide' }).click();
  await expect(page.locator('.slide-stage')).toHaveText('Second slide');
  await expect(page.getByRole('button', { name: 'Next slide' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous slide' }).click();
  await expect(page.locator('.slide-stage')).toHaveText('First slide');
});

test('PDF uses a local native viewer and malformed Office files keep original download available', async ({
  page,
}) => {
  await files(page);
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  );
  await attach(page, 'empty.pdf', pdf);
  await expect(page.locator('iframe.pdf-preview')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await attach(page, 'broken.docx', Buffer.from('not a zip'));
  await expect(page.getByRole('alert')).toContainText('Could not preview');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file', exact: true }).click();
  expect(await readFile((await (await pending).path())!, 'utf8')).toBe('not a zip');
});

test('files above 5 MB compress in a worker and download completely; limit rejects oversized files', async ({
  page,
}) => {
  await files(page);
  const bytes = Buffer.alloc(6 * 1024 * 1024, 65);
  await attach(page, 'large.txt', bytes);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file', exact: true }).click();
  expect((await readFile((await (await pending).path())!)).equals(bytes)).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'too-big.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(26 * 1024 * 1024),
  });
  await expect(page.getByRole('status').filter({ hasText: '25 MB' })).toBeVisible();
  await expect(page.locator('.material-row')).toHaveCount(1);
});

test('Office preview rejects unsafe XML and oversized ZIP parts without losing the original', async ({
  page,
}) => {
  await files(page);
  const xml = archive({
    'word/document.xml': '<!DOCTYPE doc [<!ENTITY x "expansion">]><doc>&x;</doc>',
  });
  const huge = archive({ 'word/document.xml': '<doc>small actual contents</doc>' });
  const central = huge.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  huge.writeUInt32LE(100 * 1024 * 1024, central + 24);
  for (const [name, bytes] of [
    ['unsafe.docx', xml],
    ['oversized.docx', huge],
  ] as const) {
    await attach(page, name, bytes);
    await expect(page.getByRole('alert')).toContainText('Could not preview');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download file', exact: true }).click();
    expect((await readFile((await (await pending).path())!)).equals(bytes)).toBe(true);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
});

test('whitespace-only note and document titles remain valid after saving and reopening', async ({
  page,
}) => {
  await files(page);
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('   ');
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Untitled note');
  await page.getByRole('textbox', { name: 'Note content' }).fill('Keep this note');
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
  await page.locator('.project-link').filter({ hasText: 'Preview project' }).click();
  await page.getByRole('button', { name: /^Documents/ }).click();
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await page.getByRole('textbox', { name: 'Document title' }).fill('   ');
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Untitled');
  await page.getByRole('textbox', { name: 'Document content' }).fill('Keep this document');
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText('Keep this note', {
    useInnerText: true,
  });
  await page.locator('.project-link').filter({ hasText: 'Preview project' }).click();
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.getByRole('textbox', { name: 'Document content' })).toHaveText(
    'Keep this document',
  );
});
