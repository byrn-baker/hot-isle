import type {
  CellType,
  DuctTile,
  DuctType,
  GridCell,
  LevelConfig,
  Rotation,
} from '@/types';

export interface GridState {
  width: number;
  height: number;
  cells: GridCell[][];
  ducts: Map<string, DuctTile>;
}

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

let nextDuctId = 0;

export function createGrid(config: LevelConfig): GridState {
  const cells: GridCell[][] = [];

  for (let y = 0; y < config.gridHeight; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < config.gridWidth; x++) {
      row.push({ x, y, type: 'empty' });
    }
    cells.push(row);
  }

  // Place servers
  for (const server of config.servers) {
    cells[server.y]![server.x]!.type = 'server';
  }

  // Place cold sources
  for (const source of config.coldSources) {
    cells[source.y]![source.x]!.type = 'cold_source';
  }

  // Place obstacles
  for (const obs of config.obstacles) {
    cells[obs.y]![obs.x]!.type = 'obstacle';
  }

  return {
    width: config.gridWidth,
    height: config.gridHeight,
    cells,
    ducts: new Map(),
  };
}

export function getCellType(grid: GridState, x: number, y: number): CellType | null {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return null;
  return grid.cells[y]![x]!.type;
}

export function isInBounds(grid: GridState, x: number, y: number): boolean {
  return x >= 0 && x < grid.width && y >= 0 && y < grid.height;
}

export function canPlaceDuct(grid: GridState, x: number, y: number): boolean {
  if (!isInBounds(grid, x, y)) return false;
  return grid.cells[y]![x]!.type === 'empty';
}

export function placeDuct(
  grid: GridState,
  x: number,
  y: number,
  type: DuctType,
  rotation: Rotation = 0
): DuctTile | null {
  if (!canPlaceDuct(grid, x, y)) return null;

  const duct: DuctTile = {
    id: `duct-${nextDuctId++}`,
    position: { x, y },
    type,
    rotation,
  };

  grid.cells[y]![x]!.type = 'duct';
  grid.ducts.set(posKey(x, y), duct);

  return duct;
}

export function removeDuct(grid: GridState, x: number, y: number): DuctTile | null {
  const key = posKey(x, y);
  const duct = grid.ducts.get(key);
  if (!duct) return null;

  grid.cells[y]![x]!.type = 'empty';
  grid.ducts.delete(key);

  return duct;
}

export function rotateDuct(grid: GridState, x: number, y: number): DuctTile | null {
  const key = posKey(x, y);
  const duct = grid.ducts.get(key);
  if (!duct) return null;

  duct.rotation = ((duct.rotation + 90) % 360) as Rotation;
  return duct;
}

export function getDuctAt(grid: GridState, x: number, y: number): DuctTile | null {
  return grid.ducts.get(posKey(x, y)) ?? null;
}

export function getAllDucts(grid: GridState): DuctTile[] {
  return Array.from(grid.ducts.values());
}

/** Reset the internal ID counter — for testing only. */
export function _resetIdCounter(): void {
  nextDuctId = 0;
}
