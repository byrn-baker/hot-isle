# Level Schema Guide — Hot Isle Cold Isle

Create your own levels by writing a JSON file following this schema.

## Quick Start

Copy this minimal example and modify it:

```json
{
  "id": "my-level",
  "name": "My Custom Level",
  "gridWidth": 5,
  "gridHeight": 5,
  "servers": [
    {
      "x": 4,
      "y": 2,
      "meltdownThreshold": 100,
      "safeThreshold": 40,
      "heatRate": 4,
      "coolingRate": 8
    }
  ],
  "coldSources": [
    {
      "x": 0,
      "y": 2,
      "direction": "right",
      "strength": 1
    }
  ],
  "obstacles": [],
  "availableTiles": {
    "straight": 5,
    "corner": 3,
    "t_junction": 2,
    "cross": 1
  },
  "scoring": {
    "threeStarTiles": 3,
    "twoStarTiles": 5,
    "threeStarTime": 30,
    "twoStarTime": 60
  }
}
```

## Field Reference

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the level (e.g., "my-level-01") |
| `name` | string | Yes | Display name shown in-game (max 50 characters) |
| `gridWidth` | integer | Yes | Grid columns (3–20) |
| `gridHeight` | integer | Yes | Grid rows (3–20) |
| `servers` | array | Yes | At least 1 server rack |
| `coldSources` | array | Yes | At least 1 cold air source |
| `obstacles` | array | Yes | Blocked cells (can be empty `[]`) |
| `availableTiles` | object | Yes | Duct tiles the player can use |
| `scoring` | object | Yes | Star rating thresholds |

### Server Object

Each server is a heat-generating device the player must cool.

| Field | Type | Description |
|-------|------|-------------|
| `x` | integer | Column position (0-indexed, must be within grid) |
| `y` | integer | Row position (0-indexed, must be within grid) |
| `meltdownThreshold` | number | Temperature at which the server explodes (≥ 50) |
| `safeThreshold` | number | Temperature at which the server counts as "cooled" (≥ 20) |
| `heatRate` | number | Degrees per second the server heats up when uncooled (≥ 0.1) |
| `coolingRate` | number | Degrees per second the server cools when receiving air (≥ 0.1) |

Servers start at a temperature between safeThreshold and meltdownThreshold.

### Cold Source Object

Each cold source emits cold air in one direction.

| Field | Type | Description |
|-------|------|-------------|
| `x` | integer | Column position (0-indexed) |
| `y` | integer | Row position (0-indexed) |
| `direction` | string | Direction air flows: `"up"`, `"down"`, `"left"`, or `"right"` |
| `strength` | number | Cooling power multiplier (≥ 0.1, typically 1) |

### Obstacle Object

Obstacles block placement. Players must route ducts around them.

| Field | Type | Description |
|-------|------|-------------|
| `x` | integer | Column position |
| `y` | integer | Row position |

### Available Tiles

How many of each duct type the player can place.

| Field | Type | Description |
|-------|------|-------------|
| `straight` | integer | Connects top↔bottom (rotatable) |
| `corner` | integer | Connects top↔right (rotatable to any L-shape) |
| `t_junction` | integer | Connects top, right, and bottom (rotatable, splits airflow) |
| `cross` | integer | Connects all 4 sides (airflow passes through) |

### Scoring

Star ratings based on efficiency.

| Field | Type | Description |
|-------|------|-------------|
| `threeStarTiles` | number | Max tiles used for 3 stars |
| `twoStarTiles` | number | Max tiles used for 2 stars |
| `threeStarTime` | number | Max seconds for 3 stars |
| `twoStarTime` | number | Max seconds for 2 stars |

Using more tiles or time than `twoStarTiles`/`twoStarTime` gives 1 star.
Final star rating = minimum of tile stars and time stars.

## Grid Coordinate System

```
(0,0) (1,0) (2,0) (3,0) (4,0)
(0,1) (1,1) (2,1) (3,1) (4,1)
(0,2) (1,2) (2,2) (3,2) (4,2)
(0,3) (1,3) (2,3) (3,3) (4,3)
(0,4) (1,4) (2,4) (3,4) (4,4)
```

- `x` = column (left to right)
- `y` = row (top to bottom)
- Top-left corner is (0, 0)

## Tips for Good Levels

1. **Ensure solvability** — Make sure there's at least one valid path from cold sources to all servers using the available tiles.
2. **Tune difficulty with heatRate** — Higher values (5–8) create time pressure. Lower values (2–3) give the player time to think.
3. **Use obstacles sparingly** — A few well-placed obstacles create routing puzzles without frustration.
4. **Balance tile counts** — Give slightly more tiles than the minimum solution requires for 1-star completion.
5. **Set scoring thresholds** — `threeStarTiles` should be the optimal solution, `twoStarTiles` around 1.5x optimal.
6. **Test your level** — Import and play it yourself before sharing!

## Importing

1. Open the game → Menu → Custom Levels
2. Paste your JSON into the text area, or click "Upload File"
3. If validation passes, your level appears in the list
4. Click "Play" to test it

## Sharing

Use the "Copy JSON" or "Download .json" buttons next to your custom level to share it with others.
