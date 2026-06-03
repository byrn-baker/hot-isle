import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGrid,
  canPlaceDuct,
  placeDuct,
  removeDuct,
  rotateDuct,
  getDuctAt,
  getCellType,
  isInBounds,
  _resetIdCounter,
} from '@/systems/GridSystem';
import type { LevelConfig } from '@/types';

const minimalLevel: LevelConfig = {
  id: 'test-level',
  name: 'Test',
  gridWidth: 5,
  gridHeight: 5,
  servers: [{ x: 4, y: 2, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 }],
  coldSources: [{ x: 0, y: 2, direction: 'right', strength: 1 }],
  obstacles: [{ x: 2, y: 0 }],
  availableTiles: { straight: 5, corner: 3, t_junction: 1, cross: 1 },
  scoring: { threeStarTiles: 3, twoStarTiles: 5, threeStarTime: 30, twoStarTime: 60 },
};

describe('GridSystem', () => {
  beforeEach(() => {
    _resetIdCounter();
  });

  describe('createGrid', () => {
    it('creates grid with correct dimensions', () => {
      const grid = createGrid(minimalLevel);
      expect(grid.width).toBe(5);
      expect(grid.height).toBe(5);
      expect(grid.cells.length).toBe(5);
      expect(grid.cells[0]!.length).toBe(5);
    });

    it('places servers at configured positions', () => {
      const grid = createGrid(minimalLevel);
      expect(getCellType(grid, 4, 2)).toBe('server');
    });

    it('places cold sources at configured positions', () => {
      const grid = createGrid(minimalLevel);
      expect(getCellType(grid, 0, 2)).toBe('cold_source');
    });

    it('places obstacles at configured positions', () => {
      const grid = createGrid(minimalLevel);
      expect(getCellType(grid, 2, 0)).toBe('obstacle');
    });

    it('fills remaining cells as empty', () => {
      const grid = createGrid(minimalLevel);
      expect(getCellType(grid, 1, 1)).toBe('empty');
    });
  });

  describe('isInBounds', () => {
    it('returns true for valid positions', () => {
      const grid = createGrid(minimalLevel);
      expect(isInBounds(grid, 0, 0)).toBe(true);
      expect(isInBounds(grid, 4, 4)).toBe(true);
    });

    it('returns false for out-of-bounds positions', () => {
      const grid = createGrid(minimalLevel);
      expect(isInBounds(grid, -1, 0)).toBe(false);
      expect(isInBounds(grid, 5, 0)).toBe(false);
      expect(isInBounds(grid, 0, -1)).toBe(false);
      expect(isInBounds(grid, 0, 5)).toBe(false);
    });
  });

  describe('canPlaceDuct', () => {
    it('allows placement on empty cells', () => {
      const grid = createGrid(minimalLevel);
      expect(canPlaceDuct(grid, 1, 1)).toBe(true);
    });

    it('rejects placement on servers', () => {
      const grid = createGrid(minimalLevel);
      expect(canPlaceDuct(grid, 4, 2)).toBe(false);
    });

    it('rejects placement on cold sources', () => {
      const grid = createGrid(minimalLevel);
      expect(canPlaceDuct(grid, 0, 2)).toBe(false);
    });

    it('rejects placement on obstacles', () => {
      const grid = createGrid(minimalLevel);
      expect(canPlaceDuct(grid, 2, 0)).toBe(false);
    });

    it('rejects placement out of bounds', () => {
      const grid = createGrid(minimalLevel);
      expect(canPlaceDuct(grid, -1, 0)).toBe(false);
    });
  });

  describe('placeDuct', () => {
    it('places a duct on an empty cell', () => {
      const grid = createGrid(minimalLevel);
      const duct = placeDuct(grid, 1, 2, 'straight');
      expect(duct).not.toBeNull();
      expect(duct!.type).toBe('straight');
      expect(duct!.rotation).toBe(0);
      expect(getCellType(grid, 1, 2)).toBe('duct');
    });

    it('returns null when placing on occupied cell', () => {
      const grid = createGrid(minimalLevel);
      const duct = placeDuct(grid, 4, 2, 'straight'); // server position
      expect(duct).toBeNull();
    });

    it('tracks placed duct in ducts map', () => {
      const grid = createGrid(minimalLevel);
      placeDuct(grid, 1, 2, 'corner', 90);
      const found = getDuctAt(grid, 1, 2);
      expect(found).not.toBeNull();
      expect(found!.type).toBe('corner');
      expect(found!.rotation).toBe(90);
    });
  });

  describe('removeDuct', () => {
    it('removes an existing duct and restores cell to empty', () => {
      const grid = createGrid(minimalLevel);
      placeDuct(grid, 1, 2, 'straight');
      const removed = removeDuct(grid, 1, 2);
      expect(removed).not.toBeNull();
      expect(getCellType(grid, 1, 2)).toBe('empty');
      expect(getDuctAt(grid, 1, 2)).toBeNull();
    });

    it('returns null when no duct exists', () => {
      const grid = createGrid(minimalLevel);
      expect(removeDuct(grid, 1, 1)).toBeNull();
    });
  });

  describe('rotateDuct', () => {
    it('rotates duct by 90 degrees', () => {
      const grid = createGrid(minimalLevel);
      placeDuct(grid, 1, 2, 'corner', 0);
      rotateDuct(grid, 1, 2);
      expect(getDuctAt(grid, 1, 2)!.rotation).toBe(90);
    });

    it('wraps rotation from 270 to 0', () => {
      const grid = createGrid(minimalLevel);
      placeDuct(grid, 1, 2, 'corner', 270);
      rotateDuct(grid, 1, 2);
      expect(getDuctAt(grid, 1, 2)!.rotation).toBe(0);
    });

    it('returns null when no duct at position', () => {
      const grid = createGrid(minimalLevel);
      expect(rotateDuct(grid, 1, 1)).toBeNull();
    });
  });
});
