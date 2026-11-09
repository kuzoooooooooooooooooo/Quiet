import { resumeProject, seedWorkspace } from './helpers';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Збережено на пристрої' })).toBeVisible();
}
async function start(page: Page) {
  await page.goto('/');
  await expect(page.locator('.home-project-list')).toBeEmpty();
  await createProject(page, 'Мій workspace');
  await page.getByRole('button', { name: /^Документи/ }).click();
  await page.getByRole('button', { name: 'Новий документ', exact: true }).click();
  await page.getByRole('textbox', { name: 'Назва документа' }).fill('Нотатки');
  await page.getByRole('textbox', { name: 'Вміст документа' }).fill('# Рішення\n\nRust + SQLite');
  await page.getByRole('button', { name: 'Огляд', exact: true }).click();
  await saved(page);
}
async function createProject(page: Page, name: string) {
  if (
    (page.viewportSize()?.width ?? 1440) <= 600 &&
    !(await page.locator('.sidebar').getAttribute('class'))?.includes('open')
  ) {
    await page.getByRole('button', { name: 'Відкрити проєкти', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Створити проєкт', exact: true }).click();
  await page.getByLabel('Назва проєкту').fill(name);
  await page.getByLabel('Короткий опис').fill('Контекст для реальної роботи');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Створити проєкт', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
test('project → task → document → reload preserves content and context', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  await createProject(page, 'Мій продукт');
  await page.getByRole('button', { name: 'Додати завдання', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Нове завдання' }).fill('Зібрати перший прототип');
  await page.getByRole('button', { name: 'Додати', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Зібрати перший прототип' }).click();
  await page.getByRole('button', { name: /^Документи/ }).click();
  await page.getByRole('button', { name: 'Новий документ', exact: true }).click();
  await page.getByRole('textbox', { name: 'Назва документа' }).fill('План реалізації');
  await page
    .getByRole('textbox', { name: 'Вміст документа' })
    .fill('Перша версія\n\nRust + SQLite. Без зайвого.');
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(page.getByRole('textbox', { name: 'Назва документа' })).toHaveValue(
    'План реалізації',
  );
  await expect(page.getByRole('textbox', { name: 'Вміст документа' })).toHaveText(
    'Перша версія\n\nRust + SQLite. Без зайвого.',
    { useInnerText: true },
  );
  await page.getByRole('button', { name: 'Перегляд', exact: true }).click();
  await expect(page.locator('.rich-content')).toContainText('Перша версія');
  await page.getByRole('button', { name: /^Завдання/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Зібрати перший прототип' })).toBeChecked();
  expect(errors).toEqual([]);
});

test('global search finds document content and jumps across projects with keyboard', async ({
  page,
}) => {
  await start(page);
  await createProject(page, 'Дослідження');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: 'Пошук у workspace' });
  await search.fill('SQLite');
  await expect(
    page.locator('.search-result,.document-card').filter({ hasText: 'Нотатки' }),
  ).toBeVisible();
  await search.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Мій workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Назва документа' })).toHaveValue('Нотатки');
  await page.keyboard.press('Control+k');
  await search.fill('немаєтакогословазовсім');
  await expect(page.getByText('Нічого не знайшлося')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('deleting one project preserves another project', async ({ page }) => {
  await start(page);
  await createProject(page, 'Другий проєкт');
  await page.getByRole('button', { name: 'Меню проєкту', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Видалити проєкт', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Видалити проєкт', exact: true })
    .click();
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(page.getByRole('heading', { name: 'Мій workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Другий проєкт/ })).toHaveCount(0);
  await expect(
    page.locator('.search-result,.document-card').filter({ hasText: 'Нотатки' }),
  ).toBeVisible();
});

test('Markdown preview strips executable HTML and external images', async ({ page }) => {
  await page.goto('/');
  const date = '2026-11-07T10:00:00Z';
  const legacy = {
    version: 1,
    projects: [{ id: 'p', name: 'Legacy', description: '', tone: 'green', createdAt: date }],
    documents: [
      {
        id: 'd',
        projectId: 'p',
        title: 'Markdown',
        content:
          '# Безпечний текст\n\n<script>window.pwned=true</script><img src="https://example.com/track" onerror="window.pwned=true"><a href="javascript:alert(1)">bad</a>\n\n**Працює**',
        updatedAt: date,
      },
    ],
    tasks: [],
    materials: [],
    context: { projectId: 'p', tab: 'documents', documentId: 'd' },
  };
  await seedWorkspace(page, legacy);
  await resumeProject(page);
  await page.getByRole('button', { name: 'Перегляд', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Безпечний текст' })).toBeVisible();
  await expect(
    page.locator('.markdown img,.markdown script,.markdown [href^="javascript:"]'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
});

test('mobile layout has no horizontal overflow and navigation works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Відкрити проєкти', exact: true }).click();
  await page.getByRole('button', { name: 'Створити проєкт', exact: true }).click();
  await page.getByLabel('Назва проєкту').fill('Мобільний');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Створити проєкт', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Мобільний', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('corrupt stored data shows recovery error without silently resetting data', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('quiet-workspace', 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ version: 99, marker: 'keep-me' }, 'current');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Не вдалося відкрити workspace' })).toBeVisible();
  await expect(page.getByText('Наявні дані не перезаписано.')).toBeVisible();
});

test('storage failure is visible and retry saves the newest changes', async ({ page }) => {
  await start(page);
  await page.locator('.document-card').filter({ hasText: 'Нотатки' }).click();
  await saved(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (Reflect.get(window, '__quietFailWrites') === true)
        throw new DOMException('Test: storage full', 'QuotaExceededError');
      return original.apply(this, args);
    };
    Reflect.set(window, '__quietFailWrites', true);
  });
  await page
    .getByRole('textbox', { name: 'Вміст документа' })
    .fill('Новий текст не можна втратити.');
  await expect(page.getByRole('alert')).toContainText('Не вдалося зберегти');
  await page.evaluate(() => Reflect.set(window, '__quietFailWrites', false));
  await page.getByRole('button', { name: 'Повторити', exact: true }).click();
  await saved(page);
  await page.reload();
  await resumeProject(page);
  await expect(page.getByRole('textbox', { name: 'Вміст документа' })).toHaveText(
    'Новий текст не можна втратити.',
  );
});
