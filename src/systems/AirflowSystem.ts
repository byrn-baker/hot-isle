import type { Direction, DuctTile, DuctType, LevelColdSourceConfig, Rotation } from '@/types';
import type { GridState } from './GridSystem';
import { getCellType, getDuctAt } from './GridSystem';

/**
 * Returns the set of open connection directions for a duct tile
 * based on its type and rotation.
 */
export function getDuctConnections(type: DuctType, rotation: Rotation): Direction[] {
  const baseConnections: Record<DuctType, Direction[]> = {
    straight: ['up', 'down'],
    corner: ['up', 'right'],
    t_junction: ['up', 'right', 'down'],
    cross: ['up', 'right', 'down', 'left'],
  };

  const base = baseConnections[type];
  return base.map((dir) => rotateDirection(dir, rotation));
}

function rotateDirection(dir: Direction, degrees: Rotation): Direction {
  const order: Direction[] = ['up', 'right', 'down', 'left'];
  const steps = degrees / 90;
  const currentIndex = order.indexOf(dir);
  return order[(currentIndex + steps) % 4]!;
}

export function getOppositeDirection(dir: Direction): Direction {
  const opposites: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  };
  return opposites[dir];
}

function getAdjacentPosition(x: number, y: number, dir: Direction): { x: number; y: number } {
  switch (dir) {
    case 'up': return { x, y: y - 1 };
    case 'down': return { x, y: y + 1 };
    case 'left': return { x: x - 1, y };
    case 'right': return { x: x + 1, y };
  }
}

export interface AirflowResult {
  /** IDs of servers receiving cold air, mapped to total cooling strength */
  cooledServers: Map<string, number>;
  /** Set of grid positions (as "x,y") that have active airflow passing through */
  airflowPaths: Set<string>;
}

/**
 * Resolves airflow from all cold sources through connected duct paths.
 * Returns which servers are being cooled and the airflow path for visualization.
 */
export function resolveAirflow(
  grid: GridState,
  coldSources: LevelColdSourceConfig[],
  servers: { id: string; x: number; y: number }[]
): AirflowResult {
  const cooledServers = new Map<string, number>();
  const airflowPaths = new Set<string>();

  // Build a quick lookup for server positions
  const serverByPos = new Map<string, { id: string; x: number; y: number }>();
  for (const server of servers) {
    serverByPos.set(`${server.x},${server.y}`, server);
  }

  for (const source of coldSources) {
    // Air flows from the source in its emission direction
    const startDir = source.direction;
    const startPos = getAdjacentPosition(source.x, source.y, startDir);

    // BFS/DFS traversal from the source
    traceAirflow(
      grid,
      startPos.x,
      startPos.y,
      startDir,
      source.strength,
      serverByPos,
      cooledServers,
      airflowPaths,
      new Set()
    );
  }

  return { cooledServers, airflowPaths };
}

function traceAirflow(
  grid: GridState,
  x: number,
  y: number,
  entryDirection: Direction, // direction the air is COMING FROM (the side it enters)
  strength: number,
  serverByPos: Map<string, { id: string; x: number; y: number }>,
  cooledServers: Map<string, number>,
  airflowPaths: Set<string>,
  visited: Set<string>
): void {
  const posKey = `${x},${y}`;

  // Prevent infinite loops
  if (visited.has(posKey)) return;

  const cellType = getCellType(grid, x, y);
  if (cellType === null) return; // Out of bounds

  // Air hits a server — it gets cooled
  if (cellType === 'server') {
    const server = serverByPos.get(posKey);
    if (server) {
      const existing = cooledServers.get(server.id) ?? 0;
      cooledServers.set(server.id, existing + strength);
    }
    return; // Air doesn't pass through servers
  }

  // Air can only flow through duct tiles
  if (cellType !== 'duct') return;

  const duct: DuctTile | null = getDuctAt(grid, x, y);
  if (!duct) return;

  const connections = getDuctConnections(duct.type, duct.rotation);

  // The air enters from a direction — the duct must have an opening on the opposite side
  const inletSide = getOppositeDirection(entryDirection);
  if (!connections.includes(inletSide)) return; // Duct doesn't have an inlet where air is coming from

  visited.add(posKey);
  airflowPaths.add(posKey);

  // Air exits through all OTHER open connections
  for (const outDir of connections) {
    if (outDir === inletSide) continue; // Don't go back the way it came

    const nextPos = getAdjacentPosition(x, y, outDir);
    traceAirflow(
      grid,
      nextPos.x,
      nextPos.y,
      outDir,
      strength,
      serverByPos,
      cooledServers,
      airflowPaths,
      visited
    );
  }
}
