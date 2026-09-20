# Phase 1 Data Model: Datacenter Engineering Tycoon

## Conventions

- IDs are non-empty stable strings unique within their entity collection. Runtime iteration sorts by ID or cell index before any result-sensitive operation.
- Grid coordinates are integer `{x, y}` floor-cell indices. Orientation is `north | east | south | west`; north maps to `(0, -1)`. Rack intake is the adjacent cell in the orientation direction; exhaust is opposite. A cooler definition declares its supply/return offsets and rotates them the same way.
- SI units are encoded in field names: metres (`M`), seconds (`S`/`Ms`), cubic metres per second (`M3s`), watts (`W`), integer milliwatts (`MilliW`), joules (`J`), watt-hours (`Wh`), and degrees Celsius (`C`). Capacity definitions use fictional `serviceUnits`; authoritative delivered output uses integer `milliServiceUnits` (1,000 per service unit).
- Money is integer `microcents`, where 1 displayed cent = 1,000,000 microcents. Do not serialize `NaN`, infinities, `Map`, `Set`, class instances, functions, DOM nodes, or Three.js objects.
- JSON numbers holding integer counts/money/times must be safe integers. Definition power values must convert to an exact safe integer number of milliwatts. Rate definitions must pass the simulation contract's maximum per-tick numerator and accumulated-value safe-integer checks. Every number must be finite.

## Declarative definitions

Definitions are shipped with the static application and validated before a new scenario or saved state can load.

### `ScenarioDefinition`

| Field | Type | Rules |
|---|---|---|
| `id`, `revision` | string | Save binds to both; revision changes when semantic data changes. |
| `room` | `RoomDefinition` | One bounded rectangular room. |
| `model` | `ModelParameters` | Numerical/air constants and explicit limits. |
| `equipment` | `EquipmentDefinition[]` | Exactly three rack definitions and one cooler definition for this slice. |
| `initialEquipment` | `InitialPlacement[]` | Empty in the playable reference start so purchases are explicit; fixtures may declare owned opening inventory with matching opening ledger entries. |
| `economy` | `EconomyDefinition` | Startup cash, tariffs, rent, and policy. |
| `contract` | `ContractDefinition` | One visible customer contract. |
| `workload` | `WorkloadSegment[]` | Ordered, non-overlapping schedule covering the contract period. |
| `trialFixtures` | `TrialDefinition[]` | Named good/poor/transport fixtures; never a gameplay bonus input. |
| `disclaimer` | string | Must state approximate game model/not facility advice. |

### `RoomDefinition`

| Field | Type | Rules |
|---|---|---|
| `widthCells`, `heightCells` | positive integer | Cell count; reference scenario must support up to 24 valid racks. |
| `cellSizeM` | `1` | Fixed for the first slice. |
| `mixingHeightM` | positive number | Proposed value 3; treated as game-model volume. |
| `blockedCells` | `GridPosition[]` | Walls/columns/permanent obstacles; unique and in bounds. |
| `requiredAccessCells` | `GridPosition[]` | Cannot be occupied. |
| `powerLimitW` | positive number | Applies to combined actual equipment demand. |
| `initialTemperatureC` | finite number | Initializes every free air cell. |
| `envelopeHeatWByCell` | `{position, heatW}[]` | Non-negative explicit heat sources on cells that placement is forbidden to occupy. |

### `ModelParameters`

| Field | Proposed value | Validation/purpose |
|---|---:|---|
| `tickMs` | 100 | Positive integer and fixed for all speeds. |
| `airDensityKgM3` | declarative | Positive finite; fictional model constant. |
| `airSpecificHeatJKgK` | declarative | Positive finite; fictional model constant. |
| `faceConductanceM3sPa` | declarative | Positive finite passive-flow coefficient. |
| `mixingConductanceM3s` | declarative | Non-negative, symmetric thermal mixing. |
| `minTemperatureC`, `maxTemperatureC` | `-50`, `150` | Finite ordered inclusive runtime guard; fictional safety range, not facility limits. |
| `maxOutgoingVolumeFraction` | 0.45 | `(0, 0.5]`; runtime CFL audit. |
| `flowResidualToleranceM3s` | `1e-8` | Positive; maximum absolute cell imbalance. |
| `flowMaxIterations` | 500 | Positive integer PCG cap. |
| `energyAbsoluteToleranceJ` | 0.01 | Positive. |
| `energyRelativeTolerance` | `1e-9` | Positive. |

These are numerical design values, not benchmark results. Scenario validation rejects provable flow/CFL or mixing bounds, including `mixingConductanceM3s × tickS / cellVolumeM3 > 0.5`. At runtime a forced link is operable only when both port cells are free and in the same free-air component; a blocked or separated link is valid layout state but contributes zero flow and exposes impairment reasons.

The provisional reference definition sets density to 1.2kg/m³, specific heat to 1,005J/(kg·K), face conductance to 0.15m³/(s·Pa), and mixing conductance to 0.03m³/s. They are fictional game-model inputs and must not be described as measurements of a real room.

### `RackDefinition`

| Field | Type |
|---|---|
| `kind` | `'rack'` |
| `id`, `displayName` | string |
| `footprint` | `{widthCells, depthCells}` positive integers |
| `intakeOffset`, `exhaustOffset`, `serviceOffsets[]` | positions relative to north orientation |
| `purchasePriceMicrocents`, `resaleBasisPoints`, `maintenanceRateMicrocentsPerS` | safe non-negative integers; resale basis points ≤10,000 and proposed as 6,000 |
| `nameplateServiceUnits`, `idlePowerW`, `maxPowerW`, `ratedFanFlowM3s` | positive finite values; max ≥ idle; powers exactly representable as integer milliwatts |
| `thermalControl` | `ThermalControlDefinition` |

Three definitions must differ in purchase price, nameplate capacity, electrical demand, fan flow, and at least one thermal-control value.

Port offsets and service offsets are distinct in the first-slice definitions. Rotated footprint cells must be in bounds and cannot overlap any footprint, permanent blocked cell, envelope-heat source cell, or room required-access cell. Rotated port locations must be in bounds but may face a non-free cell; that yields a blocked, zero-flow device rather than rejection. Rotated equipment service cells must be in bounds and free of footprints/permanent blocks; service cells may overlap other service cells so a shared aisle remains legal. Any later placement that would occupy an existing required service cell is rejected atomically.

Provisional definition values for plan review:

| Definition | Purchase | Capacity | Idle/max power | Fan flow | Full output through | Shutdown | Recover | Maintenance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Economy | $8,000 | 10 units | 1/4kW | 0.8m³/s | 26°C | 36°C | ≤30°C for 30s | $0.60/min |
| Balanced | $12,000 | 16 units | 1.5/6kW | 1.1m³/s | 27°C | 35°C | ≤30°C for 30s | $0.90/min |
| Dense | $18,000 | 26 units | 2/10kW | 1.3m³/s | 25°C | 33°C | ≤28°C for 30s | $1.50/min |

All three use the proposed minimum pre-shutdown throttle factor 0.5 and 60% resale. These values are calibration inputs, not demonstrated balance.

### `ThermalControlDefinition`

`fullOutputThroughC`, `shutdownAtC`, `recoverAtOrBelowC`, `recoverHoldMs`, and `minimumThrottleFactor`. Required order: `recoverAtOrBelowC < shutdownAtC`, `fullOutputThroughC < shutdownAtC`, hold is a non-negative integer, throttle factor is `[0,1]`. The Balanced-rack example is 27°C, 35°C, 30°C, 30,000ms, and 0.5 respectively; Economy and Dense use the distinct values in the table. Calibration is pending.

### `CoolerDefinition`

Includes common identity/footprint/purchase/resale/maintenance fields plus `kind: 'cooler'`, `returnOffset`, `supplyOffset`, `serviceOffsets`, `ratedAirflowM3s`, `ratedHeatRemovalW`, `targetSupplyC`, `idlePowerW`, and `ratedPowerW`. An instance stores `commandedCoolingFraction`. At zero it requests no power; above zero its request, airflow, and removal-cap scaling follow the exact formulas in [contracts/simulation.md](./contracts/simulation.md). Target supply is a lower target, not an unlimited temperature assignment.

The provisional cooler costs $25,000, resells for 60%, moves 10m³/s at rating, removes at most 80kW sensible heat, targets 18°C supply, requests 3/15kW idle/rated electrical power, and costs $3/min maintenance. No performance result is inferred from these inputs.

### `EconomyDefinition`

| Field | Meaning |
|---|---|
| `startingCashMicrocents` | Finite startup budget. |
| `electricityRateMicrocentsPerWh` | One tariff applied separately to measured IT and cooling energy. |
| `rentRateMicrocentsPerS` | Operating-time rent. |
| `powerAllocationPolicy` | Literal `'cooling-first-proportional-racks'`. |
| `bankruptcyThresholdMicrocents` | Proposed `0`; scenario ends when committed cash is below it. |

Provisional scenario values are $150,000 starting cash, a 120kW room limit, $0.15/kWh electricity, and $10/min operating-time rent. Source data stores their exact integer-microcent equivalents rather than parsing display strings.

### `ContractDefinition`

Contains `id`, `displayName`, `requiredServiceUnits`, `durationMs`, `reliabilityTargetBasisPoints`, `revenueRateMicrocentsPerServiceUnitSecond`, and a declared `shortfallPolicy`. The provisional first-slice contract runs 600,000ms, requires 100 service units at 9,500 basis points reliability, and pays $0.05 per delivered service-unit-second. Its final debit is $0.05 per missing required service-unit-second, capped at gross earned revenue. Terms are visible before acceptance and remain pending balance calibration.

### `WorkloadSegment`

Contains `[startMs, endMs)`, a default demand fraction `[0,1]`, and optional per-definition/per-instance overrides. Segments cover contract time without gaps or overlaps; boundary selection uses integer milliseconds. Effective requested workload is `min(segmentDemandFraction, instance.workloadCapFraction)`, so player throttling can reduce but not manufacture contract demand.

## Runtime state

### `ScenarioState`

| Field | Type/meaning |
|---|---|
| `scenarioId`, `scenarioRevision` | Definition binding. |
| `runId` | Stable ID for the current operation attempt. |
| `mode` | `offered | planning | operating | completed | failed`; an active operating save reloads as `planning` with `paused=true`, while offered/terminal meaning is retained. |
| `paused` | Boolean authoritative time gate. |
| `selectedSpeed` | `1 | 2 | 4`; saved preference, never changes tick size. |
| `simulatedTimeMs` | Non-negative multiple of `tickMs`. |
| `contractElapsedMs` | Non-negative multiple of tick; ≤ duration. |
| `air` | `AirState`, including full-grid temperatures and current free-cell topology. |
| `equipment` | `EquipmentInstance[]`, sorted by ID in serialized canonical form. |
| `contractProgress` | `ContractProgress`. |
| `accounts` | `AccountsState`. |
| `ledger` | `LedgerEntry[]`. |
| `accrualRemainders` | Exact integer division remainders by category. |
| `undo` | Planning `UndoRecord[]`; cleared on resume. |
| `nextInstanceOrdinal`, `nextLedgerOrdinal` | Monotonic safe integers; no wall-clock/random IDs. |
| `lastDiagnostic` | `null | SimulationDiagnostic`; user-visible on failure. |

Renderer camera, current pointer coordinates, hover animations, frame accumulator, and DOM focus are ephemeral and not part of authoritative save state. The logical selected equipment, cursor cell, active overlay, and first-visit-help completion may be stored as UI preferences outside the simulation payload if desired, but cannot affect outcomes.

### `AirState`

Canonical row-major arrays indexed by `index = y * width + x`:

- `temperatureC: (number | null)[]`: exactly `widthCells × heightCells` slots. Permanent blocked cells are `null`. Every other cell has a finite temperature, including an equipment-occupied cell whose value is a dormant local shadow sample excluded from solver volume and energy audits.
- `freeCellMask: boolean[]`: the same exact length; true only for cells currently participating in the airflow/thermal solve. It is derived and validated against permanent obstacles and equipment footprints, then serialized to make topology validation explicit.
- `faceFlowXM3s`, `faceFlowYM3s`: diagnostic flow from low to high index direction; recomputed every tick and serialized so load reproduces inspection exactly before the next step.
- `flowValid`: false after a topology edit and true after a successful solve; invalid face-flow arrays are zero.
- `lastFlowResidualM3s`, `lastEnergyResidualJ`, `lastIterationCount`: finite diagnostics from the last valid solve, or zero before the first valid solve.

On a paused topology edit, temperatures in cells that remain free are unchanged. A newly occupied cell retains its last temperature as a dormant shadow sample. A newly freed cell is initialized to the arithmetic mean of its currently free orthogonal neighbors after the edit, falling back to the pre-edit mean of all free cells when it has none. Face-flow arrays become zero with `flowValid=false`. Other cells, accumulated time, ledger, contract history, and recovery timers are untouched. Dormant samples are refreshed after each successful tick to the same neighbor/fallback mean without entering heat transport or energy audits. This is a deterministic topology-remap approximation, not simulated time; tests must prove there is no room-wide thermal reset.

### `EquipmentInstance`

Common fields: `id`, `definitionId`, `position`, `orientation`, `acquisitionPriceMicrocents`, `resaleValueMicrocents`, saved `workloadCapFraction`, derived `effectiveRequestedWorkloadFraction`, integer `requestedPowerMilliW`, integer `allocatedPowerMilliW`, `actualFlowM3s`, `operatingState`, and `limitReasons[]`.

Rack-only state: nullable `intakeTemperatureC`, nullable `exhaustTemperatureC`, `thermalFactor`, integer `usefulOutputMilliServiceUnits`, and `recoveryCoolMs`. Cooler-only state: `commandedCoolingFraction`, nullable `returnTemperatureC`, nullable `supplyTemperatureC`, `heatRemovedW`, and `capacityLimited`.

`operatingState` is `off | running | throttled | thermal-shutdown | power-limited`. `limitReasons` is a stable ordered subset of `NO_WORKLOAD | INTAKE_BLOCKED | EXHAUST_BLOCKED | INSUFFICIENT_FLOW | POWER_LIMITED | INTAKE_HOT | THERMAL_SHUTDOWN | COOLER_CAPACITY`.

### `ContractProgress`

Contains `status: offered | active | succeeded | failed`, `elapsedMs`, `qualifyingMs`, integer `deliveredMilliServiceUnitMs`, `grossRevenueMicrocents`, `settlementMicrocents`, and final nullable `failureReason`. Reliability basis points are derived as integer `floor(qualifyingMs * 10000 / max(elapsedMs, 1))`; UI may also show a decimal percentage. Failure reason includes `BANKRUPTCY`, `RELIABILITY_SHORTFALL`, or a numerical diagnostic code; precedence is normative in the simulation contract.

### `AccountsState` and `LedgerEntry`

`AccountsState` contains exact integer `cashMicrocents`, `operatingRevenueMicrocents`, categorized operating costs, `operatingProfitMicrocents`, `capitalPurchasesMicrocents`, and `resaleProceedsMicrocents`. `accrualRemainders` stores one integer numerator remainder per rate category with its fixed denominator from the simulation contract. Invariant:

`cash = startingCash - capitalPurchases + resaleProceeds + operatingRevenue + settlement - IT cost - cooling cost - rent - maintenance`.

A ledger entry contains monotonic `id`, `simulatedTimeMs`, `category`, signed `amountMicrocents`, `equipmentInstanceId?`, `descriptionCode`, and `contractId?`. Category determines sign; validation rejects inconsistent signs.

### `UndoRecord`

Contains command, minimal affected pre-state/post-state, pre/post authoritative state hashes, and exact ledger/account changes. It never contains renderer objects. Undo is legal only while paused in planning and only for the most recent record.

### `TrialDefinition` and `TrialReport`

A trial definition identifies scenario/revision, named initial layout or snapshot, workload, duration, and `commitToLive: false`. A report contains `label: 'NON-ECONOMIC TRIAL'`, definition identity, deterministic layout hash, equipment inventory hash, initial-condition hash, tick count, duration, peak/mean rack intake temperatures, minimum/total delivered service, IT/cooling energy, capacity-limit duration, diagnostics, and projected ledger/profit from the isolated clone. Projections must be marked `projected` and cannot enter any live account, contract, save, or classic key.

## Save envelope contract

```ts
interface TycoonSaveEnvelopeV1 {
  schemaVersion: 1;
  kind: 'hot-isle-tycoon-save';
  savedAt: string;              // informational ISO timestamp only
  scenarioId: string;
  scenarioRevision: string;
  state: ScenarioStateV1;
}
```

Storage keys:

- primary: `hici-tycoon-save-v1`
- staging: `hici-tycoon-save-v1-staging`
- forbidden to the adapter: `hici-progress`, `hici-custom-levels`, `hici-difficulty`

Validation order: storage availability → parse JSON as `unknown` → envelope discriminants/version → safe integer and finite scalar checks → array lengths → unique IDs → definition references → placement/topology → mode/time invariants → account/ledger reconciliation → air diagnostics/ranges. Unknown version returns `UNSUPPORTED_VERSION`; malformed content returns a path-specific `INVALID_SAVE`. Neither case creates a new state or overwrites the raw value.

Serialization tolerance: integer fields and strings must round-trip exactly; finite IEEE-754 temperatures/flows must round-trip through JSON with absolute difference ≤1×10⁻⁹. Reload forces `paused=true`, changes only `mode: operating` to `planning`, retains `offered`, `completed`, and `failed` terminal meaning, clears wall-time accumulator (not serialized), preserves all simulated/economic/thermal values, and does not use `savedAt` to advance time.

## State transitions

```text
offered --accept--> planning(paused, contract active)
planning --valid edit--> planning + undo record
planning --resume operation--> operating(unpaused), undo cleared
operating --pause/hidden--> planning(paused), state retained
planning --trial--> isolated trial report; live state unchanged
operating --contract complete and reliability met--> completed(paused)
operating --bankruptcy/reliability shortfall/numerical failure--> failed(paused)
planning/completed/failed --restart--> fresh offered(paused) state
save/load --> same logical state paused; only operating becomes planning
```

Invalid commands and invalid placements return reason codes and leave every authoritative field unchanged.

The reference playable start is `offered`, paused, with no owned equipment and no purchase entries. Accepting the contract opens planning; the player purchases the cooler and racks from the displayed startup cash. Named acceptance trials separately provide equal pre-owned inventories in their isolated snapshots so layout is the only comparison variable.


## Storage encoding correction after integration

The authoritative version-1 envelope and full ledger remain unchanged. The localStorage adapter writes small saves as plain JSON, and losslessly gzip/base64 encodes JSON of at least 128,000 characters with the `HICI-GZIP-1:` prefix. It decodes before complete schema validation and staging verification; legacy JSON remains readable. This uses pinned fflate 0.8.3. A measured full-contract save shrank from 5,299,471 characters (actual Chromium quota failure) to 256,904, allowing staging and repeated primary saves without dropping ledger rows or undo state.
