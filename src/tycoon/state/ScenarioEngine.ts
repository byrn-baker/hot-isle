import { createInitialScenarioState } from '../data/loadScenarioDefinition';
import { applyEconomyTick } from '../economy/EconomySystem';
import type {
  AdvanceResult,
  CommandResult,
  ScenarioCommand,
  ScenarioDefinition,
  ScenarioState,
  ScenarioView,
  SimulationDiagnostic,
  TrialReport,
  TrialRequest,
  TrialResult,
  TycoonSaveEnvelopeV1,
} from '../model/types';
import { assertValidScenarioDefinition } from '../model/validation';
import { simulateSpatialTick } from '../simulation/ThermalTransport';
import { reduceScenarioCommand } from './commands';
import { createScenarioView, workloadSegmentAt } from './selectors';

function workloadFractionsAt(
  definition: ScenarioDefinition,
  state: ScenarioState,
): Readonly<Record<string, number>> {
  const segment = workloadSegmentAt(definition, state.contractElapsedMs);
  return Object.fromEntries(state.equipment
    .filter((instance) => instance.kind === 'rack')
    .map((instance) => [
      instance.id,
      segment.instanceOverrides?.[instance.id]
        ?? segment.definitionOverrides?.[instance.definitionId]
        ?? segment.demandFraction,
    ]));
}

function numericalFailureState(
  current: ScenarioState,
  diagnostic: SimulationDiagnostic,
): ScenarioState {
  const state = structuredClone(current);
  state.mode = 'failed';
  state.paused = true;
  state.contractProgress.status = 'failed';
  state.contractProgress.failureReason = diagnostic.code;
  state.lastDiagnostic = structuredClone(diagnostic);
  return state;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function stableHash(value: unknown): string {
  const source = canonical(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function trialDiagnostic(message: string): SimulationDiagnostic {
  return {
    code: 'INVALID_DEFINITION',
    simulatedTick: 0,
    messageKey: 'tycoon.trial.invalid_request',
    details: { message },
  };
}

/** Deterministic authoritative command/tick engine. Wall-clock pacing belongs to the UI. */
export class ScenarioEngine {
  readonly definition: ScenarioDefinition;
  private state: ScenarioState;

  constructor(definition: ScenarioDefinition, initialState?: ScenarioState) {
    assertValidScenarioDefinition(definition);
    this.definition = structuredClone(definition);
    this.state = initialState
      ? structuredClone(initialState)
      : createInitialScenarioState(this.definition);
    if (this.state.scenarioId !== this.definition.id
        || this.state.scenarioRevision !== this.definition.revision) {
      throw new Error('Initial state does not match the scenario definition');
    }
  }

  dispatch(command: ScenarioCommand): CommandResult {
    if (command.type === 'RESTART') {
      this.state = createInitialScenarioState(this.definition, this.state.runId);
      return { ok: true, stateChanged: true, view: this.createView() };
    }
    const result = reduceScenarioCommand(this.definition, this.state, command);
    if (!result.ok) {
      return { ...result, view: this.createView() };
    }
    if (result.stateChanged) this.state = result.state;
    return { ok: true, stateChanged: result.stateChanged, view: this.createView() };
  }

  advanceTicks(count: number): AdvanceResult {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new RangeError('Tick count must be a positive safe integer');
    }
    if (this.state.mode !== 'operating' || this.state.paused
        || this.state.contractProgress.status !== 'active') {
      return {
        requestedTicks: count,
        advancedTicks: 0,
        stateChanged: false,
        diagnostic: null,
        view: this.createView(),
      };
    }

    let advancedTicks = 0;
    let diagnostic: SimulationDiagnostic | null = null;
    for (; advancedTicks < count; advancedTicks += 1) {
      const current = this.state;
      const simulatedTick = current.simulatedTimeMs / this.definition.model.tickMs + 1;
      const spatial = simulateSpatialTick(
        this.definition,
        current.air,
        current.equipment,
        workloadFractionsAt(this.definition, current),
        simulatedTick,
      );
      if (!spatial.ok) {
        diagnostic = spatial.diagnostic;
        this.state = numericalFailureState(current, diagnostic);
        break;
      }
      // Historical ledger entries are immutable: economy ticks only append entries.
      // Copy the array without repeatedly deep-copying the full contract history.
      // Public snapshots still deep-clone everything, so callers cannot mutate it.
      const candidate: ScenarioState = structuredClone({ ...current, ledger: [] });
      candidate.ledger = current.ledger.slice();
      candidate.air = spatial.air;
      candidate.equipment = spatial.equipment;
      candidate.lastDiagnostic = null;
      const economy = applyEconomyTick(this.definition, candidate);
      if (!economy.ok) {
        diagnostic = {
          code: 'NON_FINITE_STATE',
          simulatedTick,
          messageKey: 'tycoon.simulation.non_finite_state',
          details: { reason: economy.reason },
        };
        this.state = numericalFailureState(current, diagnostic);
        break;
      }
      this.state = economy.state;
      if (this.state.mode !== 'operating') {
        advancedTicks += 1;
        break;
      }
    }
    return {
      requestedTicks: count,
      advancedTicks,
      stateChanged: advancedTicks > 0 || diagnostic !== null,
      diagnostic,
      view: this.createView(),
    };
  }

  createView(): Readonly<ScenarioView> {
    return createScenarioView(this.definition, this.state);
  }

  /** Bounded detached ledger rows for HUD updates without copying the full run. */
  createRecentLedger(limit = 8): ScenarioState['ledger'] {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1_000) {
      throw new RangeError('Recent ledger count must be an integer from 0 to 1000');
    }
    return limit === 0 ? [] : structuredClone(this.state.ledger.slice(-limit));
  }

  /** Test/persistence seam returning a detached authoritative snapshot. */
  createStateSnapshot(): ScenarioState {
    return structuredClone(this.state);
  }

  createSave(savedAt = new Date().toISOString()): TycoonSaveEnvelopeV1 {
    if (!this.state.paused) throw new Error('A save can only be created from a paused state');
    if (new Date(savedAt).toISOString() !== savedAt) throw new Error('savedAt must be an ISO timestamp');
    return {
      schemaVersion: 1,
      kind: 'hot-isle-tycoon-save',
      savedAt,
      scenarioId: this.definition.id,
      scenarioRevision: this.definition.revision,
      state: this.createStateSnapshot(),
    };
  }

  runTrial(request: TrialRequest): TrialResult {
    const liveBefore = canonical(this.state);
    const invalid = request.commitToLive !== false
      || !Number.isFinite(request.workloadFraction)
      || request.workloadFraction < 0
      || request.workloadFraction > 1
      || !Number.isSafeInteger(request.durationMs)
      || request.durationMs <= 0
      || request.durationMs % this.definition.model.tickMs !== 0
      || (request.fixtureId === undefined) === (request.initialState === undefined);
    if (invalid) return { ok: false, diagnostic: trialDiagnostic('Invalid or ambiguous trial request') };

    try {
      const definition = structuredClone(this.definition);
      definition.contract.durationMs = request.durationMs;
      definition.workload = [{
        startMs: 0,
        endMs: request.durationMs,
        demandFraction: request.workloadFraction,
      }];
      let initial: ScenarioState;
      if (request.fixtureId !== undefined) {
        const fixture = definition.trialFixtures.find((candidate) => candidate.id === request.fixtureId);
        if (!fixture) return { ok: false, diagnostic: trialDiagnostic('Unknown trial fixture') };
        if (fixture.scenarioId !== definition.id || fixture.scenarioRevision !== definition.revision
            || fixture.commitToLive !== false) {
          return { ok: false, diagnostic: trialDiagnostic('Trial fixture does not match this scenario') };
        }
        definition.initialEquipment = structuredClone(fixture.initialEquipment);
        initial = createInitialScenarioState(definition, `trial-${fixture.id}`);
      } else {
        initial = structuredClone(request.initialState!);
        if (initial.scenarioId !== definition.id || initial.scenarioRevision !== definition.revision) {
          return { ok: false, diagnostic: trialDiagnostic('Trial snapshot does not match this scenario') };
        }
        initial.undo = [];
      }

      initial.mode = 'operating';
      initial.paused = false;
      initial.simulatedTimeMs = 0;
      initial.contractElapsedMs = 0;
      initial.contractProgress = {
        status: 'active', elapsedMs: 0, qualifyingMs: 0,
        deliveredMilliServiceUnitMs: 0, grossRevenueMicrocents: 0,
        settlementMicrocents: 0, failureReason: null,
      };
      initial.lastDiagnostic = null;
      const startingLedgerLength = initial.ledger.length;
      const startingProfit = initial.accounts.operatingProfitMicrocents;
      const trial = new ScenarioEngine(definition, initial);
      const tickCount = request.durationMs / definition.model.tickMs;
      let peak: number | null = null;
      let intakeSum = 0;
      let intakeSamples = 0;
      let minimumDelivered = Number.MAX_SAFE_INTEGER;
      let itEnergyMilliWh = 0;
      let coolingEnergyMilliWh = 0;
      let capacityLimitedMs = 0;
      const diagnostics: SimulationDiagnostic[] = [];
      for (let tick = 0; tick < tickCount; tick += 1) {
        const result = trial.advanceTicks(1);
        if (result.diagnostic) diagnostics.push(structuredClone(result.diagnostic));
        if (result.advancedTicks !== 1) {
          return { ok: false, diagnostic: result.diagnostic ?? trialDiagnostic('Trial stopped before its duration') };
        }
        const state = trial.createStateSnapshot();
        const rackIntakes = state.equipment.flatMap((item) =>
          item.kind === 'rack' && item.intakeTemperatureC !== null ? [item.intakeTemperatureC] : []);
        for (const temperature of rackIntakes) {
          peak = peak === null ? temperature : Math.max(peak, temperature);
          intakeSum += temperature;
          intakeSamples += 1;
        }
        const delivered = state.equipment
          .filter((item) => item.kind === 'rack')
          .reduce((sum, item) => sum + item.usefulOutputMilliServiceUnits, 0);
        minimumDelivered = Math.min(minimumDelivered, delivered);
        itEnergyMilliWh += state.equipment
          .filter((item) => item.kind === 'rack')
          .reduce((sum, item) => sum + item.allocatedPowerMilliW * definition.model.tickMs / 3_600_000, 0);
        coolingEnergyMilliWh += state.equipment
          .filter((item) => item.kind === 'cooler')
          .reduce((sum, item) => sum + item.allocatedPowerMilliW * definition.model.tickMs / 3_600_000, 0);
        if (state.equipment.some((item) => (item.kind === 'cooler' && item.capacityLimited)
            || item.limitReasons.includes('POWER_LIMITED'))) {
          capacityLimitedMs += definition.model.tickMs;
        }
      }
      const final = trial.createStateSnapshot();
      const report: TrialReport = {
        label: 'NON-ECONOMIC TRIAL', projected: true,
        scenarioId: definition.id, scenarioRevision: definition.revision,
        layoutHash: stableHash(initial.equipment.map(({ id, position, orientation }) => ({ id, position, orientation }))),
        equipmentInventoryHash: stableHash(initial.equipment.map(({ definitionId }) => definitionId).sort()),
        initialConditionHash: stableHash({ air: initial.air, equipment: initial.equipment }),
        tickCount, durationMs: request.durationMs,
        peakRackIntakeTemperatureC: peak,
        meanRackIntakeTemperatureC: intakeSamples === 0 ? null : intakeSum / intakeSamples,
        minimumDeliveredMilliServiceUnits: minimumDelivered === Number.MAX_SAFE_INTEGER ? 0 : minimumDelivered,
        deliveredMilliServiceUnitMs: final.contractProgress.deliveredMilliServiceUnitMs,
        itEnergyMilliWh, coolingEnergyMilliWh, capacityLimitedMs, diagnostics,
        projectedLedger: structuredClone(final.ledger.slice(startingLedgerLength)),
        projectedOperatingProfitMicrocents:
          final.accounts.operatingProfitMicrocents - startingProfit,
      };
      if (canonical(this.state) !== liveBefore) {
        throw new Error('Live state changed while running isolated trial');
      }
      return { ok: true, report };
    } catch (error) {
      if (canonical(this.state) !== liveBefore) {
        throw new Error('Trial isolation invariant failed');
      }
      return {
        ok: false,
        diagnostic: trialDiagnostic(error instanceof Error ? error.message : 'Trial failed'),
      };
    }
  }
}
