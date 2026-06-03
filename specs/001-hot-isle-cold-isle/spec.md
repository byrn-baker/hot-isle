# Feature Specification: Hot Isle Cold Isle

**Feature Branch**: `001-hot-isle-cold-isle`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "A game where you need to redirect cold air to offset the hot air inside a datacenter so that the devices do not overheat and meltdown the equipment."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Place Duct Tiles to Direct Cold Air (Priority: P1)

A player views a datacenter grid with hot aisles (containing servers generating heat) and cold aisles (air intake sources). The player places and rotates duct/vent tiles on the grid to create airflow paths from cold air sources to hot zones. When the path is complete, cold air flows through and cools the equipment below the critical threshold.

**Why this priority**: This is the absolute core mechanic. Without placing ducts to redirect airflow, there is no game.

**Independent Test**: Player can open a level, place duct tiles on a grid, and observe cold air reaching hot equipment. The level completes when all devices are below meltdown temperature.

**Acceptance Scenarios**:

1. **Given** a level with hot servers and cold air sources, **When** the player places duct tiles creating a valid path from cold source to hot equipment, **Then** the temperature of that equipment decreases over time
2. **Given** a level with multiple hot zones, **When** the player connects all hot zones to cold sources, **Then** the level is marked as complete
3. **Given** a duct tile is placed, **When** the player clicks/taps it, **Then** the tile rotates 90 degrees to change airflow direction

---

### User Story 2 - Monitor Temperature & Prevent Meltdown (Priority: P1)

The player sees real-time temperature indicators on each server rack. If a server's temperature reaches the critical threshold (meltdown), the equipment is destroyed and the player loses a life or fails the level. The player must act quickly to route cold air before temperatures rise too high.

**Why this priority**: The tension between rising heat and the player's actions is what makes the game engaging. Without a fail state, there's no challenge.

**Independent Test**: Load a level, do nothing, and observe temperatures rising until meltdown occurs and the level fails.

**Acceptance Scenarios**:

1. **Given** a server without cold air supply, **When** time passes, **Then** its temperature increases steadily toward the meltdown threshold
2. **Given** a server reaches meltdown temperature, **When** the threshold is crossed, **Then** the equipment visually melts/fails and the player loses the level
3. **Given** a server receiving cold air, **When** cold airflow is sufficient, **Then** its temperature stabilizes or decreases

---

### User Story 3 - Progress Through Levels (Priority: P2)

The player progresses through a series of levels with increasing difficulty. Early levels have simple layouts with one heat source and one cold source. Later levels introduce multiple sources, obstacles, limited duct pieces, and tighter time pressure.

**Why this priority**: Progression gives the game longevity and teaches mechanics gradually, but the core loop must work first.

**Independent Test**: Player completes level 1, is presented with level 2 which has a more complex layout, and can navigate between unlocked levels from a level select screen.

**Acceptance Scenarios**:

1. **Given** the player completes a level, **When** the success screen appears, **Then** the next level is unlocked and accessible
2. **Given** the player opens the level select screen, **When** they view available levels, **Then** completed levels show a checkmark and the next unlocked level is highlighted
3. **Given** a later level, **When** the player starts it, **Then** it has more heat sources, fewer available duct tiles, or additional obstacles compared to earlier levels

---

### User Story 4 - Limited Resources & Scoring (Priority: P3)

The player has a limited inventory of duct tiles per level. Efficiency is rewarded: using fewer tiles and completing faster yields a higher score (star rating). This adds replayability and strategic depth.

**Why this priority**: Scoring and resource constraints add depth but are not required for the core loop to be fun.

**Independent Test**: Player completes a level using minimal tiles and gets 3 stars; replaying with more tiles yields 2 stars.

**Acceptance Scenarios**:

1. **Given** a level with 10 available duct tiles, **When** the player has placed all 10, **Then** no more tiles can be placed until one is removed
2. **Given** the player completes a level using 4 of 10 tiles, **When** the score is calculated, **Then** fewer tiles used results in a higher star rating
3. **Given** the player completes a level quickly, **When** time is factored in, **Then** faster completion contributes to a higher score

---

### User Story 5 - Custom Level Creation (Priority: P3)

Players who want to create their own levels can do so by writing a simple JSON file following a documented schema. Custom levels can be loaded into the game via a "Custom Levels" section in the level select screen, either by pasting JSON or importing a file. The schema is well-documented with examples so that non-developers can author levels.

**Why this priority**: Community content extends the game's life and engages creative players, but the core game must work first.

**Independent Test**: A player creates a JSON file following the documented schema, imports it via the Custom Levels UI, and plays their custom level successfully.

**Acceptance Scenarios**:

1. **Given** a valid custom level JSON file, **When** the player imports it via the Custom Levels interface, **Then** the level appears in a "Custom" section and is playable
2. **Given** an invalid custom level JSON (missing required fields, out-of-bounds positions), **When** the player attempts to import it, **Then** a clear validation error message is shown indicating what's wrong
3. **Given** the player has imported custom levels, **When** they return to the game later, **Then** their custom levels are persisted and still available
4. **Given** a player wants to share a level, **When** they select "Export" on a custom level, **Then** the JSON is available for download or copy to clipboard

---

### Edge Cases

- What happens when the player removes a duct tile that is actively cooling a server? Temperature begins rising immediately.
- What happens if cold air paths intersect or overlap? Airflow follows the tile direction; overlapping paths do not amplify cooling.
- What if the player places a duct that creates a loop (circular path)? Air does not flow in loops; the path must have a source and a destination.
- What happens when all equipment melts? The level fails and the player can retry.
- What if a level is unsolvable with the given tiles? All levels MUST be verified solvable during design. The UI does not communicate unsolvability.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a grid-based datacenter layout with identifiable hot aisles, cold aisles, and server racks
- **FR-002**: System MUST allow players to place duct tiles on empty grid cells to create airflow paths
- **FR-003**: System MUST allow players to rotate placed duct tiles in 90-degree increments
- **FR-004**: System MUST simulate airflow from cold sources through connected duct paths to hot zones
- **FR-005**: System MUST display real-time temperature for each server rack using visual indicators (color gradient + numeric value)
- **FR-006**: System MUST increase server temperature over time when not receiving adequate cold air
- **FR-007**: System MUST trigger a meltdown event when a server exceeds its critical temperature threshold
- **FR-008**: System MUST declare level failure when a meltdown occurs
- **FR-009**: System MUST declare level success when all servers are cooled below their safe threshold
- **FR-010**: System MUST support a minimum of 10 levels with progressive difficulty
- **FR-011**: System MUST provide a level selection interface showing completion status
- **FR-012**: System MUST limit the number of available duct tiles per level
- **FR-013**: System MUST allow players to remove previously placed duct tiles
- **FR-014**: System MUST calculate a score (1-3 stars) based on tiles used and time taken
- **FR-015**: System MUST persist level completion and star ratings across sessions (local storage)
- **FR-016**: System MUST be pausable at any time during gameplay
- **FR-017**: System MUST allow players to import custom levels via JSON file or pasted JSON text
- **FR-018**: System MUST validate custom level JSON against the schema and display clear error messages for invalid levels
- **FR-019**: System MUST persist imported custom levels in local storage
- **FR-020**: System MUST display custom levels in a separate "Custom" section of the level select screen
- **FR-021**: System MUST allow players to export/share custom levels as JSON (download or clipboard)
- **FR-022**: System MUST provide a documented level schema with examples accessible from within the game

### Key Entities

- **Grid Cell**: A position on the datacenter floor. Can be empty, contain a server rack, contain a cold air source, or contain a placed duct tile.
- **Server Rack**: A heat-generating entity with current temperature, meltdown threshold, and cooling rate when receiving airflow.
- **Cold Air Source**: A fixed grid cell that emits cold air in a specific direction.
- **Duct Tile**: A player-placed tile that channels airflow. Has inlet/outlet directions based on its type (straight, corner, T-junction, cross).
- **Level**: A declarative configuration defining grid size, server positions, cold source positions, available duct types and quantities, and difficulty parameters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Players can understand the core mechanic (place ducts to cool servers) within 30 seconds of starting level 1, without external instructions
- **SC-002**: The game maintains smooth visual performance (60fps) on a 2020-era mid-range laptop browser
- **SC-003**: A new player can complete the first 3 levels in under 5 minutes
- **SC-004**: The game loads and is interactive within 3 seconds on a standard broadband connection
- **SC-005**: Players who complete level 5 return to attempt level 6 at least 50% of the time (engagement retention)
- **SC-006**: All 10+ levels are completable, verified by at least one valid solution path per level

## Assumptions

- Target platform is modern desktop/mobile browsers (Chrome, Firefox, Safari, Edge — last 2 major versions)
- Single-player experience only; no multiplayer or leaderboards in v1
- No audio required for v1 (visual feedback is sufficient)
- Levels are handcrafted, not procedurally generated
- Local storage is available for persistence (no server-side saves)
- Touch input on mobile is out of scope for v1 (desktop mouse/keyboard focus)
- No monetization or ads in v1
- Custom level creation is JSON-authoring only (no visual level editor in v1)
