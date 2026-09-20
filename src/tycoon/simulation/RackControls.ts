import { findAirComponents, type ForcedAirLink } from './AirflowSolver';
import { resolveEquipmentGeometry } from '../model/placement';
import type {
  AirState,
  CoolerDefinition,
  CoolerInstance,
  EquipmentDefinition,
  EquipmentInstance,
  LimitReason,
  RackDefinition,
  RackInstance,
  RoomDefinition,
} from '../model/types';

export interface ControlledEquipmentResult {
  equipment: EquipmentInstance[];
  forcedLinks: ForcedAirLink[];
  totalAllocatedPowerMilliW: number;
}

interface PreparedEquipment {
  instance: EquipmentInstance;
  definition: EquipmentDefinition;
  fromCell: number | null;
  toCell: number | null;
  operable: boolean;
  reasons: LimitReason[];
  requestedPowerMilliW: number;
  thermalFactor: number;
  recoveryCoolMs: number;
}

function indexOf(x: number, y: number, room: RoomDefinition): number {
  if (x < 0 || y < 0 || x >= room.widthCells || y >= room.heightCells) return -1;
  return y * room.widthCells + x;
}

function thermalFactor(definition: RackDefinition, intakeTemperatureC: number): number {
  const control = definition.thermalControl;
  if (intakeTemperatureC <= control.fullOutputThroughC) return 1;
  if (intakeTemperatureC >= control.shutdownAtC) return 0;
  const progress = (intakeTemperatureC - control.fullOutputThroughC)
    / (control.shutdownAtC - control.fullOutputThroughC);
  return 1 - progress * (1 - control.minimumThrottleFactor);
}

function orderedReasons(reasons: Iterable<LimitReason>): LimitReason[] {
  const order: LimitReason[] = [
    'THERMAL_SHUTDOWN',
    'INTAKE_HOT',
    'INTAKE_BLOCKED',
    'EXHAUST_BLOCKED',
    'INSUFFICIENT_FLOW',
    'POWER_LIMITED',
    'NO_WORKLOAD',
    'COOLER_CAPACITY',
  ];
  const unique = new Set(reasons);
  return order.filter((reason) => unique.has(reason));
}

function definitionFor(
  definitions: readonly EquipmentDefinition[],
  instance: EquipmentInstance,
): EquipmentDefinition {
  const definition = definitions.find((candidate) => candidate.id === instance.definitionId);
  if (!definition || definition.kind !== instance.kind) {
    throw new Error(`Definition mismatch for equipment ${instance.id}`);
  }
  return definition;
}

function prepareRack(
  instance: RackInstance,
  definition: RackDefinition,
  intakeTemperatureC: number,
  operable: boolean,
  portReasons: LimitReason[],
  requestedWorkloadFraction: number,
  tickMs: number,
): Omit<PreparedEquipment, 'fromCell' | 'toCell'> {
  const reasons = [...portReasons];
  let recoveryCoolMs = instance.recoveryCoolMs;
  let factor = thermalFactor(definition, intakeTemperatureC);
  let shutdown = instance.operatingState === 'thermal-shutdown';

  if (shutdown) {
    recoveryCoolMs = intakeTemperatureC <= definition.thermalControl.recoverAtOrBelowC
      ? Math.min(definition.thermalControl.recoverHoldMs, recoveryCoolMs + tickMs)
      : 0;
    if (recoveryCoolMs >= definition.thermalControl.recoverHoldMs) shutdown = false;
  } else if (intakeTemperatureC >= definition.thermalControl.shutdownAtC) {
    shutdown = true;
    recoveryCoolMs = 0;
  }
  if (shutdown) {
    factor = 0;
    reasons.push('THERMAL_SHUTDOWN');
  } else if (factor < 1) {
    reasons.push('INTAKE_HOT');
  }
  if (requestedWorkloadFraction === 0) reasons.push('NO_WORKLOAD');
  const requestedPowerMilliW = operable && !shutdown
    ? Math.floor(1_000 * (
        definition.idlePowerW
        + requestedWorkloadFraction * (definition.maxPowerW - definition.idlePowerW)
      ))
    : 0;
  return {
    instance,
    definition,
    operable,
    reasons,
    requestedPowerMilliW,
    thermalFactor: factor,
    recoveryCoolMs,
  };
}

function allocateProportionally(
  items: readonly PreparedEquipment[],
  availableMilliW: number,
  allocationById: Map<string, number>,
): number {
  const total = items.reduce((sum, item) => sum + item.requestedPowerMilliW, 0);
  if (total <= 0 || availableMilliW <= 0) {
    items.forEach((item) => allocationById.set(item.instance.id, 0));
    return 0;
  }
  const fraction = Math.min(1, availableMilliW / total);
  let allocated = 0;
  for (const item of [...items].sort((a, b) => a.instance.id.localeCompare(b.instance.id))) {
    const value = Math.floor(item.requestedPowerMilliW * fraction);
    allocationById.set(item.instance.id, value);
    allocated += value;
  }
  return allocated;
}

/** Updates thermal controls, allocates the room cap, and emits paired equipment fan links. */
export function controlEquipmentAndAllocatePower(
  room: RoomDefinition,
  definitions: readonly EquipmentDefinition[],
  equipment: readonly EquipmentInstance[],
  air: Pick<AirState, 'temperatureC' | 'freeCellMask'>,
  requestedWorkloadFraction: number | Readonly<Record<string, number>>,
  tickMs: number,
): ControlledEquipmentResult {
  const requestedWorkloadFor = (instance: EquipmentInstance): number =>
    typeof requestedWorkloadFraction === 'number'
      ? requestedWorkloadFraction
      : requestedWorkloadFraction[instance.id] ?? 0;
  const components = findAirComponents(room, air.freeCellMask);
  const prepared: PreparedEquipment[] = equipment.map((instance) => {
    const definition = definitionFor(definitions, instance);
    const geometry = resolveEquipmentGeometry(definition, instance.position, instance.orientation);
    const fromPosition = definition.kind === 'rack' ? geometry.ports.intake! : geometry.ports.return!;
    const toPosition = definition.kind === 'rack' ? geometry.ports.exhaust! : geometry.ports.supply!;
    const fromCell = indexOf(fromPosition.x, fromPosition.y, room);
    const toCell = indexOf(toPosition.x, toPosition.y, room);
    const fromOpen = fromCell >= 0 && air.freeCellMask[fromCell] === true;
    const toOpen = toCell >= 0 && air.freeCellMask[toCell] === true;
    const sameComponent = fromOpen && toOpen
      && components.labelByCell[fromCell] === components.labelByCell[toCell];
    const operable = fromOpen && toOpen && sameComponent;
    const reasons: LimitReason[] = [];
    if (!fromOpen) reasons.push('INTAKE_BLOCKED');
    if (!toOpen) reasons.push('EXHAUST_BLOCKED');
    if (!operable) reasons.push('INSUFFICIENT_FLOW');

    if (definition.kind === 'rack' && instance.kind === 'rack') {
      const intakeTemperatureC = fromOpen ? air.temperatureC[fromCell] : null;
      if (intakeTemperatureC === null || intakeTemperatureC === undefined) {
        return {
          instance,
          definition,
          fromCell: operable ? fromCell : null,
          toCell: operable ? toCell : null,
          operable: false,
          reasons: orderedReasons(reasons),
          requestedPowerMilliW: 0,
          thermalFactor: instance.thermalFactor,
          recoveryCoolMs: instance.recoveryCoolMs,
        };
      }
      const demand = Math.min(requestedWorkloadFor(instance), instance.workloadCapFraction);
      return {
        ...prepareRack(instance, definition, intakeTemperatureC, operable, reasons, demand, tickMs),
        fromCell: operable ? fromCell : null,
        toCell: operable ? toCell : null,
      };
    }
    if (definition.kind !== 'cooler' || instance.kind !== 'cooler') {
      throw new Error(`Definition mismatch for equipment ${instance.id}`);
    }
    const requestedPowerMilliW = operable && instance.commandedCoolingFraction > 0
      ? Math.floor(1_000 * (
          definition.idlePowerW
          + instance.commandedCoolingFraction * (definition.ratedPowerW - definition.idlePowerW)
        ))
      : 0;
    return {
      instance,
      definition,
      fromCell: operable ? fromCell : null,
      toCell: operable ? toCell : null,
      operable,
      reasons: orderedReasons(reasons),
      requestedPowerMilliW,
      thermalFactor: 1,
      recoveryCoolMs: 0,
    };
  });

  const allocationById = new Map<string, number>();
  const limitMilliW = Math.floor(room.powerLimitW * 1_000);
  const coolers = prepared.filter((item) => item.definition.kind === 'cooler');
  const racks = prepared.filter((item) => item.definition.kind === 'rack');
  const coolingAllocated = allocateProportionally(coolers, limitMilliW, allocationById);
  const rackAllocated = allocateProportionally(racks, limitMilliW - coolingAllocated, allocationById);

  const forcedLinks: ForcedAirLink[] = [];
  const nextEquipment = prepared.map((item): EquipmentInstance => {
    const allocatedPowerMilliW = allocationById.get(item.instance.id) ?? 0;
    const allocationFraction = item.requestedPowerMilliW > 0
      ? allocatedPowerMilliW / item.requestedPowerMilliW
      : 0;
    const reasons = [...item.reasons];
    if (allocatedPowerMilliW < item.requestedPowerMilliW) reasons.push('POWER_LIMITED');

    if (item.definition.kind === 'rack' && item.instance.kind === 'rack') {
      const demand = Math.min(requestedWorkloadFor(item.instance), item.instance.workloadCapFraction);
      const actualFlowM3s = item.operable
        ? item.definition.ratedFanFlowM3s * allocationFraction
        : 0;
      const usefulOutputMilliServiceUnits = actualFlowM3s > 0 && item.thermalFactor > 0
        ? Math.floor(1_000 * item.definition.nameplateServiceUnits
          * demand * allocationFraction * item.thermalFactor)
        : 0;
      if (actualFlowM3s > 0 && item.fromCell !== null && item.toCell !== null) {
        forcedLinks.push({
          equipmentInstanceId: item.instance.id,
          kind: 'rack',
          fromCell: item.fromCell,
          toCell: item.toCell,
          flowM3s: actualFlowM3s,
        });
      }
      const isShutdown = item.thermalFactor === 0
        && orderedReasons(reasons).includes('THERMAL_SHUTDOWN');
      const operatingState = isShutdown
        ? 'thermal-shutdown'
        : allocatedPowerMilliW < item.requestedPowerMilliW
          ? 'power-limited'
          : usefulOutputMilliServiceUnits === 0
            ? 'off'
            : item.thermalFactor < 1 ? 'throttled' : 'running';
      return {
        ...item.instance,
        effectiveRequestedWorkloadFraction: demand,
        requestedPowerMilliW: item.requestedPowerMilliW,
        allocatedPowerMilliW,
        actualFlowM3s,
        operatingState,
        limitReasons: orderedReasons(reasons),
        thermalFactor: item.thermalFactor,
        usefulOutputMilliServiceUnits,
        recoveryCoolMs: item.recoveryCoolMs,
      };
    }

    const definition = item.definition as CoolerDefinition;
    const instance = item.instance as CoolerInstance;
    const actualFlowM3s = item.operable
      ? definition.ratedAirflowM3s * instance.commandedCoolingFraction * allocationFraction
      : 0;
    if (actualFlowM3s > 0 && item.fromCell !== null && item.toCell !== null) {
      forcedLinks.push({
        equipmentInstanceId: instance.id,
        kind: 'cooler',
        fromCell: item.fromCell,
        toCell: item.toCell,
        flowM3s: actualFlowM3s,
      });
    }
    return {
      ...instance,
      effectiveRequestedWorkloadFraction: 0,
      requestedPowerMilliW: item.requestedPowerMilliW,
      allocatedPowerMilliW,
      actualFlowM3s,
      operatingState: allocatedPowerMilliW === 0
        ? 'off'
        : allocatedPowerMilliW < item.requestedPowerMilliW ? 'power-limited' : 'running',
      limitReasons: orderedReasons(reasons),
      heatRemovedW: 0,
      capacityLimited: false,
    };
  });

  return {
    equipment: nextEquipment,
    forcedLinks: forcedLinks.sort((a, b) => a.equipmentInstanceId.localeCompare(b.equipmentInstanceId)),
    totalAllocatedPowerMilliW: coolingAllocated + rackAllocated,
  };
}
