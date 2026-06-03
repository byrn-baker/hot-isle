<!-- Sync Impact Report
  Version change: 0.0.0 → 1.0.0
  Added sections: All (initial constitution)
  Removed sections: None
  Templates requiring updates: None (initial setup)
  Follow-up TODOs: None
-->

# Hot Isle Cold Isle Constitution

## Core Principles

### I. Game-First Design
Every feature MUST deliver a clear, enjoyable gameplay experience. Mechanics are prioritized over visual polish. The core loop (redirect cold air → prevent overheating) MUST be satisfying and intuitive from the first playable version.

### II. Progressive Complexity
The game MUST introduce mechanics gradually. Early levels teach basics (airflow direction), later levels add constraints (limited duct pieces, time pressure, multiple heat sources). Difficulty curves MUST be playtested and tunable.

### III. Simulation Integrity
Airflow and heat mechanics MUST follow consistent, understandable rules. Players MUST be able to predict outcomes based on visible state. No hidden mechanics or random failures that contradict the displayed system.

### IV. Browser-Native & Lightweight
The game MUST run in modern browsers without plugins or heavy dependencies. Performance MUST remain smooth (60fps target) on mid-range hardware. Bundle size MUST stay minimal.

### V. Accessibility
The game MUST be playable with keyboard and mouse. Color MUST NOT be the sole indicator of hot/cold state. UI elements MUST meet WCAG AA contrast ratios. Game state MUST be pausable.

## Development Standards

- All game mechanics MUST be unit-testable in isolation
- Visual components MUST be separable from logic
- Level data MUST be declarative (JSON/data-driven), not hardcoded
- Code MUST be modular: rendering, simulation, input, and level management are independent systems

## Governance

This constitution governs all development decisions for Hot Isle Cold Isle. Amendments require documentation and a clear rationale. Complexity MUST be justified against the Game-First principle.

**Version**: 1.0.0 | **Ratified**: 2026-06-03 | **Last Amended**: 2026-06-03
