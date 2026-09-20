import type { Direction, DuctType, LevelConfig, Rotation } from '@/types';
import { createGrid, placeDuct } from '@/systems/GridSystem';
import { getDuctConnections, resolveAirflow } from '@/systems/AirflowSystem';

export const ROOM: LevelConfig = {
  id: 'room-001', name: 'The first shift', gridWidth: 7, gridHeight: 7,
  servers: [1, 3, 5].map(y => ({ x: 6, y, meltdownThreshold: 100, safeThreshold: 40, heatRate: 4, coolingRate: 6 })),
  coldSources: [{ x: 0, y: 3, direction: 'right', strength: 1 }],
  obstacles: [{ x: 3, y: 2 }, { x: 3, y: 4 }],
  availableTiles: { straight: 18, corner: 18, t_junction: 18, cross: 18 },
  scoring: { threeStarTiles: 9, twoStarTiles: 13, threeStarTime: 30, twoStarTime: 60 },
};
export const BUDGET = 18;
export const keyOf = (x: number, y: number): string => `${x},${y}`;
export const steps: [Direction, number, number][] = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
export function canRoute(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < ROOM.gridWidth && y < ROOM.gridHeight &&
    ![...ROOM.servers, ...ROOM.coldSources, ...ROOM.obstacles].some(p => p.x === x && p.y === y);
}
export function buildNetwork(cells: Set<string>) {
  const grid = createGrid(ROOM);
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    if (!canRoute(x, y)) continue;
    const ports = steps.filter(([, dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return cells.has(keyOf(nx, ny)) || ROOM.servers.some(s => s.x === nx && s.y === ny) ||
        ROOM.coldSources.some(s => s.x + 1 === x && s.y === y && nx === s.x && ny === s.y);
    }).map(([direction]) => direction);
    // The smallest matching tile automatically forms corners and branches.
    outer: for (const type of ['straight', 'corner', 't_junction', 'cross'] as DuctType[]) {
      for (const rotation of [0, 90, 180, 270] as Rotation[]) {
        const connections = getDuctConnections(type, rotation);
        if (ports.every(p => connections.includes(p))) {
          placeDuct(grid, x, y, type, rotation);
          break outer;
        }
      }
    }
  }
  const servers = ROOM.servers.map((s, i) => ({ ...s, id: `rack-${i}` }));
  return { grid, airflow: resolveAirflow(grid, ROOM.coldSources, servers) };
}

/** Fill cells skipped by a quick drag; stop at equipment rather than routing through it. */
export function dragCells(from: [number, number], to: [number, number]): [number, number][] {
  const result: [number, number][] = [];
  let [x, y] = from;
  while (x !== to[0] || y !== to[1]) {
    if (Math.abs(to[0] - x) >= Math.abs(to[1] - y)) x += Math.sign(to[0] - x);
    else y += Math.sign(to[1] - y);
    if (!canRoute(x, y)) break;
    result.push([x, y]);
  }
  return result;
}
