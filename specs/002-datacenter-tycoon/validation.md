# Implementation validation

This is measured implementation evidence, separate from proposed checks in the plan. Automated browser delivery has been exercised; the first-time human playtest and a hardware-accelerated reference-device result remain pending and are not claimed.

## Matched full-contract benchmark

The current spatial and economic engine ran both layouts for 6,000 fixed 100ms ticks (600 simulated seconds). Each uses two 80kW floor coolers and four Dense racks, the same initial 21°C air, 120kW power limit, tariffs, workload, contract, and $150,000 startup budget. Equipment purchases total $122,000. No layout bonus was used.

| Outcome | Good cold row | Exhaust-to-intake chain |
|---|---:|---:|
| Peak rack intake | 21.00°C | 32.95°C |
| Operating revenue | $3,120.00 | $2,098.74 |
| Shortfall settlement | $0.00 | −$901.26 |
| Operating profit | $2,898.25 | $975.98 |
| Final available cash | $30,898.25 | $28,975.98 |
| Reliability | 100% | 0.35% |
| Contract outcome | Succeeded | Failed |

Actual full-precision measurements and exact placements are in [benchmarks/initial-contract.json](./benchmarks/initial-contract.json). Permanent behavioral assertions are in `tests/tycoon/acceptance/layouts.test.ts`; their execution status is recorded in Ralph progress. Values are fictional game economics, not facility estimates. Profit excludes capital purchases, which are reflected separately in available cash.

The built-in `good-layout` and `poor-layout` trial fixtures now use these exact measured placements, stable equipment IDs, full workload/cooling, and the complete 600,000ms contract duration. The acceptance regression checks them against `tests/tycoon/fixtures/matchedLayouts.ts` so the playable trial buttons cannot silently drift back to draft examples.

### Reproduce the affordable winning layout

Coordinates are **zero-based (x,y)** floor-cell anchors. Purchase two coolers and four Dense racks. Place coolers at (1,2) and (11,2), both facing east. Place north-facing racks at (2,3), (4,3), (7,3), and (9,3). This leaves the room's fixed columns clear and feeds rack fronts from the cold side. Run all at full workload/cooling. The adverse comparison uses the same coolers and north-facing racks stacked at (7,1), (7,3), (7,5), and (7,7).

## Performance investigation

Before optimization, successive 500-tick blocks slowed from 4.2 to 7.9 to 10.3 seconds because the engine repeatedly deep-copied the full ledger. Copying immutable historical entries by reference internally, while retaining detached public snapshots, reduced those blocks to approximately 2.59, 2.46 and 2.47 seconds with identical financial results. A regression checks snapshot isolation.

These Node timing probes are not SC-008 browser frame/input measurements. Full trials must yield or run in a worker; a synchronous 600-second trial takes tens of seconds on this host.

On 2026-09-13, a separate 24-rack engine profile ran 20 warm-up ticks followed by 500 individually timed fixed ticks through the real `ScenarioEngine`. The measured wall time was 2,521.00ms; per-tick median was 5.217ms, p95 5.818ms, and maximum 14.661ms. The environment was Omarchy 4.0.2 (Arch Linux), Linux 7.1.9, Node 26.7.0, and an Intel Core i5-10300H (4 cores/8 threads). The exact invocation was `node_modules/.bin/vite-node --root / /tmp/hot-isle-24-rack-profile.ts`.

That probe measures synchronous simulation cost only. It does not measure WebGL presentation, frame pacing, or end-to-end browser input latency and is not evidence that the named SC-008 60fps/100ms targets pass. No reference midrange device or protocol has been approved, so that target remains pending.

### 24-rack browser profile

The T007 Playwright profile mounted the production `RoomRenderer`, `RoomController`, and `ScenarioEngine` with 24 valid Economy racks in alternating rows. It ran at 1440×1000, device pixel ratio 1, using a Vite development server and headless Chromium 151 with software SwiftShader on Omarchy 4.0.2 / Linux 7.1.9, Intel i5-10300H, and 16GB RAM. Static shadow maps were updated only after layout/preview/selection changes, and world-label layout reads were batched before the final measurement.

| Measurement | Median | p95 | Maximum |
|---|---:|---:|---:|
| `requestAnimationFrame` interval | 183.3ms (5.46fps) | 216.6ms | 233.3ms |
| Capture-phase overlay keydown to next rAF callback | 32.9ms | 46.9ms | 46.9ms |
| Fixed simulation tick | 2.1ms | 2.4ms | 2.8ms |

The profile test passed its collection and under-100ms callback/physics assertions in 50.7 seconds. Exact machine-readable results are in [benchmarks/browser-profile.json](./benchmarks/browser-profile.json). The five-second rAF sample uses browser callbacks; the input measurement ends at the next callback and is not physical display latency. Software rendering did **not** meet the 60fps target. Hardware-accelerated production rendering on an identified midrange reference device is unmeasured, so SC-008 is not claimed as passed.

## Browser checks

- Playwright classic campaign smoke test passed and preserved classic progress.
- The procedural renderer was inspected in Chromium at 1440×1000 and 900×850 using fixture temperatures; these screenshots are visual checks, not simulation evidence.
- T005 adds local smoke contracts in `tests/tycoon/unit/ui-state.test.ts` and `ui-shell.test.ts`. They verify bounded cursor movement, distinct purchase/move previews, clockwise orientation, all overlay states, exact help-key parity, semantic DOM controls, numeric diagnostic roles, save/load/trial controls, live-region status, disclaimer, and the classic link. The focused run passed 5/5 and the complete Vitest run passed 110/110.
- The T005 production build emitted separate default tycoon, trial-worker, and classic campaign bundles. Browser surfaces were unavailable inside the implementation sandbox and its direct headless Chromium launch exited with SIGTRAP; no result is inferred from that failed attempt.
- A concurrent supervising session did complete an actual integrated Chromium smoke at 1440×1000: first-visit help rendered; contract acceptance worked; a Dense rack was selected, rotated and placed by keyboard; Escape/Space selected it; Delete sold it; Ctrl+Z restored it with exact $132,000 cash; local save succeeded; screenshots were inspected; and no page errors were reported. Evidence is in `.ralph/ui-smoke.mjs`, `.ralph/tycoon-first-screen.png`, and `.ralph/tycoon-planning.png`.
- The existing Playwright integrated suite subsequently passed 3/3 in 1.2 minutes on actual Chromium. It covers keyboard placement/move/rotate, right-click sale and exact undo, paused save reload, repeated slider keyboard input, help focus containment/Escape, trial cancellation/completion, and complete live-save isolation. Evidence is `.ralph/ui-acceptance-fixed.log`.
- The screenshots above were re-inspected during T007. The 1440×1000 first-visit dialog and planning room are legible with visible focus, numeric KPI/diagnostic text, front/rear markers, and a usable room/panel split. The earlier 900×850 renderer check also keeps equipment and labels visible, but it is not an integrated responsive-workflow result.
- T007 added `tests/browser/tycoon-final.spec.ts` for operation/speed/pause, overlay cycling, save stability across 900×850 and 1440×1000 resize, visible quota-write failure, primary-action hover contrast, and navigation through the classic link. It also added `tests/browser/performance.spec.ts` for the 24-rack profile above. The final gameplay sweep passed 8/8 in 1.1 minutes on actual headless Chromium; `.ralph/gameplay-final.log` records the run, including the existing placement/right-click/undo, save/reload, focus, trial-worker, and classic-isolation cases.
- Responsive and desktop screenshots are retained under `.ralph/browser-final-evidence/`. Inspection confirmed that the 900×850 room/cursor/temperature labels remain visible, the side panel scrolls without overlapping the stage, and numeric airflow/status text remains readable. The 24-rack screenshot shows the dense 3D room, intake values and warnings, and numeric airflow diagnostics. Its inspection exposed a low-contrast hovered operation button; the CSS fix preserves dark text on a light background and the final browser sweep verified the computed colors.
- The nested implementation sandbox itself denied Playwright loopback access and browser socket operations. Browser execution and screenshot capture therefore ran in the supervising browser-capable session; the failed sandbox launches are not product results.
- SC-001 requires an actual first-time-player observation; this has not been performed.


## Completed-contract save capacity

A final real-browser check exposed a defect missed by short saves: the good layout produced 30,006 ledger rows and a 5,299,471-character envelope, which Chromium rejected with QuotaExceededError. Lossless storage compression reduced it to 256,904 characters. Actual Chromium then successfully saved, overwrote, and loaded the complete state with exact JSON equality. Evidence: [benchmarks/full-save.json](./benchmarks/full-save.json). The matched-layout acceptance test now saves both complete contracts twice through a 5 MiB quota adapter and checks exact restored state; codec tests cover Unicode, legacy JSON, and corruption.

Final gates after the save correction: **111/111 tests across17 files passed** (23.61s); TypeScript and Vite production build passed (4.72s); `git diff --check` clean. The eight browser workflow cases passed before this isolated codec correction; actual completed-contract browser save/overwrite/reload then passed against the final codec. The separate24-rack performance collection is reported above and does not certify60fps.


## Camera, selection and mobile feedback

Ralph T008 reviewed the changes and root addressed the reported touch-target/coverage gaps. `room-design.spec.ts` passed2/2 in49.1s: direct rack-body picking, exact label selection through four orbit steps, Q/E, middle drag, wheel/button zoom, plan view, camera-only save equality, rack movement and right-click label removal; touch building/selection/rotation/save at390×844 and six-stat containment/no horizontal overflow in portrait and844×390 landscape. The old portrait warning no longer blocks tycoon input. Existing keyboard/right-click/undo/reload and slider/help browser cases passed during this change. Full unit/contract suite111/111 and production build passed. Browser checks use Chromium151 with touch emulation; real mobile hardware is not certified.


## Airflow visibility feedback

Replaced thin line arrows with filled outlined meshes, added always-visible blue/red directional roof markers and brighter matching port strips, and updated legend/help. Markers are excluded from equipment picking. Plan labels now sit outside roof bounds; a label toggle clears crowded/mobile views. Real Chromium screenshots of the40-second adverse layout were inspected in Room, Plan and390×844 mobile views (`.ralph/air-review.mjs`); hide/show assertions passed. Existing orbit/picking/movement/browser regression passed1/1(38.3s), focused UI tests5/5 passed, and final production build passed(5.30s). Ralph T009 confirmed all four orientation mappings and no simulation coupling; its label-overlap finding is resolved by the Plan offset and label toggle. No physics or economic rules changed.
