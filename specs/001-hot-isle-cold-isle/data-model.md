# Data Model: Hot Isle Cold Isle

## Core Types

### GridCell
```
GridCell {
  x: number          // Column index
  y: number          // Row index
  type: "empty" | "server" | "cold_source" | "duct" | "obstacle"
  occupant: ServerRack | ColdSource | DuctTile | null
}
```

### ServerRack
```
ServerRack {
  id: string
  position: { x, y }
  temperature: number         // Current temp (starts at ambient)
  meltdownThreshold: number   // Temp at which equipment fails
  safeThreshold: number       // Temp at which level counts it as "cooled"
  heatRate: number            // Degrees per second when not cooled
  coolingRate: number         // Degrees per second when receiving airflow
  isMeltedDown: boolean
}
```

### ColdSource
```
ColdSource {
  id: string
  position: { x, y }
  direction: "up" | "down" | "left" | "right"  // Direction air is emitted
  strength: number                               // Cooling power
}
```

### DuctTile
```
DuctTile {
  id: string
  position: { x, y }
  type: "straight" | "corner" | "t_junction" | "cross"
  rotation: 0 | 90 | 180 | 270    // Degrees clockwise
  connections: Direction[]          // Derived from type + rotation
}
```

### Level Configuration (JSON)
```
LevelConfig {
  id: string
  name: string
  gridWidth: number
  gridHeight: number
  servers: Array<{
    x: number
    y: number
    meltdownThreshold: number
    safeThreshold: number
    heatRate: number
    coolingRate: number
  }>
  coldSources: Array<{
    x: number
    y: number
    direction: "up" | "down" | "left" | "right"
    strength: number
  }>
  obstacles: Array<{ x: number, y: number }>
  availableTiles: {
    straight: number
    corner: number
    t_junction: number
    cross: number
  }
  scoring: {
    threeStarTiles: number    // Max tiles used for 3 stars
    twoStarTiles: number      // Max tiles used for 2 stars
    threeStarTime: number     // Max seconds for 3-star time bonus
    twoStarTime: number       // Max seconds for 2-star time bonus
  }
}
```

### Player Progress (localStorage)
```
PlayerProgress {
  levels: Record<string, {
    completed: boolean
    stars: 1 | 2 | 3
    bestTilesUsed: number
    bestTime: number
  }>
}
```

### Custom Levels (localStorage)
```
CustomLevelStore {
  levels: Array<{
    id: string              // Generated UUID on import
    name: string            // From level JSON
    config: LevelConfig     // Validated level data
    importedAt: string      // ISO timestamp
  }>
}
```

## Duct Connection Logic

Each duct type defines which sides are open for airflow:

| Type | Base Connections (rotation 0) |
|------|-------------------------------|
| straight | top, bottom |
| corner | top, right |
| t_junction | top, right, bottom |
| cross | top, right, bottom, left |

Rotation shifts all connections clockwise by the rotation amount.

Air flows from a ColdSource in its emission direction. If the adjacent cell contains a duct with a matching inlet on that side, air continues through the duct's other open connections. This chain continues until it reaches a ServerRack (cooling applied) or a dead end.
