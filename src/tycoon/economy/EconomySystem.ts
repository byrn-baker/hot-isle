import type {
  AccrualRemainders,
  AccountsState,
  EquipmentDefinition,
  LedgerCategory,
  ScenarioDefinition,
  ScenarioState,
} from '../model/types';

const ELECTRICITY_DIVISOR = 3_600_000_000;
const RATE_PER_SECOND_DIVISOR = 1_000;
const SERVICE_DIVISOR = 1_000_000;

export type EconomyTickResult =
  | { ok: true; state: ScenarioState }
  | { ok: false; reason: string };

function definitionFor(
  definitions: readonly EquipmentDefinition[],
  definitionId: string,
): EquipmentDefinition {
  const result = definitions.find((candidate) => candidate.id === definitionId);
  if (!result) throw new Error(`Unknown equipment definition: ${definitionId}`);
  return result;
}

function divideWithRemainder(
  numerator: number,
  previousRemainder: number,
  divisor: number,
): { amount: number; remainder: number } {
  const total = numerator + previousRemainder;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('Economy accrual exceeded safe integer range');
  }
  return { amount: Math.floor(total / divisor), remainder: total % divisor };
}

function appendLedger(
  state: ScenarioState,
  category: LedgerCategory,
  amountMicrocents: number,
  descriptionCode: string,
  contractId: string,
): void {
  if (amountMicrocents === 0) return;
  state.ledger.push({
    id: `ledger-${state.nextLedgerOrdinal}`,
    simulatedTimeMs: state.simulatedTimeMs,
    category,
    amountMicrocents,
    descriptionCode,
    contractId,
  });
  state.nextLedgerOrdinal += 1;
}

function applyAccountDeltas(
  accounts: AccountsState,
  revenue: number,
  settlement: number,
  itCost: number,
  coolingCost: number,
  rent: number,
  maintenance: number,
): void {
  accounts.operatingRevenueMicrocents += revenue;
  accounts.settlementMicrocents += settlement;
  accounts.itElectricityCostMicrocents += itCost;
  accounts.coolingElectricityCostMicrocents += coolingCost;
  accounts.rentCostMicrocents += rent;
  accounts.maintenanceCostMicrocents += maintenance;
  accounts.operatingProfitMicrocents = accounts.operatingRevenueMicrocents
    + accounts.settlementMicrocents
    - accounts.itElectricityCostMicrocents
    - accounts.coolingElectricityCostMicrocents
    - accounts.rentCostMicrocents
    - accounts.maintenanceCostMicrocents;
  accounts.cashMicrocents += revenue + settlement - itCost - coolingCost - rent - maintenance;
}

function allSafeIntegers(value: object): boolean {
  return Object.values(value).every(
    (item) => typeof item !== 'number' || Number.isSafeInteger(item),
  );
}

/** Integrates one already simulated spatial tick into the authoritative fixed-point ledger. */
export function applyEconomyTick(
  definition: ScenarioDefinition,
  candidate: ScenarioState,
): EconomyTickResult {
  try {
    const tickMs = definition.model.tickMs;
    const rackPowerMilliW = candidate.equipment
      .filter((item) => item.kind === 'rack')
      .reduce((sum, item) => sum + item.allocatedPowerMilliW, 0);
    const coolingPowerMilliW = candidate.equipment
      .filter((item) => item.kind === 'cooler')
      .reduce((sum, item) => sum + item.allocatedPowerMilliW, 0);
    const outputMilliServiceUnits = candidate.equipment
      .filter((item) => item.kind === 'rack')
      .reduce((sum, item) => sum + item.usefulOutputMilliServiceUnits, 0);
    const deliveredThisTick = outputMilliServiceUnits * tickMs;
    const maintenanceRate = candidate.equipment.reduce(
      (sum, item) => sum + definitionFor(definition.equipment, item.definitionId)
        .maintenanceRateMicrocentsPerS,
      0,
    );
    const rate = definition.economy.electricityRateMicrocentsPerWh;
    const nextRemainders: AccrualRemainders = { ...candidate.accrualRemainders };
    const revenue = divideWithRemainder(
      deliveredThisTick * definition.contract.revenueRateMicrocentsPerServiceUnitSecond,
      nextRemainders.revenue,
      SERVICE_DIVISOR,
    );
    const it = divideWithRemainder(
      rackPowerMilliW * tickMs * rate,
      nextRemainders.itElectricity,
      ELECTRICITY_DIVISOR,
    );
    const cooling = divideWithRemainder(
      coolingPowerMilliW * tickMs * rate,
      nextRemainders.coolingElectricity,
      ELECTRICITY_DIVISOR,
    );
    const rent = divideWithRemainder(
      definition.economy.rentRateMicrocentsPerS * tickMs,
      nextRemainders.rent,
      RATE_PER_SECOND_DIVISOR,
    );
    const maintenance = divideWithRemainder(
      maintenanceRate * tickMs,
      nextRemainders.maintenance,
      RATE_PER_SECOND_DIVISOR,
    );
    nextRemainders.revenue = revenue.remainder;
    nextRemainders.itElectricity = it.remainder;
    nextRemainders.coolingElectricity = cooling.remainder;
    nextRemainders.rent = rent.remainder;
    nextRemainders.maintenance = maintenance.remainder;

    candidate.contractProgress.elapsedMs += tickMs;
    candidate.contractElapsedMs += tickMs;
    candidate.simulatedTimeMs += tickMs;
    candidate.contractProgress.deliveredMilliServiceUnitMs += deliveredThisTick;
    candidate.contractProgress.grossRevenueMicrocents += revenue.amount;
    if (outputMilliServiceUnits >= definition.contract.requiredServiceUnits * 1_000) {
      candidate.contractProgress.qualifyingMs += tickMs;
    }
    candidate.accrualRemainders = nextRemainders;

    appendLedger(candidate, 'REVENUE', revenue.amount, 'DELIVERED_SERVICE_REVENUE', definition.contract.id);
    appendLedger(candidate, 'IT_ELECTRICITY', -it.amount, 'IT_ELECTRICITY_COST', definition.contract.id);
    appendLedger(candidate, 'COOLING_ELECTRICITY', -cooling.amount, 'COOLING_ELECTRICITY_COST', definition.contract.id);
    appendLedger(candidate, 'RENT', -rent.amount, 'ROOM_RENT_COST', definition.contract.id);
    appendLedger(candidate, 'MAINTENANCE', -maintenance.amount, 'EQUIPMENT_MAINTENANCE_COST', definition.contract.id);
    applyAccountDeltas(
      candidate.accounts,
      revenue.amount,
      0,
      it.amount,
      cooling.amount,
      rent.amount,
      maintenance.amount,
    );

    const finalTick = candidate.contractProgress.elapsedMs >= definition.contract.durationMs;
    if (finalTick) {
      const required = definition.contract.requiredServiceUnits * 1_000
        * definition.contract.durationMs;
      const missing = Math.max(
        0,
        required - candidate.contractProgress.deliveredMilliServiceUnitMs,
      );
      const uncappedDebit = Math.floor(
        missing * definition.contract.shortfallPolicy.rateMicrocentsPerServiceUnitSecond
          / SERVICE_DIVISOR,
      );
      const debit = Math.min(uncappedDebit, candidate.contractProgress.grossRevenueMicrocents);
      const settlement = debit === 0 ? 0 : -debit;
      candidate.contractProgress.settlementMicrocents = settlement;
      appendLedger(candidate, 'SETTLEMENT', settlement, 'CONTRACT_SHORTFALL_SETTLEMENT', definition.contract.id);
      applyAccountDeltas(candidate.accounts, 0, settlement, 0, 0, 0, 0);
    }

    if (!allSafeIntegers(candidate.accounts)
        || !allSafeIntegers(candidate.contractProgress)
        || !allSafeIntegers(candidate.accrualRemainders)) {
      return { ok: false, reason: 'Economy result exceeded safe integer range' };
    }

    if (candidate.accounts.cashMicrocents < definition.economy.bankruptcyThresholdMicrocents) {
      candidate.mode = 'failed';
      candidate.paused = true;
      candidate.contractProgress.status = 'failed';
      candidate.contractProgress.failureReason = 'BANKRUPTCY';
    } else if (finalTick) {
      const reliability = Math.floor(
        candidate.contractProgress.qualifyingMs * 10_000
          / Math.max(candidate.contractProgress.elapsedMs, 1),
      );
      const succeeded = reliability >= definition.contract.reliabilityTargetBasisPoints;
      candidate.mode = succeeded ? 'completed' : 'failed';
      candidate.paused = true;
      candidate.contractProgress.status = succeeded ? 'succeeded' : 'failed';
      candidate.contractProgress.failureReason = succeeded ? null : 'RELIABILITY_SHORTFALL';
    }
    return { ok: true, state: candidate };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Economy tick failed' };
  }
}
