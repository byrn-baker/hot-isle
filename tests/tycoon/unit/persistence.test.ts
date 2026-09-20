import { describe, expect, it } from 'vitest';
import { loadScenarioDefinition } from '../../../src/tycoon/data/loadScenarioDefinition';
import type { StorageLike } from '../../../src/tycoon/persistence/TycoonSaveStore';
import {
  TYCOON_SAVE_KEY,
  TYCOON_STAGING_KEY,
  TycoonSaveStore,
} from '../../../src/tycoon/persistence/TycoonSaveStore';
import { ScenarioEngine } from '../../../src/tycoon/state/ScenarioEngine';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly calls: Array<{ method: string; key: string }> = [];
  failRead = false;
  failWriteKey: string | null = null;

  getItem(key: string): string | null {
    this.calls.push({ method: 'get', key });
    if (this.failRead) throw new Error('storage blocked');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.calls.push({ method: 'set', key });
    if (this.failWriteKey === key) throw new DOMException('quota full', 'QuotaExceededError');
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.calls.push({ method: 'remove', key });
    this.values.delete(key);
  }
}

function runningEngine(): ScenarioEngine {
  const engine = new ScenarioEngine(loadScenarioDefinition());
  expect(engine.dispatch({ type: 'ACCEPT_CONTRACT' }).ok).toBe(true);
  expect(engine.dispatch({
    type: 'PLACE', definitionId: 'rack-economy', position: { x: 3, y: 3 }, orientation: 'north',
  }).ok).toBe(true);
  expect(engine.dispatch({ type: 'SET_WORKLOAD', instanceId: 'equipment-1', fraction: 0.6 }).ok).toBe(true);
  expect(engine.dispatch({ type: 'SET_SPEED', speed: 4 }).ok).toBe(true);
  expect(engine.dispatch({ type: 'RESUME' }).ok).toBe(true);
  expect(engine.advanceTicks(3).advancedTicks).toBe(3);
  return engine;
}

describe('tycoon save persistence', () => {
  it('round-trips the complete paused thermal, control, financial, and time state', () => {
    const definition = loadScenarioDefinition();
    const storage = new MemoryStorage();
    const store = new TycoonSaveStore(definition, storage);
    const engine = runningEngine();

    const saved = store.save(engine, '2026-09-13T12:00:00.000Z');
    expect(saved.ok).toBe(true);
    const paused = engine.createStateSnapshot();
    expect(paused).toMatchObject({ mode: 'planning', paused: true, selectedSpeed: 4, simulatedTimeMs: 300 });
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(paused);
    expect(loaded.state.air.flowValid).toBe(true);
    expect(loaded.state.equipment[0]).toMatchObject({ workloadCapFraction: 0.6 });
    expect(loaded.state.accounts).toEqual(paused.accounts);
    expect(loaded.state.accrualRemainders).toEqual(paused.accrualRemainders);
    expect(loaded.state.ledger).toEqual(paused.ledger);
    expect(storage.values.has(TYCOON_STAGING_KEY)).toBe(false);
  });

  it('reloads an active serialized run paused without offline time or earnings', () => {
    const definition = loadScenarioDefinition();
    const storage = new MemoryStorage();
    const engine = runningEngine();
    const operating = engine.createStateSnapshot();
    const envelope = {
      schemaVersion: 1 as const,
      kind: 'hot-isle-tycoon-save' as const,
      savedAt: '2000-01-01T00:00:00.000Z',
      scenarioId: definition.id,
      scenarioRevision: definition.revision,
      state: operating,
    };
    storage.values.set(TYCOON_SAVE_KEY, JSON.stringify(envelope));

    const loaded = new TycoonSaveStore(definition, storage).load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual({ ...operating, mode: 'planning', paused: true });
    expect(loaded.state.simulatedTimeMs).toBe(operating.simulatedTimeMs);
    expect(loaded.state.contractProgress).toEqual(operating.contractProgress);
    expect(loaded.state.accounts).toEqual(operating.accounts);
  });

  it('rejects malformed nested state, unsupported versions, and incompatible revisions in place', () => {
    const definition = loadScenarioDefinition();
    const storage = new MemoryStorage();
    const store = new TycoonSaveStore(definition, storage);
    const engine = runningEngine();
    engine.dispatch({ type: 'PAUSE' });
    const valid = engine.createSave('2026-09-13T12:00:00.000Z');

    const cases: Array<{ raw: string; code: string; path?: string }> = [
      { raw: '{bad json', code: 'INVALID_SAVE' },
      { raw: JSON.stringify({ ...valid, schemaVersion: undefined }), code: 'INVALID_SAVE', path: '$.schemaVersion' },
      { raw: JSON.stringify({ ...valid, schemaVersion: 2 }), code: 'UNSUPPORTED_VERSION', path: '$.schemaVersion' },
      { raw: JSON.stringify({ ...valid, scenarioRevision: 'old' }), code: 'INVALID_SAVE', path: '$' },
      { raw: JSON.stringify({ ...valid, state: { ...valid.state, air: { ...valid.state.air, temperatureC: [21] } } }), code: 'INVALID_SAVE', path: '$.state.air.temperatureC' },
      { raw: JSON.stringify({ ...valid, state: { ...valid.state, accounts: { ...valid.state.accounts, cashMicrocents: valid.state.accounts.cashMicrocents + 1 } } }), code: 'INVALID_SAVE', path: '$.state.accounts' },
    ];
    for (const item of cases) {
      storage.values.set(TYCOON_SAVE_KEY, item.raw);
      const result = store.load();
      expect(result).toMatchObject({ ok: false, error: { code: item.code, ...(item.path ? { path: item.path } : {}) } });
      expect(storage.values.get(TYCOON_SAVE_KEY)).toBe(item.raw);
    }
  });

  it('reports unavailable/read/quota failures, pauses the game, and preserves the previous primary save', () => {
    const definition = loadScenarioDefinition();
    const unavailableEngine = runningEngine();
    expect(new TycoonSaveStore(definition, null).save(unavailableEngine)).toMatchObject({
      ok: false, error: { code: 'STORAGE_UNAVAILABLE' },
    });
    expect(unavailableEngine.createStateSnapshot()).toMatchObject({ mode: 'planning', paused: true });

    const storage = new MemoryStorage();
    const previous = 'previous-good-save';
    storage.values.set(TYCOON_SAVE_KEY, previous);
    storage.failRead = true;
    expect(new TycoonSaveStore(definition, storage).load()).toMatchObject({
      ok: false, error: { code: 'STORAGE_READ_FAILED' },
    });
    expect(storage.values.get(TYCOON_SAVE_KEY)).toBe(previous);

    storage.failRead = false;
    storage.failWriteKey = TYCOON_SAVE_KEY;
    const quotaEngine = runningEngine();
    expect(new TycoonSaveStore(definition, storage).save(quotaEngine)).toMatchObject({
      ok: false, error: { code: 'STORAGE_WRITE_FAILED' },
    });
    expect(quotaEngine.createStateSnapshot()).toMatchObject({ mode: 'planning', paused: true });
    expect(storage.values.get(TYCOON_SAVE_KEY)).toBe(previous);
    expect(storage.values.has(TYCOON_STAGING_KEY)).toBe(true);
  });

  it('touches only the two tycoon keys and never classic campaign storage', () => {
    const definition = loadScenarioDefinition();
    const storage = new MemoryStorage();
    storage.values.set('hici-progress', 'classic-progress');
    storage.values.set('hici-custom-levels', 'classic-levels');
    storage.values.set('hici-difficulty', 'classic-difficulty');
    const store = new TycoonSaveStore(definition, storage);
    expect(store.save(runningEngine()).ok).toBe(true);
    expect(store.load().ok).toBe(true);
    expect(new Set(storage.calls.map(({ key }) => key))).toEqual(new Set([
      TYCOON_SAVE_KEY, TYCOON_STAGING_KEY,
    ]));
    expect(storage.values.get('hici-progress')).toBe('classic-progress');
    expect(storage.values.get('hici-custom-levels')).toBe('classic-levels');
    expect(storage.values.get('hici-difficulty')).toBe('classic-difficulty');
  });
});
