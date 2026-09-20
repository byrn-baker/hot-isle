import { expect, test } from '@playwright/test';

test('orbit and exact rack selection preserve the room and support movement', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter planning room', exact: true }).click();
  await page.locator('[data-action="accept"]').click();
  await page.locator('[data-definition-id="rack-economy"]').click();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space'); await page.keyboard.press('Escape');
  const label = await page.locator('[data-instance-id="equipment-1"]').boundingBox();
  await page.mouse.click(label!.x + label!.width / 2, label!.y + label!.height + 18);
  await expect(page.locator('.tycoon-inspection-title')).toContainText('equipment-1');
  const floor = await page.locator('.tycoon-canvas').boundingBox();
  const labelBeforeDrag = await page.locator('[data-instance-id="equipment-1"]').boundingBox();
  await page.mouse.move(floor!.x + 80, floor!.y + floor!.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(floor!.x + 180, floor!.y + floor!.height / 2, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => (await page.locator('[data-instance-id="equipment-1"]').boundingBox())!.x).not.toBe(labelBeforeDrag!.x);
  await page.mouse.wheel(0, 80);
  await page.locator('[data-action="save"]').click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('hici-tycoon-save-v1')!).state);
  for (let turn = 0; turn < 4; turn++) {
    await page.locator('[data-action="orbit-right"]').click();
    const rack = page.locator('[data-instance-id="equipment-1"]');
    await rack.click();
    await expect(page.locator('.tycoon-inspection-title')).toContainText('equipment-1');
    await page.locator('[data-instance-id="equipment-2"]').click();
    await expect(page.locator('.tycoon-inspection-title')).toContainText('equipment-2');
  }
  await page.locator('.tycoon-canvas').focus(); await page.keyboard.press('q');
  await page.locator('[data-action="camera"]').click();
  await page.locator('[data-action="zoom-in"]').click();
  await page.locator('[data-action="save"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hici-tycoon-save-v1')!).state)).toEqual(before);
  await page.locator('[data-instance-id="equipment-1"]').click();
  await page.locator('[data-action="move"]').click();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');
  await page.locator('[data-action="save"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hici-tycoon-save-v1')!).state.equipment[0].position)).toEqual({ x: 2, y: 3 });
  await page.locator('[data-instance-id="equipment-1"]').click({ button: 'right' });
  await expect(page.locator('[data-instance-id="equipment-1"]')).toHaveCount(0);
  await expect(page.locator('[data-instance-id="equipment-2"]')).toHaveCount(1);
});

test.describe('touch layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('keeps every stat visible and supports touch building and view controls', async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter planning room', exact: true }).tap();
    for (const role of ['cash', 'profit', 'clock', 'service', 'power', 'reliability']) {
      const stat = page.locator(`[data-role="${role}"]`);
      await expect(stat).toBeVisible();
      const box = await stat.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    await page.locator('[data-action="accept"]').tap();
    await page.locator('[data-definition-id="rack-economy"]').tap();
    await page.locator('[data-action="camera"]').tap();
    const canvas = page.locator('.tycoon-canvas'); await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    // In plan view an empty tile left of the central columns is unobstructed.
    await page.touchscreen.tap(box!.x + box!.width * 0.36, box!.y + box!.height * 0.52);
    await expect(page.locator('.tycoon-rack-label')).toHaveCount(1);
    expect((await page.locator('.tycoon-rack-label').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.locator('.tycoon-rack-label').tap();
    await expect(page.locator('.tycoon-inspection-title')).toContainText('equipment-1');
    await page.locator('[data-action="rotate"]').tap();
    await page.locator('[data-action="orbit-right"]').tap();
    await page.locator('[data-action="zoom-in"]').tap();
    await page.locator('[data-action="save"]').tap();
    await expect(page.locator('[data-role="status"]')).toContainText('Saved locally');
    await page.locator('.tycoon-topbar').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('mobile-room.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    for (const role of ['cash', 'profit', 'clock', 'service', 'power', 'reliability']) {
      const stat = page.locator(`[data-role="${role}"]`); await expect(stat).toBeVisible();
      const bounds = await stat.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(844);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
