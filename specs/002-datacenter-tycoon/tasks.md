# Tasks: Datacenter Engineering Tycoon

**Input**: Approved spec.md, plan.md, research.md, data-model.md and contracts/simulation.md.

**Workflow**: Generated after `.specify/scripts/bash/setup-tasks.sh --json` resolved the checked-in task template. User explicitly approved the technical plan.

**Tests**: Required by FR-021 and SC-001–008. Each task includes behavior validation; proposed tests are not completion evidence.

**Execution**: Sequential Ralph stories map one-to-one to the task IDs below. No automatic commits. Dependencies run in listed order.

## T001: Shared foundation and US1: declarative model and placement

- [x] T001 Implement src/tycoon/model/{types,placement,validation}.ts and src/tycoon/data/{scenario-001,loadScenarioDefinition}.ts. Define complete serializable scenario/runtime types matching the reviewed contracts, initial state helper, three rack types and one cooler, rotation/ports/service access, atomic placement validation and thermal remapping helpers. Add meaningful tests in tests/tycoon/unit/model.test.ts.

Acceptance: Invalid definitions (including non-finite/unsafe numbers) rejected; reference definition loads; Placement, rotation, shared service access, blocked ports and obstruction semantics tested; Existing tests and TypeScript build pass.

## T002: US2: spatial forced airflow and heat transport

- [x] T002 Implement src/tycoon/simulation/{AirflowSolver,ThermalTransport,RackControls}.ts against the approved equations and types. Deterministic pressure correction, components, paired fans, finite cooler, conservative donor-cell transport, mixing, thermal controls, audits and power allocation. Add behavioral tests in tests/tycoon/unit/simulation.test.ts.

Acceptance: Directional upstream heating and obstruction change actual cell transport; Closed-component mass balance and thermal energy audits pass with declared tolerances; Finite cooling saturation, zero-flow equipment, recovery and atomic non-finite/CFL failures tested.

## T003: US1 and US3: command engine and profitable operation

- [x] T003 Implement src/tycoon/state/{ScenarioEngine,commands,selectors}.ts and src/tycoon/economy/EconomySystem.ts. Fixed-tick operation, offer acceptance, buy/move/rotate/remove/undo/workload/cooling commands, financial reconciliation, power allocation, delivered-service revenue, terminal settlement/reliability/bankruptcy. Add tests/tycoon/unit/engine.test.ts and economy.test.ts.

Acceptance: Buy/remove cannot create cash; undo exact and clears on resume; Pause and failed commands preserve authoritative state; repeated and accelerated equal-tick operation identical; Integer accrual reconciles electricity, maintenance, rent, revenue, settlement and cash; terminal conditions explained.

## T004: US4 and US5: isolated trials and complete saves

- [x] T004 Implement trials through the same engine and src/tycoon/persistence/TycoonSaveStore.ts; versioned complete schema validation, staging, paused reload, explicit storage failure and classic key isolation. Add tests/tycoon/unit/persistence.test.ts and trials.test.ts.

Acceptance: Live state and storage unchanged by projected trial, including on failure; Complete save/reload round trip preserves thermal/control/financial/time state; no offline earnings; Malformed, incompatible and unavailable/quota storage cases handled without deleting previous save.

## T005: US1 US4 US5: playable 3D tycoon presentation

- [x] T005 Implement src/tycoon/bootstrap.ts, rendering/RoomRenderer.ts, ui/RoomController.ts and ui/room.css; wire src/main.ts default to tycoon retaining classic route. Deliver polished isometric 3D equipment/room, visible intake/exhaust, placement preview and selection, catalog and operation ledger, overlays/inspection, trial reports, save/load, contract result, first-visit help, responsive DOM. All core actions keyboard/mouse, right-click deletes, resize preserves layout and hidden tabs pause. Reuse procedural Three.js ideas from prototype. No external image requirement.

Acceptance: Playable buy/place/orient/operate/diagnose/earn/save loop connected to real engine; Keyboard help lists exact implemented keys, focus visible, DOM controls reachable, numeric diagnostics supplement colors; TypeScript/build and existing tests pass; include UI smoke evidence available locally without claiming unperformed browser tests.

## T006: US2 US3 US4: matched-layout acceptance and calibration

- [x] T006 Add tests/tycoon/fixtures and tests/tycoon/acceptance/layouts.test.ts with identical inventory/air/workload/tariff/duration good-vs-poor layouts. Calibrate only declarative fictional data if needed; fix actual model defects with evidence. Record exact layouts and results in specs/002-datacenter-tycoon/validation.md, include affordable player build instructions.

Acceptance: Good layout lowers affected peak intake by at least 5 C and produces higher operating profit using actual transport; Document affordable profitable complete-contract layout and adverse layout effects; Workload, orientation, equal-tick speed, pause/trial/save behaviors pass meaningful tests; full suite and production build pass.

## T007: US5: browser workflow and final verification

- [x] T007 Use available browser tooling or install a minimal development browser harness if needed. Verify and fix rendered desktop UI and keyboard/mouse workflows, right-click removal/undo, overlay/trial/operation/save/resize, classic access. Record tested environment and performance profile up to 24 racks in specs/002-datacenter-tycoon/validation.md. Update README with gameplay instructions. Do not claim a real first-time human playtest or midrange-device result without actual evidence.

Acceptance: Browser workflows actually exercised and screenshots inspected; failures fixed; Performance numbers identify actual environment and limitations; unmeasured targets explicitly pending; Full npm test and npm run build pass; tasks/progress accurately reflect implementation and remaining human evidence.

## Delivery checkpoints

T001 establishes domain types; T002 makes layout physically meaningful; T003 completes the pure operating loop; T004 adds comparison/persistence; T005 makes it playable; T006 proves thermal/economic benefit; T007 verifies browser delivery.

User-story coverage: US1 T001/T003/T005; US2 T002/T006; US3 T003/T006; US4 T004/T005/T006; US5 T004/T005/T007. FR/SC details remain in the plan and review matrices.

A real first-time-player SC-001 observation and the specific mid-range-device SC-008 target must remain pending if unavailable. This does not prevent implementing or measuring the feature on available hardware.

- [x] Integration correction: losslessly encode large complete saves after actual Chromium quota failure; verify full-contract double save/reload and legacy compatibility. Final111 tests and production build pass.

## Player feedback: camera, selection and mobile layout
User requested room rotation, reliable rack selection, all stats on smaller screens, and mobile/PC usability. Extend the approved UI slice with view-only orbit/zoom controls and middle-drag/Q/E, solid-only picking and explicit rack-label selection, floor-only destination picking, responsive six-stat header, touch-sized controls and scrollable mobile panels. Verify camera changes preserve saved layout and exercise desktop/mobile browser workflows. This supersedes the original desktop-only presentation scope; physical mobile device performance remains separately unmeasured.

- [x] T008 Review player-feedback camera, selection and mobile layout fixes. Inspect RoomRenderer, RoomController, bootstrap, room.css and room-design browser coverage; report concrete findings for root without editing application files or claiming unexecuted browser results.

Acceptance: Review camera controls, solid-only ray picking, label interactions and responsive stats/touch layout; record concrete findings for root while preserving concurrent changes. Review completion is not final browser acceptance.

- [x] Player-feedback camera/selection/mobile extension implemented and reviewed by Ralph T008; targeted desktop/touch browser cases pass.

## Player feedback: airflow visibility

Use larger filled, dark-outlined flow arrows; blue intake/supply and red exhaust/return equipment markers stay visible during planning and rotate with equipment. Floor arrows reflect simulated local flow and temperature. Update legend/help, preserve picking and mechanics, inspect Room/Plan/mobile views. Ralph T009 reviews semantics.

- [x] T009 Review airflow visibility and blue/red direction markers. Inspect `FlowArrow.ts`, `RoomRenderer`, legend/help, rotation semantics, picking isolation, and root browser evidence without editing application files.

Acceptance: Confirm rack blue intake points in and red exhaust points out; cooler red return points in and blue supply points out for all rotations; verify marker geometry/colors and presentation-only behavior; record concrete findings while preserving concurrent implementation.

- [x] Airflow visibility feedback: filled outlined flow arrows, blue/red equipment directions, Plan label clearance and hide/show control; visual review and picking/build checks passed.
