# Implementation Plan: Hot Isle Cold Isle

**Branch**: `001-hot-isle-cold-isle` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-hot-isle-cold-isle/spec.md`

## Summary

A grid-based puzzle game where players place and rotate duct tiles to route cold air from sources to overheating server racks in a datacenter. Built with Phaser 3 for cross-platform browser compatibility (desktop + mobile), TypeScript for type safety in game logic, and Vite for fast development iteration. Levels are data-driven via JSON configurations.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)

**Primary Dependencies**:
- Phaser 3.80+ (game framework — rendering, input, scenes, asset management)
- Vite 5.x (build tool — dev server, bundling, HMR)

**Storage**: Browser localStorage (level completion, star ratings)

**Testing**: Vitest (unit tests for simulation logic, grid state, temperature calculations)

**Target Platform**: Modern desktop and mobile browsers (Chrome, Firefox, Safari, Edge — last 2 major versions)

**Project Type**: Single-page web game (static deployment)

**Performance Goals**: 60fps on mid-range 2020-era hardware, <3s initial load

**Constraints**: Bundle size <500KB gzipped (excluding assets), no server dependencies, offline-capable after first load

**Scale/Scope**: 10+ handcrafted levels, ~6 scenes (Boot, Menu, LevelSelect, Game, LevelComplete, CustomLevelImport)

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Game-First Design | ✅ | Core loop (place ducts → cool servers) is the primary deliverable |
| Progressive Complexity | ✅ | Level data is JSON-driven, difficulty is tunable per level |
| Simulation Integrity | ✅ | Airflow simulation is a deterministic graph traversal — predictable, visible |
| Browser-Native & Lightweight | ✅ | Phaser 3 + Vite, no plugins, WebGL with Canvas fallback |
| Accessibility | ✅ | Keyboard controls, non-color-only indicators, pausable |

## Project Structure

### Documentation (this feature)

```text
specs/001-hot-isle-cold-isle/
├── plan.md              # This file
├── data-model.md        # Data model and entity definitions
├── tasks.md             # Implementation tasks (/speckit.tasks output)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── main.ts              # Phaser game config and bootstrap
├── scenes/
│   ├── BootScene.ts     # Asset preloading
│   ├── MenuScene.ts     # Title screen
│   ├── LevelSelectScene.ts  # Level picker with completion status
│   ├── GameScene.ts     # Main gameplay
│   ├── LevelCompleteScene.ts  # Results, star rating
│   └── CustomLevelScene.ts    # Import/export/manage custom levels
├── systems/
│   ├── GridSystem.ts    # Grid state management (cells, placement, removal)
│   ├── AirflowSystem.ts # Airflow path resolution (graph traversal from sources)
│   ├── TemperatureSystem.ts  # Heat simulation (rise/fall rates per tick)
│   ├── ScoreSystem.ts   # Star rating calculation
│   └── LevelValidator.ts # Schema validation for custom level JSON
├── entities/
│   ├── ServerRack.ts    # Server with temperature state and meltdown threshold
│   ├── ColdSource.ts    # Air emission point with direction
│   └── DuctTile.ts      # Player-placed tile with type and rotation
├── ui/
│   ├── TemperatureBar.ts    # Per-rack temperature indicator
│   ├── TileInventory.ts     # Available duct tiles sidebar
│   └── PauseOverlay.ts      # Pause menu
├── data/
│   ├── levels/
│   │   ├── level-001.json   # Level configuration files
│   │   ├── level-002.json
│   │   └── ...
│   └── level-schema.json    # JSON Schema for level validation + documentation
├── utils/
│   ├── persistence.ts   # localStorage read/write for progress + custom levels
│   └── constants.ts     # Game-wide constants (tick rates, thresholds)
└── types/
    └── index.ts         # Shared TypeScript interfaces

tests/
├── systems/
│   ├── AirflowSystem.test.ts
│   ├── TemperatureSystem.test.ts
│   ├── GridSystem.test.ts
│   ├── ScoreSystem.test.ts
│   └── LevelValidator.test.ts
└── utils/
    └── persistence.test.ts

public/
└── assets/
    ├── sprites/         # Tile sprites, server rack sprites
    └── ui/              # UI elements, icons

index.html               # Entry point
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
```

**Structure Decision**: Single project with clear separation between game systems (pure logic, testable), entities (game objects), scenes (Phaser lifecycle), and UI (visual components). Systems are independent modules that can be unit-tested without Phaser's runtime. Level data lives in JSON files for easy authoring and tuning.

## Key Architecture Decisions

### Airflow as Graph Traversal
Cold air propagation is modeled as a directed graph. Each cold source is a root node. Duct tiles are edges with direction determined by tile type and rotation. On each placement/removal, the graph is re-evaluated to determine which server racks receive airflow. This is deterministic and visually traceable.

### Systems Decoupled from Rendering
`GridSystem`, `AirflowSystem`, `TemperatureSystem`, and `ScoreSystem` are pure TypeScript classes with no Phaser dependency. They operate on data and return state. `GameScene` reads their output and updates visuals. This makes logic fully unit-testable.

### Data-Driven Levels
Each level is a JSON file specifying: grid dimensions, server positions + thresholds, cold source positions + directions, available duct tile types and quantities, and difficulty tuning parameters (heat rate, time bonus thresholds). Adding levels requires no code changes.

### Responsive Scaling
Phaser's Scale Manager handles fitting the game to any screen size. The grid cell size adapts based on viewport. Touch and pointer events are unified — no separate mobile input code needed.

### Custom Level Pipeline
Players author levels using a well-documented JSON Schema (`src/data/level-schema.json`). The `LevelValidator` system validates imports against this schema and provides human-readable error messages (e.g., "Server at position (3,5) is outside the grid bounds"). Custom levels are stored in localStorage separately from progress data. The import flow: paste/upload JSON → validate → persist → appears in Custom section of level select. Export provides the raw JSON for sharing.

## Complexity Tracking

No constitution violations. All choices align with the five principles.
