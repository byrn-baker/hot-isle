# Ralph runner for Hot Isle

## Installation

Installed `@iannuttall/ralph@0.1.3` under `/home/byrnbaker/.local`:

```bash
npm install --global --prefix "$HOME/.local" @iannuttall/ralph@0.1.3 --ignore-scripts --no-audit --no-fund
```

This is the Codex-compatible [iannuttall/ralph](https://github.com/iannuttall/ralph) runner. Its upstream repository is archived; the installed version is pinned, and its local shell runner remains inspectable. `ralph install` copied the runner into `.agents/ralph/`. Optional commit/browser/PRD skills were declined because this project uses Spec Kit and has existing uncommitted work.

Codex is already authenticated through ChatGPT. The local configuration launches a fresh `codex exec` context per story with workspace-write sandbox, approval policy never, ephemeral sessions, the user's default model, and no automatic commits. It does not use the upstream default `--yolo` command.

## Current phase

The user explicitly approved the technical plan. `../tasks.md` is the implementation task source; `implementation.json` maps T001–T007 to dependency-ordered executable stories. Both earlier planning stories are complete and retained in `planning.json`.

From the repository root, resume a bounded batch:

```bash
ralph build 7 --no-commit --prd specs/002-datacenter-tycoon/ralph/implementation.json --progress specs/002-datacenter-tycoon/ralph/progress.md
```

Completed stories are skipped. Use one active runner per queue. Ctrl-C stops a foreground run; inspect the queue and log before retrying an interrupted story. Never reset an in-progress story while its process is active.

Runtime prompts, structured CLI events, and final assistant replies are in ignored `.ralph/`; durable evidence is in `progress.md`. The local completion check uses a separate final response file and successful process exit, never the combined prompt/output log. Signals still require inspection against task acceptance. Regression checks: `python3 .agents/ralph/test-completion.py`. Do not run `ralph install --force` without preserving local customizations.

## Spec Kit handoff

- `../spec.md` is the approved feature scope.
- `../plan.md` and supporting artifacts define the implementation design.
- `.specify/workflows/speckit/workflow.yml` requires plan review before generating implementation tasks.
- The explicit review approval is recorded in `state.json` and `plan.md`; implementation task generation is complete and the prompt now permits scoped implementation.
- Run bounded batches, inspect meaningful behavior tests and browser evidence, and record blockers. Stop after three consecutive unsuccessful attempts on the same unchanged blocker.
- Do not stage, commit, reset or overwrite unrelated working-tree changes. Never mark unmeasured performance or proposed tests as passed.

## Feature acceptance

Implementation includes the matched good/poor layout thermal and profit benchmark; load, obstruction and capacity behavior; numerical/financial consistency; pause/speed and save/reload; keyboard/mouse/right-click; rendered UI and classic compatibility. See `../validation.md` for executed checks and explicit remaining performance/playtest evidence.

See `state.json`, `planning.json`, and `progress.md` for the actual checkpoint. Queue completion is supported by recorded test results; it does not substitute for the pending first-time-player observation or target-device performance measurement.
