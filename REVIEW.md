# Hot Isle Cold Isle — review

Reviewed September 13, 2026. Scope: source, all ten campaign configurations, existing tests, production build, and a desktop browser check of the opening level. This is not a complete campaign playtest or physical-device mobile certification.

## Assessment

A promising compact routing puzzle with a clear premise. Pure simulation modules, JSON levels, and a working place–rotate–cool–score loop provide a good foundation. The highest-value next work is teaching the rules, making interactions reliable, and balancing the time pressure. Additional content should follow those improvements.

## Graphics implemented in this pass

- Double-resolution procedural textures: server rack bays, fan units, metal duct channels and flanges, and hazard-striped obstacles.
- A consistent dark control-room background across scenes and a framed title panel.
- Framed checkerboard floor, illuminated active duct channels, and pulsing airflow highlights.
- Centered inventory, brighter selection outline, shortcut labels, and dimmed unavailable tiles.
- Temperature labels above rack sprites, cell-sized temperature bars, and explicit cooler outlet arrows.

The asset work adds no image downloads. Build output is approximately 351 KB gzipped, compared with 350 KB before the changes. Existing tests pass (65/65). Browser automation observed no JavaScript exceptions during the opening-level interaction.

## Fix next — player-facing defects

1. **Touch removal cannot work as documented.** In `GameScene.handlePointerDown`, pressing an existing duct starts a removal timeout, then immediately clears it in the rotate branch. Defer tap rotation until release; recognize a completed hold separately, or provide an explicit remove tool. Verify real touch placement, rotation, removal, cancellation, and inventory refunds.
2. **Custom-level identity is lost.** Restart and completion pass only `levelConfig.id`; the imported configuration and generated storage ID are discarded. A retry falls back to campaign level 1 unless the ID matches a built-in level. Preserve a campaign/custom level reference and config throughout the scene flow. Store custom progress separately so imported IDs cannot overwrite campaign records.
3. **Resizing resets the puzzle.** The game restarts on scale resize, losing ducts, time, and temperatures. Reposition existing objects while preserving the simulation. Remove each scene's own resize handler on shutdown; avoid removing all shared resize listeners.
4. **Campaign ending loops to level 1.** `LevelCompleteScene.getNextLevelId` generates `level-011` after level 10; the game then silently falls back to the tutorial. Use a shared campaign registry and show a campaign-complete screen.
5. **Narrow layouts have fixed-size overflow.** Level selection is always five 80 px columns with 16 px gaps (464 px wide). Inventory and custom-level controls also have fixed dimensions; a minimum 32 px cell makes large grids exceed small viewports. Use adaptive columns, scrolling lists, and an explicit large-board viewport strategy.

## Improve the experience

- **Teach before timing.** The tutorial begins heating immediately and has no instructional steps. On Normal its server melts down after 14 seconds without cooling. Start with a guided placement and rotation, then introduce a timer. A short planning phase or a separate untimed practice mode would support deliberate puzzle solving.
- **Smooth the difficulty curve.** The earliest uncooled meltdown is about 5.8 seconds in level 5, 5.2 in level 9, and 5.8 in level 10 on Normal. These are calculated deadlines, not proof the levels are unsolvable. Playtest solution action counts and completion rates, especially with touch, before tuning heat and star thresholds.
- **Explain success and failure.** Show the cooling target and progress, such as “2/3 racks safe,” plus heating/cooling state and the three-star tile/time targets. Failure should identify the rack and let players inspect the failed route.
- **Reduce repetitive input.** Add a placement preview, rotation before placement, undo, and an optional drag-to-build interaction. Keep tap behavior predictable and add complete keyboard navigation through menus.
- **Add restrained feedback.** Distinct placement, connection, warning, and victory sounds would improve clarity. Include mute and reduced-motion controls. Test temperature and flow readability without relying on color alone.
- **Expand puzzle variety after balancing.** Introduce valves, directional ducts, or limited cooling capacity one at a time. A visual level editor would make the existing custom-level support useful to more players than JSON import alone.

## Technical follow-ups

- Cache airflow until the board changes; currently graph traversal and graphics redraw happen every frame. Animate the cached result independently.
- Define whether one source reaching a rack along multiple branches should count once or repeatedly. Currently the traversal adds cooling at each server visit without marking servers visited, so one source can contribute more than once. Add a regression test for the intended rule.
- Validate custom-level cell overlaps, safe/meltdown threshold ordering, finite numeric values, and scoring threshold ordering. Add known solutions for campaign levels to regression checks.
- Separate campaign/custom and difficulty score records. Leaderboard totals currently aggregate all saved completions, including custom levels, while the API expects at most ten levels and thirty stars. Scores are supplied by the client and should not be presented as verified competitive results without validation.
- Add scene integration coverage for retry, resize, campaign ending, touch removal, and progress persistence. The current tests cover pure systems but miss these lifecycle defects.

## Suggested sequence

First: touch input, custom retries, resize preservation, and campaign ending. Second: tutorial, visible objectives, responsive layout, and level balancing. Third: audio, replay improvements, and new mechanics or a visual editor.
