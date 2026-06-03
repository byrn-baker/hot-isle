# Spec-Driven Development with Spec-Kit: Building Hot Isle Cold Isle in Under 2 Hours

## What is Spec-Driven Development?

Spec-Driven Development (SDD) is a methodology that puts specifications at the center of AI-assisted software development. Instead of jumping straight into code, you describe what you want to build, refine it through structured phases, and let your AI coding agent implement it with full context.

The core insight: AI coding agents produce dramatically better code when given a well-structured specification rather than ad-hoc prompts. SDD formalizes this into a repeatable process.

## The SDD Workflow

```
Constitution → Specify → Plan → Tasks → Implement
```

Each phase produces a Markdown artifact that feeds the next, giving the AI agent structured context instead of fragmented instructions.

## Spec-Kit: The Toolkit

[Spec-Kit](https://github.com/github/spec-kit) is an open-source toolkit that provides templates, commands, and workflow automation for SDD. It works with any AI coding agent (Copilot, Claude, Gemini, Kiro, Cursor, and 30+ others) and provides:

- Structured templates for each phase
- Quality checklists and validation gates
- Extension system for custom workflows
- Git integration for feature branching

## How We Built Hot Isle Cold Isle

### The Starting Point

A one-sentence idea: *"A game where you redirect cold air to offset hot air inside a datacenter so devices don't overheat and meltdown."*

That's it. No wireframes, no technical design doc, no architecture diagrams. Just a concept.

### Phase 1: Constitution (~2 minutes)

We established project principles that would govern all decisions:

- **Game-First Design** — mechanics over polish
- **Progressive Complexity** — teach gradually
- **Simulation Integrity** — predictable, no hidden mechanics
- **Browser-Native & Lightweight** — 60fps, minimal bundle
- **Accessibility** — keyboard playable, not color-dependent

These principles acted as guardrails throughout implementation. When making trade-offs later (e.g., "should we add particle effects?"), the constitution provided the answer: mechanics first, polish later.

### Phase 2: Specification (~10 minutes)

The spec defined *what* to build without dictating *how*:

- 5 user stories prioritized P1–P3
- 22 functional requirements (FR-001 through FR-022)
- Acceptance scenarios in Given/When/Then format
- Edge cases identified upfront
- Success criteria that are measurable and technology-agnostic
- Assumptions documented explicitly

Key decisions surfaced early: "Should custom levels have a visual editor?" → No, JSON-only for v1 (documented in assumptions rather than discovered mid-implementation).

### Phase 3: Technical Plan (~5 minutes)

With the spec locked, we chose the tech stack:

- **Phaser 3** — chosen after evaluating alternatives (vanilla Canvas, PixiJS, KAPLAY) based on the game's needs (grid-based, mobile+desktop, no physics)
- **TypeScript** — type safety for game simulation logic
- **Vite** — fast dev iteration
- **Vitest** — unit tests for pure logic systems

The plan defined the architecture: systems decoupled from rendering, data-driven levels, directed graph airflow model. Each decision traced back to a constitutional principle.

### Phase 4: Task Breakdown (~3 minutes)

70 tasks across 8 phases, organized by user story:

1. **Setup** — project scaffolding, types, config
2. **Foundational** — pure logic systems (Grid, Airflow, Temperature, Score, Validator)
3. **US1: Tile Placement** — the core interaction
4. **US2: Temperature Monitoring** — the tension mechanic
5. **US3: Level Progression** — 10 levels, difficulty ramp
6. **US4: Scoring** — star ratings, replayability
7. **US5: Custom Levels** — community content
8. **Polish** — accessibility, performance, responsive

Each task had exact file paths, clear dependencies, and parallel markers for tasks that could run simultaneously.

### Phase 5: Implementation (~90 minutes)

With the full spec as context, implementation was fast and focused:

- **Core systems** built first — fully unit-testable, no Phaser dependency. 65 tests passing before any rendering code existed.
- **Scenes** wired up progressively — Boot → Menu → LevelSelect → Game → LevelComplete
- **10 levels** designed with progressive difficulty curves
- **Custom level pipeline** — import, validate, play, export
- **Leaderboard** — Cloudflare Worker + KV in the same deployment

The AI agent never asked "what should this function do?" because the spec, plan, and data model provided complete context for every decision.

### Phase 6: Deployment (~5 minutes)

- Git push to GitHub
- Cloudflare Workers build triggered automatically
- Static assets + serverless API deployed as one unit
- Live at `https://hot-isle.byrnbaker.workers.dev`

## What SDD Got Us

### Things that would have gone wrong without a spec:

1. **Immediate win bug** — the spec said "servers start needing cooling" but the initial code started them at ambient temperature (below safe threshold), causing instant wins. The spec made the bug obvious.

2. **Custom levels scope creep** — without the spec explicitly stating "JSON-only, no visual editor in v1," this could have ballooned into weeks of work.

3. **Architecture drift** — the constitution's "all mechanics must be unit-testable in isolation" forced the systems-decoupled-from-rendering architecture. Without it, game logic would have been tangled into Phaser scenes.

4. **Missing win/lose conditions** — the acceptance scenarios explicitly defined meltdown = lose and all-cooled = win. These aren't obvious implementation details — they're design decisions that should be made upfront.

### The numbers:

| Metric | Value |
|--------|-------|
| Time from idea to deployed game | ~2 hours |
| Lines of game code | ~2,500 |
| Lines of spec/plan/tasks | ~800 |
| Unit tests | 65 |
| Campaign levels | 10 |
| Deployment | Serverless (Cloudflare Workers) |
| Backend code for leaderboard | ~120 lines |

### The ratio that matters:

Roughly **25% of total output was specification** (800 lines of spec vs 2,500 lines of code). That specification investment eliminated:

- Back-and-forth clarification loops
- "Wait, what should this actually do?" moments
- Rework from misunderstood requirements
- Architecture decisions made under pressure

## When to Use SDD

SDD shines when:

- You're building something with meaningful complexity (not a one-liner)
- Multiple components need to work together coherently
- You want the AI to make good decisions autonomously
- You care about the result being correct, not just fast

It's overkill for:

- Quick scripts or one-off utilities
- Exploratory prototyping where you don't know what you want yet
- Trivial bug fixes

## Getting Started with Spec-Kit

```bash
# Install
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@latest

# Initialize a project
specify init my-project --integration kiro

# Or use it without installing
uvx --from git+https://github.com/github/spec-kit.git specify init my-project
```

Then follow the workflow: constitution → specify → plan → tasks → implement.

The specs become living documentation — they're not throwaway prompts, they're artifacts that explain *why* the code exists and *what* it's supposed to do.

---

*Hot Isle Cold Isle was built using [Spec-Kit](https://github.com/github/spec-kit) and [Kiro](https://kiro.dev) in a single session on June 3, 2026.*
