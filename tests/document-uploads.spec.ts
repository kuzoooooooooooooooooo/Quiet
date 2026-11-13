import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});
const docx = Buffer.from(
  zipSync({
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    'word/document.xml': strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Uploaded document content</w:t></w:r></w:p></w:body></w:document>',
    ),
  }),
);
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
);
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Imported documents');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await tab(page, 'Documents');
}
async function tab(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('button', { name: new RegExp('^' + name) })
    .click();
}
async function saved(page: Page) {
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
}
async function original(page: Page, name: string, bytes: Buffer) {
  const pending = page.waitForEvent('download');
  await page
    .locator('.file-preview')
    .getByRole('button', { name: 'Download file', exact: true })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(name);
  expect(await readFile((await download.path())!)).toEqual(bytes);
}
async function ageFiles(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('quiet-workspace');
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('attachments', 'readwrite'),
            cursor = tx.objectStore('attachments').openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (row) {
              row.update({ ...row.value, touched: 0 });
              row.continue();
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test('DOCX imports into Documents, survives cleanup and restart, supports rename, delete and undo', async ({
  page,
}) => {
  await start(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload document', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'Reference.DOCX', mimeType: 'application/octet-stream', buffer: docx });
  await expect(page.locator('.docx-preview')).toContainText('Uploaded document content');
  await expect(page.locator('.document-list-item')).toContainText('DOCX');
  await expect(page.getByRole('textbox', { name: 'Document content' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Document title' }).fill('Renamed reference');
  await saved(page);
  await ageFiles(page);
  await page.reload();
  await page.locator('.home-project').click();
  await expect(page.locator('.docx-preview')).toContainText('Uploaded document content');
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue(
    'Renamed reference',
  );
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('Reference.DOCX');
  await page.getByRole('textbox', { name: 'Search workspace' }).press('Enter');
  await expect(page.locator('.docx-preview')).toContainText('Uploaded document content');
  await original(page, 'Reference.DOCX', docx);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('[data-section="appearance"]').click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const contrast = await page.locator('.docx-preview').evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color: string) =>
      color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(style.color),
      b = luminance(style.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.locator('.document-list-item').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete document', exact: true }).click();
  await expect(page.locator('.uploaded-document')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.docx-preview')).toContainText('Uploaded document content');
  await original(page, 'Reference.DOCX', docx);
  await tab(page, 'Materials');
  await expect(page.locator('.material-row')).toHaveCount(0);
});

test('Documents drops accept PDF and DOCX, reject other types, and PDF preview fits mobile', async ({
  page,
}) => {
  await start(page);
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(['no'], 'bad.pptx'));
    return d;
  });
  await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(
    page.getByText('Only DOCX and PDF files can be added to Documents.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.document-list-item')).toHaveCount(0);
  const data = await page.evaluateHandle(
    (bytes) => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(bytes)], 'Paper.pdf', { type: 'application/pdf' }));
      return d;
    },
    [...pdf],
  );
  await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.locator('.uploaded-document iframe')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('.document-list-item')).toContainText('PDF');
  await original(page, 'Paper.pdf', pdf);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await saved(page);
});

test('Documents and Materials deduplicate shared binaries; removing one reference keeps the other', async ({
  page,
}) => {
  await start(page);
  await page
    .locator('[data-document-upload]')
    .setInputFiles({ name: 'Shared.docx', mimeType: 'application/octet-stream', buffer: docx });
  await expect(page.locator('.docx-preview')).toContainText('Uploaded document content');
  await tab(page, 'Materials');
  await page
    .locator('input[type=file]:not([data-document-upload])')
    .setInputFiles({ name: 'Shared.docx', mimeType: 'application/octet-stream', buffer: docx });
  await expect(page.locator('.material-row')).toHaveCount(1);
  const count = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('quiet-workspace');
        req.onsuccess = () => {
          const db = req.result,
            r = db.transaction('attachments').objectStore('attachments').count();
          r.onsuccess = () => {
            resolve(r.result);
            db.close();
          };
        };
      }),
  );
  expect(count).toBe(1);
  await page.locator('.material-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Delete/ }).click();
  await saved(page);
  await ageFiles(page);
  await page.reload();
  await page.locator('.home-project').click();
  await tab(page, 'Documents');
  await expect(page.locator('.docx-preview')).toContainText('Uploaded document content');
  await original(page, 'Shared.docx', docx);
});

test('upload is available through Create and imported files remain separate from editable documents', async ({
  page,
}) => {
  await start(page);
  await tab(page, 'Tasks');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Upload document', exact: true }).click();
  await (
    await chooser
  ).setFiles([
    { name: 'One.docx', mimeType: 'application/octet-stream', buffer: docx },
    { name: 'Two.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]);
  await expect(page.locator('.document-list-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Create document', exact: true }).click();
  await page.getByRole('textbox', { name: 'Document content' }).fill('My own draft');
  await expect(page.locator('.document-list-item')).toHaveCount(3);
  await page.locator('.document-list-item').filter({ hasText: 'One.docx' }).click();
  await expect(page.locator('.docx-preview')).toContainText('Uploaded document content');
});
