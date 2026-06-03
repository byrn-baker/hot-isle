# Hot Isle Cold Isle

A grid-based puzzle game where you route cold air through duct tiles to prevent datacenter servers from overheating and melting down.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5174` in your browser.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`.

### Run Tests

```bash
npm test
```

## How to Play

**Goal:** Cool all servers below their safe temperature threshold before any server reaches meltdown.

### Controls

| Action | Mouse/Touch | Keyboard |
|--------|-------------|----------|
| Place tile | Click empty cell | Arrow keys + Space |
| Rotate tile | Click placed tile | R |
| Remove tile | Right-click / long-press | Delete / Backspace |
| Pause | Click ⏸ button | Esc / P |

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
