import { describe, expect, it } from 'vitest';
import { loadScenarioDefinition } from '../../../src/tycoon/data/loadScenarioDefinition';
import { ScenarioEngine } from '../../../src/tycoon/state/ScenarioEngine';

describe('isolated projected trials', () => {
  it('runs a named layout through engine ticks and returns explicitly projected results', () => {
    const engine = new ScenarioEngine(loadScenarioDefinition());
    const before = engine.createStateSnapshot();
    const result = engine.runTrial({
      fixtureId: 'transport-check',
      workloadFraction: 0.75,
      durationMs: 300,
      commitToLive: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report).toMatchObject({
      label: 'NON-ECONOMIC TRIAL',
      projected: true,
      scenarioId: 'scenario-001',
      scenarioRevision: '1.0.0',
      tickCount: 3,
      durationMs: 300,
    });
    expect(result.report.layoutHash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.report.equipmentInventoryHash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.report.projectedLedger.length).toBeGreaterThan(0);
    expect(result.report.deliveredMilliServiceUnitMs).toBeGreaterThan(0);
    expect(engine.createStateSnapshot()).toEqual(before);
  });

  it('does not change live state or any external storage on successful or failed trials', () => {
    const engine = new ScenarioEngine(loadScenarioDefinition());
    engine.dispatch({ type: 'ACCEPT_CONTRACT' });
    const before = JSON.stringify(engine.createStateSnapshot());
    const storage = new Map([['hici-tycoon-save-v1', 'untouched'], ['hici-progress', 'classic']]);

    expect(engine.runTrial({
      fixtureId: 'transport-check', workloadFraction: 1, durationMs: 100, commitToLive: false,
    }).ok).toBe(true);
    expect(engine.runTrial({
      fixtureId: 'missing-fixture', workloadFraction: 1, durationMs: 100, commitToLive: false,
    })).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_DEFINITION' } });

    expect(JSON.stringify(engine.createStateSnapshot())).toBe(before);
    expect([...storage]).toEqual([
      ['hici-tycoon-save-v1', 'untouched'],
      ['hici-progress', 'classic'],
    ]);
  });

  it('can start from a detached live snapshot without mutating it or the engine', () => {
    const engine = new ScenarioEngine(loadScenarioDefinition());
    engine.dispatch({ type: 'ACCEPT_CONTRACT' });
    engine.dispatch({
      type: 'PLACE', definitionId: 'rack-economy', position: { x: 3, y: 3 }, orientation: 'north',
    });
    const snapshot = engine.createStateSnapshot();
    const snapshotBefore = structuredClone(snapshot);
    const liveBefore = engine.createStateSnapshot();
    const result = engine.runTrial({
      initialState: snapshot, workloadFraction: 0.5, durationMs: 200, commitToLive: false,
    });
    expect(result.ok).toBe(true);
    expect(snapshot).toEqual(snapshotBefore);
    expect(engine.createStateSnapshot()).toEqual(liveBefore);
  });
});
