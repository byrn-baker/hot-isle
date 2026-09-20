# Planning Review Analysis: Datacenter Engineering Tycoon

## Review boundary and outcome

This is the fresh-context PLAN-002 review of the PLAN-001 technical package. It records local evidence, contradictions found, their disposition, complete requirement/success-criterion coverage, and remaining risks. It is design evidence only: no game feature, solver, browser workflow, benchmark, build, or acceptance result was implemented or run.

The design is coherent enough to implement and test after review, subject to the explicit pending items below. The user's request to install Ralph and start work is treated as specification approval. At review time, the `spec.md` header still said draft; the supervising session subsequently synchronized that header with the user’s approval. The workflow's separate `review-plan` gate remains **pending**. No `tasks.md` exists and no plan approval is asserted.

## Inputs and repository evidence inspected

- Governance and workflow: `AGENTS.md`, `.specify/memory/constitution.md`, `.specify/workflows/speckit/workflow.yml`, and `.specify/templates/plan-template.md`.
- Feature artifacts: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/simulation.md`, and `ralph/progress.md`.
- Project/tooling: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, file inventory, test inventory, and read-only working-tree status.
- Existing integration seams: `src/main.ts`, `src/campaign.ts`, `src/prototype/Room.ts`, `src/prototype/RouteSystem.ts`, `src/systems/AirflowSystem.ts`, `src/systems/TemperatureSystem.ts`, `src/systems/GridSystem.ts`, `src/utils/persistence.ts`, relevant types, scenes, UI, and representative tests.

Observed local facts:

1. `src/main.ts` routes `?mode=classic` to lazy-loaded Phaser and the default route to the Three.js prototype. This supports the planned isolated tycoon bootstrap while retaining classic access.
2. `Room.ts` owns DOM, Three.js resources, input, render timing, prototype state, and a reset-on-run thermal loop. It has useful resize, right-click, keyboard, reduced-motion, pooling, hidden-tab, and disposal patterns, but not the required domain boundary.
3. `RouteSystem` and `AirflowSystem` calculate binary duct reachability; `TemperatureSystem` heats/cools rack scalars from that connectivity. They do not supply spatial room flow, conservative heat transport, finite cooling, or economics.
4. `src/utils/persistence.ts` uses classic keys `hici-progress`, `hici-custom-levels`, and `hici-difficulty` and silently falls back on malformed reads. The planned tycoon adapter therefore needs its separate namespace and explicit errors.
5. Vitest is configured for Node and current mechanics tests are pure. `package.json` declares no browser automation dependency, so browser-runner selection is a real review/implementation decision rather than an available capability.
6. The worktree already contains unrelated modified and untracked application work. PLAN-002 leaves it untouched; `tasks.md` remains absent.

## Findings and disposition

| ID | Finding | Disposition in reviewed documents | Status |
|---|---|---|---|
| F-01 | The earlier port rule rejected every blocked port, making the specification's blocked-intake scenario impossible. | Ports must be in bounds, but a neighboring obstruction/footprint may block them. Such placement is valid and visibly impaired; the link is inactive and de-energized. Footprint overlap and occupied required service cells still reject atomically. | Resolved |
| F-02 | “Exact carried remainders” was not implementable when power and useful output remained arbitrary floating-point values. | Power allocations now round down once to integer milliwatts and useful output to integer milli-service-units. The contract defines exact divisors for electricity, revenue, rent, and maintenance, carried numerator remainders, and safe-integer validation. | Resolved |
| F-03 | Cooler `idlePowerW`/`ratedPowerW`, airflow, removal, and power allocation formed an unspecified control loop. | A player command fraction `c` is explicit. Off requests zero; otherwise requested power is `idle + c(rated-idle)`. Flow and removal cap scale by `c` and the actual allocation fraction, using prior-state return temperature in the fixed tick. | Resolved |
| F-04 | The generic 27/35/30°C “default” contradicted the three heterogeneous rack curves. | The equations consume per-definition thresholds. 27/35/30°C is labeled only as the Balanced-rack example; Economy and Dense retain their declared differences. | Resolved |
| F-05 | `initialEquipment` said the cooler was already present while the balance discussion treated cooler purchase as part of the startup budget. | The playable reference starts empty with no purchase ledger entries; accepting the offer opens paused planning and the player buys cooling/racks. Matched trials separately carry identical pre-owned fixture inventory in isolated snapshots. | Resolved |
| F-06 | Non-economic trials were forbidden to change a ledger but SC-002 requires comparable net operating profit. | Trials run the same simulation/economy reducers in a deep clone with `commitToLive=false`; clone-only accounts are reported as projected. Canonical live state and storage must remain unchanged. | Resolved |
| F-07 | Contract completion, reliability failure, settlement, and bankruptcy had no same-tick precedence. | Final settlement posts before result evaluation. Numerical failure rejects the tick; otherwise bankruptcy takes precedence, then reliability decides success versus `RELIABILITY_SHORTFALL`. The result retains all metrics and one primary cause. | Resolved |
| F-08 | Moving/removing solid equipment changes the free-cell topology, but preservation of thermal state during paused edits was undefined. | Still-free cell temperatures remain exact. Occupied cells retain dormant shadow samples; newly freed cells use a deterministic orthogonal-neighbor mean with a pre-edit room-mean fallback. No other thermal, time, recovery, contract, or finance state resets. | Resolved |
| F-09 | Save/load said operating mode becomes planning but did not distinguish terminal/offered states. | Load changes only active `operating` to paused `planning`; `offered`, `completed`, and `failed` meaning is retained. Wall-clock time remains ignored. | Resolved |
| F-10 | The flow/thermal equations needed confirmation that blocked or disconnected paired links cannot unbalance a closed component. | Only operable same-component port pairs enter the forced-source vector. Every included link is equal-volume intake/exhaust; closed components must have near-zero source sum before PCG. Heat transport uses the same committed link flows and a whole-room energy audit. | Resolved |
| F-11 | The spec header still labels specification review pending although the current user instruction says it was approved. | Recorded as contextual approval only because `spec.md` is forbidden for this story. This does not imply plan approval. | Resolved by run context; header subsequently synchronized by supervising session |
| F-12 | Browser automation, measured performance, calibration, and first-time comprehension have no local evidence yet. | All remain named pending evidence. No pass claim is made. | Pending |

## Solver and step-contract coherence

The normative contract now has one implementable tick path:

1. Read only committed prior state, select the integer-time workload segment, resolve port operability, and update per-definition thermal state.
2. Derive integer-milliwatt equipment requests; allocate cooling first and racks proportionally without exceeding the room limit.
3. Convert allocation to paired forced flows; omit blocked/cross-component links; solve passive four-neighbor flow in stable component/cell order and audit cell residuals.
4. Use prior-cell donor temperatures for all accumulated upwind transfers, add rack/envelope joules, subtract finite cooler joules, then audit CFL, finiteness, and room energy before commit.
5. Quantize output once to milli-service-units, accrue integer financial numerators/remainders, advance integer time, settle only at the contract boundary, and apply deterministic terminal precedence.
6. Commit the complete candidate or retain the prior state and enter a safe paused diagnostic. A multi-tick request is repeated single-tick atomicity.

Important declared approximations are now testable rather than implicit: height-averaged four-neighbor potential flow is not CFD; walls are closed/adiabatic except explicit envelope watts; equipment fan links are same-component transfers; fan/cooling electrical heat is not deposited into the room; ports are binary open/blocked; and paused geometry remapping is not elapsed thermal simulation.

## Functional-requirement traceability

Every row below points to planned modules/contracts and future validation. “Specified” means the design decision exists, not that code or evidence exists.

| Requirement | Design coverage | Planned validation | Design status |
|---|---|---|---|
| FR-001 | Room definition, blocked/access cells, placement validator, floor renderer | Boundary, wall, permanent-obstacle, and service-access unit cases; visible-floor browser check | Specified |
| FR-002 | Three declarative rack definitions with distinct price/capacity/power/fan/thermal values | Schema distinctness test; catalog/inspection browser check | Specified; balance pending |
| FR-003 | Atomic `PLACE/MOVE/ROTATE/REMOVE`, cooler command, controller/render adapters | Pure command tests plus separate mouse-only and keyboard-only workflows | Specified |
| FR-004 | Rotated intake/exhaust offsets and non-color preview/placed markers; no duct mechanic | Rotation/offset tests and visual/browser front/back check | Specified |
| FR-005 | Footprint/service validation, valid blocked-port impairment, reason codes, transactional undo | Unchanged-state rejection, blocked-port, exact cash/ledger undo, right-click/delete tests | Specified |
| FR-006 | Free-cell graph, paired forced links, PCG passive flow, obstruction, upwind heat | Orientation/obstruction fixtures and matched transport comparisons without layout bonus | Specified; solver evidence pending |
| FR-007 | Local rack port sampling, oriented link, actual IT heat, heterogeneous controls | Single-rack first-law and upstream idle/load downstream-temperature fixtures | Specified |
| FR-008 | Cooler command, paired return/supply, finite flow/removal, electrical allocation/cost | Off/partial/full/power-limited and below/above-capacity fixtures plus ledger check | Specified |
| FR-009 | Component source check, PCG residual, CFL, finite/range and energy audits, atomic commit | Conservation fixtures and injected nonconvergence/NaN/CFL/energy failures | Specified; tolerances unvalidated |
| FR-010 | Per-rack throttle/shutdown/recovery state machine and visible reasons | Exact threshold, hysteresis, hold-time, no-flow, and recovery tests | Specified; calibration pending |
| FR-011 | `ScenarioView`, DOM inspection, airflow/temperature overlays, numeric arrows/text reasons | Selector snapshots and color-independent keyboard/browser checks | Specified |
| FR-012 | Startup cash, catalog, integer-mW power cap, rate formulas, categorized ledger | Purchase/cap tests, safe-integer validation, per-tick reconciliation | Specified; balance pending |
| FR-013 | Visible offer, active duration/reliability, settlement, terminal precedence/results | Offer schema/UI; success, reliability failure, bankruptcy, and final-tick fixtures | Specified; balance pending |
| FR-014 | Separate cash/revenue/profit/capital accounts and floor resale rule | Ledger invariant and repeated buy/remove/undo property tests | Specified |
| FR-015 | Fixed 100ms ticks, wall-time adapter, pause/speed, state-preserving topology remap | Equal-tick speed tests, 30s pause, pause/edit/resume no-reset tests | Specified |
| FR-016 | Deep-cloned `commitToLive=false` trial with projected clone-only accounts | Live canonical before/after equality and no-storage-write tests | Specified |
| FR-017 | Full versioned envelope, staging/primary keys, explicit errors, paused reload | Round-trip, corruption/version/quota, next-tick continuation, classic sentinel tests | Specified |
| FR-018 | Keyboard map, pointer paths, semantic DOM/focus, text/numeric/pattern alternatives | Keyboard-only/mouse-only matrices, contrast tooling, manual screen-reader review | Specified; harness/review pending |
| FR-019 | Existing `main.ts` mode boundary and forbidden classic keys | Classic route smoke and byte-for-byte localStorage sentinel tests | Specified |
| FR-020 | Validated declarative scenario/model definitions and required disclaimer | Invalid-definition tests, help/about copy check, balance-constant source scan | Specified |
| FR-021 | Pure unit/contract suite plus future browser suite and named fixtures | Recorded unit/contract/browser commands and outputs after implementation | Specified; all evidence pending |

## Success-criterion traceability

| Criterion | Planned evidence and threshold | Current status |
|---|---|---|
| SC-001 | Recorded first-time participant buys a rack, identifies front/back, rotates, and starts a test within 5 minutes using in-game help | Pending playtest |
| SC-002 | Same revision/inventory/air/workload/tariffs/duration good-vs-poor cloned reports; affected peak intake at least 5°C lower and projected net operating profit greater | Pending solver implementation and calibration |
| SC-003 | Upstream idle/load and rotated/separated paired fixtures show signed downstream temperature changes through actual transport | Pending solver implementation |
| SC-004 | Full 10-minute deterministic good/adverse reports demonstrate affordable profitable completion and explained degradation | Pending economy implementation and calibration |
| SC-005 | Repeated canonical runs plus 1×/accelerated equal-tick runs; finance difference ≤$0.01 and temperature difference ≤0.1°C | Pending implementation; fixed-point/fixed-tick contract specified |
| SC-006 | 30 wall-clock seconds paused changes no authoritative state; JSON round-trip preserves integers exactly and floats within 1×10⁻⁹; no offline tick | Pending persistence/runtime tests |
| SC-007 | Mouse-only and keyboard-only browser matrices cover every named action/overlay/control; resize preserves layout/state hash | Pending browser harness and execution |
| SC-008 | Production profile with 24 racks records device/OS/browser/viewport/pixel ratio/build/method; target 60fps and <100ms visible input feedback | Pending device selection and measurement |

## Remaining risks and true pending decisions

- The deterministic PCG limit and residual/CFL/energy tolerances are reviewable values but untested. Dense valid layouts may require revised declarative limits or a documented solver change.
- The height-averaged potential-flow model omits vertical stratification, buoyancy, turbulence, leakage, humidity, fan curves, and real geometry. Plan review must accept it as a predictable game approximation; the UI must never call it validated CFD or facility guidance.
- The topology shadow-sample rule preserves existing cells but is intentionally simplified. Property tests and playtesting must check that repeated edits do not become a useful thermal exploit.
- Provisional thermal/economic values do not yet demonstrate SC-002 or SC-004. Calibration may change only declarative definitions with recorded before/after evidence, never add a fixture/layout bonus.
- No browser automation package is installed. Plan review must select an available external runner or authorize a later dependency before FR-021/SC-007 evidence can exist.
- No reference mid-range device or latency measurement method is chosen, so SC-008 remains unmeasured.
- WCAG contrast, screen-reader behavior, and first-time comprehension require browser/manual evidence beyond Node tests.

None of these is a blocker to technical plan review or to generating implementation tasks after that gate is explicitly approved. They are blockers to claiming the corresponding acceptance criteria have passed.

## Scope and gate conclusion

The reviewed package remains one playable slice: one bounded room; forced room airflow; oriented heterogeneous racks; finite commanded cooling; thermal performance and delivered-service finance; 3D/plan views, overlays, keyboard and right-click controls; isolated trials; local saves; and retained classic mode. It does not add CFD claims, backend/accounts, property expansion, staff, multiplayer, liquid cooling, stochastic failures, or mobile parity.

PLAN-002 changes planning artifacts only. Application code, dependencies, `spec.md`, runner queue/state/files, and git state remain unchanged. The technical plan is ready for the user's review, and `review-plan` remains pending.
