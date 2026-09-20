export type Orientation = 'north' | 'east' | 'south' | 'west';
export type SimulationSpeed = 1 | 2 | 4;

export interface GridPosition {
  x: number;
  y: number;
}

export interface FootprintDefinition {
  widthCells: number;
  depthCells: number;
}

export interface ThermalControlDefinition {
  fullOutputThroughC: number;
  shutdownAtC: number;
  recoverAtOrBelowC: number;
  recoverHoldMs: number;
  minimumThrottleFactor: number;
}

interface EquipmentDefinitionBase {
  id: string;
  displayName: string;
  footprint: FootprintDefinition;
  serviceOffsets: GridPosition[];
  purchasePriceMicrocents: number;
  resaleBasisPoints: number;
  maintenanceRateMicrocentsPerS: number;
}

export interface RackDefinition extends EquipmentDefinitionBase {
  kind: 'rack';
  intakeOffset: GridPosition;
  exhaustOffset: GridPosition;
  nameplateServiceUnits: number;
  idlePowerW: number;
  maxPowerW: number;
  ratedFanFlowM3s: number;
  thermalControl: ThermalControlDefinition;
}

export interface CoolerDefinition extends EquipmentDefinitionBase {
  kind: 'cooler';
  returnOffset: GridPosition;
  supplyOffset: GridPosition;
  ratedAirflowM3s: number;
  ratedHeatRemovalW: number;
  targetSupplyC: number;
  idlePowerW: number;
  ratedPowerW: number;
}

export type EquipmentDefinition = RackDefinition | CoolerDefinition;

export interface RoomDefinition {
  widthCells: number;
  heightCells: number;
  cellSizeM: 1;
  mixingHeightM: number;
  blockedCells: GridPosition[];
  requiredAccessCells: GridPosition[];
  powerLimitW: number;
  initialTemperatureC: number;
  envelopeHeatWByCell: Array<{ position: GridPosition; heatW: number }>;
}

export interface ModelParameters {
  tickMs: number;
  airDensityKgM3: number;
  airSpecificHeatJKgK: number;
  faceConductanceM3sPa: number;
  mixingConductanceM3s: number;
  minTemperatureC: number;
  maxTemperatureC: number;
  maxOutgoingVolumeFraction: number;
  flowResidualToleranceM3s: number;
  flowMaxIterations: number;
  energyAbsoluteToleranceJ: number;
  energyRelativeTolerance: number;
}

export interface EconomyDefinition {
  startingCashMicrocents: number;
  electricityRateMicrocentsPerWh: number;
  rentRateMicrocentsPerS: number;
  powerAllocationPolicy: 'cooling-first-proportional-racks';
  bankruptcyThresholdMicrocents: number;
}

export interface ShortfallPolicyDefinition {
  kind: 'missing-service-debit';
  rateMicrocentsPerServiceUnitSecond: number;
  cap: 'gross-revenue';
}

export interface ContractDefinition {
  id: string;
  displayName: string;
  requiredServiceUnits: number;
  durationMs: number;
  reliabilityTargetBasisPoints: number;
  revenueRateMicrocentsPerServiceUnitSecond: number;
  shortfallPolicy: ShortfallPolicyDefinition;
}

export interface WorkloadSegment {
  startMs: number;
  endMs: number;
  demandFraction: number;
  definitionOverrides?: Record<string, number>;
  instanceOverrides?: Record<string, number>;
}

export interface InitialPlacementBase {
  id: string;
  definitionId: string;
  position: GridPosition;
  orientation: Orientation;
  workloadCapFraction?: number;
}

export interface RackInitialPlacement extends InitialPlacementBase {
  kind: 'rack';
}

export interface CoolerInitialPlacement extends InitialPlacementBase {
  kind: 'cooler';
  commandedCoolingFraction?: number;
}

export type InitialPlacement = RackInitialPlacement | CoolerInitialPlacement;

export interface TrialDefinition {
  id: string;
  displayName: string;
  scenarioId: string;
  scenarioRevision: string;
  initialEquipment: InitialPlacement[];
  workloadFraction: number;
  durationMs: number;
  commitToLive: false;
}

export interface ScenarioDefinition {
  id: string;
  revision: string;
  room: RoomDefinition;
  model: ModelParameters;
  equipment: EquipmentDefinition[];
  initialEquipment: InitialPlacement[];
  economy: EconomyDefinition;
  contract: ContractDefinition;
  workload: WorkloadSegment[];
  trialFixtures: TrialDefinition[];
  disclaimer: string;
}

export type OperatingState = 'off' | 'running' | 'throttled' | 'thermal-shutdown' | 'power-limited';
export type LimitReason =
  | 'NO_WORKLOAD'
  | 'INTAKE_BLOCKED'
  | 'EXHAUST_BLOCKED'
  | 'INSUFFICIENT_FLOW'
  | 'POWER_LIMITED'
  | 'INTAKE_HOT'
  | 'THERMAL_SHUTDOWN'
  | 'COOLER_CAPACITY';

interface EquipmentInstanceBase {
  id: string;
  definitionId: string;
  position: GridPosition;
  orientation: Orientation;
  acquisitionPriceMicrocents: number;
  resaleValueMicrocents: number;
  workloadCapFraction: number;
  effectiveRequestedWorkloadFraction: number;
  requestedPowerMilliW: number;
  allocatedPowerMilliW: number;
  actualFlowM3s: number;
  operatingState: OperatingState;
  limitReasons: LimitReason[];
}

export interface RackInstance extends EquipmentInstanceBase {
  kind: 'rack';
  intakeTemperatureC: number | null;
  exhaustTemperatureC: number | null;
  thermalFactor: number;
  usefulOutputMilliServiceUnits: number;
  recoveryCoolMs: number;
}

export interface CoolerInstance extends EquipmentInstanceBase {
  kind: 'cooler';
  commandedCoolingFraction: number;
  returnTemperatureC: number | null;
  supplyTemperatureC: number | null;
  heatRemovedW: number;
  capacityLimited: boolean;
}

export type EquipmentInstance = RackInstance | CoolerInstance;

export interface AirState {
  temperatureC: Array<number | null>;
  freeCellMask: boolean[];
  faceFlowXM3s: number[];
  faceFlowYM3s: number[];
  flowValid: boolean;
  lastFlowResidualM3s: number;
  lastEnergyResidualJ: number;
  lastIterationCount: number;
}

export type SimulationDiagnosticCode =
  | 'FLOW_SOLVE_FAILED'
  | 'FLOW_RESIDUAL_EXCEEDED'
  | 'CFL_EXCEEDED'
  | 'ENERGY_RESIDUAL_EXCEEDED'
  | 'NON_FINITE_STATE'
  | 'INVALID_DEFINITION'
  | 'INVALID_SAVE';

export interface SimulationDiagnostic {
  code: SimulationDiagnosticCode;
  simulatedTick: number;
  messageKey: string;
  measuredValue?: number;
  allowedValue?: number;
  details?: Record<string, string | number | boolean | null>;
}

export type ContractFailureReason = 'BANKRUPTCY' | 'RELIABILITY_SHORTFALL' | SimulationDiagnosticCode;

export interface ContractProgress {
  status: 'offered' | 'active' | 'succeeded' | 'failed';
  elapsedMs: number;
  qualifyingMs: number;
  deliveredMilliServiceUnitMs: number;
  grossRevenueMicrocents: number;
  settlementMicrocents: number;
  failureReason: ContractFailureReason | null;
}

export interface AccountsState {
  cashMicrocents: number;
  operatingRevenueMicrocents: number;
  settlementMicrocents: number;
  itElectricityCostMicrocents: number;
  coolingElectricityCostMicrocents: number;
  rentCostMicrocents: number;
  maintenanceCostMicrocents: number;
  operatingProfitMicrocents: number;
  capitalPurchasesMicrocents: number;
  resaleProceedsMicrocents: number;
}

export interface AccrualRemainders {
  revenue: number;
  itElectricity: number;
  coolingElectricity: number;
  rent: number;
  maintenance: number;
}

export type LedgerCategory =
  | 'PURCHASE'
  | 'RESALE'
  | 'REVENUE'
  | 'SETTLEMENT'
  | 'IT_ELECTRICITY'
  | 'COOLING_ELECTRICITY'
  | 'RENT'
  | 'MAINTENANCE';

export interface LedgerEntry {
  id: string;
  simulatedTimeMs: number;
  category: LedgerCategory;
  amountMicrocents: number;
  equipmentInstanceId?: string;
  descriptionCode: string;
  contractId?: string;
}

export type ScenarioCommand =
  | { type: 'ACCEPT_CONTRACT' }
  | { type: 'PLACE'; definitionId: string; position: GridPosition; orientation: Orientation }
  | { type: 'MOVE'; instanceId: string; position: GridPosition; orientation: Orientation }
  | { type: 'ROTATE'; instanceId: string; orientation: Orientation }
  | { type: 'REMOVE'; instanceId: string }
  | { type: 'UNDO' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SET_SPEED'; speed: SimulationSpeed }
  | { type: 'SET_WORKLOAD'; instanceId: string; fraction: number }
  | { type: 'SET_COOLING'; instanceId: string; fraction: number }
  | { type: 'RESTART' };

export type PlanningMutationCommand = Extract<ScenarioCommand, { type: 'PLACE' | 'MOVE' | 'ROTATE' | 'REMOVE' }>;

export interface PlanningMutationSnapshot {
  air: AirState;
  equipment: EquipmentInstance[];
  accounts: AccountsState;
  ledger: LedgerEntry[];
  nextInstanceOrdinal: number;
  nextLedgerOrdinal: number;
}

export interface UndoRecord {
  command: PlanningMutationCommand;
  preState: PlanningMutationSnapshot;
  postState: PlanningMutationSnapshot;
  preStateHash: string;
  postStateHash: string;
}

export interface ScenarioState {
  scenarioId: string;
  scenarioRevision: string;
  runId: string;
  mode: 'offered' | 'planning' | 'operating' | 'completed' | 'failed';
  paused: boolean;
  selectedSpeed: SimulationSpeed;
  simulatedTimeMs: number;
  contractElapsedMs: number;
  air: AirState;
  equipment: EquipmentInstance[];
  contractProgress: ContractProgress;
  accounts: AccountsState;
  ledger: LedgerEntry[];
  accrualRemainders: AccrualRemainders;
  undo: UndoRecord[];
  nextInstanceOrdinal: number;
  nextLedgerOrdinal: number;
  lastDiagnostic: SimulationDiagnostic | null;
}

export interface TycoonSaveEnvelopeV1 {
  schemaVersion: 1;
  kind: 'hot-isle-tycoon-save';
  savedAt: string;
  scenarioId: string;
  scenarioRevision: string;
  state: ScenarioState;
}

export interface TrialReport {
  label: 'NON-ECONOMIC TRIAL';
  projected: true;
  scenarioId: string;
  scenarioRevision: string;
  layoutHash: string;
  equipmentInventoryHash: string;
  initialConditionHash: string;
  tickCount: number;
  durationMs: number;
  peakRackIntakeTemperatureC: number | null;
  meanRackIntakeTemperatureC: number | null;
  minimumDeliveredMilliServiceUnits: number;
  deliveredMilliServiceUnitMs: number;
  itEnergyMilliWh: number;
  coolingEnergyMilliWh: number;
  capacityLimitedMs: number;
  diagnostics: SimulationDiagnostic[];
  projectedLedger: LedgerEntry[];
  projectedOperatingProfitMicrocents: number;
}

export type CommandFailureCode =
  | 'NOT_PAUSED'
  | 'NOT_RUNNING'
  | 'OUT_OF_BOUNDS'
  | 'FOOTPRINT_BLOCKED'
  | 'SERVICE_ACCESS_BLOCKED'
  | 'OCCUPIED'
  | 'INSUFFICIENT_FUNDS'
  | 'UNKNOWN_DEFINITION'
  | 'UNKNOWN_INSTANCE'
  | 'NOT_REMOVABLE'
  | 'INVALID_VALUE'
  | 'NOTHING_TO_UNDO';

export interface ScenarioView {
  scenarioId: string;
  scenarioRevision: string;
  mode: ScenarioState['mode'];
  paused: boolean;
  selectedSpeed: SimulationSpeed;
  simulatedTimeMs: number;
  room: RoomDefinition;
  air: AirState;
  equipment: EquipmentInstance[];
  contractProgress: ContractProgress;
  accounts: AccountsState;
  lastDiagnostic: SimulationDiagnostic | null;
}

export type CommandResult =
  | { ok: true; stateChanged: boolean; view: Readonly<ScenarioView> }
  | {
      ok: false;
      code: CommandFailureCode;
      messageKey: string;
      details: Record<string, string | number | boolean | null>;
      view: Readonly<ScenarioView>;
    };

export interface AdvanceResult {
  requestedTicks: number;
  advancedTicks: number;
  stateChanged: boolean;
  diagnostic: SimulationDiagnostic | null;
  view: Readonly<ScenarioView>;
}

export interface TrialRequest {
  fixtureId?: string;
  initialState?: ScenarioState;
  workloadFraction: number;
  durationMs: number;
  commitToLive: false;
}

export type TrialResult =
  | { ok: true; report: TrialReport }
  | { ok: false; diagnostic: SimulationDiagnostic };

export interface ScenarioEngine {
  dispatch(command: ScenarioCommand): CommandResult;
  advanceTicks(count: number): AdvanceResult;
  createView(): Readonly<ScenarioView>;
  createSave(savedAt?: string): TycoonSaveEnvelopeV1;
  runTrial(request: TrialRequest): TrialResult;
}
