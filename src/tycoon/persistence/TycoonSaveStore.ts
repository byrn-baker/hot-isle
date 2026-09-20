import { decodeSaveJson, encodeSaveJson } from './SaveCodec';
import { buildFreeCellMask, calculateResaleValueMicrocents, validatePlacement } from '../model/placement';
import type {
  AccrualRemainders,
  AccountsState,
  AirState,
  EquipmentInstance,
  LedgerEntry,
  PlanningMutationSnapshot,
  ScenarioCommand,
  ScenarioDefinition,
  ScenarioState,
  SimulationDiagnostic,
  TycoonSaveEnvelopeV1,
  UndoRecord,
} from '../model/types';
import { ScenarioEngine } from '../state/ScenarioEngine';

export const TYCOON_SAVE_KEY = 'hici-tycoon-save-v1';
export const TYCOON_STAGING_KEY = 'hici-tycoon-save-v1-staging';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveFailureCode =
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'NO_SAVE'
  | 'INVALID_SAVE'
  | 'UNSUPPORTED_VERSION';

export interface SaveFailure {
  code: SaveFailureCode;
  message: string;
  path?: string;
}

export type SaveResult = { ok: true; envelope: TycoonSaveEnvelopeV1 } | { ok: false; error: SaveFailure };
export type LoadResult = { ok: true; envelope: TycoonSaveEnvelopeV1; state: ScenarioState }
  | { ok: false; error: SaveFailure };

class ValidationError extends Error {
  constructor(
    readonly path: string,
    message: string,
    readonly failureCode: Extract<SaveFailureCode, 'INVALID_SAVE' | 'UNSUPPORTED_VERSION'> = 'INVALID_SAVE',
  ) {
    super(`${path}: ${message}`);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(path, 'expected object');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(path, 'expected array');
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ValidationError(path, 'expected non-empty string');
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(path, 'expected boolean');
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(path, 'expected finite number');
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new ValidationError(path, `expected safe integer >= ${minimum}`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new ValidationError(path, `expected one of ${values.join(', ')}`);
  }
  return value as T;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

const modes = ['offered', 'planning', 'operating', 'completed', 'failed'] as const;
const statuses = ['offered', 'active', 'succeeded', 'failed'] as const;
const orientations = ['north', 'east', 'south', 'west'] as const;
const operatingStates = ['off', 'running', 'throttled', 'thermal-shutdown', 'power-limited'] as const;
const reasons = ['NO_WORKLOAD', 'INTAKE_BLOCKED', 'EXHAUST_BLOCKED', 'INSUFFICIENT_FLOW', 'POWER_LIMITED', 'INTAKE_HOT', 'THERMAL_SHUTDOWN', 'COOLER_CAPACITY'] as const;
const categories = ['PURCHASE', 'RESALE', 'REVENUE', 'SETTLEMENT', 'IT_ELECTRICITY', 'COOLING_ELECTRICITY', 'RENT', 'MAINTENANCE'] as const;
const diagnosticCodes = ['FLOW_SOLVE_FAILED', 'FLOW_RESIDUAL_EXCEEDED', 'CFL_EXCEEDED', 'ENERGY_RESIDUAL_EXCEEDED', 'NON_FINITE_STATE', 'INVALID_DEFINITION', 'INVALID_SAVE'] as const;
const failureReasons = ['BANKRUPTCY', 'RELIABILITY_SHORTFALL', ...diagnosticCodes] as const;

function validateAir(value: unknown, definition: ScenarioDefinition, path: string): AirState {
  const source = record(value, path);
  const cells = definition.room.widthCells * definition.room.heightCells;
  const temperatures = array(source.temperatureC, `${path}.temperatureC`);
  const mask = array(source.freeCellMask, `${path}.freeCellMask`);
  const xFlows = array(source.faceFlowXM3s, `${path}.faceFlowXM3s`);
  const yFlows = array(source.faceFlowYM3s, `${path}.faceFlowYM3s`);
  if (temperatures.length !== cells) throw new ValidationError(`${path}.temperatureC`, `expected length ${cells}`);
  if (mask.length !== cells) throw new ValidationError(`${path}.freeCellMask`, `expected length ${cells}`);
  if (xFlows.length !== (definition.room.widthCells - 1) * definition.room.heightCells) {
    throw new ValidationError(`${path}.faceFlowXM3s`, 'unexpected length');
  }
  if (yFlows.length !== definition.room.widthCells * (definition.room.heightCells - 1)) {
    throw new ValidationError(`${path}.faceFlowYM3s`, 'unexpected length');
  }
  const permanentlyBlocked = new Set(definition.room.blockedCells.map(
    ({ x, y }) => y * definition.room.widthCells + x,
  ));
  temperatures.forEach((item, index) => {
    if (permanentlyBlocked.has(index)) {
      if (item !== null) throw new ValidationError(`${path}.temperatureC[${index}]`, 'blocked cell must be null');
      return;
    }
    if (item === null) throw new ValidationError(`${path}.temperatureC[${index}]`, 'non-blocked cell requires a shadow temperature');
    const temperature = finite(item, `${path}.temperatureC[${index}]`);
    if (temperature < definition.model.minTemperatureC || temperature > definition.model.maxTemperatureC) {
      throw new ValidationError(`${path}.temperatureC[${index}]`, 'temperature outside model bounds');
    }
  });
  mask.forEach((item, index) => bool(item, `${path}.freeCellMask[${index}]`));
  xFlows.forEach((item, index) => finite(item, `${path}.faceFlowXM3s[${index}]`));
  yFlows.forEach((item, index) => finite(item, `${path}.faceFlowYM3s[${index}]`));
  const flowValid = bool(source.flowValid, `${path}.flowValid`);
  if (!flowValid && [...xFlows, ...yFlows].some((item) => item !== 0)) {
    throw new ValidationError(path, 'invalid flow diagnostics must be zeroed');
  }
  finite(source.lastFlowResidualM3s, `${path}.lastFlowResidualM3s`);
  finite(source.lastEnergyResidualJ, `${path}.lastEnergyResidualJ`);
  integer(source.lastIterationCount, `${path}.lastIterationCount`);
  return source as unknown as AirState;
}

function validateEquipment(value: unknown, definition: ScenarioDefinition, path: string): EquipmentInstance[] {
  const items = array(value, path);
  const ids = new Set<string>();
  const equipment = items.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const source = record(item, itemPath);
    const id = string(source.id, `${itemPath}.id`);
    if (ids.has(id)) throw new ValidationError(`${itemPath}.id`, 'duplicate equipment id');
    ids.add(id);
    const definitionId = string(source.definitionId, `${itemPath}.definitionId`);
    const equipmentDefinition = definition.equipment.find((candidate) => candidate.id === definitionId);
    if (!equipmentDefinition) throw new ValidationError(`${itemPath}.definitionId`, 'unknown definition');
    const kind = oneOf(source.kind, ['rack', 'cooler'] as const, `${itemPath}.kind`);
    if (kind !== equipmentDefinition.kind) throw new ValidationError(`${itemPath}.kind`, 'does not match definition');
    const position = record(source.position, `${itemPath}.position`);
    integer(position.x, `${itemPath}.position.x`);
    integer(position.y, `${itemPath}.position.y`);
    oneOf(source.orientation, orientations, `${itemPath}.orientation`);
    const acquisition = integer(source.acquisitionPriceMicrocents, `${itemPath}.acquisitionPriceMicrocents`);
    const resale = integer(source.resaleValueMicrocents, `${itemPath}.resaleValueMicrocents`);
    if (acquisition !== equipmentDefinition.purchasePriceMicrocents
        || resale !== calculateResaleValueMicrocents(acquisition, equipmentDefinition.resaleBasisPoints)) {
      throw new ValidationError(itemPath, 'purchase or resale value does not match definition');
    }
    ['workloadCapFraction', 'effectiveRequestedWorkloadFraction'].forEach((field) => {
      const fraction = finite(source[field], `${itemPath}.${field}`);
      if (fraction < 0 || fraction > 1) throw new ValidationError(`${itemPath}.${field}`, 'expected fraction in [0,1]');
    });
    const requestedPower = integer(source.requestedPowerMilliW, `${itemPath}.requestedPowerMilliW`);
    const allocatedPower = integer(source.allocatedPowerMilliW, `${itemPath}.allocatedPowerMilliW`);
    if (allocatedPower > requestedPower) throw new ValidationError(`${itemPath}.allocatedPowerMilliW`, 'allocation exceeds request');
    const flow = finite(source.actualFlowM3s, `${itemPath}.actualFlowM3s`);
    if (flow < 0) throw new ValidationError(`${itemPath}.actualFlowM3s`, 'expected non-negative flow');
    oneOf(source.operatingState, operatingStates, `${itemPath}.operatingState`);
    const limitReasons = array(source.limitReasons, `${itemPath}.limitReasons`);
    const uniqueReasons = new Set(limitReasons.map((reason, reasonIndex) =>
      oneOf(reason, reasons, `${itemPath}.limitReasons[${reasonIndex}]`)));
    if (uniqueReasons.size !== limitReasons.length) throw new ValidationError(`${itemPath}.limitReasons`, 'duplicate reason');
    if (kind === 'rack') {
      for (const field of ['intakeTemperatureC', 'exhaustTemperatureC'] as const) {
        if (source[field] !== null) {
          const temperature = finite(source[field], `${itemPath}.${field}`);
          if (temperature < definition.model.minTemperatureC || temperature > definition.model.maxTemperatureC) {
            throw new ValidationError(`${itemPath}.${field}`, 'temperature outside model bounds');
          }
        }
      }
      const thermal = finite(source.thermalFactor, `${itemPath}.thermalFactor`);
      if (thermal < 0 || thermal > 1) throw new ValidationError(`${itemPath}.thermalFactor`, 'expected fraction in [0,1]');
      integer(source.usefulOutputMilliServiceUnits, `${itemPath}.usefulOutputMilliServiceUnits`);
      integer(source.recoveryCoolMs, `${itemPath}.recoveryCoolMs`);
    } else {
      const cooling = finite(source.commandedCoolingFraction, `${itemPath}.commandedCoolingFraction`);
      if (cooling < 0 || cooling > 1) throw new ValidationError(`${itemPath}.commandedCoolingFraction`, 'expected fraction in [0,1]');
      for (const field of ['returnTemperatureC', 'supplyTemperatureC'] as const) {
        if (source[field] !== null) {
          const temperature = finite(source[field], `${itemPath}.${field}`);
          if (temperature < definition.model.minTemperatureC || temperature > definition.model.maxTemperatureC) {
            throw new ValidationError(`${itemPath}.${field}`, 'temperature outside model bounds');
          }
        }
      }
      if (finite(source.heatRemovedW, `${itemPath}.heatRemovedW`) < 0) {
        throw new ValidationError(`${itemPath}.heatRemovedW`, 'expected non-negative value');
      }
      bool(source.capacityLimited, `${itemPath}.capacityLimited`);
    }
    return source as unknown as EquipmentInstance;
  });
  const sorted = equipment.map((item) => item.id).sort((a, b) => a.localeCompare(b));
  if (equipment.some((item, index) => item.id !== sorted[index])) throw new ValidationError(path, 'equipment must be sorted by id');
  equipment.forEach((instance, index) => {
    const equipmentDefinition = definition.equipment.find((item) => item.id === instance.definitionId)!;
    const result = validatePlacement(equipmentDefinition, instance.position, instance.orientation, {
      room: definition.room, definitions: definition.equipment, equipment,
      excludeInstanceId: instance.id,
    });
    if (!result.ok) throw new ValidationError(`${path}[${index}].position`, `invalid placement: ${result.code}`);
  });
  return equipment;
}

function validateAccounts(value: unknown, path: string): AccountsState {
  const source = record(value, path);
  const fields = ['cashMicrocents', 'operatingRevenueMicrocents', 'settlementMicrocents',
    'itElectricityCostMicrocents', 'coolingElectricityCostMicrocents', 'rentCostMicrocents',
    'maintenanceCostMicrocents', 'operatingProfitMicrocents', 'capitalPurchasesMicrocents',
    'resaleProceedsMicrocents'] as const;
  fields.forEach((field) => {
    const minimum = field === 'cashMicrocents' || field === 'settlementMicrocents'
      || field === 'operatingProfitMicrocents' ? Number.MIN_SAFE_INTEGER : 0;
    integer(source[field], `${path}.${field}`, minimum);
  });
  return source as unknown as AccountsState;
}

function validateLedger(value: unknown, path: string): LedgerEntry[] {
  const ids = new Set<string>();
  return array(value, path).map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const source = record(item, itemPath);
    const id = string(source.id, `${itemPath}.id`);
    if (ids.has(id)) throw new ValidationError(`${itemPath}.id`, 'duplicate ledger id');
    ids.add(id);
    integer(source.simulatedTimeMs, `${itemPath}.simulatedTimeMs`);
    const category = oneOf(source.category, categories, `${itemPath}.category`);
    const amount = integer(source.amountMicrocents, `${itemPath}.amountMicrocents`, Number.MIN_SAFE_INTEGER);
    const positive = category === 'RESALE' || category === 'REVENUE';
    if ((positive && amount < 0) || (!positive && amount > 0)) {
      throw new ValidationError(`${itemPath}.amountMicrocents`, 'sign does not match category');
    }
    optionalString(source.equipmentInstanceId, `${itemPath}.equipmentInstanceId`);
    string(source.descriptionCode, `${itemPath}.descriptionCode`);
    optionalString(source.contractId, `${itemPath}.contractId`);
    return source as unknown as LedgerEntry;
  });
}

function validateRemainders(value: unknown, path: string): AccrualRemainders {
  const source = record(value, path);
  ['revenue', 'itElectricity', 'coolingElectricity', 'rent', 'maintenance']
    .forEach((field) => integer(source[field], `${path}.${field}`));
  if (Number(source.revenue) >= 1_000_000 || Number(source.itElectricity) >= 3_600_000_000
      || Number(source.coolingElectricity) >= 3_600_000_000
      || Number(source.rent) >= 1_000 || Number(source.maintenance) >= 1_000) {
    throw new ValidationError(path, 'accrual remainder exceeds its divisor');
  }
  return source as unknown as AccrualRemainders;
}

function validateDiagnostic(value: unknown, path: string): SimulationDiagnostic | null {
  if (value === null) return null;
  const source = record(value, path);
  oneOf(source.code, diagnosticCodes, `${path}.code`);
  integer(source.simulatedTick, `${path}.simulatedTick`);
  string(source.messageKey, `${path}.messageKey`);
  if (source.measuredValue !== undefined) finite(source.measuredValue, `${path}.measuredValue`);
  if (source.allowedValue !== undefined) finite(source.allowedValue, `${path}.allowedValue`);
  if (source.details !== undefined) {
    const details = record(source.details, `${path}.details`);
    Object.entries(details).forEach(([key, item]) => {
      if (item !== null && typeof item !== 'string' && typeof item !== 'boolean'
          && (typeof item !== 'number' || !Number.isFinite(item))) {
        throw new ValidationError(`${path}.details.${key}`, 'unsupported diagnostic value');
      }
    });
  }
  return source as unknown as SimulationDiagnostic;
}

function validatePlanningCommand(value: unknown, path: string): ScenarioCommand {
  const source = record(value, path);
  const type = oneOf(source.type, ['PLACE', 'MOVE', 'ROTATE', 'REMOVE'] as const, `${path}.type`);
  if (type === 'PLACE') string(source.definitionId, `${path}.definitionId`);
  else string(source.instanceId, `${path}.instanceId`);
  if (type === 'PLACE' || type === 'MOVE') {
    const position = record(source.position, `${path}.position`);
    integer(position.x, `${path}.position.x`);
    integer(position.y, `${path}.position.y`);
  }
  if (type !== 'REMOVE') oneOf(source.orientation, orientations, `${path}.orientation`);
  return source as unknown as ScenarioCommand;
}

function validateSnapshot(value: unknown, definition: ScenarioDefinition, path: string): PlanningMutationSnapshot {
  const source = record(value, path);
  const air = validateAir(source.air, definition, `${path}.air`);
  const equipment = validateEquipment(source.equipment, definition, `${path}.equipment`);
  const expectedMask = buildFreeCellMask(definition.room, equipment, definition.equipment);
  if (JSON.stringify(air.freeCellMask) !== JSON.stringify(expectedMask)) {
    throw new ValidationError(`${path}.air.freeCellMask`, 'does not match equipment topology');
  }
  validateAccounts(source.accounts, `${path}.accounts`);
  validateLedger(source.ledger, `${path}.ledger`);
  integer(source.nextInstanceOrdinal, `${path}.nextInstanceOrdinal`, 1);
  integer(source.nextLedgerOrdinal, `${path}.nextLedgerOrdinal`, 1);
  return source as unknown as PlanningMutationSnapshot;
}

function validateUndo(value: unknown, definition: ScenarioDefinition, path: string): UndoRecord[] {
  return array(value, path).map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const source = record(item, itemPath);
    validatePlanningCommand(source.command, `${itemPath}.command`);
    const pre = validateSnapshot(source.preState, definition, `${itemPath}.preState`);
    const post = validateSnapshot(source.postState, definition, `${itemPath}.postState`);
    const preHash = string(source.preStateHash, `${itemPath}.preStateHash`);
    const postHash = string(source.postStateHash, `${itemPath}.postStateHash`);
    if (preHash !== JSON.stringify(pre) || postHash !== JSON.stringify(post)) {
      throw new ValidationError(itemPath, 'undo snapshot hash mismatch');
    }
    return source as unknown as UndoRecord;
  });
}

function validateState(value: unknown, definition: ScenarioDefinition, path: string): ScenarioState {
  const source = record(value, path);
  if (string(source.scenarioId, `${path}.scenarioId`) !== definition.id
      || string(source.scenarioRevision, `${path}.scenarioRevision`) !== definition.revision) {
    throw new ValidationError(path, 'scenario identity mismatch');
  }
  string(source.runId, `${path}.runId`);
  const mode = oneOf(source.mode, modes, `${path}.mode`);
  const paused = bool(source.paused, `${path}.paused`);
  const speed = integer(source.selectedSpeed, `${path}.selectedSpeed`);
  if (speed !== 1 && speed !== 2 && speed !== 4) throw new ValidationError(`${path}.selectedSpeed`, 'unsupported speed');
  const simulatedTimeMs = integer(source.simulatedTimeMs, `${path}.simulatedTimeMs`);
  const contractElapsedMs = integer(source.contractElapsedMs, `${path}.contractElapsedMs`);
  if (simulatedTimeMs % definition.model.tickMs !== 0 || contractElapsedMs % definition.model.tickMs !== 0
      || contractElapsedMs > definition.contract.durationMs || simulatedTimeMs < contractElapsedMs) {
    throw new ValidationError(path, 'invalid simulation time');
  }
  const air = validateAir(source.air, definition, `${path}.air`);
  const equipment = validateEquipment(source.equipment, definition, `${path}.equipment`);
  const expectedMask = buildFreeCellMask(definition.room, equipment, definition.equipment);
  if (JSON.stringify(air.freeCellMask) !== JSON.stringify(expectedMask)) {
    throw new ValidationError(`${path}.air.freeCellMask`, 'does not match equipment topology');
  }
  const progress = record(source.contractProgress, `${path}.contractProgress`);
  const status = oneOf(progress.status, statuses, `${path}.contractProgress.status`);
  const elapsed = integer(progress.elapsedMs, `${path}.contractProgress.elapsedMs`);
  const qualifying = integer(progress.qualifyingMs, `${path}.contractProgress.qualifyingMs`);
  integer(progress.deliveredMilliServiceUnitMs, `${path}.contractProgress.deliveredMilliServiceUnitMs`);
  integer(progress.grossRevenueMicrocents, `${path}.contractProgress.grossRevenueMicrocents`);
  integer(progress.settlementMicrocents, `${path}.contractProgress.settlementMicrocents`, Number.MIN_SAFE_INTEGER);
  if (progress.failureReason !== null) oneOf(progress.failureReason, failureReasons, `${path}.contractProgress.failureReason`);
  if (elapsed !== contractElapsedMs || qualifying > elapsed) throw new ValidationError(`${path}.contractProgress`, 'time mismatch');
  const expectedStatus = mode === 'offered' ? 'offered' : mode === 'completed' ? 'succeeded'
    : mode === 'failed' ? 'failed' : 'active';
  if (status !== expectedStatus || (mode === 'operating' ? paused : !paused)) {
    throw new ValidationError(path, 'mode, pause, and contract status are inconsistent');
  }
  if ((mode === 'failed') !== (progress.failureReason !== null)) {
    throw new ValidationError(`${path}.contractProgress.failureReason`, 'failure reason does not match mode');
  }
  const accounts = validateAccounts(source.accounts, `${path}.accounts`);
  const ledger = validateLedger(source.ledger, `${path}.ledger`);
  ledger.forEach((entry, index) => {
    if (entry.simulatedTimeMs > simulatedTimeMs) throw new ValidationError(`${path}.ledger[${index}].simulatedTimeMs`, 'entry is in the future');
    if (entry.equipmentInstanceId !== undefined && !equipment.some((item) => item.id === entry.equipmentInstanceId)
        && entry.category !== 'RESALE') {
      throw new ValidationError(`${path}.ledger[${index}].equipmentInstanceId`, 'unknown equipment');
    }
    if (entry.contractId !== undefined && entry.contractId !== definition.contract.id) {
      throw new ValidationError(`${path}.ledger[${index}].contractId`, 'unknown contract');
    }
  });
  const total = (category: LedgerEntry['category']) => ledger.filter((entry) => entry.category === category)
    .reduce((sum, entry) => sum + entry.amountMicrocents, 0);
  const reconciled = accounts.operatingRevenueMicrocents + accounts.settlementMicrocents
    - accounts.itElectricityCostMicrocents - accounts.coolingElectricityCostMicrocents
    - accounts.rentCostMicrocents - accounts.maintenanceCostMicrocents;
  if (accounts.operatingProfitMicrocents !== reconciled
      || accounts.operatingRevenueMicrocents !== progress.grossRevenueMicrocents
      || accounts.settlementMicrocents !== progress.settlementMicrocents
      || total('PURCHASE') !== -accounts.capitalPurchasesMicrocents
      || total('RESALE') !== accounts.resaleProceedsMicrocents
      || total('REVENUE') !== accounts.operatingRevenueMicrocents
      || total('SETTLEMENT') !== accounts.settlementMicrocents
      || total('IT_ELECTRICITY') !== -accounts.itElectricityCostMicrocents
      || total('COOLING_ELECTRICITY') !== -accounts.coolingElectricityCostMicrocents
      || total('RENT') !== -accounts.rentCostMicrocents
      || total('MAINTENANCE') !== -accounts.maintenanceCostMicrocents
      || accounts.cashMicrocents !== definition.economy.startingCashMicrocents
        - accounts.capitalPurchasesMicrocents + accounts.resaleProceedsMicrocents + reconciled) {
    throw new ValidationError(`${path}.accounts`, 'accounts do not reconcile with ledger and opening cash');
  }
  validateRemainders(source.accrualRemainders, `${path}.accrualRemainders`);
  validateUndo(source.undo, definition, `${path}.undo`);
  integer(source.nextInstanceOrdinal, `${path}.nextInstanceOrdinal`, 1);
  integer(source.nextLedgerOrdinal, `${path}.nextLedgerOrdinal`, 1);
  validateDiagnostic(source.lastDiagnostic, `${path}.lastDiagnostic`);
  return source as unknown as ScenarioState;
}

export function validateTycoonSaveEnvelope(
  value: unknown,
  definition: ScenarioDefinition,
): TycoonSaveEnvelopeV1 {
  const source = record(value, '$');
  const schemaVersion = integer(source.schemaVersion, '$.schemaVersion');
  if (schemaVersion !== 1) {
    throw new ValidationError('$.schemaVersion', 'unsupported save version', 'UNSUPPORTED_VERSION');
  }
  if (source.kind !== 'hot-isle-tycoon-save') throw new ValidationError('$.kind', 'invalid save kind');
  const savedAt = string(source.savedAt, '$.savedAt');
  try {
    if (new Date(savedAt).toISOString() !== savedAt) throw new Error();
  } catch {
    throw new ValidationError('$.savedAt', 'expected canonical ISO timestamp');
  }
  if (string(source.scenarioId, '$.scenarioId') !== definition.id
      || string(source.scenarioRevision, '$.scenarioRevision') !== definition.revision) {
    throw new ValidationError('$', 'scenario identity or revision is incompatible');
  }
  validateState(source.state, definition, '$.state');
  return source as unknown as TycoonSaveEnvelopeV1;
}

function validationFailure(error: unknown): SaveFailure {
  if (error instanceof ValidationError) {
    return {
      code: error.failureCode,
      message: error.message,
      path: error.path,
    };
  }
  return { code: 'INVALID_SAVE', message: error instanceof Error ? error.message : 'Invalid save' };
}

/** Versioned storage adapter. It never reads or writes classic campaign keys. */
export class TycoonSaveStore {
  constructor(
    private readonly definition: ScenarioDefinition,
    private readonly storage: StorageLike | null | undefined = undefined,
  ) {}

  private resolveStorage(): StorageLike | null {
    if (this.storage !== undefined) return this.storage;
    try {
      return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
    } catch {
      return null;
    }
  }

  save(engine: ScenarioEngine, savedAt = new Date().toISOString()): SaveResult {
    if (!engine.createStateSnapshot().paused) engine.dispatch({ type: 'PAUSE' });
    const storage = this.resolveStorage();
    if (!storage) return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is unavailable' } };
    let envelope: TycoonSaveEnvelopeV1;
    let serialized: string;
    try {
      envelope = engine.createSave(savedAt);
      serialized = encodeSaveJson(JSON.stringify(envelope));
      validateTycoonSaveEnvelope(JSON.parse(decodeSaveJson(serialized)) as unknown, this.definition);
    } catch (error) {
      return { ok: false, error: validationFailure(error) };
    }
    try {
      storage.setItem(TYCOON_STAGING_KEY, serialized);
      const staged = storage.getItem(TYCOON_STAGING_KEY);
      if (staged !== serialized) throw new Error('Staging round trip did not preserve the save');
      validateTycoonSaveEnvelope(JSON.parse(decodeSaveJson(staged)) as unknown, this.definition);
      storage.setItem(TYCOON_SAVE_KEY, serialized);
    } catch (error) {
      return {
        ok: false,
        error: { code: 'STORAGE_WRITE_FAILED', message: error instanceof Error ? error.message : 'Storage write failed' },
      };
    }
    try { storage.removeItem(TYCOON_STAGING_KEY); } catch { /* Primary save is already durable. */ }
    return { ok: true, envelope };
  }

  load(): LoadResult {
    const storage = this.resolveStorage();
    if (!storage) return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is unavailable' } };
    let raw: string | null;
    try {
      raw = storage.getItem(TYCOON_SAVE_KEY);
    } catch (error) {
      return {
        ok: false,
        error: { code: 'STORAGE_READ_FAILED', message: error instanceof Error ? error.message : 'Storage read failed' },
      };
    }
    if (raw === null) return { ok: false, error: { code: 'NO_SAVE', message: 'No tycoon save exists' } };
    try {
      const envelope = validateTycoonSaveEnvelope(JSON.parse(decodeSaveJson(raw)) as unknown, this.definition);
      const state = structuredClone(envelope.state);
      state.paused = true;
      if (state.mode === 'operating') state.mode = 'planning';
      return { ok: true, envelope: structuredClone(envelope), state };
    } catch (error) {
      return { ok: false, error: validationFailure(error) };
    }
  }
}
