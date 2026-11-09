import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function fakeUpdater(
  page: Page,
  mode: 'available' | 'current' | 'offline' | 'download-error' | 'unconfigured' = 'available',
) {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
  await page.route('**/src/updateService.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      window.updateCalls = { checks: 0, downloads: 0, installs: 0, closes: 0 };
      export async function getUpdateSupport() { return '${mode}' === 'unconfigured' ? 'unconfigured' : 'ready'; }
      export async function checkForUpdate() {
        window.updateCalls.checks++;
        if ('${mode}' === 'offline') throw new Error('Network unavailable');
        if ('${mode}' === 'current') return null;
        return { version: '0.9.0',
          async download(event) {
            window.updateCalls.downloads++;
            if ('${mode}' === 'download-error') throw new Error('Invalid signature');
            event({ event:'Started', data:{contentLength:100} });
            event({ event:'Progress', data:{chunkLength:50} });
            await new Promise(resolve => setTimeout(resolve, 250));
            event({ event:'Finished' });
          },
          async install() {
            window.updateCalls.installs++;
            await new Promise(resolve => setTimeout(resolve, 200));
          },
          async close() { window.updateCalls.closes++; }
        };
      }
    `,
    }),
  );
}
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}
async function calls(page: Page, key: string) {
  return page.evaluate(
    (key) => (window as unknown as { updateCalls: Record<string, number> }).updateCalls[key],
    key,
  );
}

test('browser settings explain native updates without making update requests', async ({ page }) => {
  let requests = 0;
  await page.route('https://github.com/**', (route) => {
    requests++;
    return route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await page.getByRole('button', { name: 'Налаштування', exact: true }).click();
  await expect(page.getByText('Оновлення доступні у Windows-додатку.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перевірити оновлення' })).toHaveCount(0);
  expect(requests).toBe(0);
});

test('startup check only announces updates; dismissing does not download or install', async ({
  page,
}) => {
  await fakeUpdater(page);
  await page.goto('/');
  const notice = page.locator('.update-notice');
  await expect(notice).toContainText('Version 0.9.0 is available.');
  await notice.getByRole('button', { name: 'Dismiss update' }).click();
  await expect(notice).toHaveCount(0);
  await settings(page);
  await expect(page.getByRole('button', { name: 'Download and install' })).toBeVisible();
  expect(await calls(page, 'checks')).toBe(1);
  expect(await calls(page, 'downloads')).toBe(0);
  expect(await calls(page, 'installs')).toBe(0);
});

test('explicit install shows progress and keeps saved project data', async ({ page }) => {
  await fakeUpdater(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('My workspace');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page
    .locator('.update-notice')
    .getByRole('button', { name: 'Version 0.9.0 is available.' })
    .click();
  await page.getByRole('button', { name: 'Download and install' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50');
  await expect(page.getByText('Update installed. Open Quiet again.')).toBeVisible();
  expect(await calls(page, 'downloads')).toBe(1);
  expect(await calls(page, 'installs')).toBe(1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.locator('.home-project')).toContainText('My workspace');
});

test('offline startup stays quiet, while a manual check reports an error and allows retry', async ({
  page,
}) => {
  await fakeUpdater(page, 'offline');
  await page.goto('/');
  await expect.poll(() => calls(page, 'checks')).toBe(1);
  await expect(page.locator('.update-notice')).toHaveCount(0);
  await settings(page);
  await expect(page.getByText('Could not complete the update. Try again.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('Could not complete the update. Try again.')).toBeVisible();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect.poll(() => calls(page, 'checks')).toBe(3);
});

test('a rejected download cannot reach installation', async ({ page }) => {
  await fakeUpdater(page, 'download-error');
  await page.goto('/');
  await page
    .locator('.update-notice')
    .getByRole('button', { name: 'Version 0.9.0 is available.' })
    .click();
  await page.getByRole('button', { name: 'Download and install' }).click();
  await expect(page.getByText('Could not complete the update. Try again.')).toBeVisible();
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByText('Error: Invalid signature')).toBeVisible();
  expect(await calls(page, 'installs')).toBe(0);
  await expect(page.getByRole('button', { name: 'Download and install' })).toBeEnabled();
});

test('an up-to-date app and an unconfigured build have distinct states', async ({ page }) => {
  await fakeUpdater(page, 'current');
  await page.goto('/');
  await settings(page);
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('You have the latest version.')).toBeVisible();
  await page.unroute('**/src/updateService.ts*');
  await fakeUpdater(page, 'unconfigured');
  await page.reload();
  await settings(page);
  await expect(page.getByText('This build is not configured for updates.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download and install' })).toHaveCount(0);
});

test('unsaved changes block installation, and retry uses the already downloaded update', async ({
  page,
}) => {
  await fakeUpdater(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Before update');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (Reflect.get(window, '__failUpdateSave')) throw new DOMException('Test save failure');
      return original.apply(this, args);
    };
    Reflect.set(window, '__failUpdateSave', true);
  });
  await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rename project', exact: true }).fill('Keep this edit');
  await page.getByRole('textbox', { name: 'Rename project', exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await page
    .locator('.update-notice')
    .getByRole('button', { name: 'Version 0.9.0 is available.' })
    .click();
  await page.getByRole('button', { name: 'Download and install' }).click();
  await expect(page.getByText('Could not complete the update. Try again.')).toBeVisible();
  expect(await calls(page, 'installs')).toBe(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => Reflect.set(window, '__failUpdateSave', false));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await settings(page);
  await page.getByRole('button', { name: 'Download and install' }).click();
  await expect(page.getByText('Update installed. Open Quiet again.')).toBeVisible();
  expect(await calls(page, 'downloads')).toBe(1);
  expect(await calls(page, 'installs')).toBe(1);
});
