import { describe, expect, it } from 'vitest';
import {
  createInitialScenarioState,
  loadScenarioDefinition,
} from '../../../src/tycoon/data/loadScenarioDefinition';
import { applyEconomyTick } from '../../../src/tycoon/economy/EconomySystem';
import type {
  CoolerDefinition,
  CoolerInstance,
  RackDefinition,
  RackInstance,
  ScenarioState,
} from '../../../src/tycoon/model/types';

function operatingState(): { definition: ReturnType<typeof loadScenarioDefinition>; state: ScenarioState } {
  const definition = loadScenarioDefinition();
  definition.contract.durationMs = 200;
  definition.contract.requiredServiceUnits = 20;
  definition.workload = [{ startMs: 0, endMs: 200, demandFraction: 1 }];
  const rackDefinition = definition.equipment.find(
    (item): item is RackDefinition => item.id === 'rack-economy',
  )!;
  const coolerDefinition = definition.equipment.find(
    (item): item is CoolerDefinition => item.kind === 'cooler',
  )!;
  const rack: RackInstance = {
    kind: 'rack', id: 'rack-1', definitionId: rackDefinition.id,
    position: { x: 3, y: 3 }, orientation: 'north',
    acquisitionPriceMicrocents: 0, resaleValueMicrocents: 0,
    workloadCapFraction: 1, effectiveRequestedWorkloadFraction: 1,
    requestedPowerMilliW: 4_000_000, allocatedPowerMilliW: 4_000_000,
    actualFlowM3s: 0.8, operatingState: 'running', limitReasons: [],
    intakeTemperatureC: 21, exhaustTemperatureC: 25, thermalFactor: 1,
    usefulOutputMilliServiceUnits: 10_000, recoveryCoolMs: 0,
  };
  const cooler: CoolerInstance = {
    kind: 'cooler', id: 'cooler-1', definitionId: coolerDefinition.id,
    position: { x: 1, y: 1 }, orientation: 'north',
    acquisitionPriceMicrocents: 0, resaleValueMicrocents: 0,
    workloadCapFraction: 1, effectiveRequestedWorkloadFraction: 0,
    requestedPowerMilliW: 15_000_000, allocatedPowerMilliW: 15_000_000,
    actualFlowM3s: 10, operatingState: 'running', limitReasons: [],
    commandedCoolingFraction: 1, returnTemperatureC: 25, supplyTemperatureC: 18,
    heatRemovedW: 80_000, capacityLimited: false,
  };
  const state = createInitialScenarioState(definition);
  state.mode = 'operating';
  state.paused = false;
  state.contractProgress.status = 'active';
  state.equipment = [cooler, rack];
  return { definition, state };
}

function ledgerTotal(state: ScenarioState, category: ScenarioState['ledger'][number]['category']): number {
  return state.ledger
    .filter((entry) => entry.category === category)
    .reduce((sum, entry) => sum + entry.amountMicrocents, 0);
}

describe('fixed-point economy', () => {
  it('credits delivered service and can finish a genuinely profitable reliable operation', () => {
    const { definition, state } = operatingState();
    definition.contract.requiredServiceUnits = 10;
    state.equipment = state.equipment.filter((item) => item.kind === 'rack');
    let candidate = state;
    for (let tick = 0; tick < 2; tick += 1) {
      const result = applyEconomyTick(definition, candidate);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      candidate = result.state;
    }
    expect(candidate).toMatchObject({
      mode: 'completed',
      paused: true,
      contractProgress: {
        status: 'succeeded',
        qualifyingMs: 200,
        settlementMicrocents: 0,
        failureReason: null,
      },
    });
    expect(candidate.accounts.operatingProfitMicrocents).toBeGreaterThan(0);
    expect(candidate.accounts.cashMicrocents).toBeGreaterThan(
      definition.economy.startingCashMicrocents,
    );
  });

  it('carries integer remainders and reconciles every operating category and cash exactly', () => {
    const { definition, state } = operatingState();
    const first = applyEconomyTick(definition, structuredClone(state));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyEconomyTick(definition, first.state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const result = second.state;

    expect(result.contractProgress.deliveredMilliServiceUnitMs).toBe(2_000_000);
    expect(result.accounts).toMatchObject({
      operatingRevenueMicrocents: 10_000_000,
      settlementMicrocents: -10_000_000,
      itElectricityCostMicrocents: 3_333,
      coolingElectricityCostMicrocents: 12_500,
      rentCostMicrocents: 3_333_333,
      maintenanceCostMicrocents: 1_200_000,
    });
    expect(result.accrualRemainders).toEqual({
      revenue: 0,
      itElectricity: 1_200_000_000,
      coolingElectricity: 0,
      rent: 400,
      maintenance: 0,
    });
    expect(result.contractProgress).toMatchObject({
      status: 'failed',
      settlementMicrocents: -10_000_000,
      failureReason: 'RELIABILITY_SHORTFALL',
    });

    expect(ledgerTotal(result, 'REVENUE')).toBe(result.accounts.operatingRevenueMicrocents);
    expect(ledgerTotal(result, 'SETTLEMENT')).toBe(result.accounts.settlementMicrocents);
    expect(ledgerTotal(result, 'IT_ELECTRICITY')).toBe(-result.accounts.itElectricityCostMicrocents);
    expect(ledgerTotal(result, 'COOLING_ELECTRICITY')).toBe(-result.accounts.coolingElectricityCostMicrocents);
    expect(ledgerTotal(result, 'RENT')).toBe(-result.accounts.rentCostMicrocents);
    expect(ledgerTotal(result, 'MAINTENANCE')).toBe(-result.accounts.maintenanceCostMicrocents);

    const expectedProfit = result.accounts.operatingRevenueMicrocents
      + result.accounts.settlementMicrocents
      - result.accounts.itElectricityCostMicrocents
      - result.accounts.coolingElectricityCostMicrocents
      - result.accounts.rentCostMicrocents
      - result.accounts.maintenanceCostMicrocents;
    expect(result.accounts.operatingProfitMicrocents).toBe(expectedProfit);
    expect(result.accounts.cashMicrocents).toBe(
      definition.economy.startingCashMicrocents + expectedProfit,
    );
  });

  it('settles before applying final-tick bankruptcy precedence', () => {
    const { definition, state } = operatingState();
    definition.contract.durationMs = 100;
    definition.workload = [{ startMs: 0, endMs: 100, demandFraction: 1 }];
    state.accounts.cashMicrocents = 1;
    definition.economy.bankruptcyThresholdMicrocents = 0;
    const result = applyEconomyTick(definition, state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.contractProgress.settlementMicrocents).toBeLessThan(0);
    expect(result.state.contractProgress.failureReason).toBe('BANKRUPTCY');
    expect(result.state.mode).toBe('failed');
  });
});
