import {
  buildFreeCellMask,
  calculateResaleValueMicrocents,
  remapAirStateForTopology,
  validatePlacement,
} from '../model/placement';
import type {
  CommandFailureCode,
  CoolerInstance,
  EquipmentDefinition,
  EquipmentInstance,
  LedgerCategory,
  PlanningMutationCommand,
  PlanningMutationSnapshot,
  RackInstance,
  ScenarioCommand,
  ScenarioDefinition,
  ScenarioState,
  UndoRecord,
} from '../model/types';
import { equipmentDefinitionById } from './selectors';

export type CommandReduction =
  | { ok: true; state: ScenarioState; stateChanged: boolean }
  | {
      ok: false;
      code: CommandFailureCode;
      messageKey: string;
      details: Record<string, string | number | boolean | null>;
    };

function failure(
  code: CommandFailureCode,
  details: Record<string, string | number | boolean | null> = {},
): CommandReduction {
  return { ok: false, code, messageKey: `tycoon.command.${code.toLowerCase()}`, details };
}

function snapshot(state: ScenarioState): PlanningMutationSnapshot {
  return structuredClone({
    air: state.air,
    equipment: state.equipment,
    accounts: state.accounts,
    ledger: state.ledger,
    nextInstanceOrdinal: state.nextInstanceOrdinal,
    nextLedgerOrdinal: state.nextLedgerOrdinal,
  });
}

function snapshotHash(value: PlanningMutationSnapshot): string {
  return JSON.stringify(value);
}

function restoreSnapshot(state: ScenarioState, value: PlanningMutationSnapshot): void {
  const restored = structuredClone(value);
  state.air = restored.air;
  state.equipment = restored.equipment;
  state.accounts = restored.accounts;
  state.ledger = restored.ledger;
  state.nextInstanceOrdinal = restored.nextInstanceOrdinal;
  state.nextLedgerOrdinal = restored.nextLedgerOrdinal;
}

function appendCapitalEntry(
  state: ScenarioState,
  category: Extract<LedgerCategory, 'PURCHASE' | 'RESALE'>,
  amountMicrocents: number,
  equipmentInstanceId: string,
): void {
  state.ledger.push({
    id: `ledger-${state.nextLedgerOrdinal}`,
    simulatedTimeMs: state.simulatedTimeMs,
    category,
    amountMicrocents,
    equipmentInstanceId,
    descriptionCode: category === 'PURCHASE' ? 'EQUIPMENT_PURCHASE' : 'EQUIPMENT_RESALE',
  });
  state.nextLedgerOrdinal += 1;
}

function createInstance(
  definition: EquipmentDefinition,
  id: string,
  command: Extract<ScenarioCommand, { type: 'PLACE' }>,
): EquipmentInstance {
  const common = {
    id,
    definitionId: definition.id,
    position: { ...command.position },
    orientation: command.orientation,
    acquisitionPriceMicrocents: definition.purchasePriceMicrocents,
    resaleValueMicrocents: calculateResaleValueMicrocents(
      definition.purchasePriceMicrocents,
      definition.resaleBasisPoints,
    ),
    workloadCapFraction: 1,
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
    commandedCoolingFraction: 1,
    returnTemperatureC: null,
    supplyTemperatureC: null,
    heatRemovedW: 0,
    capacityLimited: false,
  } satisfies CoolerInstance;
}

function requirePlanning(state: ScenarioState): CommandReduction | null {
  return state.mode === 'planning' && state.paused ? null : failure('NOT_PAUSED');
}

function recordMutation(
  state: ScenarioState,
  command: PlanningMutationCommand,
  preState: PlanningMutationSnapshot,
): void {
  const postState = snapshot(state);
  const record: UndoRecord = {
    command: structuredClone(command),
    preState,
    postState,
    preStateHash: snapshotHash(preState),
    postStateHash: snapshotHash(postState),
  };
  state.undo.push(record);
}

function remapTopology(definition: ScenarioDefinition, state: ScenarioState): void {
  const nextMask = buildFreeCellMask(definition.room, state.equipment, definition.equipment);
  state.air = remapAirStateForTopology(state.air, nextMask, definition.room);
}

function placementFailure(result: Extract<ReturnType<typeof validatePlacement>, { ok: false }>): CommandReduction {
  return failure(result.code, { x: result.position.x, y: result.position.y });
}

/** Pure command reducer: failures never expose or mutate a candidate state. */
export function reduceScenarioCommand(
  definition: ScenarioDefinition,
  current: ScenarioState,
  command: ScenarioCommand,
): CommandReduction {
  const state = structuredClone(current);

  if (command.type === 'ACCEPT_CONTRACT') {
    if (state.mode !== 'offered' || state.contractProgress.status !== 'offered') {
      return failure('NOT_RUNNING');
    }
    state.mode = 'planning';
    state.paused = true;
    state.contractProgress.status = 'active';
    return { ok: true, state, stateChanged: true };
  }
  if (command.type === 'PAUSE') {
    if (state.paused) return { ok: true, state, stateChanged: false };
    state.mode = 'planning';
    state.paused = true;
    return { ok: true, state, stateChanged: true };
  }
  if (command.type === 'RESUME') {
    if (state.mode !== 'planning' || state.contractProgress.status !== 'active') {
      return failure('NOT_RUNNING');
    }
    state.mode = 'operating';
    state.paused = false;
    state.undo = [];
    return { ok: true, state, stateChanged: true };
  }
  if (command.type === 'SET_SPEED') {
    if (command.speed !== 1 && command.speed !== 2 && command.speed !== 4) {
      return failure('INVALID_VALUE', { speed: command.speed });
    }
    if (state.selectedSpeed === command.speed) return { ok: true, state, stateChanged: false };
    state.selectedSpeed = command.speed;
    return { ok: true, state, stateChanged: true };
  }
  if (command.type === 'RESTART') return failure('NOT_RUNNING');

  const planningFailure = requirePlanning(state);
  if (planningFailure) return planningFailure;

  if (command.type === 'UNDO') {
    const record = state.undo[state.undo.length - 1];
    if (!record) return failure('NOTHING_TO_UNDO');
    state.undo.pop();
    restoreSnapshot(state, record.preState);
    return { ok: true, state, stateChanged: true };
  }
  if (command.type === 'SET_WORKLOAD' || command.type === 'SET_COOLING') {
    if (!Number.isFinite(command.fraction) || command.fraction < 0 || command.fraction > 1) {
      return failure('INVALID_VALUE', { fraction: command.fraction });
    }
    const index = state.equipment.findIndex((item) => item.id === command.instanceId);
    if (index < 0) return failure('UNKNOWN_INSTANCE', { instanceId: command.instanceId });
    const instance = state.equipment[index]!;
    if (command.type === 'SET_WORKLOAD') {
      if (instance.kind !== 'rack') return failure('UNKNOWN_INSTANCE', { instanceId: command.instanceId });
      if (instance.workloadCapFraction === command.fraction) return { ok: true, state, stateChanged: false };
      instance.workloadCapFraction = command.fraction;
    } else {
      if (instance.kind !== 'cooler') return failure('UNKNOWN_INSTANCE', { instanceId: command.instanceId });
      if (instance.commandedCoolingFraction === command.fraction) return { ok: true, state, stateChanged: false };
      instance.commandedCoolingFraction = command.fraction;
    }
    return { ok: true, state, stateChanged: true };
  }

  const preState = snapshot(state);
  if (command.type === 'PLACE') {
    const equipmentDefinition = equipmentDefinitionById(definition, command.definitionId);
    if (!equipmentDefinition) return failure('UNKNOWN_DEFINITION', { definitionId: command.definitionId });
    const placement = validatePlacement(
      equipmentDefinition,
      command.position,
      command.orientation,
      {
        room: definition.room,
        definitions: definition.equipment,
        equipment: state.equipment,
        availableCashMicrocents: state.accounts.cashMicrocents,
        isPurchase: true,
      },
    );
    if (!placement.ok) return placementFailure(placement);
    const instance = createInstance(equipmentDefinition, `equipment-${state.nextInstanceOrdinal}`, command);
    state.nextInstanceOrdinal += 1;
    state.equipment.push(instance);
    state.equipment.sort((a, b) => a.id.localeCompare(b.id));
    state.accounts.cashMicrocents -= instance.acquisitionPriceMicrocents;
    state.accounts.capitalPurchasesMicrocents += instance.acquisitionPriceMicrocents;
    appendCapitalEntry(state, 'PURCHASE', -instance.acquisitionPriceMicrocents, instance.id);
    remapTopology(definition, state);
  } else {
    const index = state.equipment.findIndex((item) => item.id === command.instanceId);
    if (index < 0) return failure('UNKNOWN_INSTANCE', { instanceId: command.instanceId });
    const instance = state.equipment[index]!;
    const equipmentDefinition = equipmentDefinitionById(definition, instance.definitionId);
    if (!equipmentDefinition) return failure('UNKNOWN_DEFINITION', { definitionId: instance.definitionId });
    if (command.type === 'REMOVE') {
      state.equipment.splice(index, 1);
      state.accounts.cashMicrocents += instance.resaleValueMicrocents;
      state.accounts.resaleProceedsMicrocents += instance.resaleValueMicrocents;
      appendCapitalEntry(state, 'RESALE', instance.resaleValueMicrocents, instance.id);
    } else {
      const position = command.type === 'MOVE' ? command.position : instance.position;
      const orientation = command.orientation;
      const placement = validatePlacement(equipmentDefinition, position, orientation, {
        room: definition.room,
        definitions: definition.equipment,
        equipment: state.equipment,
        excludeInstanceId: instance.id,
      });
      if (!placement.ok) return placementFailure(placement);
      instance.position = { ...position };
      instance.orientation = orientation;
    }
    remapTopology(definition, state);
  }
  recordMutation(state, command, preState);
  return { ok: true, state, stateChanged: true };
}
