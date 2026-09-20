# Phase 0 Research: Datacenter Engineering Tycoon

## Evidence boundary

This research is based on the checked-in repository, feature specification, constitution, and workflow. It makes no external facility-performance claim. Constants below are design choices for a fictional game and require calibration against the specified acceptance fixtures. No simulation, benchmark, accessibility audit, or playtest was run during this planning iteration.

## Repository observations

| Observation | Consequence |
|---|---|
| `src/main.ts` uses default Three.js room mode and `?mode=classic` for lazy-loaded Phaser. | Replace the default room bootstrap behind the same route; do not merge tycoon state into Phaser scenes. |
| `src/prototype/Room.ts` combines DOM, Three.js resources, input, timing, and prototype state. | Split engine, renderer, and controller. Preserve resource disposal, resize, hidden-tab, keyboard, and right-click patterns where applicable. |
| `RouteSystem` plus `AirflowSystem` is a binary graph traversal through player-drawn ducts. | It cannot satisfy room airflow, recirculation, oriented rack transfer, or finite cooling; do not extend it as the tycoon solver. |
| `TemperatureSystem` heats or cools each server from a connectivity strength and resets prototype temperatures when editing. | Introduce room-cell energy state and preserve it across ordinary pause/edit/resume. Use explicit trial reset only for matched comparisons. |
| `src/utils/persistence.ts` uses `hici-progress`, `hici-custom-levels`, and `hici-difficulty`. | Add a separate, versioned key and adapter. Test that classic key values remain byte-for-byte unchanged. |
| Vitest is configured for Node; no browser automation package is declared. | Keep authoritative mechanics DOM-free. Browser runner selection is genuinely unresolved pending plan review. |

## Decision 1: Height-averaged finite-volume room approximation

**Decision**: Use a uniform 2D floor grid of 1m × 1m free-air cells with a declarative 3m effective mixing height. Equipment footprints and walls remove cells and faces. Oriented rack/cooler ports connect adjacent free cells. Forced equipment transfers create local source/sink divergence; a scalar pressure correction generates passive face flow. Heat is transported by conservative upwind flux.

**Why**: This is spatial, orientation-sensitive, obstruction-sensitive, deterministic, and small enough for a dependency-free TypeScript implementation. It creates actual downstream transport rather than a layout-quality score. Conservation can be audited per tick.

**Limitations**: It does not resolve height, buoyancy plumes, turbulence, leakage, fan curves, humidity, conduction through structures, or real geometry. Cell-averaged temperature and potential flow are gameplay signals only. UI and documentation must call it an approximate room model, never CFD, certification, or design advice.

**Alternatives rejected**:

- Distance-based cooling fields: simple, but fail orientation, obstruction, exhaust recirculation, and FR-006.
- Cellular automaton with arbitrary directional weights: predictable but difficult to conserve and too easy to turn into hidden layout bonuses.
- Full Navier–Stokes/CFD or a third-party solver: outside the browser-lightweight scope and disproportionate to one room.
- Pure graph flow among equipment ports: conserves flow but makes open-room position and obstructions less legible than a spatial field.

## Decision 2: Fixed ticks and atomic numerical validation

**Decision**: One physics tick is exactly 100ms simulated time. Speeds change tick throughput, not `dt`. The render loop maintains a wall-time accumulator only while visible and running; it processes a bounded number of complete ticks and carries remaining time. A hidden tab immediately pauses and clears the accumulator.

For each tick, solve each free-cell connected component in ascending cell index with deterministic preconditioned conjugate gradient, a fixed maximum of 500 iterations, and a maximum cell balance residual of 1×10⁻⁸ m³/s. Require every donor cell's summed outgoing volume over a tick to be no more than 45% of cell volume. Reject invalid configuration up front where bounds prove violation; if an actual tick is non-finite, fails convergence, violates CFL, or fails energy audit, commit none of it and pause with a diagnostic.

**Why**: Fixed ticks make 1×/accelerated results comparable and save state compact. Atomic failure protects players from invisible corruption. The CFL cap keeps explicit upwind transport positive and stable without hiding adaptive frame-dependent behavior.

**Alternatives rejected**:

- Variable render delta: existing prototype pattern is convenient, but equal simulated duration may follow different numerical paths.
- Semi-Lagrangian temperature advection: stable at large steps, but is not naturally conservative.
- Silently clamp invalid temperatures or residuals: masks solver defects and violates simulation integrity.

## Decision 3: Closed boundaries and paired forced transfers

**Decision**: Room walls have zero normal airflow and zero thermal flux in the first slice. Declarative envelope heat enters as watts distributed over named free cells. A rack transfers air from the free cell adjacent to its front into the cell adjacent to its rear; a cooler transfers return air to supply. Each active link has equal intake and exhaust volume, so global air source is zero. Port locations must be in bounds, but a neighboring footprint/obstacle may block one. If either port is blocked or the two free ports are in different connected components, the link is inactive and the equipment is de-energized for that tick with visible blockage/insufficient-flow reasons. This is a valid poor layout; footprint overlap and blocked declared service access remain invalid placements.

Rack actual flow is `ratedFanFlow × powerAllocationFraction × min(frontOpen, rearOpen)`. Cooler flow additionally scales by its commanded cooling fraction. A port is either open (`1`) or blocked (`0`) in this slice; partial face openness remains a future extension. Orientation rotates footprint, ports, and service cells together. Required service cells may be shared as access space but may not be occupied.

**Why**: A closed room makes mass accounting explicit; paired links model forced room circulation without player-drawn ducts. Separating valid-but-impaired ports from invalid service/footprint geometry makes the specification's blocked-intake case constructible and testable.

**Alternative rejected**: Treating coolers as fresh-air sources with unmodeled room exhaust would require open-boundary conditions and an additional mass-accounting rule not needed for the first slice.

## Decision 4: Sensible-heat balance and finite cooler

**Decision**: Store cell air temperature in °C but calculate sensible energy differences with declarative constant air density `ρ` (kg/m³) and specific heat `cp` (J/kg·K). Values are scenario model parameters, not measured environment facts. For free cell volume `V`, its represented sensible energy relative to 0°C is `E = ρ cp V T`.

Rack heat is actual IT electrical power in watts and is added to its exhaust transfer. Cooler requested removal is `ρ q cp max(Treturn - TsupplyTarget, 0)` watts. Actual removal is the minimum of that request and rated removal scaled by both commanded cooling fraction and power-allocation fraction; the formula cannot drive supply below the target. The supply stream temperature follows the actual removed energy. Fan/cooling electrical demand is booked separately and is not silently added to room air in this slice; that simplification is declared.

After transport, require:

`Eafter - Ebefore = dt × (rackHeat + envelopeHeat - coolerRemoval)`

within `max(0.01 J, 1×10⁻⁹ × max(|Ebefore|, |Eafter|))`. Any diffusion/mixing term must be implemented as equal-and-opposite face transfer so it contributes zero net room energy.

**Why**: This gives finite capacity, recirculation, and a first-law audit with understandable telemetry.

**Alternative rejected**: Setting supply cells directly to a target temperature destroys energy accounting and lets a cooler remove unlimited heat.

## Decision 5: Observable deterministic rack controls

**Decision**: Rack definition provides nameplate capacity, idle/max IT power, rated fan flow, purchase/resale/maintenance terms, and its own thermal curve. The Balanced-rack review example is:

- intake ≤27°C: thermal factor 1.0;
- 27–35°C: linear factor from 1.0 to 0.5;
- intake ≥35°C: shut down, output 0;
- recovery: remain off until intake ≤30°C continuously for 30 simulated seconds.

Useful output is `nameplateCapacity × requestedWorkload × powerAllocationFraction × thermalFactor` while on, then is rounded down once to integer milli-service-units for reliability and money. IT demand interpolates idle→max by requested workload, then is scaled by power allocation and is zero when shut down or its airflow link is inoperable. Telemetry lists all active limiting reasons rather than only the most severe. Economy and Dense rack thresholds remain distinct as listed in the data model; the example is not a hard-coded common curve.

**Why**: The curve has visible thresholds, hysteresis, no randomness, and directly connects intake conditions to revenue.

**Uncertainty**: Thresholds, duration, and rack characteristics need gameplay calibration. Thermal shutdown is concretely de-energized in this slice; that behavior may change only through a later reviewed design revision. These are game defaults, not accepted results or real hardware guidance.

## Decision 6: Power allocation and economics

**Decision**: At each tick, reserve power for operable cooler requests first because room cooling is shared infrastructure. A cooler commanded to fraction `c` requests `idle + c × (rated - idle)` power when `c > 0` and zero when off; its airflow/removal cap scale by `c` and its allocation fraction. Scale cooler requests together if they exceed the room limit. Allocate all remaining power to operable, non-shutdown racks with one common fraction of requested IT power, avoiding hidden per-rack favoritism. Definition watts and allocations are integer milliwatts; allocations round down so the room cap cannot be exceeded. The inspection panel shows command/workload, requested/allocated kW, and `POWER_LIMITED` on every affected device.

Internally represent money as integer microcents. Accrual categories are revenue, IT energy, cooling energy, rent, maintenance, purchases, resale, and contract settlement. Integer milliwatts and milli-service-units feed the explicit rational formulas in the simulation contract; each category carries its integer numerator remainder across ticks, and definition validation prevents unsafe-integer products. Operating profit excludes purchases/resale and equals revenue plus settlement minus operating costs; cash includes every ledger entry. Reliability is qualifying milliseconds divided by elapsed contract milliseconds, with a tick qualifying only when authoritative milli-service output meets the visible requirement. This resolves the earlier impossible claim that exact integer remainders could be carried directly from arbitrary floating-point output/power.

On the final contract tick, settlement posts before outcome evaluation. A committed cash balance below the bankruptcy threshold takes precedence; otherwise meeting the reliability target succeeds and missing it fails with `RELIABILITY_SHORTFALL`. Numerical failure never commits the failed tick. This produces one deterministic primary result while retaining the full financial/service breakdown.

**Why**: Shared scaling is deterministic and explainable. Separate accounts prevent cash, revenue, and profit from being conflated. Integer accrual makes equal-tick runs cent-consistent.

**Alternatives rejected**:

- Rack-by-rack priority: deterministic but makes ID/order an economically powerful hidden mechanic.
- Revenue from installed nameplate capacity: rewards unusable overheated equipment.
- Floating-point dollars rounded every frame: creates speed/frame-dependent drift.

## Decision 7: Planning undo and trial isolation

**Decision**: Planning commands are transactions containing pre-state and post-state hashes plus exact financial entries. A rejected placement has no post-state. Move/rotate is free. Removal refunds `floor(acquisition price × resale basis points / 10,000)` recorded on the instance; undo restores the exact earlier instance and balance. Undo history is cleared when economic operation resumes.

Topology edits preserve every still-free cell temperature. Newly occupied cell temperatures become dormant shadow samples; newly freed cells use the deterministic neighboring/fallback mean specified in the data model. Time, accounts, contract history, and recovery timers never reset. This permits paused redesign without pretending that changing solid geometry is a simulated thermal step.

A design trial deep-clones a named initial snapshot and definition, has a declared duration/workload, and runs the same simulation/economy reducers with `commitToLive=false`. Its clone accumulates projected accounts and contract progress for a comparable projected profit report. It cannot mutate live state, save storage, live contract, cash, or ledger.

**Why**: These boundaries eliminate purchase/remove arbitrage and make matched trials fair.

## Decision 8: Versioned local save with explicit failure

**Decision**: Use `hici-tycoon-save-v1` and `hici-tycoon-save-v1-staging`. Save pauses, serializes the complete committed state and definition identity, validates a parsed staging round-trip, writes the primary key, then removes staging. `localStorage.setItem` exceptions return actionable `UNAVAILABLE` or `QUOTA` results and do not clear a prior primary value. Load parses into `unknown`, validates every field/reference/range, rejects unsupported versions without mutation, and forces runtime mode to paused. No timestamp delta advances the simulation.

**Why**: Separate keys protect classic progress; staged validation avoids replacing a good save with data the application itself cannot reload.

**Alternative rejected**: Reusing current persistence helpers would silently discard corruption and cannot restore full thermal/economic state.

## Decision 9: DOM/Three.js boundary and accessibility

**Decision**: A pure `ScenarioView` snapshot feeds both the renderer and semantic DOM. Three.js owns room geometry, picking IDs, camera, and decorative overlays. DOM owns all text, controls, focus, live status, and ledger tables. Input maps to typed commands; neither UI layer mutates state directly. Arrow shapes, numeric units, text reasons, patterned threshold badges, and focus outlines supplement color. Respect reduced motion.

**Why**: This keeps the simulation unit-testable and provides meaningful non-canvas access.

## Decision 10: Provisional fictional reference scenario

**Decision**: Give planning review a concrete balance baseline while keeping every number declarative. The baseline is not a measured result and may be changed only with recorded calibration evidence:

- 12 × 10 floor bounding grid, 1m cells, 3m mixing height, 21°C initial air, 120kW room power limit, $150,000 startup cash, and no pre-owned equipment in the playable start;
- model constants: density 1.2kg/m³, specific heat 1,005J/(kg·K), passive face conductance 0.15m³/(s·Pa), symmetric mixing conductance 0.03m³/s; these are fictional simulation parameters, not a site characterization;
- Economy rack: $8,000 purchase, 10 service units, 1/4kW idle/max, 0.8m³/s fan, full through 26°C, shutdown 36°C, recover ≤30°C, $0.60/min maintenance;
- Balanced rack: $12,000, 16 units, 1.5/6kW, 1.1m³/s, full through 27°C, shutdown 35°C, recover ≤30°C, $0.90/min;
- Dense rack: $18,000, 26 units, 2/10kW, 1.3m³/s, full through 25°C, shutdown 33°C, recover ≤28°C, $1.50/min;
- one $25,000 cooler: 10m³/s rated flow, 80kW rated sensible removal, 18°C target supply, 3/15kW idle/rated electrical demand, $3/min maintenance;
- electricity $0.15/kWh, rent $10/min, 60% equipment resale;
- one 10-minute contract requiring 100 service units at 95% reliability, paying $0.05 per delivered service-unit-second; final missing-service debit uses the same $0.05 rate and is capped at gross earned revenue; requested rack workload is 100% throughout.

All displayed currency converts to integer microcents in definitions. This baseline appears structurally affordable (for example, cooler plus several racks can be purchased within startup cash), but no layout's thermal behavior, contract success, 5°C separation, or profit has been simulated. SC-002 and SC-004 remain pending calibration evidence.

## Resolved and unresolved items

Resolved here: spatial approximation, units, boundaries, valid-but-impaired port obstruction semantics, topology remapping while paused, deterministic flow solve, thermal transport, finite cooling and its exact power command, stability/audit behavior, per-definition rack controls, power policy, fixed-point accounting precision and terminal precedence, trial projection isolation, save namespace/validation, integration seams, and a provisional fictional balance baseline.

Pending plan review or implementation evidence:

- Browser automation mechanism (none is currently declared).
- Exact fictional scenario/rack/cooler/contract values after SC-002 and SC-004 calibration.
- Reference mid-range device and measurement protocol details for SC-008.
- Recorded first-time-player evidence for SC-001 and manual accessibility findings.
- Solver iteration and frame-time measurements on dense valid layouts.
