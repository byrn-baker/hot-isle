import type {
  EquipmentDefinition,
  ScenarioDefinition,
  ScenarioState,
  ScenarioView,
  WorkloadSegment,
} from '../model/types';

export function equipmentDefinitionById(
  definition: ScenarioDefinition,
  definitionId: string,
): EquipmentDefinition | undefined {
  return definition.equipment.find((candidate) => candidate.id === definitionId);
}

export function workloadSegmentAt(
  definition: ScenarioDefinition,
  elapsedMs: number,
): WorkloadSegment {
  const segment = definition.workload.find(
    (candidate) => elapsedMs >= candidate.startMs && elapsedMs < candidate.endMs,
  );
  if (!segment) throw new Error(`No workload segment covers ${elapsedMs}ms`);
  return segment;
}

export function reliabilityBasisPoints(state: ScenarioState): number {
  return Math.floor(
    state.contractProgress.qualifyingMs * 10_000
      / Math.max(state.contractProgress.elapsedMs, 1),
  );
}

export function createScenarioView(
  definition: ScenarioDefinition,
  state: ScenarioState,
): Readonly<ScenarioView> {
  return structuredClone({
    scenarioId: state.scenarioId,
    scenarioRevision: state.scenarioRevision,
    mode: state.mode,
    paused: state.paused,
    selectedSpeed: state.selectedSpeed,
    simulatedTimeMs: state.simulatedTimeMs,
    room: definition.room,
    air: state.air,
    equipment: state.equipment,
    contractProgress: state.contractProgress,
    accounts: state.accounts,
    lastDiagnostic: state.lastDiagnostic,
  });
}
