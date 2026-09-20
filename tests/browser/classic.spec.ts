import { expect, test } from '@playwright/test';

test('classic campaign still boots without touching its stored progress', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('hici-progress', JSON.stringify({ levels: {} }));
  });
  await page.goto('/?mode=classic');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.locator('canvas').evaluate(canvas => canvas.width)).toBeGreaterThan(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hici-progress')!))).toEqual({ levels: {} });
  expect(failures).toEqual([]);
});
