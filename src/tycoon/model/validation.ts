import { calculateResaleValueMicrocents, validatePlacement } from './placement';
import type {
  CoolerDefinition,
  EquipmentDefinition,
  GridPosition,
  InitialPlacement,
  ModelParameters,
  RackDefinition,
  RoomDefinition,
  ScenarioDefinition,
  TrialDefinition,
  WorkloadSegment,
} from './types';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ScenarioDefinitionValidation =
  | { ok: true; value: ScenarioDefinition }
  | { ok: false; issues: ValidationIssue[] };

class DefinitionValidator {
  readonly issues: ValidationIssue[] = [];

  issue(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  object(value: unknown, path: string): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.issue(path, 'must be an object');
      return false;
    }
    return true;
  }

  array(value: unknown, path: string): value is unknown[] {
    if (!Array.isArray(value)) {
      this.issue(path, 'must be an array');
      return false;
    }
    return true;
  }

  string(value: unknown, path: string): value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      this.issue(path, 'must be a non-empty string');
      return false;
    }
    return true;
  }

  finite(value: unknown, path: string, options: { min?: number; max?: number } = {}): value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.issue(path, 'must be a finite number');
      return false;
    }
    if (options.min !== undefined && value < options.min) this.issue(path, `must be at least ${options.min}`);
    if (options.max !== undefined && value > options.max) this.issue(path, `must be at most ${options.max}`);
    return true;
  }

  safeInteger(value: unknown, path: string, options: { min?: number; max?: number } = {}): value is number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      this.issue(path, 'must be a safe integer');
      return false;
    }
    if (options.min !== undefined && value < options.min) this.issue(path, `must be at least ${options.min}`);
    if (options.max !== undefined && value > options.max) this.issue(path, `must be at most ${options.max}`);
    return true;
  }
}

function validateJsonValue(
  validator: DefinitionValidator,
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) validator.issue(path, 'must be finite for JSON serialization');
    return;
  }
  if (typeof value !== 'object') {
    validator.issue(path, 'must contain only JSON-serializable values');
    return;
  }
  if (ancestors.has(value)) {
    validator.issue(path, 'must not contain circular references');
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    validator.issue(path, 'must use plain JSON objects');
    return;
  }
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(validator, item, `${path}[${index}]`, nextAncestors));
  } else {
    Object.entries(value).forEach(([key, item]) => validateJsonValue(validator, item, `${path}.${key}`, nextAncestors));
  }
}

function validatePosition(validator: DefinitionValidator, value: unknown, path: string): value is GridPosition {
  if (!validator.object(value, path)) return false;
  return validator.safeInteger(value.x, `${path}.x`) && validator.safeInteger(value.y, `${path}.y`);
}

function validatePositionList(
  validator: DefinitionValidator,
  value: unknown,
  path: string,
  room?: RoomDefinition,
): value is GridPosition[] {
  if (!validator.array(value, path)) return false;
  const seen = new Set<string>();
  value.forEach((position, index) => {
    if (!validatePosition(validator, position, `${path}[${index}]`)) return;
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) validator.issue(`${path}[${index}]`, 'must be unique');
    seen.add(key);
    if (room && (position.x < 0 || position.y < 0
      || position.x >= room.widthCells || position.y >= room.heightCells)) {
      validator.issue(`${path}[${index}]`, 'must be inside the room');
    }
  });
  return true;
}

function validateRoom(validator: DefinitionValidator, value: unknown): value is RoomDefinition {
  if (!validator.object(value, 'room')) return false;
  const dimensionsValid = validator.safeInteger(value.widthCells, 'room.widthCells', { min: 1 })
    && validator.safeInteger(value.heightCells, 'room.heightCells', { min: 1 });
  if (value.cellSizeM !== 1) validator.issue('room.cellSizeM', 'must be 1 in this model revision');
  validator.finite(value.mixingHeightM, 'room.mixingHeightM', { min: Number.MIN_VALUE });
  validator.finite(value.powerLimitW, 'room.powerLimitW', { min: Number.MIN_VALUE });
  validator.finite(value.initialTemperatureC, 'room.initialTemperatureC');
  const room = dimensionsValid ? value as unknown as RoomDefinition : undefined;
  validatePositionList(validator, value.blockedCells, 'room.blockedCells', room);
  validatePositionList(validator, value.requiredAccessCells, 'room.requiredAccessCells', room);
  if (validator.array(value.envelopeHeatWByCell, 'room.envelopeHeatWByCell')) {
    const seen = new Set<string>();
    value.envelopeHeatWByCell.forEach((entry, index) => {
      const path = `room.envelopeHeatWByCell[${index}]`;
      if (!validator.object(entry, path)) return;
      if (validatePosition(validator, entry.position, `${path}.position`) && room) {
        const key = `${entry.position.x},${entry.position.y}`;
        if (seen.has(key)) validator.issue(`${path}.position`, 'must be unique');
        seen.add(key);
        if (entry.position.x < 0 || entry.position.y < 0
          || entry.position.x >= room.widthCells || entry.position.y >= room.heightCells) {
          validator.issue(`${path}.position`, 'must be inside the room');
        }
      }
      validator.finite(entry.heatW, `${path}.heatW`, { min: 0 });
    });
  }
  if (room) {
    const blocked = new Set(room.blockedCells?.map((position) => `${position.x},${position.y}`));
    room.requiredAccessCells?.forEach((position, index) => {
      if (blocked.has(`${position.x},${position.y}`)) {
        validator.issue(`room.requiredAccessCells[${index}]`, 'cannot also be a blocked cell');
      }
    });
  }
  return dimensionsValid;
}

function validateModel(validator: DefinitionValidator, value: unknown, room?: RoomDefinition): value is ModelParameters {
  if (!validator.object(value, 'model')) return false;
  validator.safeInteger(value.tickMs, 'model.tickMs', { min: 1 });
  validator.finite(value.airDensityKgM3, 'model.airDensityKgM3', { min: Number.MIN_VALUE });
  validator.finite(value.airSpecificHeatJKgK, 'model.airSpecificHeatJKgK', { min: Number.MIN_VALUE });
  validator.finite(value.faceConductanceM3sPa, 'model.faceConductanceM3sPa', { min: Number.MIN_VALUE });
  validator.finite(value.mixingConductanceM3s, 'model.mixingConductanceM3s', { min: 0 });
  const minValid = validator.finite(value.minTemperatureC, 'model.minTemperatureC');
  const maxValid = validator.finite(value.maxTemperatureC, 'model.maxTemperatureC');
  if (minValid && maxValid && (value.minTemperatureC as number) >= (value.maxTemperatureC as number)) {
    validator.issue('model.maxTemperatureC', 'must be greater than minTemperatureC');
  }
  validator.finite(value.maxOutgoingVolumeFraction, 'model.maxOutgoingVolumeFraction', {
    min: Number.MIN_VALUE,
    max: 0.5,
  });
  validator.finite(value.flowResidualToleranceM3s, 'model.flowResidualToleranceM3s', { min: Number.MIN_VALUE });
  validator.safeInteger(value.flowMaxIterations, 'model.flowMaxIterations', { min: 1 });
  validator.finite(value.energyAbsoluteToleranceJ, 'model.energyAbsoluteToleranceJ', { min: Number.MIN_VALUE });
  validator.finite(value.energyRelativeTolerance, 'model.energyRelativeTolerance', { min: Number.MIN_VALUE });
  if (room && typeof value.tickMs === 'number' && typeof value.mixingConductanceM3s === 'number') {
    const mixingFraction = value.mixingConductanceM3s * (value.tickMs / 1_000)
      / (room.cellSizeM * room.cellSizeM * room.mixingHeightM);
    if (!Number.isFinite(mixingFraction) || mixingFraction > 0.5) {
      validator.issue('model.mixingConductanceM3s', 'violates the symmetric mixing stability bound');
    }
  }
  return true;
}

function validatePower(validator: DefinitionValidator, value: unknown, path: string, positive = true): value is number {
  if (!validator.finite(value, path, { min: positive ? Number.MIN_VALUE : 0 })) return false;
  if (!Number.isSafeInteger(value * 1_000)) validator.issue(path, 'must convert exactly to safe integer milliwatts');
  return true;
}

function validateCommonEquipment(
  validator: DefinitionValidator,
  value: Record<string, unknown>,
  path: string,
): void {
  validator.string(value.id, `${path}.id`);
  validator.string(value.displayName, `${path}.displayName`);
  if (validator.object(value.footprint, `${path}.footprint`)) {
    validator.safeInteger(value.footprint.widthCells, `${path}.footprint.widthCells`, { min: 1 });
    validator.safeInteger(value.footprint.depthCells, `${path}.footprint.depthCells`, { min: 1 });
  }
  validatePositionList(validator, value.serviceOffsets, `${path}.serviceOffsets`);
  if (Array.isArray(value.serviceOffsets) && value.serviceOffsets.length === 0) {
    validator.issue(`${path}.serviceOffsets`, 'must declare at least one service-access cell');
  }
  validator.safeInteger(value.purchasePriceMicrocents, `${path}.purchasePriceMicrocents`, { min: 0 });
  validator.safeInteger(value.resaleBasisPoints, `${path}.resaleBasisPoints`, { min: 0, max: 10_000 });
  validator.safeInteger(value.maintenanceRateMicrocentsPerS, `${path}.maintenanceRateMicrocentsPerS`, { min: 0 });
}

function validateAccessOffsets(
  validator: DefinitionValidator,
  value: Record<string, unknown>,
  path: string,
  portNames: readonly string[],
): void {
  if (!validator.object(value.footprint, `${path}.footprint`)
      || !Number.isSafeInteger(value.footprint.widthCells)
      || !Number.isSafeInteger(value.footprint.depthCells)) return;
  const width = value.footprint.widthCells as number;
  const depth = value.footprint.depthCells as number;
  const offsets: Array<{ name: string; position: GridPosition }> = [];
  if (Array.isArray(value.serviceOffsets)) {
    value.serviceOffsets.forEach((position, index) => {
      if (typeof position?.x === 'number' && typeof position?.y === 'number') {
        offsets.push({ name: `serviceOffsets[${index}]`, position: position as GridPosition });
      }
    });
  }
  portNames.forEach((name) => {
    const position = value[name];
    if (typeof (position as GridPosition | undefined)?.x === 'number'
        && typeof (position as GridPosition | undefined)?.y === 'number') {
      offsets.push({ name, position: position as GridPosition });
    }
  });
  const seen = new Set<string>();
  offsets.forEach(({ name, position }) => {
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) validator.issue(`${path}.${name}`, 'must be distinct from every port and service offset');
    seen.add(key);
    const inside = position.x >= 0 && position.x < width && position.y >= 0 && position.y < depth;
    let adjacent = false;
    for (let y = 0; y < depth && !adjacent; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (Math.abs(position.x - x) + Math.abs(position.y - y) === 1) {
          adjacent = true;
          break;
        }
      }
    }
    if (inside || !adjacent) validator.issue(`${path}.${name}`, 'must be directly adjacent to, not inside, the footprint');
  });
}

function validateRack(
  validator: DefinitionValidator,
  value: Record<string, unknown>,
  path: string,
): void {
  validateCommonEquipment(validator, value, path);
  validatePosition(validator, value.intakeOffset, `${path}.intakeOffset`);
  validatePosition(validator, value.exhaustOffset, `${path}.exhaustOffset`);
  validator.finite(value.nameplateServiceUnits, `${path}.nameplateServiceUnits`, { min: Number.MIN_VALUE });
  const idleValid = validatePower(validator, value.idlePowerW, `${path}.idlePowerW`);
  const maxValid = validatePower(validator, value.maxPowerW, `${path}.maxPowerW`);
  if (idleValid && maxValid && (value.maxPowerW as number) < (value.idlePowerW as number)) {
    validator.issue(`${path}.maxPowerW`, 'must be at least idlePowerW');
  }
  validator.finite(value.ratedFanFlowM3s, `${path}.ratedFanFlowM3s`, { min: Number.MIN_VALUE });
  if (validator.object(value.thermalControl, `${path}.thermalControl`)) {
    const thermalPath = `${path}.thermalControl`;
    const fullValid = validator.finite(value.thermalControl.fullOutputThroughC, `${thermalPath}.fullOutputThroughC`);
    const shutdownValid = validator.finite(value.thermalControl.shutdownAtC, `${thermalPath}.shutdownAtC`);
    const recoverValid = validator.finite(value.thermalControl.recoverAtOrBelowC, `${thermalPath}.recoverAtOrBelowC`);
    validator.safeInteger(value.thermalControl.recoverHoldMs, `${thermalPath}.recoverHoldMs`, { min: 0 });
    validator.finite(value.thermalControl.minimumThrottleFactor, `${thermalPath}.minimumThrottleFactor`, { min: 0, max: 1 });
    if (fullValid && shutdownValid
        && (value.thermalControl.fullOutputThroughC as number) >= (value.thermalControl.shutdownAtC as number)) {
      validator.issue(`${thermalPath}.fullOutputThroughC`, 'must be below shutdownAtC');
    }
    if (recoverValid && shutdownValid
        && (value.thermalControl.recoverAtOrBelowC as number) >= (value.thermalControl.shutdownAtC as number)) {
      validator.issue(`${thermalPath}.recoverAtOrBelowC`, 'must be below shutdownAtC');
    }
  }
  validateAccessOffsets(validator, value, path, ['intakeOffset', 'exhaustOffset']);
}

function validateCooler(
  validator: DefinitionValidator,
  value: Record<string, unknown>,
  path: string,
): void {
  validateCommonEquipment(validator, value, path);
  validatePosition(validator, value.returnOffset, `${path}.returnOffset`);
  validatePosition(validator, value.supplyOffset, `${path}.supplyOffset`);
  validator.finite(value.ratedAirflowM3s, `${path}.ratedAirflowM3s`, { min: Number.MIN_VALUE });
  validatePower(validator, value.ratedHeatRemovalW, `${path}.ratedHeatRemovalW`);
  validator.finite(value.targetSupplyC, `${path}.targetSupplyC`);
  const idleValid = validatePower(validator, value.idlePowerW, `${path}.idlePowerW`);
  const ratedValid = validatePower(validator, value.ratedPowerW, `${path}.ratedPowerW`);
  if (idleValid && ratedValid && (value.ratedPowerW as number) < (value.idlePowerW as number)) {
    validator.issue(`${path}.ratedPowerW`, 'must be at least idlePowerW');
  }
  validateAccessOffsets(validator, value, path, ['returnOffset', 'supplyOffset']);
}

function validateEquipment(
  validator: DefinitionValidator,
  value: unknown,
): value is EquipmentDefinition[] {
  if (!validator.array(value, 'equipment')) return false;
  const ids = new Set<string>();
  const racks: RackDefinition[] = [];
  const coolers: CoolerDefinition[] = [];
  value.forEach((definition, index) => {
    const path = `equipment[${index}]`;
    if (!validator.object(definition, path)) return;
    if (typeof definition.id === 'string') {
      if (ids.has(definition.id)) validator.issue(`${path}.id`, 'must be unique');
      ids.add(definition.id);
    }
    if (definition.kind === 'rack') {
      validateRack(validator, definition, path);
      racks.push(definition as unknown as RackDefinition);
    } else if (definition.kind === 'cooler') {
      validateCooler(validator, definition, path);
      coolers.push(definition as unknown as CoolerDefinition);
    } else {
      validator.issue(`${path}.kind`, "must be 'rack' or 'cooler'");
    }
  });
  if (racks.length !== 3) validator.issue('equipment', 'must contain exactly three rack definitions');
  if (coolers.length !== 1) validator.issue('equipment', 'must contain exactly one cooler definition');
  if (racks.length === 3) {
    const distinct = (values: unknown[], description: string): void => {
      if (new Set(values.map((item) => JSON.stringify(item))).size !== 3) {
        validator.issue('equipment', `rack definitions must have distinct ${description}`);
      }
    };
    distinct(racks.map((rack) => rack.purchasePriceMicrocents), 'purchase prices');
    distinct(racks.map((rack) => rack.nameplateServiceUnits), 'nameplate capacities');
    distinct(racks.map((rack) => [rack.idlePowerW, rack.maxPowerW]), 'electrical demand');
    distinct(racks.map((rack) => rack.ratedFanFlowM3s), 'fan flow');
    distinct(racks.map((rack) => rack.thermalControl), 'thermal controls');
  }
  return true;
}

function validateFractionRecord(validator: DefinitionValidator, value: unknown, path: string): void {
  if (value === undefined) return;
  if (!validator.object(value, path)) return;
  for (const [key, fraction] of Object.entries(value)) {
    if (key.trim().length === 0) validator.issue(path, 'override IDs must be non-empty');
    validator.finite(fraction, `${path}.${key}`, { min: 0, max: 1 });
  }
}

function validateWorkload(
  validator: DefinitionValidator,
  value: unknown,
  durationMs: number | undefined,
): value is WorkloadSegment[] {
  if (!validator.array(value, 'workload')) return false;
  let expectedStart = 0;
  value.forEach((segment, index) => {
    const path = `workload[${index}]`;
    if (!validator.object(segment, path)) return;
    const startValid = validator.safeInteger(segment.startMs, `${path}.startMs`, { min: 0 });
    const endValid = validator.safeInteger(segment.endMs, `${path}.endMs`, { min: 1 });
    if (startValid && segment.startMs !== expectedStart) validator.issue(`${path}.startMs`, `must equal ${expectedStart}`);
    if (startValid && endValid && (segment.endMs as number) <= (segment.startMs as number)) {
      validator.issue(`${path}.endMs`, 'must be after startMs');
    }
    if (endValid) expectedStart = segment.endMs as number;
    validator.finite(segment.demandFraction, `${path}.demandFraction`, { min: 0, max: 1 });
    validateFractionRecord(validator, segment.definitionOverrides, `${path}.definitionOverrides`);
    validateFractionRecord(validator, segment.instanceOverrides, `${path}.instanceOverrides`);
  });
  if (durationMs !== undefined && expectedStart !== durationMs) {
    validator.issue('workload', 'must cover the complete contract duration without gaps');
  }
  return true;
}

function validateInitialPlacement(
  validator: DefinitionValidator,
  placement: unknown,
  path: string,
  definitions: readonly EquipmentDefinition[],
): placement is InitialPlacement {
  if (!validator.object(placement, path)) return false;
  validator.string(placement.id, `${path}.id`);
  const definitionIdValid = validator.string(placement.definitionId, `${path}.definitionId`);
  const definition = definitionIdValid
    ? definitions.find((candidate) => candidate.id === placement.definitionId)
    : undefined;
  if (definitionIdValid && !definition) validator.issue(`${path}.definitionId`, 'references an unknown definition');
  if (definition && placement.kind !== definition.kind) validator.issue(`${path}.kind`, 'must match the referenced definition kind');
  validatePosition(validator, placement.position, `${path}.position`);
  if (!['north', 'east', 'south', 'west'].includes(placement.orientation as string)) {
    validator.issue(`${path}.orientation`, 'must be a supported orientation');
  }
  if (placement.workloadCapFraction !== undefined) {
    validator.finite(placement.workloadCapFraction, `${path}.workloadCapFraction`, { min: 0, max: 1 });
  }
  if (definition?.kind === 'cooler' && placement.commandedCoolingFraction !== undefined) {
    validator.finite(placement.commandedCoolingFraction, `${path}.commandedCoolingFraction`, { min: 0, max: 1 });
  }
  return true;
}

function validatePlacementCollection(
  validator: DefinitionValidator,
  placements: unknown,
  path: string,
  room: RoomDefinition,
  definitions: readonly EquipmentDefinition[],
): placements is InitialPlacement[] {
  if (!validator.array(placements, path)) return false;
  const ids = new Set<string>();
  const accepted: import('./types').EquipmentInstance[] = [];
  placements.forEach((placement, index) => {
    const itemPath = `${path}[${index}]`;
    if (!validateInitialPlacement(validator, placement, itemPath, definitions)) return;
    if (ids.has(placement.id)) validator.issue(`${itemPath}.id`, 'must be unique');
    ids.add(placement.id);
    const definition = definitions.find((candidate) => candidate.id === placement.definitionId);
    if (!definition) return;
    const result = validatePlacement(definition, placement.position, placement.orientation, {
      room,
      definitions,
      equipment: accepted,
    });
    if (!result.ok) {
      validator.issue(itemPath, `invalid placement: ${result.code}`);
      return;
    }
    accepted.push({
      ...placement,
      kind: definition.kind,
      acquisitionPriceMicrocents: definition.purchasePriceMicrocents,
      resaleValueMicrocents: calculateResaleValueMicrocents(
        definition.purchasePriceMicrocents,
        definition.resaleBasisPoints,
      ),
      workloadCapFraction: placement.workloadCapFraction ?? 1,
      effectiveRequestedWorkloadFraction: 0,
      requestedPowerMilliW: 0,
      allocatedPowerMilliW: 0,
      actualFlowM3s: 0,
      operatingState: 'off',
      limitReasons: [],
      ...(definition.kind === 'rack' ? {
        intakeTemperatureC: null,
        exhaustTemperatureC: null,
        thermalFactor: 1,
        usefulOutputMilliServiceUnits: 0,
        recoveryCoolMs: 0,
      } : {
        commandedCoolingFraction: placement.kind === 'cooler' ? placement.commandedCoolingFraction ?? 1 : 1,
        returnTemperatureC: null,
        supplyTemperatureC: null,
        heatRemovedW: 0,
        capacityLimited: false,
      }),
    } as import('./types').EquipmentInstance);
  });
  return true;
}

function validateTrial(
  validator: DefinitionValidator,
  value: unknown,
  index: number,
  scenario: ScenarioDefinition,
): value is TrialDefinition {
  const path = `trialFixtures[${index}]`;
  if (!validator.object(value, path)) return false;
  validator.string(value.id, `${path}.id`);
  validator.string(value.displayName, `${path}.displayName`);
  if (value.scenarioId !== scenario.id) validator.issue(`${path}.scenarioId`, 'must match scenario id');
  if (value.scenarioRevision !== scenario.revision) validator.issue(`${path}.scenarioRevision`, 'must match scenario revision');
  validator.finite(value.workloadFraction, `${path}.workloadFraction`, { min: 0, max: 1 });
  if (validator.safeInteger(value.durationMs, `${path}.durationMs`, { min: 1 })
      && value.durationMs % scenario.model.tickMs !== 0) {
    validator.issue(`${path}.durationMs`, 'must be divisible by model.tickMs');
  }
  if (value.commitToLive !== false) validator.issue(`${path}.commitToLive`, 'must be false');
  validatePlacementCollection(validator, value.initialEquipment, `${path}.initialEquipment`, scenario.room, scenario.equipment);
  return true;
}

function validateEconomyAndContract(validator: DefinitionValidator, value: Record<string, unknown>): void {
  if (validator.object(value.economy, 'economy')) {
    validator.safeInteger(value.economy.startingCashMicrocents, 'economy.startingCashMicrocents', { min: 0 });
    validator.safeInteger(value.economy.electricityRateMicrocentsPerWh, 'economy.electricityRateMicrocentsPerWh', { min: 0 });
    validator.safeInteger(value.economy.rentRateMicrocentsPerS, 'economy.rentRateMicrocentsPerS', { min: 0 });
    if (value.economy.powerAllocationPolicy !== 'cooling-first-proportional-racks') {
      validator.issue('economy.powerAllocationPolicy', 'must use the approved allocation policy');
    }
    validator.safeInteger(value.economy.bankruptcyThresholdMicrocents, 'economy.bankruptcyThresholdMicrocents');
  }
  if (validator.object(value.contract, 'contract')) {
    validator.string(value.contract.id, 'contract.id');
    validator.string(value.contract.displayName, 'contract.displayName');
    validator.finite(value.contract.requiredServiceUnits, 'contract.requiredServiceUnits', { min: Number.MIN_VALUE });
    validator.safeInteger(value.contract.durationMs, 'contract.durationMs', { min: 1 });
    validator.safeInteger(value.contract.reliabilityTargetBasisPoints, 'contract.reliabilityTargetBasisPoints', { min: 0, max: 10_000 });
    validator.safeInteger(value.contract.revenueRateMicrocentsPerServiceUnitSecond, 'contract.revenueRateMicrocentsPerServiceUnitSecond', { min: 0 });
    if (validator.object(value.contract.shortfallPolicy, 'contract.shortfallPolicy')) {
      if (value.contract.shortfallPolicy.kind !== 'missing-service-debit') {
        validator.issue('contract.shortfallPolicy.kind', 'must be missing-service-debit');
      }
      validator.safeInteger(
        value.contract.shortfallPolicy.rateMicrocentsPerServiceUnitSecond,
        'contract.shortfallPolicy.rateMicrocentsPerServiceUnitSecond',
        { min: 0 },
      );
      if (value.contract.shortfallPolicy.cap !== 'gross-revenue') {
        validator.issue('contract.shortfallPolicy.cap', 'must be gross-revenue');
      }
    }
  }
}

function validateNumericalBounds(validator: DefinitionValidator, scenario: ScenarioDefinition): void {
  const roomPowerMilliW = scenario.room.powerLimitW * 1_000;
  if (!Number.isSafeInteger(roomPowerMilliW)) {
    validator.issue('room.powerLimitW', 'must convert exactly to safe integer milliwatts');
  }
  const electricityTickNumerator = roomPowerMilliW * scenario.model.tickMs
    * scenario.economy.electricityRateMicrocentsPerWh;
  if (!Number.isSafeInteger(electricityTickNumerator)) {
    validator.issue('economy.electricityRateMicrocentsPerWh', 'can overflow the per-tick electricity numerator');
  }
  const maximumRackOutputMilli = scenario.equipment
    .filter((definition): definition is RackDefinition => definition.kind === 'rack')
    .reduce((sum, rack) => sum + Math.floor(rack.nameplateServiceUnits * 1_000), 0) * 24;
  const revenueTickNumerator = maximumRackOutputMilli * scenario.model.tickMs
    * scenario.contract.revenueRateMicrocentsPerServiceUnitSecond;
  if (!Number.isSafeInteger(revenueTickNumerator)) {
    validator.issue('contract.revenueRateMicrocentsPerServiceUnitSecond', 'can overflow the per-tick revenue numerator');
  }
  const cellVolumeM3 = scenario.room.cellSizeM ** 2 * scenario.room.mixingHeightM;
  for (const [index, definition] of scenario.equipment.entries()) {
    const ratedFlow = definition.kind === 'rack' ? definition.ratedFanFlowM3s : definition.ratedAirflowM3s;
    const outgoingFraction = ratedFlow * scenario.model.tickMs / 1_000 / cellVolumeM3;
    if (outgoingFraction > scenario.model.maxOutgoingVolumeFraction) {
      validator.issue(`equipment[${index}]`, 'rated flow provably violates the outgoing-volume bound');
    }
  }
}

export function validateScenarioDefinition(value: unknown): ScenarioDefinitionValidation {
  const validator = new DefinitionValidator();
  validateJsonValue(validator, value, '$');
  if (!validator.object(value, '$')) return { ok: false, issues: validator.issues };
  validator.string(value.id, 'id');
  validator.string(value.revision, 'revision');
  const roomValid = validateRoom(validator, value.room);
  validateModel(validator, value.model, roomValid ? value.room as RoomDefinition : undefined);
  const equipmentValid = validateEquipment(validator, value.equipment);
  validateEconomyAndContract(validator, value);
  validator.string(value.disclaimer, 'disclaimer');

  const candidate = value as unknown as ScenarioDefinition;
  if (roomValid && equipmentValid) {
    validatePlacementCollection(validator, value.initialEquipment, 'initialEquipment', candidate.room, candidate.equipment);
  }
  const durationMs = validator.object(value.contract, 'contract') && Number.isSafeInteger(value.contract.durationMs)
    ? value.contract.durationMs as number
    : undefined;
  validateWorkload(validator, value.workload, durationMs);
  if (validator.array(value.trialFixtures, 'trialFixtures') && roomValid && equipmentValid) {
    const ids = new Set<string>();
    value.trialFixtures.forEach((trial, index) => {
      if (validateTrial(validator, trial, index, candidate) && typeof trial.id === 'string') {
        if (ids.has(trial.id)) validator.issue(`trialFixtures[${index}].id`, 'must be unique');
        ids.add(trial.id);
      }
    });
  }
  if (validator.issues.length === 0) validateNumericalBounds(validator, candidate);
  if (validator.issues.length === 0
      && (candidate.room.initialTemperatureC < candidate.model.minTemperatureC
        || candidate.room.initialTemperatureC > candidate.model.maxTemperatureC)) {
    validator.issue('room.initialTemperatureC', 'must be within the model temperature bounds');
  }
  if (validator.issues.length === 0) {
    const openingCost = candidate.initialEquipment.reduce((sum, placement) => {
      const definition = candidate.equipment.find((item) => item.id === placement.definitionId);
      return sum + (definition?.purchasePriceMicrocents ?? 0);
    }, 0);
    if (!Number.isSafeInteger(openingCost) || openingCost > candidate.economy.startingCashMicrocents) {
      validator.issue('initialEquipment', 'must fit within the safe opening budget');
    }
    if (!/approximate|approximation/i.test(candidate.disclaimer)
        || !/not (?:validated|facility|engineering|safety)/i.test(candidate.disclaimer)) {
      validator.issue('disclaimer', 'must identify the approximation and state that it is not facility advice');
    }
  }
  return validator.issues.length === 0
    ? { ok: true, value: candidate }
    : { ok: false, issues: validator.issues };
}

export function assertValidScenarioDefinition(value: unknown): asserts value is ScenarioDefinition {
  const result = validateScenarioDefinition(value);
  if (!result.ok) {
    const summary = result.issues.map(({ path, message }) => `${path}: ${message}`).join('; ');
    throw new Error(`Invalid scenario definition: ${summary}`);
  }
}
