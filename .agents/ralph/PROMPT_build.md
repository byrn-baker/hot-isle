# Hot Isle implementation iteration {{ITERATION}}
Repository: {{REPO_ROOT}}
Implement ONLY the next approved Spec Kit task:
{{STORY_BLOCK}}

The user explicitly APPROVED the technical plan. Implementation and ordinary development dependency choices are authorized. No more approval is needed for this scoped local work. Read AGENTS.md and the relevant portions of specs/002-datacenter-tycoon/{plan.md,data-model.md,contracts/simulation.md,tasks.md} and {{PROGRESS_PATH}}. Read existing code/types needed for this task. Avoid dumping whole files/diffs repeatedly: inspect concise relevant ranges and test output. Planning-only restrictions in historical progress entries are superseded by explicit approval and this implementation queue.

Use TypeScript/Three.js/Vite/Vitest. Follow the approved spatial model and interfaces, with reasonable corrections supported by actual tests. Preserve earlier uncommitted game work and classic mode. No stage, commit, stash, reset, push, or other agents. Allowed edits: task-related src/tycoon and tests/tycoon files, src/main.ts for UI integration, necessary tooling/package files and README for final browser verification, feature validation.md and task/progress evidence. Do not rewrite spec or runner files/queue/state. Root session may work on browser tooling concurrently; preserve those changes.

Write meaningful behavioral tests alongside mechanics. Run focused checks while developing, then npm test and npm run build before completing. Do not claim proposed tests, synthetic model assertions, browser work, 5 C benchmarks or measured hardware outcomes without executing them. Explain genuine model limitations. If calibration is needed change declarative data with evidence, never add layout bonuses. No speculative scaffolding or TODO stubs for this task's required behavior. Do not expand into later queue tasks beyond necessary interfaces.

When acceptance checks pass, tick this task's checkbox in tasks.md and append concise evidence (commands/results, key files, remaining risks) to {{PROGRESS_PATH}}. Stop after this one story. End with <promise>COMPLETE</promise> on its own line only when task acceptance is satisfied; otherwise record the blocker without that marker.
