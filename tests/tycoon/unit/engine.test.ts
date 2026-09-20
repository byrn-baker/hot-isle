import { describe, expect, it } from 'vitest';
import { loadScenarioDefinition } from '../../../src/tycoon/data/loadScenarioDefinition';
import { ScenarioEngine } from '../../../src/tycoon/state/ScenarioEngine';

function acceptedEngine(): ScenarioEngine {
  const engine = new ScenarioEngine(loadScenarioDefinition());
  expect(engine.dispatch({ type: 'ACCEPT_CONTRACT' }).ok).toBe(true);
  return engine;
}

function placeRack(engine: ScenarioEngine, x = 3, y = 3) {
  return engine.dispatch({
    type: 'PLACE',
    definitionId: 'rack-economy',
    position: { x, y },
    orientation: 'north',
  });
}

describe('scenario command engine', () => {
  it('makes purchase/resale lossy and restores a purchase exactly with undo', () => {
    const engine = acceptedEngine();
    const before = engine.createStateSnapshot();
    const purchase = placeRack(engine);
    expect(purchase.ok).toBe(true);
    const purchased = engine.createStateSnapshot();
    expect(purchased.accounts.cashMicrocents).toBeLessThan(before.accounts.cashMicrocents);
    expect(purchased.undo).toHaveLength(1);

    expect(engine.dispatch({ type: 'UNDO' })).toMatchObject({ ok: true, stateChanged: true });
    expect(engine.createStateSnapshot()).toEqual(before);

    expect(placeRack(engine).ok).toBe(true);
    const rackId = engine.createStateSnapshot().equipment[0]!.id;
    expect(engine.dispatch({ type: 'REMOVE', instanceId: rackId }).ok).toBe(true);
    const afterCycle = engine.createStateSnapshot();
    expect(afterCycle.accounts.cashMicrocents).toBeLessThan(before.accounts.cashMicrocents);
    expect(afterCycle.accounts.capitalPurchasesMicrocents).toBeGreaterThan(
      afterCycle.accounts.resaleProceedsMicrocents,
    );
  });

  it('rejects invalid edits atomically and clears undo only when operation resumes', () => {
    const engine = acceptedEngine();
    expect(placeRack(engine).ok).toBe(true);
    const afterPurchase = engine.createStateSnapshot();
    const failed = placeRack(engine);
    expect(failed).toMatchObject({ ok: false, code: 'OCCUPIED' });
    expect(engine.createStateSnapshot()).toEqual(afterPurchase);

    expect(engine.dispatch({ type: 'RESUME' }).ok).toBe(true);
    expect(engine.createStateSnapshot().undo).toEqual([]);
    const operating = engine.createStateSnapshot();
    const editWhileRunning = engine.dispatch({
      type: 'MOVE',
      instanceId: operating.equipment[0]!.id,
      position: { x: 4, y: 3 },
      orientation: 'north',
    });
    expect(editWhileRunning).toMatchObject({ ok: false, code: 'NOT_PAUSED' });
    expect(engine.createStateSnapshot()).toEqual(operating);
  });

  it('applies move, rotate, workload, and cooling controls only in paused planning', () => {
    const engine = acceptedEngine();
    expect(placeRack(engine).ok).toBe(true);
    expect(engine.dispatch({
      type: 'PLACE',
      definitionId: 'cooler-floor-80',
      position: { x: 7, y: 6 },
      orientation: 'north',
    }).ok).toBe(true);
    const [rack, cooler] = engine.createStateSnapshot().equipment
      .sort((a, b) => a.kind === 'rack' ? -1 : b.kind === 'rack' ? 1 : 0);
    expect(engine.dispatch({
      type: 'MOVE', instanceId: rack!.id, position: { x: 4, y: 3 }, orientation: 'north',
    }).ok).toBe(true);
    expect(engine.dispatch({ type: 'ROTATE', instanceId: rack!.id, orientation: 'east' }).ok).toBe(true);
    expect(engine.dispatch({ type: 'SET_WORKLOAD', instanceId: rack!.id, fraction: 0.4 }).ok).toBe(true);
    expect(engine.dispatch({ type: 'SET_COOLING', instanceId: cooler!.id, fraction: 0.25 }).ok).toBe(true);
    const configured = engine.createStateSnapshot();
    expect(configured.equipment.find((item) => item.id === rack!.id)).toMatchObject({
      position: { x: 4, y: 3 }, orientation: 'east', workloadCapFraction: 0.4,
    });
    expect(configured.equipment.find((item) => item.id === cooler!.id)).toMatchObject({
      commandedCoolingFraction: 0.25,
    });
    const invalid = engine.dispatch({ type: 'SET_COOLING', instanceId: cooler!.id, fraction: 1.1 });
    expect(invalid).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
    expect(engine.createStateSnapshot()).toEqual(configured);
  });

  it('pauses without advancing or changing thermal, contract, or financial state', () => {
    const engine = acceptedEngine();
    expect(placeRack(engine).ok).toBe(true);
    expect(engine.dispatch({ type: 'RESUME' }).ok).toBe(true);
    expect(engine.advanceTicks(2).advancedTicks).toBe(2);
    const beforePause = engine.createStateSnapshot();
    expect(engine.dispatch({ type: 'PAUSE' })).toMatchObject({ ok: true, stateChanged: true });
    const paused = engine.createStateSnapshot();
    expect(paused).toMatchObject({ mode: 'planning', paused: true });
    expect(paused.air).toEqual(beforePause.air);
    expect(paused.equipment).toEqual(beforePause.equipment);
    expect(paused.contractProgress).toEqual(beforePause.contractProgress);
    expect(paused.accounts).toEqual(beforePause.accounts);
    expect(paused.accrualRemainders).toEqual(beforePause.accrualRemainders);
    const frozen = engine.createStateSnapshot();
    expect(engine.advanceTicks(20)).toMatchObject({ advancedTicks: 0, stateChanged: false });
    expect(engine.createStateSnapshot()).toEqual(frozen);
  });

  it('is identical for repeated runs and equal tick counts at different selected speeds', () => {
    const run = (speed: 1 | 2 | 4, chunks: number[]) => {
      const engine = acceptedEngine();
      expect(placeRack(engine).ok).toBe(true);
      expect(engine.dispatch({ type: 'SET_SPEED', speed }).ok).toBe(true);
      expect(engine.dispatch({ type: 'RESUME' }).ok).toBe(true);
      for (const count of chunks) expect(engine.advanceTicks(count).advancedTicks).toBe(count);
      expect(engine.dispatch({ type: 'SET_SPEED', speed: 1 }).ok).toBe(true);
      return engine.createStateSnapshot();
    };
    const repeatedA = run(1, [10]);
    const repeatedB = run(1, [10]);
    const accelerated = run(4, [4, 6]);
    expect(repeatedB).toEqual(repeatedA);
    expect(accelerated).toEqual(repeatedA);
  });

  it('reports reliability shortfall and bankruptcy as distinct terminal causes', () => {
    const shortfallDefinition = loadScenarioDefinition();
    shortfallDefinition.contract.durationMs = 200;
    shortfallDefinition.workload = [{ startMs: 0, endMs: 200, demandFraction: 1 }];
    const shortfall = new ScenarioEngine(shortfallDefinition);
    shortfall.dispatch({ type: 'ACCEPT_CONTRACT' });
    shortfall.dispatch({ type: 'RESUME' });
    expect(shortfall.advanceTicks(2).advancedTicks).toBe(2);
    expect(shortfall.createView()).toMatchObject({
      mode: 'failed',
      paused: true,
      contractProgress: { status: 'failed', failureReason: 'RELIABILITY_SHORTFALL' },
    });

    const bankruptcyDefinition = loadScenarioDefinition();
    bankruptcyDefinition.economy.startingCashMicrocents = 0;
    const bankruptcy = new ScenarioEngine(bankruptcyDefinition);
    bankruptcy.dispatch({ type: 'ACCEPT_CONTRACT' });
    bankruptcy.dispatch({ type: 'RESUME' });
    expect(bankruptcy.advanceTicks(10).advancedTicks).toBe(1);
    expect(bankruptcy.createView()).toMatchObject({
      mode: 'failed',
      paused: true,
      contractProgress: { status: 'failed', failureReason: 'BANKRUPTCY' },
    });
  });
});

it('keeps historical ledger snapshots isolated across subsequent ticks and caller edits', () => {
  const engine = acceptedEngine();
  expect(placeRack(engine).ok).toBe(true);
  engine.dispatch({ type: 'RESUME' });
  engine.advanceTicks(5);
  const snapshot = engine.createStateSnapshot();
  const saved = JSON.stringify(snapshot);
  engine.advanceTicks(5);
  expect(JSON.stringify(snapshot)).toBe(saved);
  const current = engine.createStateSnapshot();
  snapshot.ledger[0]!.amountMicrocents = 123;
  expect(engine.createStateSnapshot()).toEqual(current);
});
