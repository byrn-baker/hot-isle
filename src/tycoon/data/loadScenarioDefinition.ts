import {
  buildFreeCellMask,
  calculateResaleValueMicrocents,
  createInitialAirState,
  remapAirStateForTopology,
} from '../model/placement';
import type {
  CoolerInitialPlacement,
  CoolerInstance,
  EquipmentDefinition,
  EquipmentInstance,
  InitialPlacement,
  LedgerEntry,
  RackInstance,
  ScenarioDefinition,
  ScenarioState,
} from '../model/types';
import { assertValidScenarioDefinition } from '../model/validation';
import { SCENARIO_001 } from './scenario-001';

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function loadScenarioDefinition(source: unknown = SCENARIO_001): ScenarioDefinition {
  assertValidScenarioDefinition(source);
  return cloneJson(source);
}

function findDefinition(
  definitions: readonly EquipmentDefinition[],
  definitionId: string,
): EquipmentDefinition {
  const definition = definitions.find((candidate) => candidate.id === definitionId);
  if (!definition) throw new Error(`Unknown equipment definition: ${definitionId}`);
  return definition;
}

function createEquipmentInstance(
  placement: InitialPlacement,
  definition: EquipmentDefinition,
): EquipmentInstance {
  const common = {
    id: placement.id,
    definitionId: placement.definitionId,
    position: { ...placement.position },
    orientation: placement.orientation,
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
    operatingState: 'off' as const,
    limitReasons: [],
  };
  if (definition.kind === 'rack') {
    return {
      ...common,
      kind: 'rack',
      intakeTemperatureC: null,
      exhaustTemperatureC: null,
      thermalFactor: 1,
      usefulOutputMilliServiceUnits: 0,
      recoveryCoolMs: 0,
    } satisfies RackInstance;
  }
  return {
    ...common,
    kind: 'cooler',
    commandedCoolingFraction: (placement as CoolerInitialPlacement).commandedCoolingFraction ?? 1,
    returnTemperatureC: null,
    supplyTemperatureC: null,
    heatRemovedW: 0,
    capacityLimited: false,
  } satisfies CoolerInstance;
}

export function createInitialScenarioState(
  definition: ScenarioDefinition,
  runId = 'run-001',
): ScenarioState {
  assertValidScenarioDefinition(definition);
  if (runId.trim().length === 0) throw new Error('runId must be a non-empty string');

  const equipment = definition.initialEquipment
    .map((placement) => createEquipmentInstance(
      placement,
      findDefinition(definition.equipment, placement.definitionId),
    ))
    .sort((a, b) => a.id.localeCompare(b.id));
  const initialAir = createInitialAirState(definition.room);
  const air = remapAirStateForTopology(
    initialAir,
    buildFreeCellMask(definition.room, equipment, definition.equipment),
    definition.room,
  );
  const capitalPurchasesMicrocents = equipment.reduce(
    (sum, instance) => sum + instance.acquisitionPriceMicrocents,
    0,
  );
  if (!Number.isSafeInteger(capitalPurchasesMicrocents)
      || capitalPurchasesMicrocents > definition.economy.startingCashMicrocents) {
    throw new Error('Initial equipment purchases exceed the safe opening budget');
  }
  const ledger: LedgerEntry[] = equipment.map((instance, index) => ({
    id: `ledger-${index + 1}`,
    simulatedTimeMs: 0,
    category: 'PURCHASE',
    amountMicrocents: -instance.acquisitionPriceMicrocents,
    equipmentInstanceId: instance.id,
    descriptionCode: 'INITIAL_EQUIPMENT_PURCHASE',
  }));

  return {
    scenarioId: definition.id,
    scenarioRevision: definition.revision,
    runId,
    mode: 'offered',
    paused: true,
    selectedSpeed: 1,
    simulatedTimeMs: 0,
    contractElapsedMs: 0,
    air,
    equipment,
    contractProgress: {
      status: 'offered',
      elapsedMs: 0,
      qualifyingMs: 0,
      deliveredMilliServiceUnitMs: 0,
      grossRevenueMicrocents: 0,
      settlementMicrocents: 0,
      failureReason: null,
    },
    accounts: {
      cashMicrocents: definition.economy.startingCashMicrocents - capitalPurchasesMicrocents,
      operatingRevenueMicrocents: 0,
      settlementMicrocents: 0,
      itElectricityCostMicrocents: 0,
      coolingElectricityCostMicrocents: 0,
      rentCostMicrocents: 0,
      maintenanceCostMicrocents: 0,
      operatingProfitMicrocents: 0,
      capitalPurchasesMicrocents,
      resaleProceedsMicrocents: 0,
    },
    ledger,
    accrualRemainders: {
      revenue: 0,
      itElectricity: 0,
      coolingElectricity: 0,
      rent: 0,
      maintenance: 0,
    },
    undo: [],
    nextInstanceOrdinal: equipment.length + 1,
    nextLedgerOrdinal: ledger.length + 1,
    lastDiagnostic: null,
  };
}
