import { expect, test } from '@playwright/test';

interface BrowserProfile {
  rackCount: number;
  userAgent: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  frameMs: { median: number; p95: number; max: number; fpsFromMedian: number };
  inputToFrameMs: { median: number; p95: number; max: number };
  physicsTickMs: { median: number; p95: number; max: number };
}

test('profiles the real renderer, controller, and physics with 24 racks', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.route('**/performance-harness.html', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#game-container{width:100%;height:100%;margin:0}</style></head><body><div id="game-container"></div><script type="module">
      import { createTycoonShellMarkup } from '/src/tycoon/bootstrap.ts';
      import { SCENARIO_001 } from '/src/tycoon/data/scenario-001.ts';
      import { RoomRenderer } from '/src/tycoon/rendering/RoomRenderer.ts';
      import { ScenarioEngine } from '/src/tycoon/state/ScenarioEngine.ts';
      import { RoomController } from '/src/tycoon/ui/RoomController.ts';
      import '/src/tycoon/ui/room.css';
      localStorage.setItem('hici-tycoon-help-v1', 'seen');
      localStorage.removeItem('hici-tycoon-save-v1');
      const definition = structuredClone(SCENARIO_001);
      definition.economy.startingCashMicrocents = 250_000 * 100_000_000;
      definition.initialEquipment = [1, 3, 5, 7].flatMap((y) => [0, 2, 4, 6, 8, 10].map((x, index) => ({
        kind: 'rack', id: 'rack-' + y + '-' + index, definitionId: 'rack-economy', position: { x, y }, orientation: 'north'
      })));
      const root = document.getElementById('game-container');
      root.innerHTML = createTycoonShellMarkup();
      const stage = root.querySelector('[data-role="stage"]');
      const engine = new ScenarioEngine(definition);
      const renderer = new RoomRenderer(stage, definition);
      window.__profileEngine = engine;
      window.__profileController = new RoomController(root, renderer, definition, engine);
      window.__profileReady = true;
    </script></body></html>`,
  }));
  await page.goto('/performance-harness.html');
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__profileReady))).toBe(true);
  await expect(page.locator('.tycoon-rack-label')).toHaveCount(24);
  await page.locator('[data-action="accept"]').click();
  await page.locator('[data-action="toggle-operation"]').click();
  await expect(page.locator('[data-role="mode"]')).toHaveText('OPERATING');

  const frameIntervals = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const values: number[] = [];
    let prior = performance.now();
    const began = prior;
    const sample = (now: number) => {
      values.push(now - prior);
      prior = now;
      if (now - began >= 5000 && values.length >= 3) resolve(values.slice(1));
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));

  await page.evaluate(() => {
    (window as any).__inputSamples = [];
    document.querySelector('.tycoon-canvas')!.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key.toLowerCase() !== 'o') return;
      const began = performance.now();
      requestAnimationFrame(() => (window as any).__inputSamples.push(performance.now() - began));
    }, { capture: true });
  });
  await page.locator('.tycoon-canvas').focus();
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press('o');
    await page.waitForTimeout(20);
  }
  await expect.poll(() => page.evaluate(() => (window as any).__inputSamples.length)).toBe(20);
  const inputSamples = await page.evaluate(() => (window as any).__inputSamples as number[]);

  const physicsSamples = await page.evaluate(() => {
    const definition = structuredClone((window as any).__profileEngine.definition);
    const Engine = (window as any).__profileEngine.constructor;
    const engine = new Engine(definition);
    engine.dispatch({ type: 'ACCEPT_CONTRACT' });
    engine.dispatch({ type: 'RESUME' });
    const values: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      const began = performance.now();
      engine.advanceTicks(1);
      values.push(performance.now() - began);
    }
    return values.slice(20);
  });

  const summarize = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
    return { median: at(0.5), p95: at(0.95), max: sorted.at(-1)! };
  };
  const frame = summarize(frameIntervals);
  const profile: BrowserProfile = {
    rackCount: 24,
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })),
    frameMs: { ...frame, fpsFromMedian: 1000 / frame.median },
    inputToFrameMs: summarize(inputSamples),
    physicsTickMs: summarize(physicsSamples),
  };
  await testInfo.attach('performance-profile.json', {
    body: Buffer.from(JSON.stringify(profile, null, 2)), contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('tycoon-24-racks.png'), fullPage: true });

  expect(profile.rackCount).toBe(24);
  expect(profile.frameMs.median).toBeGreaterThan(0);
  expect(profile.inputToFrameMs.p95).toBeLessThan(100);
  expect(profile.physicsTickMs.p95).toBeLessThan(100);
});
