import { expect, test, type Page } from '@playwright/test';

async function enterPlanning(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter planning room', exact: true }).click();
  await page.getByRole('button', { name: 'Accept contract', exact: true }).click();
}

async function placeRack(page: Page) {
  await page.locator('[data-action="catalog"][data-definition-id="rack-economy"]').click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
}

function storedState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hici-tycoon-save-v1')!).state);
}

test('operation, speed, overlays, save, and responsive resize preserve authoritative state', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await enterPlanning(page);
  await placeRack(page);

  const canvas = page.locator('.tycoon-canvas');
  await canvas.focus();
  await page.keyboard.press('o');
  await expect(page.locator('[data-role="overlay-value"]')).toHaveText('Airflow');
  await page.keyboard.press('o');
  await expect(page.locator('[data-role="overlay-value"]')).toHaveText('Off');
  await page.locator('[data-action="overlay"]').click();
  await expect(page.locator('[data-role="overlay-value"]')).toHaveText('Temperature');

  await page.locator('[data-action="speed"][data-speed="4"]').click();
  await expect(page.locator('[data-action="speed"][data-speed="4"]')).toHaveClass(/is-active/);
  const operationToggle = page.locator('[data-action="toggle-operation"]');
  await operationToggle.click();
  await expect(page.locator('[data-role="mode"]')).toHaveText('OPERATING');
  await operationToggle.hover();
  await expect(operationToggle).toHaveCSS('color', 'rgb(6, 23, 27)');
  await expect(operationToggle).toHaveCSS('background-color', 'rgb(143, 245, 237)');
  await expect.poll(async () => page.locator('[data-role="clock"]').textContent()).not.toContain('00:00 /');
  await canvas.focus();
  await page.keyboard.press('p');
  await expect(page.locator('[data-role="mode"]')).toHaveText('PLANNING');

  await page.locator('[data-action="save"]').click();
  await expect(page.locator('[data-role="status"]')).toContainText('Saved locally');
  const beforeResize = await storedState(page);
  await page.setViewportSize({ width: 900, height: 850 });
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Boolean((await canvas.boundingBox())?.width)).toBe(true);
  const resizedBox = await canvas.boundingBox();
  expect(resizedBox!.width).toBeGreaterThan(500);
  expect(resizedBox!.height).toBeGreaterThan(350);
  await page.locator('[data-action="save"]').click();
  expect(await storedState(page)).toEqual(beforeResize);
  await page.screenshot({ path: testInfo.outputPath('tycoon-responsive-operation.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(canvas).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('tycoon-desktop-operation.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('save write failure is visible and operation is safely paused', async ({ page }) => {
  await enterPlanning(page);
  await placeRack(page);
  await page.locator('[data-action="toggle-operation"]').click();
  await expect(page.locator('[data-role="mode"]')).toHaveText('OPERATING');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('hici-tycoon-save-v1')) throw new DOMException('quota probe', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('[data-role="status"]')).toContainText('STORAGE_WRITE_FAILED');
  await expect(page.locator('[data-role="status"]')).toHaveAttribute('data-error', 'true');
  await expect(page.locator('[data-role="mode"]')).toHaveText('PLANNING');
});

test('classic campaign link remains reachable from the desktop tycoon', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter planning room', exact: true }).click();
  await page.getByRole('link', { name: /Classic campaign/ }).click();
  await expect(page).toHaveURL(/\?mode=classic$/);
  await expect(page.locator('canvas')).toBeVisible();
});
