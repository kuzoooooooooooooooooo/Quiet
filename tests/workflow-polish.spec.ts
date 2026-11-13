import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
});
async function project(page: Page, name: string, empty = false) {
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  if (empty) await page.getByRole('button', { name: 'Empty project', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
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
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}
async function doc(page: Page) {
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New document', exact: true }).click();
}

test('create a named table from an empty project, validate dimensions and preserve cells', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Comparison', true);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New table', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Table title', { exact: true }).fill('Options');
  await dialog.getByLabel('Rows', { exact: true }).fill('501');
  await expect(dialog.getByRole('button', { name: 'Create table' })).toBeDisabled();
  await dialog.getByLabel('Rows', { exact: true }).fill('4');
  await dialog.getByLabel('Columns', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Create table' }).click();
  await expect(page.getByRole('textbox', { name: /^Cell / })).toHaveCount(12);
  await expect(page.getByRole('textbox', { name: 'Table title' })).toHaveValue('Options');
  await page.getByRole('textbox', { name: 'Cell 4, 3', exact: true }).fill('Survives restart');
  await saved(page);
  await page.reload();
  await expect(page.locator('.home-page')).toBeVisible();
  await page.locator('.home-project').click();
  await expect(page.getByRole('textbox', { name: 'Cell 4, 3', exact: true })).toHaveValue(
    'Survives restart',
  );
  await page.getByRole('button', { name: 'New table', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Table title' })).toHaveValue('Options');
});

test('document typing shortcuts are optional, persistent, undoable and keep manual formatting', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Writing');
  await doc(page);
  const editor = page.getByRole('textbox', { name: 'Document content' });
  await editor.pressSequentially('# Literal **text**');
  await expect(editor.locator('h1,strong,b')).toHaveCount(0);
  await settings(page);
  await expect(
    page.getByRole('checkbox', { name: 'Automatic document formatting' }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Automatic document formatting' }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await editor.fill('');
  await editor.pressSequentially('## ');
  await expect(editor.locator('h2')).toHaveCount(1);
  await editor.press('Control+z');
  await expect(editor.locator('h2')).toHaveCount(0);
  await expect(editor).toHaveText('## ', { useInnerText: true });
  await editor.fill('');
  await editor.pressSequentially('- ');
  await expect(editor.locator('ul li')).toHaveCount(1);
  await editor.pressSequentially('First item');
  await editor.press('Enter');
  await editor.pressSequentially('Second item');
  await expect(editor.locator('ul li')).toHaveText(['First item', 'Second item']);
  await doc(page);
  await editor.pressSequentially('1. ');
  await expect(editor.locator('ol li')).toHaveCount(1);
  await doc(page);
  await editor.pressSequentially('**Bold words**');
  await expect(editor.locator('b,strong')).toHaveText('Bold words');
  await editor.pressSequentially(' plain');
  await expect(editor.locator('b,strong')).toHaveText('Bold words');
  await expect(editor).toContainText('Bold words plain');
  await saved(page);
  await settings(page);
  await page.getByRole('checkbox', { name: 'Automatic document formatting' }).uncheck();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor.locator('b,strong')).toHaveText('Bold words');
  await editor.focus();
  await editor.press('Control+a');
  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(editor.locator('i,em')).not.toHaveCount(0);
  await saved(page);
  await page.reload();
  await page.locator('.home-project').click();
  await expect(editor.locator('b,strong')).toHaveText('Bold words');
  await settings(page);
  await expect(
    page.getByRole('checkbox', { name: 'Automatic document formatting' }),
  ).not.toBeChecked();
});

test('hiding personal notes keeps their content and leaves project notes available', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Private thought');
  await page.getByRole('textbox', { name: 'Note content' }).fill('Keep this intact');
  await saved(page);
  await settings(page);
  await page.getByRole('checkbox', { name: 'Show personal notes' }).uncheck();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.home-page')).toBeVisible();
  await expect(
    page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('Keep this intact');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(
    page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }),
  ).toHaveCount(0);
  await project(page, 'Notes project');
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit project', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await tab(page, 'Notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note content' })).toBeVisible();
  await settings(page);
  await page.getByRole('checkbox', { name: 'Show personal notes' }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Private thought');
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveValue('Keep this intact');
});

test('completed tasks collapse, reopen in search across projects and can become active again', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Tasks project');
  await tab(page, 'Tasks');
  for (const title of ['Still working', 'Finished work']) {
    await page.getByRole('textbox', { name: 'New task', exact: true }).fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await page.getByRole('checkbox', { name: 'Finished work', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Finished work', exact: true })).toBeHidden();
  await expect(page.locator('.completed-tasks summary')).toHaveText('Completed1');
  await page.locator('.completed-tasks summary').click();
  await expect(page.getByRole('checkbox', { name: 'Finished work', exact: true })).toBeChecked();
  await page.locator('.completed-tasks summary').click();
  await tab(page, 'Overview');
  await expect(page.getByRole('checkbox', { name: 'Finished work', exact: true })).toBeHidden();
  await project(page, 'Other project');
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('Finished work');
  await page.getByRole('textbox', { name: 'Search workspace' }).press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Finished work', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Finished work', exact: true }).uncheck();
  await expect(page.locator('.completed-tasks')).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Finished work', exact: true }),
  ).not.toBeChecked();
});

test('home filters projects, remembers cards/list and sorts by recent opening or name', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.project-browser-tools')).toHaveCount(0);
  await project(page, 'Alpha');
  await project(page, 'Zulu');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.home-project strong')).toHaveText(['Zulu', 'Alpha']);
  await page.getByRole('combobox', { name: 'Sort projects' }).selectOption('name');
  await expect(page.locator('.home-project strong')).toHaveText(['Alpha', 'Zulu']);
  await page
    .getByRole('group', { name: 'Project view' })
    .getByRole('button', { name: 'List', exact: true })
    .click();
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('ALPHA');
  await expect(page.locator('.home-project strong')).toHaveText(['Alpha']);
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('missing');
  await expect(page.getByRole('status').filter({ hasText: 'No results' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search projects' }).clear();
  await page.getByRole('button', { name: 'Project actions: Alpha', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Description').fill('Research context');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('research');
  await expect(page.locator('.home-project strong')).toHaveText(['Alpha']);
  await page.locator('.home-project').click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sort projects' }).selectOption('recent');
  await expect(page.locator('.home-project strong')).toHaveText(['Alpha', 'Zulu']);
  await saved(page);
  await page.reload();
  await expect(page.locator('.home-project-list')).toHaveClass(/project-list-view/);
  await expect(page.getByRole('combobox', { name: 'Sort projects' })).toHaveValue('recent');
  await expect(page.locator('.home-project strong')).toHaveText(['Alpha', 'Zulu']);
});

test('typing shortcuts leave pasted and composing text intact and are saved when enabled', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Input');
  await doc(page);
  await settings(page);
  await page.getByRole('checkbox', { name: 'Automatic document formatting' }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Document content' });
  await editor.focus();
  await editor.evaluate((host) => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>**Pasted literal**</p><script>window.pwned=true</script>');
    host.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(editor).toHaveText('**Pasted literal**');
  await expect(editor.locator('b,strong,script')).toHaveCount(0);
  await editor.fill('');
  await editor.dispatchEvent('compositionstart');
  await editor.pressSequentially('**Composition**');
  await expect(editor.locator('b,strong')).toHaveCount(0);
  await editor.dispatchEvent('compositionend');
  await editor.fill('');
  await editor.pressSequentially('**Saved bold**');
  await expect(editor.locator('b,strong')).toHaveText('Saved bold');
  await editor.press('Control+z');
  await expect(editor).toHaveText('**Saved bold**');
  await expect(editor.locator('b,strong')).toHaveCount(0);
  await editor.press('Control+Shift+z');
  await expect(editor.locator('b,strong')).toHaveText('Saved bold');
  await saved(page);
  await page.reload();
  await page.locator('.home-project').click();
  await expect(editor.locator('b,strong')).toHaveText('Saved bold');
  await settings(page);
  await expect(page.getByRole('checkbox', { name: 'Automatic document formatting' })).toBeChecked();
});

for (const language of ['en', 'uk']) {
  test(`overview action hover has balanced bounds in ${language} on desktop and mobile`, async ({
    page,
  }) => {
    await page.goto('/');
    await project(page, 'Interface');
    await settings(page);
    await page.getByRole('combobox', { name: 'Language' }).selectOption(language);
    const uk = language === 'uk';
    await page.getByRole('radio', { name: uk ? 'Темна' : 'Dark', exact: true }).check();
    await page.getByRole('button', { name: uk ? 'Закрити' : 'Close', exact: true }).click();
    for (const size of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      const action = page
        .locator('.panel-add')
        .filter({ hasText: uk ? 'Новий документ' : 'New document' });
      await action.hover();
      const before = await action.boundingBox();
      await page.mouse.move(0, 0);
      await action.hover();
      expect(await action.boundingBox()).toEqual(before);
      const insets = await action.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        const icon = button.querySelector('svg')!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        const content = range.getBoundingClientRect();
        return {
          left: icon.left - bounds.left,
          right: bounds.right - content.right,
          height: bounds.height,
          icon: icon.width,
        };
      });
      expect(insets.left).toBeGreaterThanOrEqual(12);
      expect(insets.right).toBeGreaterThanOrEqual(12);
      expect(insets.height).toBeGreaterThanOrEqual(37);
      expect(insets.icon).toBe(16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}
