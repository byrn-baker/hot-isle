# Simulation and Scenario Engine Contract

## Status and intent

This is the normative proposed contract for the planning phase. It defines observable behavior to implement after plan approval. It is not evidence that an implementation exists or passes.

## Public engine surface

```ts
type SimulationSpeed = 1 | 2 | 4;

type ScenarioCommand =
  | { type: 'ACCEPT_CONTRACT' }
  | { type: 'PLACE'; definitionId: string; position: GridPosition; orientation: Orientation }
  | { type: 'MOVE'; instanceId: string; position: GridPosition; orientation: Orientation }
  | { type: 'ROTATE'; instanceId: string; orientation: Orientation }
  | { type: 'REMOVE'; instanceId: string }
  | { type: 'UNDO' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SET_SPEED'; speed: SimulationSpeed }
  | { type: 'SET_WORKLOAD'; instanceId: string; fraction: number } // saved per-rack demand cap
  | { type: 'SET_COOLING'; instanceId: string; fraction: number }
  | { type: 'RESTART' };

interface ScenarioEngine {
  dispatch(command: ScenarioCommand): CommandResult;
  advanceTicks(count: number): AdvanceResult;
  createView(): Readonly<ScenarioView>;
  createSave(): TycoonSaveEnvelopeV1;
  runTrial(request: TrialRequest): TrialResult;
}
```

`dispatch` and `advanceTicks` are synchronous, deterministic, and atomic. Identical valid definition, initial state, and ordered commands/tick counts produce identical serialized authoritative state in the same supported runtime. They never access DOM, Three.js, storage, `Date.now`, `performance.now`, random values, or network APIs.

## Command preconditions and results

`CommandResult` is either `{ok: true, stateChanged: boolean, view}` or `{ok: false, code, messageKey, details, view}`. Failure codes include `NOT_PAUSED`, `NOT_RUNNING`, `OUT_OF_BOUNDS`, `FOOTPRINT_BLOCKED`, `SERVICE_ACCESS_BLOCKED`, `OCCUPIED`, `INSUFFICIENT_FUNDS`, `UNKNOWN_DEFINITION`, `UNKNOWN_INSTANCE`, `NOT_REMOVABLE`, and `NOTHING_TO_UNDO`. `PORT_BLOCKED` is a successful-layout warning/limit reason, not a command failure.

- Placement/move/rotate/remove/workload/cooling edits require paused planning mode.
- Placement validates the rotated footprint, in-bounds port locations, required service cells, funds, and model bounds before mutation. Footprints cannot occupy declared envelope-heat cells. A port may face an occupied/blocked cell: that is a valid but visibly impaired design, not a placement error. Required service cells may overlap other required service cells but never a footprint, wall, or permanent obstacle.
- Move and rotate do not purchase again. Until validation succeeds, the original instance remains present.
- Removal credits the instance's stored resale value once. Empty-floor right-click is filtered by the controller and dispatches no removal.
- Undo restores the exact preceding successful planning mutation and its exact accounts/ledger state. Resume clears undo.
- Pausing never resets air, equipment, time, contract, accrual remainder, or cash.
- Setting speed changes controller tick throughput only. It never changes `tickMs` or authoritative equations.
- Workload and cooling settings are finite fractions in `[0,1]`. A rack setting is a saved demand cap: effective requested workload is `min(workloadScheduleFraction, rackWorkloadCapFraction)`. A cooler setting of zero is off; a positive setting is the commanded fraction used by the power/flow rules below.

Successful footprint-changing edits rebuild the free-cell mask without advancing time. Temperatures of cells that remain free are bit-for-bit unchanged; newly occupied cells retain dormant shadow values; newly freed cells take the arithmetic mean of free orthogonal neighbors after the edit, falling back to the pre-edit free-cell mean. Face flows are zeroed and marked invalid until the next successful tick because their old topology is no longer meaningful. All other thermal state, recovery counters, contract history, and accounts remain unchanged. This remap is deterministic and excluded from tick energy audits; it must never reinitialize the room.

`createSave()` accepts only a committed paused state. The persistence/controller path first dispatches `PAUSE` when necessary, then serializes and stages the returned envelope. A storage failure leaves the game paused and the last good primary value intact. Loading an active saved run changes only `operating` to paused `planning`; offered and terminal meanings remain intact.

## Tick ordering

For one tick from committed state `S0`:

1. `advanceTicks` first validates `count` as a positive safe integer. Each requested single tick then requires operating, unpaused, active-contract state; a paused call returns zero advanced ticks without mutation.
2. Clone the fields that can change into candidate state `S1`; retain `S0` until all audits pass.
3. Select scheduled demand at `contractElapsedMs`, cap it by each saved rack setting, resolve port operability against the candidate layout, sample available intake/return temperatures from `S0.air`, update rack shutdown/recovery state, and derive requested power. Equipment without an operable link requests zero power and service for this tick.
4. Allocate the room power limit in integer milliwatts: cooler requests first (scaled together if needed), then one shared rack allocation fraction. Round each allocation down to a whole milliwatt so the sum cannot exceed the integer room limit; use stable ID order for serialization.
5. Derive rack and cooler paired forced airflow links from orientation, open ports, the updated control state, and allocated power.
6. Solve passive free-cell face flow and audit mass residual.
7. Calculate actual IT heat/output, cooler heat removal, exhaust/supply temperatures, and visible limiting reasons.
8. Apply passive face transfers, equipment link transfers, symmetric mixing, rack/envelope heat, and cooler removal to candidate sensible energies; convert to temperature and audit CFL, finiteness, and whole-room energy.
9. Quantize non-negative useful output down once to integer milli-service-units and integrate IT/cooling energy, delivered service, qualifying time, revenue, rent, maintenance, and exact integer remainders for the 100ms interval. Apply terminal settlement only on the tick reaching contract duration.
10. Advance integer simulated/contract time and resolve terminal state using the precedence defined under Power and economy.
11. If all invariants pass, commit `S1`. Otherwise retain `S0`, set a diagnostic in a separately safe failure transition, and pause.

The entire multi-tick call is defined as repeated atomic single ticks. If tick `n` fails, ticks `1..n-1` stay committed, failed tick `n` does not, remaining requested ticks are skipped, and `AdvanceResult` reports counts and diagnostic.

## Airflow solve

### Domain

Each free cell has volume `V = cellSizeM² × mixingHeightM`. Four-neighbor faces connect free cells. Room perimeter, blocked cells, and equipment footprints have zero normal flow. Equipment ports are adjacent free cells; forced links cross equipment internally rather than opening an air cell in its footprint.

Let each operable forced link carry positive `q` m³/s from intake/return cell `a` to exhaust/supply cell `b`. Define source vector `b` as positive volume injected into a cell: the link contributes `b_a -= q` and `b_b += q`, so its global sum is zero. A link is operable only when both rotated port cells are free and belong to the same free-air connected component. Otherwise it contributes no source, power, heat, or service that tick and reports the applicable blockage/insufficient-flow reasons. An active connected component must have source sum within `1×10⁻¹²` m³/s of zero.

For passive face `(i,j)`, define flow from `i` to `j`:

`q_ij = G × (p_i - p_j)`

where `G` is declarative face conductance in m³/(s·Pa). With passive outflow `Σ_j q_ij`, solve the graph Laplacian equation `L p = b`, i.e. `Σ_j q_ij = b_i`; positive exhaust/supply injection flows away and negative intake/return injection draws passive inflow. Audit residual as `r_i = b_i - Σ_j q_ij`. Pressure has arbitrary offset; anchor the lowest row-major cell in each component to zero. Assemble neighbors in north/east/south/west order and solve components/cells in ascending index with deterministic PCG, maximum 500 iterations.

Success requires all finite pressures/flows and `maxCellAbsResidual ≤ 1×10⁻⁸ m³/s`. A disconnected component with nonzero forced source sum, a singular/invalid matrix, or nonconvergence is `FLOW_SOLVE_FAILED` and rejects the tick.

This pressure potential is a tractable mixing-flow approximation, not a Navier–Stokes pressure field and not validated CFD.

### Orientation, blockage, and forced flow

Offsets in definitions rotate clockwise with equipment orientation. Every intake/exhaust/supply/return port location must be in bounds, but the adjacent cell may later be blocked by a wall, permanent obstacle, or equipment footprint. Obstruction eliminates a cell/face; there is no flow through it. This deliberate distinction makes a blocked intake/exhaust a valid, diagnosable poor layout while keeping footprint overlap and blocked service access invalid.

Rack forced flow:

`qRack = ratedFanFlowM3s × rackPowerAllocationFraction × min(intakeOpen, exhaustOpen)`

`intakeOpen`/`exhaustOpen` are exactly 0 or 1 in this slice. The rack allocation fraction is allocated/requested power for an operable, non-shutdown rack. Cooler flow is `ratedAirflowM3s × commandedCoolingFraction × coolerPowerAllocationFraction`. A blocked or cross-component pair has fraction zero. A zero-flow rack delivers no service; a blocked rack is de-energized for the tick, reports `INTAKE_BLOCKED` and/or `EXHAUST_BLOCKED`, and also reports `INSUFFICIENT_FLOW`. There is no hidden distance or aisle score.

## Thermal transport

Let `C = ρ cp V` J/K for a free cell and `E_i = C T_i` J relative to 0°C. For each directed flow edge `i→j` (passive edge direction follows the sign of `q`; equipment link has declared direction), transfer a volume `q dt` using donor temperature from `S0`:

`ΔE_i = -ρ cp q dt T_i`

`ΔE_j = +ρ cp q dt T_i`

All edge deltas accumulate before applying them. For every free face, symmetric mixing adds `ΔE_i = ρ cp kMix dt (T_j - T_i)` and `ΔE_j = -ΔE_i`, where `kMix` is `mixingConductanceM3s`. Validation requires `kMix × dt / V ≤ 0.5`, preventing the equal-volume pair from crossing past equilibrium in one tick. A zero conductance disables this term; it never alters total room energy.

Rack heat added at its exhaust cell is:

`QrackJ = actualItPowerW × dtS`

Its reported exhaust stream temperature before mixing is:

`Texhaust = Tintake + actualItPowerW / (ρ cp qRack)`

when `qRack > 0`. At zero flow it is unavailable. The blocked/cross-component policy above de-energizes the rack, so it contributes neither unplaceable heat nor service while still exposing its requested workload and impairment.

Cooler requested removal:

`requestedW = ρ cp qCooler × max(Treturn - targetSupplyC, 0)`

`removedW = min(requestedW, ratedHeatRemovalW × commandedCoolingFraction × coolerPowerAllocationFraction)`

`Tsupply = Treturn - removedW / (ρ cp qCooler)` for positive flow. Removed joules are subtracted from the cooler link's destination energy. `removedW < requestedW` sets `COOLER_CAPACITY`. Cooler electrical energy is accounted independently and, by declared first-slice simplification, is not deposited in room air.

Envelope heat is the exact per-cell declared watts times `dtS`.

### Stability and audit

For every donor cell:

`outgoingFraction = dtS × sum(outgoing q) / V ≤ 0.45`.

All candidate temperatures, heat rates, and energies must be finite. The definition declares `minTemperatureC` and `maxTemperatureC` (review baseline −50°C and 150°C); runtime rejects rather than clamps a candidate outside that inclusive game-safety range.

Let external net heat be rack plus envelope minus cooler joules. Require:

`abs((sum Eafter - sum Ebefore) - externalNetJ) ≤ max(0.01 J, 1e-9 × max(abs(sum Ebefore), abs(sum Eafter)))`.

The audit is performed on unrounded numbers. Display rounding never feeds back into state.

## Rack thermal/performance controls

The controller samples local front-port temperature and actual rack flow. Every threshold below comes from the rack definition; the numbers shown are the Balanced-rack review baseline, not a universal hard-coded policy:

- full thermal factor 1 through 27°C;
- linearly descend to factor 0.5 immediately below 35°C;
- enter `thermal-shutdown` at 35°C or above;
- while shut down, reset recovery counter whenever intake exceeds 30°C; accumulate it only at/below 30°C; restart after 30,000ms.

Unquantized output while running is:

`nameplate × requestedWorkload × rackPowerFraction × thermalFactor`.

For accounting and reliability, non-negative output is rounded down once to integer milli-service-units; views may show that authoritative value divided by 1,000. No output is credited while idle, no-flow, or shut down. Active reasons are ordered: shutdown, hot intake, blocked/insufficient flow, power limit, no workload. The exact thresholds are scenario data and remain pending calibration.

## Power and economy contract

Definition watts are converted exactly to non-negative integer milliwatts during validation. Total allocated cooler plus rack power must be ≤ the integer room limit. An operable cooler at command fraction `c > 0` requests `floor(1_000 × (idlePowerW + c × (ratedPowerW - idlePowerW)))` milliwatts; at `c = 0` it requests zero. Cooler requests are allocated first; if their sum exceeds the limit, all coolers receive one common allocation fraction. An operable, non-shutdown rack requests `floor(1_000 × (idlePowerW + effectiveWorkload × (maxPowerW - idlePowerW)))` and racks share remaining power with one common fraction. Every per-device allocation is rounded down to milliwatts, actual watts are `mW / 1,000`, and heat uses that same value. The UI exposes command/workload, request, allocation, and reason.

For each tick, integrate from authoritative integer milliwatts and milli-service-units:

- IT/cooling cost numerator as `powerMilliW × tickMs × electricityRateMicrocentsPerWh`, divided by `3_600_000_000`;
- delivered milli-service-unit-milliseconds as `outputMilliServiceUnits × tickMs`;
- qualifying milliseconds only if aggregate milli-service-units ≥ `requiredServiceUnits × 1,000`;
- revenue numerator as `deliveredMilliServiceUnitMs × revenueRateMicrocentsPerServiceUnitSecond`, divided by `1_000_000`;
- rent and per-device maintenance numerator as `rateMicrocentsPerS × tickMs`, divided by `1,000`.

Each category carries the non-negative division remainder to the next tick; definitions are rejected if any per-tick numerator or accumulated integer could exceed `Number.MAX_SAFE_INTEGER`. Ledger entries and cash are integer microcents. These formulas, rather than floating-point dollar rounding, define cent-reconcilable behavior.

Rent accrues on every active-contract tick. Maintenance accrues for every owned equipment instance on every active-contract tick, including off, blocked, throttled, or shutdown equipment; electricity accrues only from allocated milliwatts. Gross revenue credits every delivered milli-service-unit-millisecond at the declared rate. At completion, `missingMilliServiceUnitMs = max(0, requiredServiceUnits × 1_000 × durationMs - deliveredMilliServiceUnitMs)`; the settlement debit magnitude is the integer quotient of `missing × shortfallRate / 1_000_000`, capped at gross revenue as declared. Any sub-microcent terminal remainder is discarded and reported only as a rounding remainder, never as a ledger entry.

Operating profit excludes capital purchase/resale. Cash includes all signed ledger categories. Account totals must reconcile with ledger and starting cash exactly in integer microcents. Resale is `floor(acquisitionPriceMicrocents × resaleBasisPoints / 10_000)`. A buy/remove cycle without undo loses `purchase - resale ≥ 0`; undo restores both values exactly.

At the final contract tick, calculate missing required service against the integral target, post the declared settlement debit (capped as specified), and then determine the result. Terminal precedence is: numerical failure (the tick is not committed); otherwise bankruptcy if committed cash is below the threshold; otherwise contract `succeeded` when reliability meets its target; otherwise `failed` with `RELIABILITY_SHORTFALL`. Before the final tick, bankruptcy ends the run immediately. The result view retains delivered service, reliability, settlement, cost categories, operating profit, cash, and the single primary cause.

## Trial contract

`runTrial` receives a named initial snapshot/layout, workload, and a positive duration divisible by `tickMs`. It deep-clones all inputs, runs exactly `duration/tickMs` ticks through the same simulation and economy reducers with `commitToLive=false`, and returns either a report or diagnostic. The clone owns projected accounts/ledger/contract progress solely to compute a comparable net operating profit. Before returning, the engine verifies the live state's canonical serialization is unchanged. The report is labeled `NON-ECONOMIC TRIAL` and every monetary value is labeled `projected`; it never writes live state or storage.

Matched-layout comparisons must use identical definition revision, equipment inventory, initial temperatures, workload, contract/tariffs, tick count, and solver parameters. Only placement/orientation may differ. No `layoutQuality`, aisle bonus, or fixture identity is available to solver/economy code.

## View and diagnostics

`ScenarioView` includes:

- room cells, equipment placement/orientation, port/access cells, and valid-preview/reason;
- simulation/contract times, pause/speed/mode;
- per-cell temperature and face-flow magnitude/direction;
- per-equipment intake/return, exhaust/supply, flow, workload, output, requested/allocated/actual power, heat, thermal state, and all reason codes;
- cooler rated vs actual removal and airflow;
- budget, cash, revenue, categorized costs, operating profit, reliability, contract result;
- numerical iteration/residual status and any failure diagnostic;
- text/unit labels needed independently of color.

Diagnostic codes are stable and testable: `FLOW_SOLVE_FAILED`, `FLOW_RESIDUAL_EXCEEDED`, `CFL_EXCEEDED`, `ENERGY_RESIDUAL_EXCEEDED`, `NON_FINITE_STATE`, `INVALID_DEFINITION`, and `INVALID_SAVE`. Each carries simulated tick, relevant measured residual/bound, and a user-facing message key. Diagnostics must not include claims of real-facility risk.

## Required contract fixtures

Future tests must define, without fabricating results in advance:

1. single rack energy/flow balance;
2. cooler below and above removal capacity;
3. obstacle/orientation flow change plus valid blocked intake/exhaust;
4. upstream idle vs loaded downstream heating;
5. rotated/separated exhaust comparison;
6. cooler command, power-overload allocation, fixed-point accrual, and explanation;
7. thermal throttle/shutdown/recovery boundaries;
8. repeated deterministic run and 1×/accelerated equal-tick run;
9. good vs poor matched layout for SC-002;
10. affordable complete contract, adverse layout, and terminal precedence for SC-004;
11. paused move/rotate/remove topology remap without room-state reset;
12. numerical failure atomicity;
13. save/reload continuation at the next tick.
