import { describe, expect, it } from 'vitest';
import { loadScenarioDefinition } from '../../../src/tycoon/data/loadScenarioDefinition';
import { buildFreeCellMask, createInitialAirState } from '../../../src/tycoon/model/placement';
import type {
  CoolerDefinition,
  CoolerInstance,
  EquipmentInstance,
  RackDefinition,
  RackInstance,
  ScenarioDefinition,
} from '../../../src/tycoon/model/types';
import { solveAirflow, type ForcedAirLink } from '../../../src/tycoon/simulation/AirflowSolver';
import { controlEquipmentAndAllocatePower } from '../../../src/tycoon/simulation/RackControls';
import { simulateSpatialTick, transportHeat } from '../../../src/tycoon/simulation/ThermalTransport';

function definition(width = 7, height = 5): ScenarioDefinition {
  const value = loadScenarioDefinition();
  value.room = {
    widthCells: width,
    heightCells: height,
    cellSizeM: 1,
    mixingHeightM: 3,
    blockedCells: [],
    requiredAccessCells: [],
    powerLimitW: 120_000,
    initialTemperatureC: 20,
    envelopeHeatWByCell: [],
  };
  value.model.mixingConductanceM3s = 0;
  value.initialEquipment = [];
  value.trialFixtures = [];
  return value;
}

function rackDefinition(source: ScenarioDefinition): RackDefinition {
  return source.equipment.find(
    (item): item is RackDefinition => item.kind === 'rack' && item.id === 'rack-balanced',
  )!;
}

function coolerDefinition(source: ScenarioDefinition): CoolerDefinition {
  return source.equipment.find((item): item is CoolerDefinition => item.kind === 'cooler')!;
}

function rack(
  source: ScenarioDefinition,
  id: string,
  x: number,
  y: number,
  orientation: RackInstance['orientation'] = 'east',
): RackInstance {
  const item = rackDefinition(source);
  return {
    kind: 'rack',
    id,
    definitionId: item.id,
    position: { x, y },
    orientation,
    acquisitionPriceMicrocents: item.purchasePriceMicrocents,
    resaleValueMicrocents: 0,
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

function cooler(
  source: ScenarioDefinition,
  id: string,
  x: number,
  y: number,
  orientation: CoolerInstance['orientation'] = 'north',
): CoolerInstance {
  const item = coolerDefinition(source);
  return {
    kind: 'cooler',
    id,
    definitionId: item.id,
    position: { x, y },
    orientation,
    acquisitionPriceMicrocents: item.purchasePriceMicrocents,
    resaleValueMicrocents: 0,
    workloadCapFraction: 1,
    effectiveRequestedWorkloadFraction: 0,
    requestedPowerMilliW: 0,
    allocatedPowerMilliW: 0,
    actualFlowM3s: 0,
    operatingState: 'off',
    limitReasons: [],
    commandedCoolingFraction: 1,
    returnTemperatureC: null,
    supplyTemperatureC: null,
    heatRemovedW: 0,
    capacityLimited: false,
  };
}

function airFor(source: ScenarioDefinition, equipment: EquipmentInstance[] = []) {
  const air = createInitialAirState(source.room);
  air.freeCellMask = buildFreeCellMask(source.room, equipment, source.equipment);
  return air;
}

function cell(source: ScenarioDefinition, x: number, y: number): number {
  return y * source.room.widthCells + x;
}

describe('pressure-corrected airflow and conservative transport', () => {
  it('balances every closed component deterministically for paired fan transfers', () => {
    const source = definition();
    const air = airFor(source);
    const links: ForcedAirLink[] = [
      { equipmentInstanceId: 'fan-a', kind: 'rack', fromCell: cell(source, 1, 2), toCell: cell(source, 5, 2), flowM3s: 1.1 },
      { equipmentInstanceId: 'fan-b', kind: 'cooler', fromCell: cell(source, 5, 3), toCell: cell(source, 1, 3), flowM3s: 0.7 },
    ];

    const first = solveAirflow(source.room, source.model, air, links);
    const second = solveAirflow(source.room, source.model, air, links);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(first.value.maxCellAbsResidualM3s).toBeLessThanOrEqual(source.model.flowResidualToleranceM3s);
    expect(first.value.iterationCount).toBeGreaterThan(0);
    expect(first.value.faceFlowXM3s.some((flow) => Math.abs(flow) > 0.01)).toBe(true);
  });

  it('moves upstream heat in rack orientation and changes actual cell transport around an obstruction', () => {
    const source = definition();
    const balanced = rackDefinition(source);
    balanced.thermalControl.fullOutputThroughC = 90;
    balanced.thermalControl.shutdownAtC = 100;
    balanced.thermalControl.recoverAtOrBelowC = 80;

    const westwardRack = rack(source, 'rack-a', 3, 2, 'east');
    const westwardAir = airFor(source, [westwardRack]);
    westwardAir.temperatureC[cell(source, 4, 2)] = 30; // east-facing intake
    const westward = simulateSpatialTick(source, westwardAir, [westwardRack], 1, 1);

    const eastwardRack = rack(source, 'rack-a', 3, 2, 'west');
    const eastwardAir = airFor(source, [eastwardRack]);
    eastwardAir.temperatureC[cell(source, 4, 2)] = 30; // now the exhaust, not the intake
    const eastward = simulateSpatialTick(source, eastwardAir, [eastwardRack], 1, 1);

    expect(westward.ok).toBe(true);
    expect(eastward.ok).toBe(true);
    if (!westward.ok || !eastward.ok) return;
    expect(westward.air.temperatureC[cell(source, 2, 2)]!)
      .toBeGreaterThan(eastward.air.temperatureC[cell(source, 2, 2)]! + 0.2);
    expect((westward.equipment[0] as RackInstance).intakeTemperatureC).toBe(30);

    const link: ForcedAirLink = {
      equipmentInstanceId: 'transport-fan',
      kind: 'rack',
      fromCell: cell(source, 1, 2),
      toCell: cell(source, 5, 2),
      flowM3s: 1,
    };
    const openAir = airFor(source);
    openAir.temperatureC[link.fromCell] = 35;
    const openFlow = solveAirflow(source.room, source.model, openAir, [link]);
    expect(openFlow.ok).toBe(true);
    if (!openFlow.ok) return;
    const openTransport = transportHeat(
      source.room, source.model, openAir, [], source.equipment, [link], openFlow.value,
    );

    const obstructedSource = definition();
    obstructedSource.room.blockedCells = [{ x: 3, y: 2 }];
    const obstructedAir = airFor(obstructedSource);
    obstructedAir.temperatureC[link.fromCell] = 35;
    const obstructedFlow = solveAirflow(
      obstructedSource.room, obstructedSource.model, obstructedAir, [link],
    );
    expect(obstructedFlow.ok).toBe(true);
    if (!obstructedFlow.ok) return;
    const obstructedTransport = transportHeat(
      obstructedSource.room,
      obstructedSource.model,
      obstructedAir,
      [],
      obstructedSource.equipment,
      [link],
      obstructedFlow.value,
    );
    expect(openTransport.ok).toBe(true);
    expect(obstructedTransport.ok).toBe(true);
    if (!openTransport.ok || !obstructedTransport.ok) return;
    // Donor-cell transport samples the prior state, so the hot destination enters
    // the obstruction-dependent passive field on the following tick.
    const openSecond = transportHeat(
      source.room, source.model, openTransport.air, [], source.equipment, [link], openFlow.value,
    );
    const obstructedSecond = transportHeat(
      obstructedSource.room,
      obstructedSource.model,
      obstructedTransport.air,
      [],
      obstructedSource.equipment,
      [link],
      obstructedFlow.value,
    );
    expect(openSecond.ok).toBe(true);
    expect(obstructedSecond.ok).toBe(true);
    if (!openSecond.ok || !obstructedSecond.ok) return;
    const commonDifferences = openSecond.air.temperatureC
      .map((temperature, index) => obstructedAir.freeCellMask[index]
        ? Math.abs(temperature! - obstructedSecond.air.temperatureC[index]!)
        : 0);
    expect(Math.max(...commonDifferences)).toBeGreaterThan(0.001);
  });

  it('passes declared mass and whole-room energy audits with rack, cooler, mixing, and envelope heat', () => {
    const source = definition(9, 7);
    source.model.mixingConductanceM3s = 0.03;
    source.room.envelopeHeatWByCell = [{ position: { x: 8, y: 6 }, heatW: 500 }];
    const equipment: EquipmentInstance[] = [
      rack(source, 'rack-a', 4, 2, 'east'),
      cooler(source, 'cooler-a', 2, 5, 'north'),
    ];
    const air = airFor(source, equipment);
    air.temperatureC[cell(source, 4, 6)] = 32;

    const result = simulateSpatialTick(source, air, equipment, 1, 4);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.air.lastFlowResidualM3s).toBeLessThanOrEqual(source.model.flowResidualToleranceM3s);
    expect(result.thermalAudit.energyResidualJ)
      .toBeLessThanOrEqual(result.thermalAudit.allowedEnergyResidualJ);
    expect(result.thermalAudit.externalNetHeatJ).not.toBe(0);
    expect(result.air.flowValid).toBe(true);
  });
});

describe('equipment limits, recovery, and atomic failures', () => {
  it('saturates finite cooling instead of assigning the target temperature', () => {
    const source = definition(8, 6);
    const item = cooler(source, 'cooler-a', 2, 3, 'north');
    const air = airFor(source, [item]);
    // North-oriented cooler returns on the east and supplies on the west.
    air.temperatureC[cell(source, 4, 3)] = 40;

    const result = simulateSpatialTick(source, air, [item], 0, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = result.equipment[0] as CoolerInstance;
    expect(updated.heatRemovedW).toBe(coolerDefinition(source).ratedHeatRemovalW);
    expect(updated.capacityLimited).toBe(true);
    expect(updated.limitReasons).toContain('COOLER_CAPACITY');
    expect(updated.supplyTemperatureC).toBeGreaterThan(coolerDefinition(source).targetSupplyC);
  });

  it('de-energizes zero-flow equipment and allocates cooling before proportional rack power', () => {
    const source = definition(9, 6);
    const blockedRack = rack(source, 'rack-blocked', 3, 2, 'east');
    source.room.blockedCells = [{ x: 4, y: 2 }]; // intake
    const blockedAir = airFor(source, [blockedRack]);
    const blocked = controlEquipmentAndAllocatePower(
      source.room, source.equipment, [blockedRack], blockedAir, 1, source.model.tickMs,
    ).equipment[0] as RackInstance;
    expect(blocked).toMatchObject({
      requestedPowerMilliW: 0,
      allocatedPowerMilliW: 0,
      actualFlowM3s: 0,
      usefulOutputMilliServiceUnits: 0,
    });
    expect(blocked.limitReasons).toEqual(['INTAKE_BLOCKED', 'INSUFFICIENT_FLOW']);

    const separatedSource = definition();
    separatedSource.room.blockedCells = [
      { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 4 },
      { x: 2, y: 3 }, { x: 4, y: 3 },
    ];
    const separatedRack = rack(separatedSource, 'rack-separated', 3, 2, 'east');
    const separated = controlEquipmentAndAllocatePower(
      separatedSource.room,
      separatedSource.equipment,
      [separatedRack],
      airFor(separatedSource, [separatedRack]),
      1,
      separatedSource.model.tickMs,
    ).equipment[0] as RackInstance;
    expect(separated.actualFlowM3s).toBe(0);
    expect(separated.limitReasons).toEqual(['INSUFFICIENT_FLOW']);

    const poweredSource = definition(10, 7);
    poweredSource.room.powerLimitW = 15_000;
    const poweredEquipment: EquipmentInstance[] = [
      rack(poweredSource, 'rack-a', 6, 2, 'east'),
      cooler(poweredSource, 'cooler-a', 2, 5, 'north'),
    ];
    const allocation = controlEquipmentAndAllocatePower(
      poweredSource.room,
      poweredSource.equipment,
      poweredEquipment,
      airFor(poweredSource, poweredEquipment),
      1,
      poweredSource.model.tickMs,
    );
    expect((allocation.equipment.find((item) => item.kind === 'cooler')!).allocatedPowerMilliW)
      .toBe(15_000_000);
    expect((allocation.equipment.find((item) => item.kind === 'rack')!).allocatedPowerMilliW).toBe(0);
    expect(allocation.totalAllocatedPowerMilliW).toBeLessThanOrEqual(15_000_000);
  });

  it('holds thermal shutdown until the configured cool recovery interval completes', () => {
    const source = definition();
    const balanced = rackDefinition(source);
    balanced.thermalControl.recoverHoldMs = 200;
    const initial = rack(source, 'rack-a', 3, 2, 'east');
    const hotAir = airFor(source, [initial]);
    hotAir.temperatureC[cell(source, 4, 2)] = balanced.thermalControl.shutdownAtC;
    const shutdown = controlEquipmentAndAllocatePower(
      source.room, source.equipment, [initial], hotAir, 1, source.model.tickMs,
    ).equipment[0] as RackInstance;
    expect(shutdown.operatingState).toBe('thermal-shutdown');
    expect(shutdown.allocatedPowerMilliW).toBe(0);

    const coolAir = structuredClone(hotAir);
    coolAir.temperatureC[cell(source, 4, 2)] = balanced.thermalControl.recoverAtOrBelowC;
    const holding = controlEquipmentAndAllocatePower(
      source.room, source.equipment, [shutdown], coolAir, 1, source.model.tickMs,
    ).equipment[0] as RackInstance;
    expect(holding.operatingState).toBe('thermal-shutdown');
    expect(holding.recoveryCoolMs).toBe(100);
    const recovered = controlEquipmentAndAllocatePower(
      source.room, source.equipment, [holding], coolAir, 1, source.model.tickMs,
    ).equipment[0] as RackInstance;
    expect(recovered.operatingState).not.toBe('thermal-shutdown');
    expect(recovered.recoveryCoolMs).toBe(200);
    expect(recovered.actualFlowM3s).toBeGreaterThan(0);
  });

  it('rejects non-finite and CFL-unstable ticks without mutating air or equipment', () => {
    const source = definition();
    const item = rack(source, 'rack-a', 3, 2, 'east');
    const air = airFor(source, [item]);
    const pristineAir = structuredClone(air);
    const pristineEquipment = structuredClone([item]);

    const nonFiniteAir = structuredClone(air);
    nonFiniteAir.temperatureC[cell(source, 4, 2)] = Number.NaN;
    const nonFiniteSnapshot = structuredClone(nonFiniteAir);
    const nonFinite = simulateSpatialTick(source, nonFiniteAir, [item], 1, 9);
    expect(nonFinite).toMatchObject({ ok: false, diagnostic: { code: 'NON_FINITE_STATE', simulatedTick: 9 } });
    expect(nonFiniteAir).toEqual(nonFiniteSnapshot);
    expect([item]).toEqual(pristineEquipment);

    const unstable = structuredClone(source);
    unstable.model.maxOutgoingVolumeFraction = 0.001;
    const cfl = simulateSpatialTick(unstable, air, [item], 1, 10);
    expect(cfl).toMatchObject({ ok: false, diagnostic: { code: 'CFL_EXCEEDED', simulatedTick: 10 } });
    expect(air).toEqual(pristineAir);
    expect([item]).toEqual(pristineEquipment);
  });
});
