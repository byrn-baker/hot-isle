# Tasks: Hot Isle Cold Isle

**Input**: Design documents from `specs/001-hot-isle-cold-isle/`

**Prerequisites**: plan.md, spec.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, and base configuration

- [x] T001 Initialize project with `npm create vite@latest . -- --template vanilla-ts`, install Phaser 3 and Vitest
- [x] T002 Configure `tsconfig.json` with strict mode, path aliases (`@/systems`, `@/scenes`, etc.)
- [x] T003 [P] Configure `vite.config.ts` with asset handling and build output
- [x] T004 [P] Configure `vitest.config.ts` for unit tests
- [x] T005 [P] Create `src/types/index.ts` with all shared interfaces (GridCell, ServerRack, ColdSource, DuctTile, LevelConfig, PlayerProgress, CustomLevelStore)
- [x] T006 [P] Create `src/utils/constants.ts` with game-wide constants (default heat rate, tick interval, grid cell size, colors)
- [x] T007 Create `src/main.ts` with Phaser game config (Scale Manager set to FIT, responsive, WebGL with Canvas fallback)
- [x] T008 [P] Create `index.html` entry point
- [x] T009 [P] Create `src/data/level-schema.json` — JSON Schema definition for level validation

**Checkpoint**: Project builds, Phaser boots to a blank screen, types are defined

---

## Phase 2: Foundational (Core Systems)

**Purpose**: Pure logic systems that all gameplay depends on — no Phaser dependency, fully unit-testable

- [x] T010 Implement `src/systems/GridSystem.ts` — grid initialization from LevelConfig, cell state management, place/remove/rotate tile operations
- [x] T011 Implement `src/systems/AirflowSystem.ts` — directed graph traversal from cold sources through duct connections, returns set of cooled server IDs
- [x] T012 [P] Implement `src/systems/TemperatureSystem.ts` — per-tick temperature updates (heat rise when uncooled, cooling when airflow connected), meltdown detection
- [x] T013 [P] Implement `src/systems/ScoreSystem.ts` — star rating calculation based on tiles used and time elapsed vs level thresholds
- [x] T014 [P] Implement `src/systems/LevelValidator.ts` — validate LevelConfig JSON against schema, return structured error messages
- [x] T015 [P] Implement `src/utils/persistence.ts` — localStorage CRUD for PlayerProgress and CustomLevelStore
- [x] T016 Write unit tests: `tests/systems/GridSystem.test.ts` — placement, removal, rotation, boundary checks
- [x] T017 [P] Write unit tests: `tests/systems/AirflowSystem.test.ts` — path resolution, branching, loops rejected, multi-source
- [x] T018 [P] Write unit tests: `tests/systems/TemperatureSystem.test.ts` — heat rise, cooling, meltdown trigger
- [x] T019 [P] Write unit tests: `tests/systems/ScoreSystem.test.ts` — star thresholds
- [x] T020 [P] Write unit tests: `tests/systems/LevelValidator.test.ts` — valid/invalid configs, error messages

**Checkpoint**: All systems pass unit tests. Core game logic works without any rendering.

---

## Phase 3: User Story 1 — Place Duct Tiles to Direct Cold Air (Priority: P1) 🎯 MVP

**Goal**: Player can place, rotate, and remove duct tiles on a grid. Cold air visually flows from sources through ducts.

**Independent Test**: Open a level, place ducts to connect cold source to server, observe air flowing through the path.

### Implementation

- [x] T021 Create `src/scenes/BootScene.ts` — preload all sprite assets (duct tiles, server racks, cold sources, grid background)
- [x] T022 Create `src/entities/DuctTile.ts` — Phaser sprite wrapper with rotation animation, placement/removal, visual connection indicators
- [x] T023 [P] Create `src/entities/ColdSource.ts` — Phaser sprite with directional airflow particle/animation
- [x] T024 [P] Create `src/entities/ServerRack.ts` — Phaser sprite with temperature state visual
- [x] T025 Create `src/scenes/GameScene.ts` — grid rendering, pointer/touch input for tile placement, integrates GridSystem + AirflowSystem
- [x] T026 Implement tile placement input in GameScene: click empty cell → place selected tile type, click existing tile → rotate 90°, right-click/long-press → remove
- [x] T027 Implement airflow visualization: when AirflowSystem resolves paths, animate cold air particles along connected duct paths
- [x] T028 Create `src/ui/TileInventory.ts` — sidebar/bottom bar showing available duct types with remaining count, tap to select
- [x] T029 Create `src/data/levels/level-001.json` — tutorial level (1 cold source, 1 server, straight path, generous tiles)

**Checkpoint**: Player can place ducts in level 1 and see cold air reach the server.

---

## Phase 4: User Story 2 — Monitor Temperature & Prevent Meltdown (Priority: P1)

**Goal**: Servers heat up over time. Cold air cools them. Meltdown = level fail. All cooled = level win.

**Independent Test**: Start a level, do nothing, watch temperature rise and meltdown occur. Then restart and cool the server to win.

### Implementation

- [x] T030 Create `src/ui/TemperatureBar.ts` — per-rack visual indicator (color gradient blue→red + numeric readout), updates each tick
- [x] T031 Integrate TemperatureSystem into GameScene update loop — tick temperatures each frame based on delta time
- [x] T032 Implement meltdown event: when server exceeds threshold, play meltdown animation, trigger level failure
- [x] T033 Implement level success detection: when all servers are below safeThreshold simultaneously, trigger win condition
- [x] T034 Create `src/scenes/LevelCompleteScene.ts` — shows success/failure state, star rating, "Next Level" / "Retry" buttons
- [x] T035 [P] Create `src/ui/PauseOverlay.ts` — pause button, overlay with Resume/Restart/Quit options, keyboard shortcut (Esc/P)
- [x] T036 Update `src/data/levels/level-001.json` with temperature parameters (heatRate, meltdownThreshold, safeThreshold, coolingRate)

**Checkpoint**: Full game loop works — place ducts, cool servers, win or lose.

---

## Phase 5: User Story 3 — Progress Through Levels (Priority: P2)

**Goal**: Multiple levels with increasing difficulty, level select screen, progress persistence.

**Independent Test**: Complete level 1, see level 2 unlock, navigate via level select.

### Implementation

- [x] T037 Create `src/scenes/MenuScene.ts` — title screen with "Play" and "Custom Levels" buttons
- [x] T038 Create `src/scenes/LevelSelectScene.ts` — grid of level buttons showing locked/unlocked/completed/stars state
- [x] T039 Implement level progression logic: completing level N unlocks level N+1, persist via PlayerProgress
- [x] T040 Create `src/data/levels/level-002.json` — introduces corners (2 cold sources, 2 servers, requires corner tiles)
- [x] T041 [P] Create `src/data/levels/level-003.json` — introduces T-junctions (1 source must cool 2 servers via branching)
- [x] T042 [P] Create `src/data/levels/level-004.json` — introduces obstacles (blocked cells, must route around)
- [x] T043 [P] Create `src/data/levels/level-005.json` — time pressure (high heat rate, fewer tiles)
- [x] T044 [P] Create `src/data/levels/level-006.json` — multiple cold sources, multiple servers, cross tiles
- [x] T045 [P] Create `src/data/levels/level-007.json` — tight inventory (minimal tiles for solution)
- [x] T046 [P] Create `src/data/levels/level-008.json` — large grid with complex routing
- [x] T047 [P] Create `src/data/levels/level-009.json` — mixed challenge (obstacles + limited tiles + high heat)
- [x] T048 [P] Create `src/data/levels/level-010.json` — final challenge level (all mechanics combined)
- [x] T049 Wire scene transitions: Menu → LevelSelect → GameScene (with level ID) → LevelComplete → LevelSelect

**Checkpoint**: 10 playable levels with progression, difficulty ramp feels good.

---

## Phase 6: User Story 4 — Limited Resources & Scoring (Priority: P3)

**Goal**: Tile inventory limits per level. Star rating based on efficiency (tiles + time).

**Independent Test**: Complete a level with minimal tiles → 3 stars. Replay with more tiles → 2 stars.

### Implementation

- [x] T050 Enforce tile inventory limits in GameScene — disable placement when a tile type count reaches 0
- [x] T051 Implement timer display in GameScene UI — elapsed seconds since level start (pauses when paused)
- [x] T052 Integrate ScoreSystem into LevelCompleteScene — display star rating with breakdown (tiles used vs threshold, time vs threshold)
- [x] T053 Update LevelSelectScene to display earned stars per completed level
- [x] T054 Persist best scores via PlayerProgress — track bestTilesUsed and bestTime per level

**Checkpoint**: Scoring works, stars display correctly, replayability incentive is clear.

---

## Phase 7: User Story 5 — Custom Level Creation (Priority: P3)

**Goal**: Players can import, play, export, and manage custom levels via JSON.

**Independent Test**: Create a JSON level file, import it, play it, export it for sharing.

### Implementation

- [x] T055 Create `src/scenes/CustomLevelScene.ts` — UI with "Import JSON" (paste or file upload), list of imported custom levels, play/delete/export buttons
- [x] T056 Implement JSON import flow: paste text or file picker → parse → validate via LevelValidator → persist to CustomLevelStore → show in list
- [x] T057 Implement validation error display: when import fails, show user-friendly messages (field name, what's wrong, expected value)
- [x] T058 Implement custom level export: "Copy JSON" button and "Download .json" button per custom level
- [x] T059 Add "Custom Levels" tab/section to LevelSelectScene — shows imported levels separately from campaign
- [x] T060 Create `public/docs/level-schema-guide.md` — human-readable guide for level authors with annotated example JSON, field descriptions, and tips
- [x] T061 Add "How to Create Levels" link/button in CustomLevelScene that opens the schema guide

**Checkpoint**: Full custom level pipeline works — import, validate, play, export, share.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Visual polish, accessibility, performance, final QA

- [x] T062 [P] Implement keyboard controls: arrow keys to move cursor, Space to place, R to rotate, Delete to remove, Esc to pause
- [x] T063 [P] Add non-color temperature indicators: numeric value on each bar, pattern/icon change at danger threshold (not just color)
- [x] T064 [P] Add responsive scaling tweaks: test on common mobile viewports (375px, 414px width), adjust UI element sizing
- [x] T065 [P] Add touch input refinements: tap to place, double-tap to rotate, long-press to remove
- [x] T066 Placeholder sprite creation: simple geometric sprites for all game elements (colored rectangles/shapes — no external art dependencies)
- [x] T067 [P] Performance audit: ensure 60fps on throttled CPU (Chrome DevTools 4x slowdown)
- [x] T068 [P] Bundle size check: verify <500KB gzipped output
- [x] T069 Final playtest: verify all 10 levels are completable, difficulty curve feels right
- [x] T070 Write README.md with setup instructions, how to play, how to create custom levels

**Checkpoint**: Game is polished, accessible, performant, and ready to ship.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (types + constants needed)
- **Phase 3 (US1)**: Depends on Phase 2 (GridSystem, AirflowSystem)
- **Phase 4 (US2)**: Depends on Phase 3 (GameScene must exist for temperature integration)
- **Phase 5 (US3)**: Depends on Phase 4 (full game loop needed for multiple levels)
- **Phase 6 (US4)**: Depends on Phase 5 (scoring needs levels + progression)
- **Phase 7 (US5)**: Depends on Phase 2 (LevelValidator) + Phase 3 (GameScene can load a level) — can run in parallel with Phases 5-6
- **Phase 8 (Polish)**: Depends on all gameplay phases complete

### Parallel Opportunities

- Within Phase 2: T012, T013, T014, T015 are all independent
- Within Phase 5: All level JSON files (T040–T048) can be created in parallel
- Phase 7 (Custom Levels) can start as soon as Phase 4 is complete, in parallel with Phases 5-6
- All Phase 8 tasks marked [P] are independent

---

## Implementation Strategy

### MVP (Phases 1–4)
Delivers the core game loop: place ducts, cool servers, prevent meltdowns. One level, full win/lose cycle.

### Feature Complete (add Phases 5–7)
All 10 levels, progression, scoring, and custom level support.

### Ship (add Phase 8)
Polished, accessible, tested, documented.
