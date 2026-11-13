import { settingsSection } from './helpers';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function settings(page: Page) {
  if ((page.viewportSize()?.width ?? 1920) < 600)
    await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

// Compare blank workspace pixels with the actual canvas underneath it. This catches
// translucent fills, borders, shadows, and other layers that obscure the background.
async function expectContinuousCanvas(page: Page) {
  const size = page.viewportSize()!;
  const frame = await page.locator('.workspace-area').boundingBox();
  const points = [
    { x: 1, y: 1 },
    { x: size.width - 1, y: 1 },
    { x: Math.ceil(frame!.x + 1), y: Math.floor(size.height * 0.8) },
    { x: Math.floor(size.width * 0.55), y: Math.floor(size.height * 0.7) },
    { x: Math.floor(size.width - 10), y: Math.floor(size.height * 0.8) },
  ];
  const visible = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  await page.locator('.workspace-area').evaluate((el) => {
    el.style.visibility = 'hidden';
  });
  let canvas: string;
  try {
    canvas = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  } finally {
    await page.locator('.workspace-area').evaluate((el) => el.style.removeProperty('visibility'));
  }
  const result = await page.evaluate(
    async ({ visible, canvas, points }) => {
      async function pixels(data: string) {
        const blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
          type: 'image/png',
        });
        const image = await createImageBitmap(blob),
          element = document.createElement('canvas');
        element.width = image.width;
        element.height = image.height;
        const ctx = element.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        image.close();
        return points.map((p) => [...ctx.getImageData(p.x, p.y, 1, 1).data]);
      }
      const label = document.createElement('span');
      document.body.append(label);
      const colors = ['--muted', '--text-secondary'].map((key) => {
        label.style.color = `var(${key})`;
        return getComputedStyle(label)
          .color.match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      });
      label.remove();
      return { visible: await pixels(visible), canvas: await pixels(canvas), colors };
    },
    { visible, canvas: canvas!, points },
  );
  expect(result.visible).toEqual(result.canvas);
  expect(new Set(result.canvas.map((pixel) => pixel.join(','))).size).toBeGreaterThan(1);
  const lum = (rgb: number[]) =>
    rgb
      .slice(0, 3)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  for (const color of result.colors)
    for (const pixel of result.canvas) {
      const a = lum(color),
        b = lum(pixel);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        JSON.stringify({ color, pixel }),
      ).toBeGreaterThanOrEqual(4.5);
    }
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: all backgrounds cover Home continuously on desktop, compact rail and mobile`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript((theme) => {
      localStorage.setItem('quiet.language', 'en');
      localStorage.setItem('quiet.theme', theme);
    }, theme);
    await page.goto('/');
    await settings(page);
    await settingsSection(page, 'appearance');
    await page
      .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .check();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    for (const viewport of [
      { width: 1920, height: 1008 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const background of [
        'Default',
        'Dawn',
        'Forest',
        'Lavender',
        'Ocean',
        'Misty mountains',
        'Lake',
        'Dunes',
        'Misty woodland',
        'Wave',
      ]) {
        await settings(page);
        await settingsSection(page, 'appearance');
        await page.getByRole('radio', { name: background, exact: true }).check();
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await expectContinuousCanvas(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    }
    await page.setViewportSize({ width: 1920, height: 1008 });
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await expectContinuousCanvas(page);
  });
}
test('documents and notes retain readable local surfaces over the full background', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('quiet.language', 'en'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Reading');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page.getByRole('button', { name: /^Documents/ }).click();
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await page.getByRole('textbox', { name: 'Document content' }).fill('A readable document.');
  const contrast = async (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const s = getComputedStyle(el),
        rgb = (value: string) =>
          value
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number);
      const lum = (color: number[]) =>
        color
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const a = lum(rgb(s.color)),
        b = lum(rgb(s.backgroundColor));
      return {
        background: s.backgroundColor,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  for (const theme of ['Light', 'Dark']) {
    await settings(page);
    await settingsSection(page, 'appearance');
    await page.getByRole('radio', { name: theme, exact: true }).check();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const style = await contrast('.rich-content');
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.ratio).toBeGreaterThanOrEqual(4.5);
  }
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note content' }).fill('A readable note.');
  expect((await contrast('.plain-note .rich-content')).ratio).toBeGreaterThanOrEqual(4.5);
});
