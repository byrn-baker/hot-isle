# Feature Specification: Datacenter Engineering Tycoon

**Feature Branch**: `002-datacenter-tycoon`
**Created**: 2026-09-13
**Status**: Approved for planning — user requested installation and starting work on 2026-09-13
**Input**: User requests a design-engineering tycoon: arrange racks into effective hot/cold aisles, use forced room airflow rather than pipe connections, account for exhaust heating downstream equipment and different equipment heat loads, and earn money through efficient use of limited floor space. User explicitly requests Spec Kit and Ralph loops.

## Product Direction

Design and operate a profitable small datacenter. Rack orientation, cooling placement, obstructions, workload, and density determine intake conditions and reliable computing output. Revenue must depend on delivered service; extra equipment that cannot be cooled or powered must not generate free profit.

The primary milestone is an evidence-backed comparison: **a well-designed layout earns more than a poorly designed layout using the same equipment and workload over the same simulated period**.

This is a new feature, not an extension of the duct-placement rules. The existing 3D duct room is a presentation/input experiment, not an implementation of room airflow or the tycoon economy. The classic campaign remains available with its existing progress intact.

## User Scenarios & Testing

### User Story 1 — Arrange a working room (Priority: P1)

As a player, I buy, place, move, rotate, inspect, and remove equipment to design hot/cold aisles inside a small leased room.

**Why this priority**: Layout is the player's primary decision and must be understandable before economics or simulation are added.

**Independent Test**: In a paused room, use mouse and keyboard separately to create a valid layout, move an existing rack, rotate it, reject an invalid placement, remove it, and undo. Verify costs, occupancy, and intake/exhaust indicators throughout.

**Acceptance Scenarios**:
1. **Given** a paused room and sufficient funds, **when** a rack is placed, **then** its footprint is occupied, its listed purchase cost is deducted once, and its front intake and rear exhaust are visible.
2. **Given** a placement preview, **when** the player rotates it, **then** the preview and intake/exhaust indicators rotate together before purchase.
3. **Given** occupied floor, a wall, insufficient funds, or blocked required service access, **when** the player attempts placement, **then** placement is rejected with a reason and no money or equipment is lost.
4. **Given** an owned rack, **when** the player moves or rotates it during planning, **then** no second purchase is charged and the original placement remains intact until the destination is valid.
5. **Given** a placed item, **when** the player right-clicks it, **then** it is removed with the displayed resale refund; undo restores the item and the exact prior cash balance. Empty-floor right-click changes nothing.

### User Story 2 — Engineer hot and cold aisles (Priority: P1)

As a player, I test my arrangement and diagnose how cool supply air, hot exhaust, equipment fans, and obstructions interact.

**Why this priority**: Room airflow is the defining mechanic. A tycoon built on a binary connected/not-connected cooling rule would not satisfy the feature.

**Independent Test**: Run matched layouts with identical inventory and workload. In one, rack fronts share cool supply and exhaust is separated. In the other, an upstream exhaust faces another rack's intake. Compare intake temperature, airflow, and useful output under a declared test configuration.

**Acceptance Scenarios**:
1. **Given** a working rack under load, **when** air passes through its intake and exits the rear, **then** the rack adds workload-dependent heat to that exhaust.
2. **Given** downstream intake exposed to upstream hot exhaust, **when** the upstream workload increases, **then** the downstream intake becomes hotter than the same test with that upstream rack idle, all other conditions equal.
3. **Given** an exhaust-facing-intake layout, **when** the player separates the exhaust from the cold aisle through valid rearrangement, **then** the reference comparison shows lower affected intake temperature and improved service output.
4. **Given** a cooler, **when** the heat load exceeds its rated removal capacity, **then** it cannot maintain its target supply temperature indefinitely; its limit is visible.
5. **Given** a rack with blocked intake or inadequate airflow, **when** the room runs, **then** its cooling is impaired even if a nearby area is cold.
6. **Given** a running room, **when** the player pauses, **then** airflow evolution, temperatures, workload progression, and finances all stop advancing.

### User Story 3 — Operate profitably under a contract (Priority: P1)

As a player, I balance equipment density, reliable capacity, electricity, cooling, and other costs to fulfill a customer contract and earn a profit.

**Why this priority**: Makes layout decisions economically meaningful and establishes the first complete tycoon loop.

**Independent Test**: Use the same purchased inventory and contract in good and poor layouts for a complete contract period. Reconcile revenue, every operating-cost category, service shortfall, and closing cash.

**Acceptance Scenarios**:
1. **Given** a contract offer, **when** the player inspects it, **then** required delivered capacity, duration, reliability target, revenue terms, and shortfall consequences are visible before acceptance.
2. **Given** operating equipment, **when** simulated time advances, **then** revenue reflects delivered service and costs include IT electricity, cooling electricity, rent, and declared maintenance overhead.
3. **Given** overheating equipment, **when** its configured limits are crossed, **then** output throttles and may shut down, reducing delivered service; idle, throttled, or failed equipment never receives full-service revenue.
4. **Given** total electrical demand above the room limit, **when** the room operates, **then** a documented, deterministic power-limiting policy constrains output and explains the affected equipment; excess capacity does not operate for free.
5. **Given** a completed contract period, **when** results appear, **then** the player can see delivered service, reliability, revenue, cost breakdown, net operating profit, and final cash.
6. **Given** depleted funds or contract failure, **when** the scenario ends, **then** the cause is explained and the player can restart the scenario without affecting classic campaign progress.

### User Story 4 — Diagnose, compare, and revise (Priority: P2)

As a player, I use temperature, airflow, and financial views to understand a problem and assess whether a revision improves it.

**Why this priority**: Players need explanations and comparisons to engineer deliberately instead of guessing.

**Independent Test**: Diagnose an intentionally poor layout using overlays and rack inspection, revise it, and compare two explicit trial reports under equal conditions.

**Acceptance Scenarios**:
1. **Given** a hot rack, **when** selected, **then** inspection shows intake temperature, exhaust temperature, actual airflow, workload, useful output, power demand, and an evidence-based explanation of any impairment.
2. **Given** airflow or temperature overlays, **when** color is unavailable, **then** arrows, numeric readings, and text still communicate direction and danger.
3. **Given** a paused operating scenario, **when** resumed after a layout edit, **then** accumulated time, thermal state, cash, and contract progress are preserved; pausing cannot erase heat or debt.
4. **Given** a saved design, **when** an explicit non-economic trial is run, **then** its report is labeled as a trial and does not credit money or contract progress. Matched trials may reset to the same stated initial conditions.
5. **Given** 1× and accelerated operation, **when** both advance by the same simulated duration, **then** their outcomes agree within declared numerical tolerance.

### User Story 5 — Learn and resume (Priority: P2)

As a new player, I learn rack orientation and aisle separation before handling financial pressure, then resume my room later.

**Why this priority**: Prevents repeating the original game's unexplained controls and abrupt difficulty.

**Independent Test**: Follow onboarding using only the keyboard, save a partially operated scenario, reload, and verify the room and its finances resume paused without advancing offline.

**Acceptance Scenarios**:
1. **Given** a first visit, **when** the room loads, **then** instructions explain placement, rotation, right-click removal, keyboard equivalents, pausing, hot/cold aisles, and the scenario goal before time starts.
2. **Given** a saved room, **when** reloaded, **then** layout, equipment settings, cash, time, thermal state, and contract progress are restored consistently in a paused state.
3. **Given** unavailable or invalid local saved data, **when** loading or saving fails, **then** the player receives an actionable message and no existing classic progress is overwritten.
4. **Given** a browser resize or hidden tab, **when** the player returns, **then** the layout is preserved and no unannounced simulation-time jump occurs.

### Edge Cases

- Exhaust returns to the same rack's intake; several racks compete for a limited cool-air supply.
- A cooler draws its own supply back without cooling racks; multiple cooler streams interact.
- A room has no cooler, no racks, blocked access, or dense equipment obstructing circulation.
- Idle racks, heterogeneous workloads, thermal shutdown and recovery, and cooling capacity saturation.
- Adjacent rotation changes flow without moving equipment; placement and input cannot penetrate walls or equipment.
- Repeated undo/removal, removal followed by repurchase, rejected moves, or editing while running must not duplicate money or objects.
- Bankruptcy, insufficient contract capacity, power overload, pause/resume, fast-forward, and explicit trial resets.
- Corrupt/version-mismatched saves, storage quota failure, refresh during operation, and display resize.

## Requirements

### Functional Requirements

- **FR-001**: Provide one bounded leased room with visible usable floor space and required service access.
- **FR-002**: Provide at least three rack types with distinct purchase cost, useful capacity, electrical demand, fan capability, and thermal behavior.
- **FR-003**: Allow players to place, move, rotate, inspect, and remove racks and cooling equipment during paused planning.
- **FR-004**: Display rack intake and exhaust sides in both previews and placed equipment. Support hot/cold aisle layouts without player-drawn rack ducts.
- **FR-005**: Reject invalid placements atomically and explain their cause; right-click removal and keyboard deletion must be undoable with consistent financial effects.
- **FR-006**: Model spatial air movement and heat transport; equipment orientation, obstructions, and source/sink locations must affect results. Distance-only cooling bonuses and binary duct connectivity do not satisfy this requirement.
- **FR-007**: Each rack must take in local air, transfer it toward its exhaust, and contribute workload-dependent heat. Different rack/workload combinations must have observable thermal consequences.
- **FR-008**: Cooling equipment must have finite airflow and heat-removal capacity and a corresponding operating-energy cost. Supply/return behavior must be explicit.
- **FR-009**: Conserve or account for air and thermal transfers within the model's declared approximation and tolerances; reject non-finite or unstable simulation state rather than silently producing arbitrary results.
- **FR-010**: Provide documented, tunable rack throttling, shutdown, and recovery behavior derived from observable conditions.
- **FR-011**: Provide inspection and overlays for intake/exhaust temperature, airflow direction, insufficient flow, capacity limits, and affected equipment.
- **FR-012**: Provide a finite startup budget, itemized purchases/resale, room power limit, ongoing electricity/cooling/rent/maintenance costs, and delivered-service revenue.
- **FR-013**: Provide one customer contract with visible terms, a finite operating period, a reliability target, and an explained success/failure result.
- **FR-014**: Account for revenue, operating profit, and available cash separately. Equipment resale cannot create profit through repeated purchase/removal.
- **FR-015**: Provide pause, resume, and simulation-speed controls with consistent outcomes for equal simulated time. Ordinary planning edits must not reset heat, debt, or contract history.
- **FR-016**: Provide isolated, explicitly labeled design trials for fair comparisons; trials cannot earn money or affect contract progress.
- **FR-017**: Save and restore the complete scenario locally, with explicit failure handling, paused reload, and separation from classic campaign data.
- **FR-018**: All core actions and views must support keyboard and mouse, including visible keyboard help, focus indication, and numeric/text alternatives to color.
- **FR-019**: Preserve existing campaign access and progress. Existing 3D duct-room code is a reference, not proof that these requirements are implemented.
- **FR-020**: Keep scenarios and equipment definitions data-driven; declare model limitations and tunable parameters. Never present the simulation as a real-facility design or safety certification tool.
- **FR-021**: Provide automated behavioral acceptance tests for airflow, heat, economic bookkeeping, simulation-time consistency, saving, and the matched-layout milestone, plus browser checks for interactive workflows.

### Key Entities

- **Room**: usable footprint, physical boundaries, access constraints, power capacity, rent, and starting conditions.
- **Equipment Definition**: footprint, orientation semantics, price/resale terms, performance curves, thermal limits, and service requirements.
- **Equipment Instance**: placement, orientation, settings, workload, operating state, and current thermal/flow measurements.
- **Air State**: spatial airflow, heat distribution, boundaries, and accounted sources/sinks.
- **Contract**: required service, duration, reliability target, payments, and shortfall terms.
- **Ledger**: timed purchases, sales, operating costs, earned revenue, and resulting cash balance.
- **Scenario State**: layout, equipment, simulation time, air state, ledger, contract, and pause/speed settings.
- **Trial Report**: initial conditions, design identity, equipment inventory, duration, performance, energy, and comparison outcomes.

## Success Criteria

- **SC-001**: A new player can buy a rack, identify its front/back, rotate it, and start a room test within five minutes using in-game instructions; validate with a recorded first-time playtest.
- **SC-002**: In a declared matched-layout benchmark using identical equipment, starting air conditions, contract, workload schedule, tariffs, and duration, the good layout achieves at least 5°C lower affected peak intake temperature and greater net operating profit than the poor layout. No layout-quality bonus may directly influence the simulation or economy.
- **SC-003**: In a paired workload test, increasing upstream heat load measurably increases downstream intake temperature; rotating/separating that exhaust reduces the effect. The comparison must follow actual transport rather than a scripted rack penalty.
- **SC-004**: A complete contract can be fulfilled profitably with at least one documented, affordable layout. A documented adverse layout must exhibit explained service or profitability degradation.
- **SC-005**: Repeat runs with the same scenario and inputs reproduce the same outputs within declared numerical tolerance. At 1× and accelerated speed, ledger totals differ by no more than one currency cent and temperatures by no more than 0.1°C after equal simulated durations.
- **SC-006**: A 30-second pause changes no simulation or financial state; save/reload reproduces those states within serialization tolerance, with no offline earnings.
- **SC-007**: Mouse and keyboard-only browser checks cover placement, movement, rotation, removal, undo, inspection, overlays, pause, and trial/operation controls without losing layout on resize.
- **SC-008**: The one-room reference scenario with up to 24 racks remains responsive on a documented mid-range test device, targeting 60fps presentation and input feedback within 100ms. Record device, resolution, rack count, and measured results; do not label an unmeasured target as passed.

## Assumptions and Scope Boundaries

- Initial release is a single-player, local browser game with a 3D room and a planning view. No backend or accounts are required for this slice.
- First slice includes one room, three rack types, one cooling-unit type, and one contract. Property expansion, employees, multiplayer, financial markets, advanced containment products, liquid cooling, and stochastic equipment failures are deferred.
- The reference datacenter uses front-to-back air-cooled racks. Other real-world arrangements can be introduced later.
- Airflow is an approximate, deterministic game simulation. Exact engineering-grade CFD and real-facility certification are out of scope. Solver choice, dimensionality, stability limits, and energy/flow tolerances belong in the technical plan and must be justified against the acceptance tests.
- Thermal and monetary values are fictional, configurable game balance values. Startup budget, prices, cooling curves, power policy, and contract terms will be explicit scenario data; they must support the success criteria rather than arbitrary initial guesses.
- Operating time advances only while running. Building pauses the simulation but retains its state. Explicit comparison trials are separate and non-economic.
- Draft financial default: placement buys equipment, moving/rotation is free, removal sells at a displayed depreciated value, and a planning-session undo restores the prior transaction exactly. Undo history ends when operation resumes.
- Mouse/keyboard on desktop is the primary interaction target. Responsive views and basic touch operation remain desirable, but physical-device mobile parity is not the first milestone.

## Constitution Review

The feature retains Game-First Design, Simulation Integrity, lightweight browser delivery, accessibility, independent testability, separation of rendering and mechanics, and declarative scenario data. The constitution's original duct-piece/time-pressure examples describe the old campaign; the new progression teaches orientation, recirculation, and business constraints. Whether to generalize that wording should be documented during the constitution check at planning, not silently rewritten here.

## Review Gate

Pending user specification review under `.specify/workflows/speckit/workflow.yml` (`review-spec`). Technical planning, task generation, and Ralph implementation are not marked approved or started. After spec approval: plan/research/data model → plan review → tasks → bounded Ralph implementation iterations → final acceptance review.
