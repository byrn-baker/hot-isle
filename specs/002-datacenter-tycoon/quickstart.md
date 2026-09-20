# Quickstart: Review and Future Implementation

## Current gate

This package is ready for technical plan review, not implementation. The specification was approved by the user's request to begin work; the plan has not yet been approved. Do not create `tasks.md`, edit application code or dependencies, or begin a Ralph implementation loop until the `review-plan` gate is explicitly approved.

## Review the design

Read in this order:

1. [spec.md](./spec.md) for required behavior and acceptance thresholds.
2. [plan.md](./plan.md) for architecture, integration seams, constitution check, traceability, risks, and delivery order.
3. [research.md](./research.md) for decisions, rejected alternatives, limitations, and genuine unknowns.
4. [data-model.md](./data-model.md) for definitions, runtime/save state, money/time precision, and transitions.
5. [contracts/simulation.md](./contracts/simulation.md) for normative stepping order, units, equations, failure behavior, and test fixtures.
6. [analysis.md](./analysis.md) for inspected local evidence and claims deliberately not made.

The key review decisions are:

- Accept the deterministic height-averaged finite-volume approximation as the gameplay model, explicitly not CFD.
- Confirm the cooling-first/proportional-racks power policy, commanded cooler curve, and per-rack thermal control shape.
- Confirm separate Three.js tycoon modules while retaining `?mode=classic` and classic persistence unchanged.
- Select or authorize a browser workflow harness; none is currently declared in `package.json`.
- Identify the device/profile protocol that will produce SC-008 evidence.
- Accept that economic and thermal constants remain declarative and pending measured calibration, not silently treated as proven.

## Model at a glance

- Geometry: 1m × 1m floor cells, 3m effective height, four-neighbor free-air faces.
- Airflow: rack front→rear and cooler return→supply forced links plus a pressure-correction passive field through open cells.
- Boundaries: closed adiabatic walls; equipment/obstacles block cells; blocked ports are valid impaired layouts while footprint/service-access conflicts reject placement; configured envelope watts are the only wall-load approximation.
- Heat: conservative upwind sensible-energy transfer, rack electrical heat at exhaust, finite cooler removal.
- Time: fixed 100ms physics ticks at every speed; pause/hidden tab advances zero ticks.
- Safety: outgoing-volume fraction ≤0.45; flow residual ≤1×10⁻⁸m³/s per cell; whole-room energy residual ≤`max(0.01J, 1e-9 relative)`; failed ticks do not commit.
- Economy: integer microcents fed by integer milliwatts and milli-service-units, explicit carried-remainder formulas, delivered-service revenue, separate IT/cooling/rent/maintenance costs, and deterministic room power limiting.
- Saves: complete, versioned `hici-tycoon-save-v1` state; reload paused; no offline progress; classic keys untouched.

All physical and financial values are fictional game parameters. The model must be described in-product as approximate and unsuitable for real-facility design or safety decisions.

## Future implementation workflow (only after plan approval)

Generate `tasks.md` from the reviewed artifacts, keeping acceptance evidence as explicit tasks. The intended task order is pure model/schema → solver/transport → controls/economy → save/trials → Three.js/DOM integration → browser/accessibility/calibration/performance evidence.

The repository's existing commands expected for implementation verification are:

```bash
npm test
npm run build
npm run dev
```

These commands are listed for the future workflow; this planning iteration did not run them and does not claim they pass. Browser-test commands must be added to this guide only after the plan-reviewed harness choice.

## Proposed unit and contract verification

After implementation, run focused tests for:

- rotated footprint/port/service-cell placement and atomic rejection;
- pressure solve residual, obstruction effects, paired source balance, and nonconvergence;
- outgoing-volume/CFL and energy audits with atomic rollback;
- finite rack/cooler heat transfer, blocked ports, cooler command/power scaling, and capacity saturation;
- throttling, shutdown, recovery hysteresis, and visible reason ordering;
- integer-milliwatt power allocation, fixed-point service/rate accrual, terminal precedence, ledger reconciliation, and resale/undo invariants;
- pause/equal-tick speed determinism and trial isolation;
- save round-trip/corruption/quota/unknown version and classic-key sentinels;
- matched transport, good/poor layout, and full-contract fixtures.

Test outputs become evidence only once recorded. Tune only declarative scenario data when calibrating SC-002/SC-004; never add a layout-name bonus or branch in the solver/economy.

## Proposed browser acceptance walkthrough

Use a production build and record browser, OS, device, viewport, build revision, scenario revision, and input method.

1. Clear only the tycoon save key; leave classic key sentinels intact.
2. Confirm first-visit help appears paused and explains front/back, rotate, right-click, keyboard equivalents, overlays, pause, and goal.
3. With mouse only, buy/place a rack, rotate preview, reject overlap/access blockage without charge, move it without repurchase, inspect it, right-click remove, and undo exact cash.
4. Repeat every core action keyboard-only with visible focus; verify text/numbers/arrows communicate without relying on color.
5. Accept the visible contract, create a known layout, run/pause, inspect rack and cooler limits, resume without resetting heat/cash/time, and reconcile result categories.
6. Run the declared non-economic matched trials, confirm their monetary results are labeled projected, and confirm live cash/contract/save state does not change.
7. Save mid-operation, reload, confirm paused state and equal thermal/economic fields, wait 30 wall-clock seconds, and confirm no state advancement.
8. Resize and background/restore the tab; confirm layout remains and no catch-up ticks occur.
9. Open `?mode=classic`, confirm campaign access, then verify classic localStorage sentinels are byte-for-byte unchanged.

SC-001 needs a first-time participant rather than a developer already familiar with controls. Record time-to-buy/orient/test and observations; do not mark it passed from a scripted developer run alone.

## Proposed matched-layout evidence

Both reports must print scenario/revision, layout hash, identical inventory hash, initial-condition hash, workload, tariffs, contract, tick count, solver parameters, diagnostics, affected rack peak intake temperature, service, energy, revenue/cost projection, and net operating profit projection. The acceptance assertion is good-layout affected peak at least 5°C lower and good-layout net operating profit greater. If it fails, report the actual values and tune declared data/model parameters with rationale; do not fabricate or round across the threshold.

## Proposed performance evidence

Use the one-room reference scenario with 24 racks in the production build. Record device CPU/GPU/RAM (as available), OS/browser, viewport/resolution, pixel ratio, duration, renderer settings, simulation speed, frame-time distribution, physics-step time, and measured input-to-visible-feedback method. SC-008 targets 60fps and under 100ms feedback; until those measurements exist, status is **pending**, not pass.

## Save recovery expectations

- Missing save: offer a fresh scenario; this is not an error.
- Invalid or unsupported save: retain raw stored data, show the specific problem and offer restart/export/removal choices; do not silently overwrite.
- Storage unavailable/quota exceeded: retain the current in-memory scenario, show that saving failed and suggest freeing site storage/exporting; do not claim success.
- Successful load: restore the complete committed simulation/economy state, force paused planning, and ignore elapsed wall time.
- No tycoon save path may read, write, clear, or migrate `hici-progress`, `hici-custom-levels`, or `hici-difficulty`.
