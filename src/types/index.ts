// === Difficulty ===

export type Difficulty = 'easy' | 'normal' | 'hard';

// === Directions & Positioning ===

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

// === Duct Tile Types ===

export type DuctType = 'straight' | 'corner' | 't_junction' | 'cross';
export type Rotation = 0 | 90 | 180 | 270;

export interface DuctTile {
  id: string;
  position: Position;
  type: DuctType;
  rotation: Rotation;
}

// === Grid ===

export type CellType = 'empty' | 'server' | 'cold_source' | 'duct' | 'obstacle';

export interface GridCell {
  x: number;
  y: number;
  type: CellType;
}

// === Server Rack ===

export interface ServerRack {
  id: string;
  position: Position;
  temperature: number;
  meltdownThreshold: number;
  safeThreshold: number;
  heatRate: number;
  coolingRate: number;
  isMeltedDown: boolean;
}

// === Cold Source ===

export interface ColdSource {
  id: string;
  position: Position;
  direction: Direction;
  strength: number;
}

// === Level Configuration ===

export interface LevelServerConfig {
  x: number;
  y: number;
  meltdownThreshold: number;
  safeThreshold: number;
  heatRate: number;
  coolingRate: number;
}

export interface LevelColdSourceConfig {
  x: number;
  y: number;
  direction: Direction;
  strength: number;
}

export interface LevelScoringConfig {
  threeStarTiles: number;
  twoStarTiles: number;
  threeStarTime: number;
  twoStarTime: number;
}

export interface LevelConfig {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  servers: LevelServerConfig[];
  coldSources: LevelColdSourceConfig[];
  obstacles: Position[];
  availableTiles: {
    straight: number;
    corner: number;
    t_junction: number;
    cross: number;
  };
  scoring: LevelScoringConfig;
}

// === Player Progress ===

export interface LevelProgress {
  completed: boolean;
  stars: 1 | 2 | 3;
  bestTilesUsed: number;
  bestTime: number;
}

export interface PlayerProgress {
  levels: Record<string, LevelProgress>;
}

// === Leaderboard ===

export interface LeaderboardEntry {
  nickname: string;
  stars: number;
  totalTime: number;
  levelsCompleted: number;
}

// === Custom Levels ===

export interface CustomLevelEntry {
  id: string;
  name: string;
  config: LevelConfig;
  importedAt: string;
}

export interface CustomLevelStore {
  levels: CustomLevelEntry[];
}
