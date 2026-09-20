import { expect, test } from '@playwright/test';

test('design trial worker leaves the browser event loop responsive and supports cancellation', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // Vite serves the real application modules, including its module worker.
    const { runTrialAsync } = await import('/src/tycoon/workers/runTrialAsync.ts');
    const { SCENARIO_001 } = await import('/src/tycoon/data/scenario-001.ts');
    let heartbeats = 0;
    const interval = setInterval(() => heartbeats++, 20);
    const trial = await runTrialAsync(SCENARIO_001, { fixtureId: 'good-layout', workloadFraction: 1, durationMs: 30_000, commitToLive: false });
    clearInterval(interval);
    const controller = new AbortController();
    const pending = runTrialAsync(SCENARIO_001, { fixtureId: 'good-layout', workloadFraction: 1, durationMs: 600_000, commitToLive: false }, controller.signal);
    controller.abort();
    let cancellation = '';
    try { await pending; } catch (error) { cancellation = (error as Error).name; }
    return { ok: trial.ok, heartbeats, cancellation, projected: trial.ok && trial.report.projected };
  });
  expect(result.ok).toBe(true);
  expect(result.projected).toBe(true);
  expect(result.heartbeats).toBeGreaterThan(3);
  expect(result.cancellation).toBe('AbortError');
});
