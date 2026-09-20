# Hot Isle Cold Isle

A grid-based puzzle game where you route cold air through duct tiles to prevent datacenter servers from overheating and melting down.

## Setup

```bash
npm install
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`) in a WebGL-capable desktop browser.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`.

### Run Tests

```bash
npm test
npm run test:browser
```

## How to Play

**Goal:** Cool all servers below their safe temperature threshold before any server reaches meltdown.

### Controls

| Action | Mouse/Touch | Keyboard |
|--------|-------------|----------|
| Select pipe | Click inventory | 1 Straight, 2 Corner, 3 T-junction, 4 Cross |
| Move placement cursor | Hover over grid | Arrow keys |
| Place tile | Click empty cell | Space / Enter |
| Rotate tile / preview | Click placed tile | R |
| Remove tile | Right-click / long-press | Delete / Backspace |
| Pause | Click ⏸ button | Esc / P |
| Controls help (pauses timer) | Click Help | H |

Every level starts with the controls shown and its timer paused. Press Enter or click Play when ready. The highlighted cell starts beside the cooler, with a pipe selected. Use R on an empty cell to rotate the placement preview; on an occupied cell it rotates that pipe. Repeated number presses keep that pipe type selected. Space/Enter only places pipes; use R to rotate them.

### Level 3: Branching Out

Route air across the middle row to the far-right column, then split up and down to both servers. This seven-pipe solution uses five straights and both T-junctions (unused T outlets are allowed):

```text
. . . . . S
. . . . . │
C ─ ─ ─ ┬ ┤
. . . . . │
. . . . . S
```

`C` is the cooler, `S` a server. The first T connects left/right/down; the second connects left/up/down. On Normal, uncooled racks now allow 21 seconds before meltdown, and seven pipes qualify for the three-star tile target.

### Gameplay

1. **Select a duct tile** from the inventory bar at the bottom
2. **Place it on the grid** to connect cold air sources (blue) to server racks (gray)
3. **Rotate tiles** to align airflow paths correctly
4. **Cool all servers** below their safe threshold to win the level
5. If any server hits meltdown temperature, you lose

### Tile Types

- **Straight** — Air flows top ↔ bottom
- **Corner** — Air turns 90° (top ↔ right)
- **T-Junction** — Air splits three ways (top, right, bottom)
- **Cross** — Air passes through all four directions

All tiles can be rotated in 90° increments.

### Scoring

Each level awards 1–3 stars based on:
- **Tiles used** — fewer tiles = better rating
- **Time taken** — faster completion = better rating

Your final star rating is the minimum of the two categories.

## Levels

10 campaign levels with increasing difficulty:

1. Tutorial: First Contact
2. Corners
3. Branching Out
4. Obstacle Course
5. Heat Wave
6. Cross Traffic
7. Tight Budget
8. Data Center
9. Under Pressure
10. Final Meltdown

## Custom Levels

Create your own levels by writing a JSON file following the schema.

### Import

1. Go to Menu → Custom Levels
2. Paste JSON or upload a `.json` file
3. The level validates automatically and appears in your list

### Export

Use the "Copy JSON" or "Download .json" buttons next to any custom level.

### Schema Guide

See `public/docs/level-schema-guide.md` for complete field reference, annotated examples, and design tips.

## Tech Stack

- [Phaser 3.80](https://phaser.io/) — Game framework
- TypeScript — Type-safe game logic
- Vite — Build tool and dev server
- Vitest — Unit testing

## Project Structure

```
src/
├── scenes/       # Phaser scenes (Boot, Menu, LevelSelect, Game, LevelComplete, CustomLevel)
├── systems/      # Pure logic (Grid, Airflow, Temperature, Score, LevelValidator)
├── entities/     # Phaser game objects (ServerRack, ColdSource, DuctTile sprites)
├── ui/           # UI components (TileInventory, TemperatureBar, PauseOverlay)
├── data/levels/  # Level JSON files
├── types/        # Shared TypeScript interfaces
└── utils/        # Constants, persistence helpers
```

## License

MIT

## Datacenter tycoon

The default page opens the Three.js datacenter tycoon. The Phaser puzzle campaign remains isolated at **Classic campaign** or `?mode=classic`; its progress keys are unchanged.

1. Accept the launch contract and buy racks and at least one floor cooler while paused.
2. Point rack fronts toward cool supply air and keep their exhausts separated. Blue marks intake/supply; orange marks exhaust/return.
3. Start operation, then inspect numeric temperature, airflow, service, power, reliability, and ledger diagnostics. Pause to revise the room.
4. Save and load locally, or run an isolated projected design trial. Trials do not alter the live contract, cash, room, or save.

For the measured affordable starting layout, use zero-based floor coordinates: place two east-facing coolers at `(1,2)` and `(11,2)`, then four north-facing Dense racks at `(2,3)`, `(4,3)`, `(7,3)`, and `(9,3)`. Set rack workload and cooler command to 100%, then start operation. This costs $122,000 of the $150,000 opening budget. The in-game separated and recirculation design-trial buttons provide an isolated comparison before you commit to live operation.

Focus the room for keyboard controls: arrows move the cursor, Space places/selects, R rotates, M starts an explicit move, Delete/Backspace sells, Ctrl/Cmd+Z undoes, I focuses inspection, O cycles overlays, P pauses/resumes, 1/2/3 choose 1×/2×/4× speed, H opens help, and Escape cancels a preview or closes help. Right-click sells owned equipment while planning. All actions are also available through DOM controls.

Saving always pauses operation. Loading restores the complete saved simulation in planning mode and does not add offline time. Resize changes presentation only; it does not rebuild or advance the room.

The simulation is a deterministic, height-averaged game approximation, not validated CFD or facility-design or safety advice. A WebGL-capable browser is required for the 3D room; the classic campaign link remains available if initialization fails.


### Room view and mobile controls

Rotate the room with Q/E, the view-arrow buttons, or a middle-button drag. Use the mouse wheel or +/− buttons to zoom; Camera switches between Room and Plan views. Click/tap a rack’s temperature label to select that exact rack, then use Move, Rotate, or Sell in Inspection. While placing, on-screen Rotate rack and Cancel controls are available without a keyboard. Right-click a rack or its label to sell it.

The tycoon supports portrait and landscape layouts: all six statistics remain visible, and on small screens the equipment panel scrolls below the room. Touch controls have 44px minimum targets. The classic campaign retains its own portrait warning. For phone testing on the same local network, start Vite with `npm run dev -- --host 0.0.0.0` and open the Network URL it prints.


### Reading airflow

Blue roof arrows point into rack intakes and out of cooler supplies; red roof arrows point out of rack exhausts and into cooler returns. They rotate with equipment and remain visible while paused. The Airflow overlay uses filled, dark-outlined arrows colored by actual local air temperature. Use Hide labels to inspect crowded rooms without temperature tags covering arrows; Show labels restores direct rack-label selection.
