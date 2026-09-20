import { TycoonSaveStore } from '../../../src/tycoon/persistence/TycoonSaveStore';
import { expect, it } from 'vitest';
import { SCENARIO_001 } from '../../../src/tycoon/data/scenario-001';
import { ScenarioEngine } from '../../../src/tycoon/state/ScenarioEngine';
import type { InitialPlacement } from '../../../src/tycoon/model/types';
import { GOOD_LAYOUT, POOR_LAYOUT } from '../fixtures/matchedLayouts';

async function run(placements: InitialPlacement[]) {
  const definition = structuredClone(SCENARIO_001);
  definition.initialEquipment = structuredClone(placements);
  const engine = new ScenarioEngine(definition);
  expect(engine.dispatch({ type: 'ACCEPT_CONTRACT' }).ok).toBe(true);
  expect(engine.dispatch({ type: 'RESUME' }).ok).toBe(true);
  let peak = definition.room.initialTemperatureC;
  for (let tick = 0; tick < definition.contract.durationMs / definition.model.tickMs; tick++) {
    const result = engine.advanceTicks(1);
    if (result.diagnostic) throw new Error(JSON.stringify(result.diagnostic));
    expect(result.advancedTicks).toBe(1);
    for (const item of result.view.equipment) if (item.kind === 'rack') peak = Math.max(peak, item.intakeTemperatureC ?? -Infinity);
    // Keep Vitest's worker RPC responsive during this intentionally long exact-tick fixture.
    if (tick > 0 && tick % 100 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
  }
  // A full ledger must fit with both staging and prior primary under a 5 MiB quota.
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => {
      const candidate = new Map(values); candidate.set(key, value);
      const size = [...candidate].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
      if (size > 5 * 1024 * 1024) throw new Error('storage quota exceeded');
      values.set(key, value);
    },
  };
  const store = new TycoonSaveStore(definition, storage);
  expect(store.save(engine).ok).toBe(true);
  expect(store.save(engine).ok).toBe(true);
  const loaded = store.load();
  expect(loaded.ok).toBe(true);
  if (loaded.ok) expect(loaded.state).toEqual(engine.createStateSnapshot());
  return { peak, state: engine.createStateSnapshot() };
}

it('rewards cold-aisle engineering with cooler intakes, reliable service and greater profit using identical inventory', async () => {
  const goodFixture = SCENARIO_001.trialFixtures.find((fixture) => fixture.id === 'good-layout');
  const poorFixture = SCENARIO_001.trialFixtures.find((fixture) => fixture.id === 'poor-layout');
  expect(goodFixture).toMatchObject({
    scenarioId: SCENARIO_001.id,
    scenarioRevision: SCENARIO_001.revision,
    initialEquipment: GOOD_LAYOUT,
    workloadFraction: 1,
    durationMs: SCENARIO_001.contract.durationMs,
    commitToLive: false,
  });
  expect(poorFixture).toMatchObject({
    scenarioId: SCENARIO_001.id,
    scenarioRevision: SCENARIO_001.revision,
    initialEquipment: POOR_LAYOUT,
    workloadFraction: 1,
    durationMs: SCENARIO_001.contract.durationMs,
    commitToLive: false,
  });
  const inventory = (layout: InitialPlacement[]) => layout.map(item => item.definitionId).sort();
  expect(inventory(GOOD_LAYOUT)).toEqual(inventory(POOR_LAYOUT));
  const good = await run(GOOD_LAYOUT), poor = await run(POOR_LAYOUT);
  expect(poor.peak - good.peak).toBeGreaterThanOrEqual(5);
  expect(good.state.accounts.operatingProfitMicrocents).toBeGreaterThan(poor.state.accounts.operatingProfitMicrocents);
  expect(good.state.accounts.operatingProfitMicrocents).toBeGreaterThan(0);
  expect(good.state.contractProgress.status).toBe('succeeded');
  expect(poor.state.contractProgress.status).toBe('failed');
  expect(good.state.accounts.capitalPurchasesMicrocents).toBe(poor.state.accounts.capitalPurchasesMicrocents);
  expect(good.state.accounts.capitalPurchasesMicrocents).toBeLessThan(SCENARIO_001.economy.startingCashMicrocents);
  expect(good.state.simulatedTimeMs).toBe(SCENARIO_001.contract.durationMs);
  expect(poor.state.simulatedTimeMs).toBe(good.state.simulatedTimeMs);
}, 120_000);
