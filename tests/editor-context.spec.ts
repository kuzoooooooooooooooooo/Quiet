import { resumeProject } from './helpers';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});
async function createProject(page: Page, name = 'Project A') {
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
}
async function start(page: Page) {
  await page.goto('/');
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await createProject(page);
}
async function doc(page: Page, title = 'Writing') {
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New document', exact: true }).click();
  await page.getByRole('textbox', { name: 'Document title', exact: true }).fill(title);
}
async function selectText(page: Page) {
  const content = page.getByRole('textbox', { name: 'Document content' });
  await content.focus();
  await content.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}
async function saved(page: Page) {
  await expect(page.locator('.save-status')).toContainText('Saved on this device');
}

test('new documents format text, preserve selection through controls, undo and reload', async ({
  page,
}) => {
  await start(page);
  await doc(page);
  const content = page.getByRole('textbox', { name: 'Document content' });
  await expect(content).toHaveAttribute('contenteditable', 'true');
  await content.fill('Simple document');
  await selectText(page);
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(content.locator('b,strong')).toHaveText('Simple document');
  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await page.getByRole('button', { name: 'Underline', exact: true }).click();
  await page.getByRole('combobox', { name: 'Font', exact: true }).selectOption('Georgia');
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('5');
  await page.getByRole('button', { name: 'Align center', exact: true }).click();
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(content.locator('b,strong')).toHaveText('Simple document');
  await expect(content.locator('i,em')).toHaveText('Simple document');
  await expect(content.locator('u')).toHaveText('Simple document');
  await expect(content.locator('[style*="Georgia"]').first()).toHaveCSS('font-family', 'Georgia');
  await expect(content.locator('[style*="24px"]').first()).toHaveCSS('font-size', '24px');
  await expect(content.locator('[style*="center"]').first()).toHaveCSS('text-align', 'center');
  await selectText(page);
  await page.getByRole('button', { name: 'Clear formatting' }).click();
  await expect(content.locator('b,strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(content.locator('b,strong')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo edit' }).click();
  await expect(content.locator('b,strong')).toHaveCount(0);
});

test('headings, lists, links and HTML export work without a Markdown source editor', async ({
  page,
}) => {
  await start(page);
  await doc(page);
  const content = page.getByRole('textbox', { name: 'Document content' });
  await content.fill('Heading');
  await selectText(page);
  await page.getByRole('combobox', { name: 'Text style' }).selectOption('h2');
  await expect(content.getByRole('heading', { name: 'Heading' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Text style' }).selectOption('p');
  await page.getByRole('button', { name: 'Bulleted list' }).click();
  await expect(content.locator('ul li')).toHaveText('Heading');
  await selectText(page);
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link', exact: true }).fill('https://example.com');
  await page.locator('.editor-link-form').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(content.locator('a')).toHaveAttribute('href', 'https://example.com/');
  await page.getByRole('button', { name: 'Document actions' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download HTML' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('Writing.html');
  const html = await readFile((await download.path())!, 'utf8');
  expect(html).toContain('<ul>');
  expect(html).toContain('https://example.com/');
});

test('pasted and imported rich text cannot load remote content or execute HTML', async ({
  page,
}) => {
  await start(page);
  await doc(page);
  const calls: string[] = [];
  await page.route('https://example.com/**', (route) => {
    calls.push(route.request().url());
    return route.abort();
  });
  const content = page.getByRole('textbox', { name: 'Document content' });
  await content.focus();
  await content.evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<p><b>Safe text</b><script>window.pwned=true</script><img src="https://example.com/track"><span style="background:url(https://example.com/css);font-size:9999px;position:fixed">Safe</span><a href="javascript:alert(1)">bad</a></p>',
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(content.locator('b')).toHaveText('Safe text');
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(
    content.locator('script,img,iframe,[style*="url"],[style*="9999"],[href^="javascript:"]'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
  expect(calls).toEqual([]);
});

test('right-click acts on the clicked project, supports keyboard navigation, and keeps the selected project', async ({
  page,
}) => {
  await start(page);
  await createProject(page, 'Project B');
  await createProject(page, 'Project C');
  const first = page.getByRole('button', { name: 'Project A', exact: true });
  await first.click({ button: 'right' });
  await expect(page.getByRole('heading', { name: 'Project C', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Project renamed');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  const renamed = page.getByRole('button', { name: 'Project renamed', exact: true });
  await renamed.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Delete project', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(renamed).toBeFocused();
  await renamed.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete project', exact: true })
    .click();
  await expect(renamed).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Project C', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(renamed).toBeVisible();
});

test('documents, tasks and materials expose rename and delete through right-click', async ({
  page,
}) => {
  await start(page);
  await doc(page, 'Right click');
  const row = page.locator('.document-list-item');
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Renamed document');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue(
    'Renamed document',
  );
  await page.getByRole('button', { name: /^Tasks/ }).click();
  await page.getByRole('textbox', { name: 'New task', exact: true }).fill('A task');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.task-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Mark complete' }).click();
  await expect(page.getByRole('checkbox', { name: 'A task' })).toBeHidden();
  await page.locator('.completed-tasks > summary').click();
  await expect(page.getByRole('checkbox', { name: 'A task' })).toBeChecked();
  await page.locator('.task-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Changed task');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^Materials/ }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'file.txt', mimeType: 'text/plain', buffer: Buffer.from('data') });
  await page.locator('.material-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('renamed.txt');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.locator('.material-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Download file', exact: true }).click();
  expect((await pending).suggestedFilename()).toBe('renamed.txt');
  await page.locator('.material-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete material/ }).click();
  await expect(page.locator('.material-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.material-row')).toContainText('renamed.txt');
});

test('font sizes keep the same visible size after reloading', async ({ page }) => {
  await start(page);
  await doc(page);
  const content = page.getByRole('textbox', { name: 'Document content' });
  await content.fill('Stable font size');
  for (const [option, pixels] of [
    ['2', '13px'],
    ['3', '16px'],
  ] as const) {
    await selectText(page);
    await page.getByRole('combobox', { name: 'Text size' }).selectOption(option);
    await expect
      .poll(() =>
        content
          .locator('font,span')
          .last()
          .evaluate((element) => getComputedStyle(element).fontSize),
      )
      .toBe(pixels);
    await saved(page);
    await page.reload();
    await resumeProject(page);
    await expect(content.locator(`span[style*="${pixels}"]`).last()).toHaveCSS('font-size', pixels);
  }
});
