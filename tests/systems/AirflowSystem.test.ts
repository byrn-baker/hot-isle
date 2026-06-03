import { describe, it, expect, beforeEach } from 'vitest';
import { resolveAirflow, getDuctConnections } from '@/systems/AirflowSystem';
import { createGrid, placeDuct, _resetIdCounter } from '@/systems/GridSystem';
import type { LevelConfig } from '@/types';

const baseLevel: LevelConfig = {
  id: 'test',
  name: 'Test',
  gridWidth: 5,
  gridHeight: 5,
  servers: [{ x: 4, y: 2, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 }],
  coldSources: [{ x: 0, y: 2, direction: 'right', strength: 1 }],
  obstacles: [],
  availableTiles: { straight: 10, corner: 10, t_junction: 5, cross: 5 },
  scoring: { threeStarTiles: 3, twoStarTiles: 5, threeStarTime: 30, twoStarTime: 60 },
};

describe('AirflowSystem', () => {
  beforeEach(() => {
    _resetIdCounter();
  });

  describe('getDuctConnections', () => {
    it('straight at 0° connects up and down', () => {
      expect(getDuctConnections('straight', 0)).toEqual(['up', 'down']);
    });

    it('straight at 90° connects right and left', () => {
      expect(getDuctConnections('straight', 90)).toEqual(['right', 'left']);
    });

    it('corner at 0° connects up and right', () => {
      expect(getDuctConnections('corner', 0)).toEqual(['up', 'right']);
    });

    it('corner at 90° connects right and down', () => {
      expect(getDuctConnections('corner', 90)).toEqual(['right', 'down']);
    });

    it('cross at any rotation connects all four', () => {
      expect(getDuctConnections('cross', 0)).toEqual(['up', 'right', 'down', 'left']);
      expect(getDuctConnections('cross', 90)).toEqual(['right', 'down', 'left', 'up']);
    });
  });

  describe('resolveAirflow', () => {
    it('returns no cooled servers when no ducts placed', () => {
      const grid = createGrid(baseLevel);
      const result = resolveAirflow(
        grid,
        baseLevel.coldSources,
        [{ id: 's1', x: 4, y: 2 }]
      );
      expect(result.cooledServers.size).toBe(0);
    });

    it('cools server with straight duct path', () => {
      const grid = createGrid(baseLevel);
      // Cold source at (0,2) emits right
      // Place straight ducts at (1,2), (2,2), (3,2) rotated 90° (left-right)
      placeDuct(grid, 1, 2, 'straight', 90);
      placeDuct(grid, 2, 2, 'straight', 90);
      placeDuct(grid, 3, 2, 'straight', 90);

      const result = resolveAirflow(
        grid,
        baseLevel.coldSources,
        [{ id: 's1', x: 4, y: 2 }]
      );
      expect(result.cooledServers.has('s1')).toBe(true);
      expect(result.cooledServers.get('s1')).toBe(1);
    });

    it('tracks airflow path positions', () => {
      const grid = createGrid(baseLevel);
      placeDuct(grid, 1, 2, 'straight', 90);
      placeDuct(grid, 2, 2, 'straight', 90);

      const result = resolveAirflow(
        grid,
        baseLevel.coldSources,
        [{ id: 's1', x: 4, y: 2 }]
      );
      expect(result.airflowPaths.has('1,2')).toBe(true);
      expect(result.airflowPaths.has('2,2')).toBe(true);
    });

    it('does not cool server with broken path', () => {
      const grid = createGrid(baseLevel);
      // Place only one duct, leaving a gap
      placeDuct(grid, 1, 2, 'straight', 90);

      const result = resolveAirflow(
        grid,
        baseLevel.coldSources,
        [{ id: 's1', x: 4, y: 2 }]
      );
      expect(result.cooledServers.has('s1')).toBe(false);
    });

    it('handles branching with t-junction', () => {
      // Cold source at (0,2), servers at (2,1) and (2,3)
      const level: LevelConfig = {
        ...baseLevel,
        servers: [
          { x: 2, y: 1, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
          { x: 2, y: 3, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
        ],
      };
      const grid = createGrid(level);
      // Straight duct at (1,2) connecting left-right
      placeDuct(grid, 1, 2, 'straight', 90);
      // T-junction at (2,2): need inlet from left + exits up and down
      // Base t_junction connections: up, right, down
      // At 180°: down, left, up — has left (inlet), up and down (exits)
      placeDuct(grid, 2, 2, 't_junction', 180);

      const result = resolveAirflow(
        grid,
        level.coldSources,
        [{ id: 's1', x: 2, y: 1 }, { id: 's2', x: 2, y: 3 }]
      );
      expect(result.cooledServers.has('s1')).toBe(true);
      expect(result.cooledServers.has('s2')).toBe(true);
    });

    it('prevents loops (visited tracking)', () => {
      // Create a potential loop scenario - should not infinite loop
      const level: LevelConfig = {
        ...baseLevel,
        gridWidth: 4,
        gridHeight: 4,
        servers: [{ x: 3, y: 1, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 }],
        coldSources: [{ x: 0, y: 1, direction: 'right', strength: 1 }],
      };
      const grid = createGrid(level);
      // Place cross tiles in a loop pattern
      placeDuct(grid, 1, 1, 'cross', 0);
      placeDuct(grid, 2, 1, 'cross', 0);
      placeDuct(grid, 1, 2, 'cross', 0);
      placeDuct(grid, 2, 2, 'cross', 0);

      // Should not throw or infinite loop
      const result = resolveAirflow(
        grid,
        level.coldSources,
        [{ id: 's1', x: 3, y: 1 }]
      );
      expect(result.cooledServers.has('s1')).toBe(true);
    });

    it('handles multiple cold sources', () => {
      const level: LevelConfig = {
        ...baseLevel,
        coldSources: [
          { x: 0, y: 2, direction: 'right', strength: 1 },
          { x: 4, y: 2, direction: 'left', strength: 0.5 },
        ],
        servers: [{ x: 2, y: 2, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 }],
      };
      const grid = createGrid(level);
      placeDuct(grid, 1, 2, 'straight', 90);
      placeDuct(grid, 3, 2, 'straight', 90);

      const result = resolveAirflow(
        grid,
        level.coldSources,
        [{ id: 's1', x: 2, y: 2 }]
      );
      // Server should receive cooling from both sources
      expect(result.cooledServers.get('s1')).toBe(1.5);
    });
  });
});
