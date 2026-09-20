import { refreshDormantTemperatureSamples } from '../model/placement';
import type {
  AirState,
  CoolerDefinition,
  EquipmentDefinition,
  EquipmentInstance,
  ModelParameters,
  RoomDefinition,
  ScenarioDefinition,
  SimulationDiagnostic,
} from '../model/types';
import { solveAirflow, type AirflowSolution, type ForcedAirLink } from './AirflowSolver';
import { controlEquipmentAndAllocatePower } from './RackControls';

export interface ThermalAudit {
  energyBeforeJ: number;
  energyAfterJ: number;
  externalNetHeatJ: number;
  energyResidualJ: number;
  allowedEnergyResidualJ: number;
  maxOutgoingVolumeFraction: number;
}

export type ThermalTransportResult =
  | { ok: true; air: AirState; equipment: EquipmentInstance[]; audit: ThermalAudit }
  | {
      ok: false;
      code: 'CFL_EXCEEDED' | 'ENERGY_RESIDUAL_EXCEEDED' | 'NON_FINITE_STATE';
      measuredValue?: number;
      allowedValue?: number;
      reason: string;
    };

export type SpatialTickResult =
  | {
      ok: true;
      air: AirState;
      equipment: EquipmentInstance[];
      thermalAudit: ThermalAudit;
      totalAllocatedPowerMilliW: number;
    }
  | { ok: false; diagnostic: SimulationDiagnostic };

function isFiniteTree(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((item) => isFiniteTree(item, seen));
}

function definitionFor(
  definitions: readonly EquipmentDefinition[],
  instance: EquipmentInstance,
): EquipmentDefinition | undefined {
  return definitions.find((candidate) => candidate.id === instance.definitionId
    && candidate.kind === instance.kind);
}

function addDirectedTransfer(
  deltaEnergyJ: number[],
  outgoingM3s: number[],
  fromCell: number,
  toCell: number,
  flowM3s: number,
  temperatureC: readonly (number | null)[],
  density: number,
  specificHeat: number,
  tickS: number,
): boolean {
  const donorTemperatureC = temperatureC[fromCell];
  if (donorTemperatureC === null || donorTemperatureC === undefined) return false;
  const energyJ = density * specificHeat * flowM3s * tickS * donorTemperatureC;
  deltaEnergyJ[fromCell] = deltaEnergyJ[fromCell]! - energyJ;
  deltaEnergyJ[toCell] = deltaEnergyJ[toCell]! + energyJ;
  outgoingM3s[fromCell] = outgoingM3s[fromCell]! + flowM3s;
  return Number.isFinite(energyJ);
}

/** Applies conservative donor-cell advection, symmetric mixing, and finite equipment heat. */
export function transportHeat(
  room: RoomDefinition,
  model: ModelParameters,
  previousAir: AirState,
  equipment: readonly EquipmentInstance[],
  definitions: readonly EquipmentDefinition[],
  forcedLinks: readonly ForcedAirLink[],
  airflow: AirflowSolution,
): ThermalTransportResult {
  const cellCount = room.widthCells * room.heightCells;
  if (previousAir.temperatureC.length !== cellCount || previousAir.freeCellMask.length !== cellCount
      || !isFiniteTree({ previousAir, equipment, forcedLinks, airflow })) {
    return { ok: false, code: 'NON_FINITE_STATE', reason: 'non-finite or malformed transport input' };
  }
  const density = model.airDensityKgM3;
  const specificHeat = model.airSpecificHeatJKgK;
  const volumeM3 = room.cellSizeM * room.cellSizeM * room.mixingHeightM;
  const heatCapacityJPerK = density * specificHeat * volumeM3;
  const tickS = model.tickMs / 1_000;
  const deltaEnergyJ = Array(cellCount).fill(0) as number[];
  const outgoingM3s = Array(cellCount).fill(0) as number[];
  let valid = true;

  const handleFace = (low: number, high: number, flowM3s: number): void => {
    if (!previousAir.freeCellMask[low] || !previousAir.freeCellMask[high]) return;
    if (flowM3s >= 0) {
      valid = addDirectedTransfer(
        deltaEnergyJ, outgoingM3s, low, high, flowM3s,
        previousAir.temperatureC, density, specificHeat, tickS,
      ) && valid;
    } else {
      valid = addDirectedTransfer(
        deltaEnergyJ, outgoingM3s, high, low, -flowM3s,
        previousAir.temperatureC, density, specificHeat, tickS,
      ) && valid;
    }
    const lowTemperature = previousAir.temperatureC[low];
    const highTemperature = previousAir.temperatureC[high];
    if (lowTemperature === null || lowTemperature === undefined
        || highTemperature === null || highTemperature === undefined) {
      valid = false;
      return;
    }
    const mixedJ = density * specificHeat * model.mixingConductanceM3s * tickS
      * (highTemperature - lowTemperature);
    deltaEnergyJ[low] = deltaEnergyJ[low]! + mixedJ;
    deltaEnergyJ[high] = deltaEnergyJ[high]! - mixedJ;
    valid = Number.isFinite(mixedJ) && valid;
  };

  for (let y = 0; y < room.heightCells; y += 1) {
    for (let x = 0; x < room.widthCells; x += 1) {
      const low = y * room.widthCells + x;
      if (x + 1 < room.widthCells) {
        handleFace(low, low + 1, airflow.faceFlowXM3s[y * (room.widthCells - 1) + x] ?? 0);
      }
      if (y + 1 < room.heightCells) {
        handleFace(low, low + room.widthCells, airflow.faceFlowYM3s[y * room.widthCells + x] ?? 0);
      }
    }
  }
  for (const link of forcedLinks) {
    valid = addDirectedTransfer(
      deltaEnergyJ, outgoingM3s, link.fromCell, link.toCell, link.flowM3s,
      previousAir.temperatureC, density, specificHeat, tickS,
    ) && valid;
  }

  let maxOutgoingVolumeFraction = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (!previousAir.freeCellMask[cell]) continue;
    maxOutgoingVolumeFraction = Math.max(
      maxOutgoingVolumeFraction,
      tickS * outgoingM3s[cell]! / volumeM3,
    );
  }
  if (!valid || !Number.isFinite(maxOutgoingVolumeFraction)) {
    return { ok: false, code: 'NON_FINITE_STATE', reason: 'non-finite energy transfer' };
  }
  if (maxOutgoingVolumeFraction > model.maxOutgoingVolumeFraction) {
    return {
      ok: false,
      code: 'CFL_EXCEEDED',
      measuredValue: maxOutgoingVolumeFraction,
      allowedValue: model.maxOutgoingVolumeFraction,
      reason: 'donor-cell outgoing volume fraction exceeded the configured bound',
    };
  }

  const linkByEquipmentId = new Map(forcedLinks.map((link) => [link.equipmentInstanceId, link]));
  let rackHeatJ = 0;
  let coolerRemovedJ = 0;
  const nextEquipment = equipment.map((instance): EquipmentInstance => {
    const definition = definitionFor(definitions, instance);
    const link = linkByEquipmentId.get(instance.id);
    if (!definition || !link) {
      return instance.kind === 'rack'
        ? { ...instance, intakeTemperatureC: null, exhaustTemperatureC: null }
        : {
            ...instance,
            returnTemperatureC: null,
            supplyTemperatureC: null,
            heatRemovedW: 0,
            capacityLimited: false,
          };
    }
    const inletTemperatureC = previousAir.temperatureC[link.fromCell];
    if (inletTemperatureC === null || inletTemperatureC === undefined || link.flowM3s <= 0) {
      return instance;
    }
    if (definition.kind === 'rack' && instance.kind === 'rack') {
      const actualItPowerW = instance.allocatedPowerMilliW / 1_000;
      const heatJ = actualItPowerW * tickS;
      deltaEnergyJ[link.toCell] = deltaEnergyJ[link.toCell]! + heatJ;
      rackHeatJ += heatJ;
      return {
        ...instance,
        intakeTemperatureC: inletTemperatureC,
        exhaustTemperatureC: inletTemperatureC
          + actualItPowerW / (density * specificHeat * link.flowM3s),
      };
    }
    if (definition.kind !== 'cooler' || instance.kind !== 'cooler') return instance;
    const coolerDefinition = definition as CoolerDefinition;
    const allocationFraction = instance.requestedPowerMilliW > 0
      ? instance.allocatedPowerMilliW / instance.requestedPowerMilliW
      : 0;
    const requestedRemovalW = density * specificHeat * link.flowM3s
      * Math.max(inletTemperatureC - coolerDefinition.targetSupplyC, 0);
    const removalCapW = coolerDefinition.ratedHeatRemovalW
      * instance.commandedCoolingFraction * allocationFraction;
    const heatRemovedW = Math.min(requestedRemovalW, removalCapW);
    const removedJ = heatRemovedW * tickS;
    deltaEnergyJ[link.toCell] = deltaEnergyJ[link.toCell]! - removedJ;
    coolerRemovedJ += removedJ;
    const capacityLimited = heatRemovedW < requestedRemovalW;
    return {
      ...instance,
      returnTemperatureC: inletTemperatureC,
      supplyTemperatureC: inletTemperatureC - heatRemovedW
        / (density * specificHeat * link.flowM3s),
      heatRemovedW,
      capacityLimited,
      limitReasons: capacityLimited
        ? [...instance.limitReasons.filter((reason) => reason !== 'COOLER_CAPACITY'), 'COOLER_CAPACITY']
        : instance.limitReasons.filter((reason) => reason !== 'COOLER_CAPACITY'),
    };
  });

  let envelopeHeatJ = 0;
  for (const source of room.envelopeHeatWByCell) {
    const cell = source.position.y * room.widthCells + source.position.x;
    if (!previousAir.freeCellMask[cell]) continue;
    const heatJ = source.heatW * tickS;
    deltaEnergyJ[cell] = deltaEnergyJ[cell]! + heatJ;
    envelopeHeatJ += heatJ;
  }

  let energyBeforeJ = 0;
  let energyAfterJ = 0;
  const temperatureC = previousAir.temperatureC.slice();
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (!previousAir.freeCellMask[cell]) continue;
    const previousTemperatureC = previousAir.temperatureC[cell];
    if (previousTemperatureC === null || previousTemperatureC === undefined) {
      return { ok: false, code: 'NON_FINITE_STATE', reason: 'free cell has no temperature' };
    }
    const beforeJ = heatCapacityJPerK * previousTemperatureC;
    const afterJ = beforeJ + deltaEnergyJ[cell]!;
    const nextTemperatureC = afterJ / heatCapacityJPerK;
    if (!Number.isFinite(afterJ) || !Number.isFinite(nextTemperatureC)
        || nextTemperatureC < model.minTemperatureC || nextTemperatureC > model.maxTemperatureC) {
      return {
        ok: false,
        code: 'NON_FINITE_STATE',
        measuredValue: nextTemperatureC,
        reason: 'candidate temperature is non-finite or outside the configured range',
      };
    }
    temperatureC[cell] = nextTemperatureC;
    energyBeforeJ += beforeJ;
    energyAfterJ += afterJ;
  }

  const externalNetHeatJ = rackHeatJ + envelopeHeatJ - coolerRemovedJ;
  const energyResidualJ = Math.abs((energyAfterJ - energyBeforeJ) - externalNetHeatJ);
  const allowedEnergyResidualJ = Math.max(
    model.energyAbsoluteToleranceJ,
    model.energyRelativeTolerance * Math.max(Math.abs(energyBeforeJ), Math.abs(energyAfterJ)),
  );
  if (!isFiniteTree({ temperatureC, nextEquipment, energyResidualJ, externalNetHeatJ })) {
    return { ok: false, code: 'NON_FINITE_STATE', reason: 'non-finite candidate state' };
  }
  if (energyResidualJ > allowedEnergyResidualJ) {
    return {
      ok: false,
      code: 'ENERGY_RESIDUAL_EXCEEDED',
      measuredValue: energyResidualJ,
      allowedValue: allowedEnergyResidualJ,
      reason: 'whole-room thermal energy residual exceeded tolerance',
    };
  }

  const air = refreshDormantTemperatureSamples({
    ...previousAir,
    temperatureC,
    faceFlowXM3s: airflow.faceFlowXM3s.slice(),
    faceFlowYM3s: airflow.faceFlowYM3s.slice(),
    flowValid: true,
    lastFlowResidualM3s: airflow.maxCellAbsResidualM3s,
    lastEnergyResidualJ: energyResidualJ,
    lastIterationCount: airflow.iterationCount,
  }, room);
  return {
    ok: true,
    air,
    equipment: nextEquipment,
    audit: {
      energyBeforeJ,
      energyAfterJ,
      externalNetHeatJ,
      energyResidualJ,
      allowedEnergyResidualJ,
      maxOutgoingVolumeFraction,
    },
  };
}

function diagnostic(
  simulatedTick: number,
  failure: {
    code: SimulationDiagnostic['code'];
    measuredValue?: number;
    allowedValue?: number;
    reason: string;
  },
): SimulationDiagnostic {
  return {
    code: failure.code,
    simulatedTick,
    messageKey: `tycoon.simulation.${failure.code.toLowerCase()}`,
    measuredValue: failure.measuredValue,
    allowedValue: failure.allowedValue,
    details: { reason: failure.reason },
  };
}

/** Runs the complete spatial part of one tick without mutating inputs on failure. */
export function simulateSpatialTick(
  definition: ScenarioDefinition,
  air: AirState,
  equipment: readonly EquipmentInstance[],
  requestedWorkloadFraction: number | Readonly<Record<string, number>>,
  simulatedTick: number,
): SpatialTickResult {
  const workloadValues = typeof requestedWorkloadFraction === 'number'
    ? [requestedWorkloadFraction]
    : Object.values(requestedWorkloadFraction);
  if (workloadValues.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      || !isFiniteTree({ air, equipment })) {
    return {
      ok: false,
      diagnostic: diagnostic(simulatedTick, {
        code: 'NON_FINITE_STATE',
        reason: 'non-finite state or invalid workload entered the spatial tick',
      }),
    };
  }
  let controlled: ReturnType<typeof controlEquipmentAndAllocatePower>;
  try {
    controlled = controlEquipmentAndAllocatePower(
      definition.room,
      definition.equipment,
      equipment,
      air,
      requestedWorkloadFraction,
      definition.model.tickMs,
    );
  } catch (error) {
    return {
      ok: false,
      diagnostic: diagnostic(simulatedTick, {
        code: 'NON_FINITE_STATE',
        reason: error instanceof Error ? error.message : 'equipment control failed',
      }),
    };
  }
  const airflow = solveAirflow(definition.room, definition.model, air, controlled.forcedLinks);
  if (!airflow.ok) {
    return { ok: false, diagnostic: diagnostic(simulatedTick, airflow) };
  }
  const thermal = transportHeat(
    definition.room,
    definition.model,
    air,
    controlled.equipment,
    definition.equipment,
    controlled.forcedLinks,
    airflow.value,
  );
  if (!thermal.ok) {
    return { ok: false, diagnostic: diagnostic(simulatedTick, thermal) };
  }
  return {
    ok: true,
    air: thermal.air,
    equipment: thermal.equipment,
    thermalAudit: thermal.audit,
    totalAllocatedPowerMilliW: controlled.totalAllocatedPowerMilliW,
  };
}
