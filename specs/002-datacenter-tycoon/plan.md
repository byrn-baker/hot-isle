# Implementation Plan: Datacenter Engineering Tycoon

**Branch**: `002-datacenter-tycoon` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Approved feature specification from `/specs/002-datacenter-tycoon/spec.md`

**Gate status**: User explicitly approved this technical plan on 2026-09-13. Task generation and implementation are authorized.

## Summary

Build one playable, local-browser datacenter-tycoon slice behind the existing default Three.js room entry point, while retaining the Phaser classic campaign at `?mode=classic`. Replace the prototype's duct-routing rule with a deterministic, height-averaged 2D finite-volume room model. A pressure-correction solve balances forced rack and cooler transfers through free cells; conservative upwind transport moves heat through the resulting airflow. Oriented heterogeneous racks, finite cooling, power allocation, service delivery, and a cent-reconcilable ledger all advance on fixed simulation ticks independent of rendering.

The simulation is a predictable game approximation, not validated CFD. Rendering and DOM input consume immutable view snapshots and issue commands to a pure scenario engine. Definitions remain data-driven. Versioned local saves use a key namespace that cannot collide with the classic campaign. Exact formulas, tolerances, contracts, and unresolved calibration/performance work are in [research.md](./research.md), [data-model.md](./data-model.md), [contracts/simulation.md](./contracts/simulation.md), and [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.7, strict ES2020 modules

**Primary Dependencies**: Three.js 0.186 for the tycoon view; existing Phaser 3.80.1 remains isolated to classic mode; Vite 6 for browser builds. The implementation adds pinned fflate 0.8.3 for lossless large-save compression after an actual completed-contract ledger exceeded browser storage quota; simulation still has no solver dependency.

**Storage**: Browser `localStorage`, using a versioned tycoon-only envelope under `hici-tycoon-save-v1`; existing `hici-progress`, `hici-custom-levels`, and `hici-difficulty` keys are not read or written by the tycoon save adapter.

**Testing**: Vitest 3 node-environment unit/contract tests for pure modules; browser workflow checks are required by the spec but the repository currently has no browser automation dependency, so the runner/tool choice is a plan-review item and results remain unmeasured.

**Target Platform**: Modern desktop browsers with WebGL and keyboard/mouse; offline-capable after static assets load. Touch parity is not part of this slice.

**Project Type**: Single Vite browser application with two client-side modes (Three.js tycoon and retained Phaser classic campaign), no backend.

**Performance Goals**: Target 60fps presentation and input feedback under 100ms in the one-room scenario with up to 24 racks. Physics must not depend on frame rate. These are acceptance targets, not measured results; device, resolution, rack count, build mode, frame distribution, input latency method, and physics cost must be recorded during implementation verification.

**Constraints**: Fixed 100ms physics step; equal simulated tick counts at every speed; no offline advancement; deterministic stable iteration/ID order; closed room boundaries; finite cooler airflow/removal and room power; 1m × 1m × 3m height-averaged air cells; reject a step atomically on non-finite state, flow-solver failure, CFL violation, or conservation breach; no claims of engineering-grade CFD or safety suitability.

**Scale/Scope**: One bounded room, at most 24 racks, three rack definitions, one cooler definition, one contract, one workload schedule, planning/operation/trial modes, 3D room plus plan camera, overlays, inspection, undo, save/load, and access to classic mode.

## Constitution Check

### Pre-research gate

| Principle or standard | Planned compliance | Gate result |
|---|---|---|
| I. Game-First Design | The playable loop is buy/place/orient → inspect airflow/temperature → operate → reconcile service and profit. No visual-only milestone substitutes for that loop. | PASS |
| II. Progressive Complexity | First-visit instructions teach front/back and pause before the contract clock begins; the single slice then introduces airflow and finance in one bounded scenario. Later levels remain out of scope. | PASS |
| III. Simulation Integrity | Fixed deterministic steps, visible limits, explicit unit equations, conservative transfer audits, stable ordering, and no random failure. Limitations are shown in help/about copy. | PASS |
| IV. Browser-Native & Lightweight | Existing Vite/TypeScript/Three.js stack is reused without a solver dependency or backend. Performance targets are retained and explicitly pending measurement. | PASS, measurement pending |
| V. Accessibility | Every core command has mouse and keyboard paths; focus state, text/numeric status, arrows/patterns, pause, reduced-motion handling, and WCAG AA contrast verification are planned. Color is supplementary. | PASS, browser verification pending |
| Unit-testable mechanics | Solver, placement, thermal controls, economy, persistence validation, and scenario stepping are pure or adapter-isolated modules. | PASS |
| Visual/logic separation | The engine emits `ScenarioView`; Three.js/DOM render it and dispatch typed commands. | PASS |
| Declarative level data | Room, definitions, workload, tariffs, contract, limits, and solver tunables are a typed scenario definition validated at load. | PASS |
| Modular systems | Domain state, airflow/thermal solve, economy, persistence, input/controller, and rendering have named seams below. | PASS |

The constitution's duct-piece and time-pressure examples are illustrative, not normative requirements. This feature retains progressive teaching but teaches rack orientation, recirculation, finite cooling, and contract pressure. No constitution amendment is required.

### Post-design re-check

Phase 1 design introduces no constitution violation. The pressure/finite-volume approximation is intentionally simpler than CFD, deterministic, inspectable, dependency-free, and testable. Three.js remains a presentation adapter; classic Phaser code remains separate. Open verification work—including browser automation selection, solver/balance calibration, and measured performance/accessibility evidence—does not invalidate the design but must be resolved during tasks/implementation after plan approval. No exception is claimed.

## Architecture and Integration Seams

### Current-code findings

- `src/main.ts` already loads `src/prototype/Room.ts` by default and lazily loads `src/campaign.ts` for `?mode=classic`; preserve this routing contract.
- `Room.ts` currently owns markup, WebGL resources, input, animation time, HUD, and a reset-on-run temperature loop in one function. It calls `RouteSystem`, the classic binary `AirflowSystem`, and `TemperatureSystem`; none models room air or tycoon state. Reuse visual construction ideas only, not those game rules.
- `src/utils/persistence.ts` owns classic keys and silently defaults on malformed data. Tycoon persistence needs a separate adapter with explicit user-visible errors and must never call the classic helpers.
- Vitest runs in Node and existing mechanics tests are pure. Preserve that pattern for the engine; put browser interaction verification in a separate harness once selected at plan review.
- The current Three renderer already clamps render `dt`, stops prototype evolution while `document.hidden`, uses a `ResizeObserver`, supports right-click and keyboard input, and disposes resources. Preserve those useful seams while moving authoritative time into the scenario engine.

### Planned runtime flow

```text
main.ts mode router
  ├─ ?mode=classic → campaign.ts / existing Phaser scenes and classic keys
  └─ default → tycoon/bootstrap.ts
       ├─ data/loadScenarioDefinition.ts → validated declarative definitions
       ├─ state/ScenarioEngine.ts → commands + fixed tick orchestration
       │    ├─ simulation/AirflowSolver.ts
       │    ├─ simulation/ThermalTransport.ts
       │    ├─ simulation/RackControls.ts
       │    └─ economy/EconomySystem.ts
       ├─ persistence/TycoonSaveStore.ts → hici-tycoon-save-v1 only
       ├─ rendering/RoomRenderer.ts → Three.js scene and overlays
       └─ ui/RoomController.ts → DOM, keyboard, pointer, focus, help
```

`ScenarioEngine.dispatch(command)` is the only gameplay mutation seam. It validates commands atomically, queues no wall-clock work, and returns a result plus an immutable serializable view. `advanceTicks(count)` performs complete fixed ticks; the render loop only decides how many ticks are due. Hidden tabs immediately force a paused runtime state and discard wall-clock accumulator time, so returning cannot create an unannounced jump.

## Simulation Design

The normative interface and equations are in [contracts/simulation.md](./contracts/simulation.md); this section records the implementation decomposition.

1. Represent usable room air as free 1m × 1m floor cells with a configured 3m effective mixing height. Walls and equipment footprint cells are impermeable. Each rack and cooler exposes oriented adjacent intake/return and exhaust/supply port locations. Footprint overlap, out-of-bounds ports, and occupied required service cells reject placement; a port facing an occupied/blocked cell is instead a valid, visibly impaired layout with its forced link inactive.
2. At each 100ms tick, derive requested rack/cooler power from the prior committed state and operable links. Allocate the integer-milliwatt room limit deterministically: commanded cooler demand first, then scale all operable rack requests by one common factor from the remaining capacity, rounding device allocations down so the cap cannot be exceeded.
3. Convert powered fans into paired transfers: rack front → rear and cooler return → supply, in m³/s. Build a finite-volume free-cell graph. Solve a scalar pressure correction per connected component with deterministic PCG so passive face flows balance the forced source/sink divergence. Closed walls have zero normal flow; obstruction removes cells/faces; face conductance is declarative.
4. Move sensible heat with explicit conservative upwind transfers. Rack transfer adds actual IT heat at its exhaust. Cooler transfer removes the minimum of stream demand and rated removal scaled by its command and allocated-power fractions; capacity saturation therefore raises supply temperature. Envelope heat is an explicit scenario source. No distance bonus or connectivity flag enters the equations.
5. Require donor-cell outgoing volume fraction ≤ 0.45 per tick. After every solve, audit per-cell airflow residual ≤ 1×10⁻⁸ m³/s and whole-room energy residual ≤ `max(0.01 J, 1×10⁻⁹ × max(|Ebefore|, |Eafter|))`. Configuration validation rejects a scenario that cannot satisfy a provable bound; a runtime failure leaves the previous state committed, pauses, and exposes a diagnostic. Paused topology edits preserve still-free temperatures and use the documented local shadow-sample remap only for newly freed cells, never a room-wide reset.
6. Derive rack intake/exhaust temperature, actual flow, integer milli-service output, throttle/shutdown/recovery, integer-milliwatt power, and reasons from observable state. Thermal thresholds come from each rack definition; the 27/35/30°C curve is specifically the Balanced-rack baseline. These values are fictional tunables pending gameplay calibration, not facility recommendations.

## Economy and Scenario Progression

- Money is stored as integer microcents internally (1 cent = 1,000,000 microcents) and formatted to cents. Power is quantized down to milliwatts and useful output to milli-service-units before accounting. Electricity, service revenue, rent, and maintenance then use the explicit integer numerator/denominator formulas in the simulation contract with per-category carried remainders and safe-integer validation.
- Purchase deducts the listed acquisition price once. Move/rotate is free. Removal refunds the instance's recorded resale value, proposed as 60% of its acquisition price. Planning undo restores the complete prior command and exact balance; undo history is cleared when operation resumes. Thus repeated buy/sell cannot increase cash.
- Each tick accrues IT electricity, cooling electricity, rent, and maintenance separately. Delivered service equals the sum of authoritative useful rack output over the tick; idle, no-flow, power-limited, throttled, or shut-down capacity is never credited at nameplate value.
- The one contract declares required capacity, duration, reliability threshold, service rate, and shortfall settlement. Reliability is the fraction of elapsed contract milliseconds whose delivered capacity meets the requirement. On the final tick settlement posts first; bankruptcy then takes precedence, otherwise reliability decides success/failure. Final results report the primary cause plus delivered service, reliability, gross revenue, each cost, settlement/penalty, operating profit, and final cash.
- Contract operation mutates time and ledger; a trial deep-clones a declared initial snapshot and runs the same engine/economy reducers with `commitToLive=false`. Its ledger and profit are explicitly projected and never write live cash, ledger, contract progress, save, or classic state.
- Scenario definition amounts and capacities must be calibrated so at least one affordable layout is profitable and the specified adverse layout degrades service/profit. No such result is claimed in this planning run.
- The review baseline is concrete but provisional: an empty 12×10 playable room, $150,000 startup cash, 120kW limit; $8k/$12k/$18k racks with 10/16/26 service units; a $25k, 10m³/s, 80kW-removal cooler; $0.15/kWh electricity; $10/min rent; and a 10-minute, 100-unit, 95%-reliability contract paying $0.05 per delivered unit-second. Full values and caveats are in `research.md` and `data-model.md`; no acceptance outcome is inferred.

## UI, Input, and Save Integration

- The Three.js room shows rack geometry with non-color front arrows and rear chevrons, cooler supply/return markers, blocked service cells, selection outline, and plan/room cameras. Overlays provide airflow arrows with numeric m³/s, temperature labels in °C plus threshold symbols/patterns, and capacity warnings.
- A DOM side panel provides catalog, contract terms, ledger reconciliation, selected-equipment telemetry/reasons, cooler command, pause/speed/trial/operation controls, save status, and first-visit help. It remains operable if WebGL overlay colors are unavailable.
- Keyboard focus begins on the room grid after help closes. Arrow keys move a logical floor cursor; Tab reaches all DOM controls; Space places/selects; R rotates preview/selection; M starts a move; Delete/Backspace removes; Ctrl/Cmd+Z undoes; I inspects; O cycles overlays; P pauses/resumes; `1`/`2`/`3` select speeds. Pointer click selects/places, drag moves only after an explicit move action, and right-click removes only an owned item. All planning mutations are rejected while running.
- Save uses the schema in [data-model.md](./data-model.md): pause first, serialize the full committed state including air temperatures and financial/recovery remainders, validate a staging round-trip, then replace the primary tycoon key. Load validates schema and references before constructing state and always resumes paused. `savedAt` is informational; elapsed wall time is ignored.
- Resize updates camera and DOM layout without reconstructing engine state. `visibilitychange` pauses before the next tick and clears the wall-time accumulator. Reduced-motion disables decorative particles but not directional arrows or numeric diagnostics.

## Project Structure

### Documentation (this feature)

```text
specs/002-datacenter-tycoon/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── analysis.md
├── contracts/
│   └── simulation.md
└── tasks.md                 # future /speckit.tasks output; do not create before review-plan
```

### Planned source code (repository root)

```text
src/
├── main.ts                  # retain default/classic lazy mode split
├── campaign.ts              # retained classic Phaser entry, unchanged by this slice
├── tycoon/
│   ├── bootstrap.ts
│   ├── data/
│   │   ├── scenario-001.ts
│   │   └── loadScenarioDefinition.ts
│   ├── model/
│   │   ├── types.ts
│   │   ├── placement.ts
│   │   └── validation.ts
│   ├── simulation/
│   │   ├── AirflowSolver.ts
│   │   ├── ThermalTransport.ts
│   │   └── RackControls.ts
│   ├── economy/
│   │   └── EconomySystem.ts
│   ├── state/
│   │   ├── ScenarioEngine.ts
│   │   ├── commands.ts
│   │   └── selectors.ts
│   ├── persistence/
│   │   └── TycoonSaveStore.ts
│   ├── rendering/
│   │   └── RoomRenderer.ts
│   └── ui/
│       ├── RoomController.ts
│       └── room.css
└── prototype/               # removable only in a later approved implementation task

tests/
├── tycoon/unit/             # placement, solver, transport, controls, economy, save validation
├── tycoon/contract/         # step API, conservation, determinism, matched-layout fixtures
└── tycoon/browser/          # chosen browser harness after plan review
```

**Structure Decision**: Keep one browser project and introduce a cohesive `src/tycoon` feature boundary. Do not broaden classic `src/types`, systems, scenes, or persistence with incompatible concepts. The existing prototype is an integration reference; replacement/removal is implementation work after approval.

## Requirements and Success Traceability

“Proposed verification” names future evidence; this planning iteration did not execute these tests or benchmarks.

| Requirement | Implementation areas | Proposed verification |
|---|---|---|
| FR-001 | scenario room/access data; placement validator; floor renderer | unit boundary/service-cell cases; browser visible-floor inspection |
| FR-002 | three rack definitions; catalog and rack controls | schema test for distinct required fields; browser catalog/inspection check |
| FR-003 | command reducer; controller; renderer | command tests and mouse/keyboard workflow for place/move/rotate/inspect/remove |
| FR-004 | oriented ports; preview and rack materials/markers | rotation unit tests; visual/browser check for front/rear before and after placement |
| FR-005 | atomic placement result; service-access rules; reason codes; command snapshots | rejection/unchanged-state tests; valid blocked-port impairment case; exact cash undo tests; right-click/keyboard workflow |
| FR-006 | airflow graph, PCG correction, thermal transport | obstruction/orientation/source tests; paired layout transport contract test |
| FR-007 | rack forced link, workload heat, rack definitions | first-law rack test; upstream-load/downstream-temperature comparison |
| FR-008 | cooler command/link/capacity/power and inspection | off/partial/full command, power-limited flow, removal saturation, and energy-cost ledger tests |
| FR-009 | residual/CFL/finite audits, topology remap, atomic step commit | conservation fixtures; no-reset edit test; injected NaN/nonconvergence/unstable-config rejection tests |
| FR-010 | rack control state machine and tunable curves | threshold, hysteresis, 30s recovery, output-reason unit tests |
| FR-011 | selectors, Three overlays, DOM inspection | selector snapshots plus keyboard/color-independent browser checks |
| FR-012 | budget/catalog/integer-mW power allocator/fixed-point economy/ledger | purchase and cap tests; formula/remainder bounds; full tick-by-tick ledger reconciliation |
| FR-013 | contract definition/progress/terminal precedence/result panel | schema test; success/reliability-failure/bankruptcy/final-tick precedence fixtures; browser offer/result check |
| FR-014 | microcent accounts; recorded resale; undo | accounting invariant and repeated buy/remove no-profit property tests |
| FR-015 | fixed-tick engine; pause/speed controller | equal-tick 1×/accelerated comparison; pause/edit state-preservation tests |
| FR-016 | isolated trial clone and projected report | before/after deep-state equality; same-reducer projected ledger; no live/storage mutation tests |
| FR-017 | versioned save envelope/store/errors | round-trip, corruption, unknown-version, quota-error, paused-load tests; classic-key sentinel test |
| FR-018 | keyboard map, DOM semantics/focus, non-color overlays | keyboard-only and mouse-only browser suites; automated contrast plus manual screen-reader review |
| FR-019 | `main.ts` mode router and isolated key namespace | classic route smoke check and classic localStorage sentinel before/after tycoon workflow |
| FR-020 | validated scenario data and limitations/help copy | invalid-definition tests; browser copy check; source scan for embedded balance constants |
| FR-021 | Vitest suites and browser harness | CI commands for unit/contract/browser plus recorded benchmark fixture; evidence pending implementation |
| SC-001 | onboarding/help, catalog, preview, trial control | recorded first-time playtest with elapsed time and observations; target ≤5 minutes, unmeasured |
| SC-002 | matched-layout fixture through actual solver/economy | same-definition good/poor trial reports; assert ≥5°C affected peak difference and greater poor→good profit; calibration pending |
| SC-003 | rack heat and transport | paired upstream idle/load and rotated/separated runs; assert signed temperature changes arise without layout bonus |
| SC-004 | scenario/economy balance data | full-contract good/adverse deterministic reports with affordability and ledger reconciliation; balance pending |
| SC-005 | fixed ticks, stable ordering, integer-mW/milli-service accrual | repeated-run exact/state tolerance test; 1× vs accelerated ≤$0.01 and ≤0.1°C after equal ticks |
| SC-006 | pause/visibility/save store | 30s wall-clock pause assertion; save/load state comparison within 1×10⁻⁹°C and exact integer finance, no offline tick |
| SC-007 | controller/accessibility/resize behavior | mouse-only and keyboard-only browser matrices for every named action; resize state hash unchanged |
| SC-008 | decoupled renderer/engine and pooled visuals | production-build profile on a documented mid-range device at chosen resolution with 24 racks; record fps/input/physics; unmeasured |

## Delivery Sequence and Review Boundaries

After plan approval, task generation should order work by executable risk:

1. Pure scenario schema, placement rules, state/command contracts, and fixtures.
2. Conservative airflow pressure solve, thermal transport, audit failures, and deterministic contract tests.
3. Rack controls, finite cooler, power allocation, service/economy ledger, and full-contract fixtures.
4. Versioned persistence and trial isolation.
5. Three.js rendering/controller integration, overlays, keyboard/mouse access, classic-mode preservation.
6. Browser accessibility workflows, calibration of fictional scenario values, matched-layout acceptance, and measured performance evidence.

This sequence was the approved design guidance. Following explicit user approval, `tasks.md` was generated and implementation proceeded through the sequential Ralph queue; current measured results are in `validation.md`.

## Risks and Open Questions

| Item | Current decision / containment | Required evidence or owner |
|---|---|---|
| Pressure solve may fail or cost too much in dense layouts | Small fixed grid, component validation, deterministic PCG cap, atomic failure; never silently continue | Unit stress fixtures and SC-008 profiling during implementation |
| Height-averaged model omits buoyancy/vertical stratification | State the limitation in UI/docs; do not label as CFD; tune only for understandable relative layout effects | Plan reviewer accepts approximation; playtest confirms predictability |
| Provisional thermal/economic values may not meet SC-002/SC-004 | Keep all values declarative and use matched deterministic fixtures; do not assert outcomes now | Calibration results recorded after implementation |
| Paused topology remap is deliberately simpler than physical equipment displacement | Preserve every still-free cell, remap only newly freed shadow samples, and expose the approximation; prohibit any room-wide reset | Unit/property tests plus playtest for understandable, non-exploitable edits |
| Browser harness is not installed | Do not add a dependency during planning | Plan review selects existing external browser runner or approves a lightweight dev dependency |
| Mid-range test device is not identified | Performance remains an unmeasured target | Reviewer/implementer records device, browser, OS, resolution, build, and measurement method |
| WCAG contrast and first-time comprehension are not measurable in Node tests | Use automated contrast checks plus manual/recorded workflow evidence | Accessibility verification and first-time playtest after integration |

## Complexity Tracking

No constitution violation requires an exception. The simulation adds a small pressure solver because orientation, obstruction, conservation, and downstream exhaust effects cannot be represented by the existing binary duct traversal. The solver remains a pure dependency-free module on a bounded grid and is less complex than CFD.


## Approved player-feedback extension

The user subsequently requested room rotation, accurate mouse rack selection, complete small-screen stats, and mobile/PC usability. This extends the original desktop-only presentation scope. View-only camera orbit/zoom, solid-surface picking, exact label selection, touch placement controls, responsive six-stat header and portrait support are implemented. Headless touch emulation at390×844 and844×390 is recorded in validation; physical-device performance remains unmeasured.
