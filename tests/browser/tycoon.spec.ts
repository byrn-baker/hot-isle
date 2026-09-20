import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter planning room', exact: true }).click();
  await page.getByRole('button', { name: 'Accept contract', exact: true }).click();
}
async function placeAndSelect(page: Page) {
  await page.locator('[data-action="catalog"][data-definition-id="rack-dense"]').click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await expect(page.locator('.tycoon-rack-label')).toHaveCount(1);
}
async function savedState(page: Page) {
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('[data-role="status"]')).toContainText('Saved locally');
  return page.evaluate(() => JSON.parse(localStorage.getItem('hici-tycoon-save-v1')!).state);
}

test('keyboard placement, movement, right-click sale, undo and paused reload preserve the room', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page); await placeAndSelect(page);
  await page.keyboard.press('m'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); await page.keyboard.press('r');
  let state = await savedState(page);
  expect(state.equipment[0].position).toEqual({ x: 3, y: 2 });
  expect(state.equipment[0].orientation).toBe('east');
  const label = await page.locator('.tycoon-rack-label').boundingBox();
  expect(label).not.toBeNull();
  await page.mouse.click(label!.x + label!.width / 2, label!.y + label!.height + 25, { button: 'right' });
  await expect(page.locator('.tycoon-rack-label')).toHaveCount(0);
  await expect(page.locator('[data-role="cash"]')).toHaveText('$142,800.00');
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('.tycoon-rack-label')).toHaveCount(1);
  state = await savedState(page);
  await page.reload();
  await expect(page.locator('.tycoon-rack-label')).toHaveCount(1);
  await expect(page.locator('[data-role="mode"]')).toHaveText('PLANNING');
  expect(await savedState(page)).toEqual(state);
  expect(errors).toEqual([]);
});

test('workload slider retains keyboard focus and help contains keyboard focus', async ({ page }) => {
  await start(page); await placeAndSelect(page);
  const slider = page.locator('[data-control="workload"]');
  await slider.focus();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('85'); await expect(slider).toBeFocused();
  await page.locator('[data-action="help"]').click();
  const close = page.locator('[data-action="close-help"]');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused();
  await expect(page.locator('[data-role="help"]')).toContainText('Tab');
  await page.keyboard.press('Escape'); await expect(page.locator('[data-role="help"]')).toBeHidden();
});

test('cancelled and completed design trials never change the paused live scenario', async ({ page }) => {
  await start(page); await placeAndSelect(page);
  const before = await savedState(page);
  await page.locator('[data-action="trial-current"]').click();
  await page.locator('[data-action="cancel-trial"]').click();
  await expect(page.locator('[data-role="trial-result"]')).toContainText('cancelled');
  expect(await savedState(page)).toEqual(before);
  await page.locator('[data-action="trial-current"]').click();
  await expect(page.locator('[data-role="trial-result"]')).toContainText(/projected/i, { timeout: 20_000 });
  await expect(page.locator('[data-action="cancel-trial"]')).toBeHidden();
  expect(await savedState(page)).toEqual(before);
});
