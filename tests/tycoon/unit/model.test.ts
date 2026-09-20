import { describe, expect, it } from 'vitest';
import { createInitialScenarioState, loadScenarioDefinition } from '../../../src/tycoon/data/loadScenarioDefinition';
import { SCENARIO_001 } from '../../../src/tycoon/data/scenario-001';
import {
  buildFreeCellMask,
  createInitialAirState,
  remapAirStateForTopology,
  resolveEquipmentGeometry,
  validatePlacement,
} from '../../../src/tycoon/model/placement';
import type {
  EquipmentDefinition,
  EquipmentInstance,
  RackDefinition,
  RackInstance,
  RoomDefinition,
  ScenarioDefinition,
} from '../../../src/tycoon/model/types';
import { validateScenarioDefinition } from '../../../src/tycoon/model/validation';

function cloneDefinition(): ScenarioDefinition {
  return structuredClone(SCENARIO_001);
}

function rackDefinition(): RackDefinition {
  return loadScenarioDefinition().equipment.find(
    (definition): definition is RackDefinition => definition.kind === 'rack' && definition.id === 'rack-balanced',
  )!;
}

function rackInstance(
  definition: RackDefinition,
  id: string,
  x: number,
  y: number,
  orientation: RackInstance['orientation'] = 'north',
): RackInstance {
  return {
    kind: 'rack',
    id,
    definitionId: definition.id,
    position: { x, y },
    orientation,
    acquisitionPriceMicrocents: definition.purchasePriceMicrocents,
    resaleValueMicrocents: 720_000_000_000,
    workloadCapFraction: 1,
    effectiveRequestedWorkloadFraction: 0,
    requestedPowerMilliW: 0,
    allocatedPowerMilliW: 0,
    actualFlowM3s: 0,
    operatingState: 'off',
    limitReasons: [],
    intakeTemperatureC: null,
    exhaustTemperatureC: null,
    thermalFactor: 1,
    usefulOutputMilliServiceUnits: 0,
    recoveryCoolMs: 0,
  };
}

function placementContext(
  room: RoomDefinition,
  definitions: EquipmentDefinition[],
  equipment: EquipmentInstance[] = [],
) {
  return { room, definitions, equipment };
}

describe('scenario definition and initial state', () => {
  it('loads the reference definition with three distinct racks, one finite cooler, and JSON-safe initial state', () => {
    const definition = loadScenarioDefinition();
    const racks = definition.equipment.filter((item) => item.kind === 'rack');
    const coolers = definition.equipment.filter((item) => item.kind === 'cooler');

    expect(racks).toHaveLength(3);
    expect(coolers).toHaveLength(1);
    expect(new Set(racks.map((rack) => rack.purchasePriceMicrocents)).size).toBe(3);
    expect(new Set(racks.map((rack) => rack.nameplateServiceUnits)).size).toBe(3);
    expect(definition.economy.startingCashMicrocents).toSatisfy(Number.isSafeInteger);

    const state = createInitialScenarioState(definition, 'test-run');
    expect(state).toMatchObject({
      scenarioId: definition.id,
      scenarioRevision: definition.revision,
      runId: 'test-run',
      mode: 'offered',
      paused: true,
      equipment: [],
    });
    expect(state.air.temperatureC).toHaveLength(120);
    expect(state.air.temperatureC.filter((value) => value === null)).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('rejects non-finite, unsafe, unstable, and incomplete definitions with paths', () => {
    const nonFinite = cloneDefinition();
    nonFinite.equipment[0]!.maxPowerW = Number.POSITIVE_INFINITY;
    const unsafe = cloneDefinition();
    unsafe.economy.startingCashMicrocents = Number.MAX_SAFE_INTEGER + 1;
    const unstable = cloneDefinition();
    unstable.model.mixingConductanceM3s = 100;
    const gap = cloneDefinition();
    gap.workload[0]!.startMs = 100;

    for (const [candidate, expectedPath] of [
      [nonFinite, 'equipment[0].maxPowerW'],
      [unsafe, 'economy.startingCashMicrocents'],
      [unstable, 'model.mixingConductanceM3s'],
      [gap, 'workload[0].startMs'],
    ] as const) {
      const result = validateScenarioDefinition(candidate);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.some((issue) => issue.path === expectedPath)).toBe(true);
      expect(() => loadScenarioDefinition(candidate)).toThrow(/Invalid scenario definition/);
    }
  });

  it('returns a detached definition so callers cannot mutate the shipped source', () => {
    const loaded = loadScenarioDefinition();
    loaded.room.blockedCells.push({ x: 1, y: 1 });
    expect(SCENARIO_001.room.blockedCells).toHaveLength(2);
  });
});

describe('rotated equipment geometry and placement', () => {
  it('rotates rack ports and service access clockwise around its footprint', () => {
    const geometry = resolveEquipmentGeometry(rackDefinition(), { x: 3, y: 3 }, 'east');
    expect(geometry.footprint).toEqual([{ x: 3, y: 3 }]);
    expect(geometry.ports).toEqual({ intake: { x: 4, y: 3 }, exhaust: { x: 2, y: 3 } });
    expect(geometry.serviceAccess).toEqual([{ x: 3, y: 4 }]);

    const cooler = loadScenarioDefinition().equipment.find((definition) => definition.kind === 'cooler')!;
    const coolerGeometry = resolveEquipmentGeometry(cooler, { x: 7, y: 2 }, 'east');
    expect(coolerGeometry).toMatchObject({ widthCells: 1, depthCells: 2 });
    expect(coolerGeometry.footprint).toEqual([{ x: 7, y: 2 }, { x: 7, y: 3 }]);
    expect(coolerGeometry.ports).toEqual({ return: { x: 7, y: 4 }, supply: { x: 7, y: 1 } });
  });

  it('allows two devices to share a service cell but rejects a footprint placed into it', () => {
    const definition = loadScenarioDefinition();
    const rack = rackDefinition();
    const existing = rackInstance(rack, 'rack-a', 2, 2, 'north');
    const context = placementContext(definition.room, definition.equipment, [existing]);

    const sharedAccess = validatePlacement(rack, { x: 4, y: 2 }, 'south', context);
    expect(sharedAccess.ok).toBe(true);
    if (sharedAccess.ok) expect(sharedAccess.geometry.serviceAccess).toEqual([{ x: 3, y: 2 }]);

    const before = structuredClone(context.equipment);
    const occupiesExistingAccess = validatePlacement(rack, { x: 3, y: 2 }, 'north', context);
    expect(occupiesExistingAccess).toMatchObject({ ok: false, code: 'SERVICE_ACCESS_BLOCKED' });
    expect(context.equipment).toEqual(before);
  });

  it('treats a blocked port as a warning while obstacles and heat cells block footprints', () => {
    const definition = loadScenarioDefinition();
    const rack = rackDefinition();
    const context = placementContext(definition.room, definition.equipment);

    const blockedExhaust = validatePlacement(rack, { x: 5, y: 3 }, 'north', context);
    expect(blockedExhaust).toMatchObject({
      ok: true,
      warnings: [{ code: 'PORT_BLOCKED', port: 'exhaust', position: { x: 5, y: 4 } }],
    });
    expect(validatePlacement(rack, { x: 5, y: 4 }, 'north', context)).toMatchObject({
      ok: false,
      code: 'FOOTPRINT_BLOCKED',
    });
    expect(validatePlacement(rack, { x: 0, y: 9 }, 'east', context)).toMatchObject({
      ok: false,
      code: 'FOOTPRINT_BLOCKED',
    });

    const instance = rackInstance(rack, 'rack-blocked', 5, 3);
    const mask = buildFreeCellMask(definition.room, [instance], definition.equipment);
    expect(mask[4 * definition.room.widthCells + 5]).toBe(false); // permanent obstruction
    expect(mask[3 * definition.room.widthCells + 5]).toBe(false); // equipment footprint
    expect(mask[9 * definition.room.widthCells]).toBe(true); // heat source remains air
  });

  it('requires rotated ports and service cells to remain in bounds and checks funds without mutation', () => {
    const definition = loadScenarioDefinition();
    const rack = rackDefinition();
    const context = {
      ...placementContext(definition.room, definition.equipment),
      isPurchase: true,
      availableCashMicrocents: rack.purchasePriceMicrocents - 1,
    };
    expect(validatePlacement(rack, { x: 2, y: 2 }, 'north', context)).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_FUNDS',
    });
    expect(validatePlacement(rack, { x: 0, y: 2 }, 'west', placementContext(definition.room, definition.equipment)))
      .toMatchObject({ ok: false, code: 'OUT_OF_BOUNDS' });
  });
});

describe('thermal topology remapping', () => {
  it('preserves stable/free and newly occupied temperatures, averages newly freed cells, and invalidates flow', () => {
    const room: RoomDefinition = {
      widthCells: 3,
      heightCells: 3,
      cellSizeM: 1,
      mixingHeightM: 3,
      blockedCells: [],
      requiredAccessCells: [],
      powerLimitW: 10_000,
      initialTemperatureC: 21,
      envelopeHeatWByCell: [],
    };
    const previous = createInitialAirState(room);
    previous.temperatureC = [10, 20, 30, 40, 99, 60, 70, 80, 90];
    previous.freeCellMask[4] = false;
    previous.flowValid = true;
    previous.faceFlowXM3s.fill(2);
    previous.faceFlowYM3s.fill(-2);
    const nextMask = previous.freeCellMask.slice();
    nextMask[4] = true;
    nextMask[8] = false;
    const original = structuredClone(previous);

    const remapped = remapAirStateForTopology(previous, nextMask, room);

    expect(remapped.temperatureC[4]).toBe(50); // mean of north/east/south/west: 20,60,80,40
    expect(remapped.temperatureC[0]).toBe(10);
    expect(remapped.temperatureC[8]).toBe(90); // dormant shadow retained when occupied
    expect(remapped.flowValid).toBe(false);
    expect(remapped.faceFlowXM3s.every((flow) => flow === 0)).toBe(true);
    expect(remapped.faceFlowYM3s.every((flow) => flow === 0)).toBe(true);
    expect(previous).toEqual(original);
  });
});

// Dollar conversions are specification behavior, not derived from the catalog.
it('prices and startup cash match the displayed dollar values without unsafe arithmetic', () => {
  const centsPerDollar = 100;
  const microcentsPerCent = 1_000_000;
  const dollars = (amount: number) => amount / microcentsPerCent / centsPerDollar;
  expect(dollars(SCENARIO_001.economy.startingCashMicrocents)).toBe(150_000);
  expect(SCENARIO_001.equipment.map(item => dollars(item.purchasePriceMicrocents))).toEqual([8_000, 12_000, 18_000, 25_000]);
  expect(Number.isSafeInteger(SCENARIO_001.economy.startingCashMicrocents)).toBe(true);
});
