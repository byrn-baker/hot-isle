import { describe, it, expect } from 'vitest';
import { validateLevel } from '@/systems/LevelValidator';

const validLevel = {
  id: 'custom-test',
  name: 'My Custom Level',
  gridWidth: 5,
  gridHeight: 5,
  servers: [{ x: 4, y: 2, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 }],
  coldSources: [{ x: 0, y: 2, direction: 'right', strength: 1 }],
  obstacles: [{ x: 2, y: 0 }],
  availableTiles: { straight: 5, corner: 3, t_junction: 1, cross: 1 },
  scoring: { threeStarTiles: 3, twoStarTiles: 5, threeStarTime: 30, twoStarTime: 60 },
};

describe('LevelValidator', () => {
  it('accepts a valid level config', () => {
    const result = validateLevel(validLevel);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.level).toBeDefined();
  });

  it('rejects non-object input', () => {
    expect(validateLevel(null).valid).toBe(false);
    expect(validateLevel('string').valid).toBe(false);
    expect(validateLevel(123).valid).toBe(false);
  });

  it('catches missing id', () => {
    const { id, ...noId } = validLevel;
    const result = validateLevel(noId);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'id')).toBe(true);
  });

  it('catches empty name', () => {
    const result = validateLevel({ ...validLevel, name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('catches name too long', () => {
    const result = validateLevel({ ...validLevel, name: 'x'.repeat(51) });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('catches grid dimensions out of range', () => {
    const result = validateLevel({ ...validLevel, gridWidth: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'gridWidth')).toBe(true);
  });

  it('catches grid dimensions too large', () => {
    const result = validateLevel({ ...validLevel, gridHeight: 25 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'gridHeight')).toBe(true);
  });

  it('catches empty servers array', () => {
    const result = validateLevel({ ...validLevel, servers: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'servers')).toBe(true);
  });

  it('catches server position out of grid bounds', () => {
    const result = validateLevel({
      ...validLevel,
      servers: [{ x: 10, y: 2, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('servers[0]')));
  });

  it('catches invalid cold source direction', () => {
    const result = validateLevel({
      ...validLevel,
      coldSources: [{ x: 0, y: 2, direction: 'sideways', strength: 1 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('direction')));
  });

  it('catches negative available tiles', () => {
    const result = validateLevel({
      ...validLevel,
      availableTiles: { straight: -1, corner: 3, t_junction: 1, cross: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('straight')));
  });

  it('catches invalid scoring values', () => {
    const result = validateLevel({
      ...validLevel,
      scoring: { threeStarTiles: 0, twoStarTiles: 5, threeStarTime: 30, twoStarTime: 60 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('threeStarTiles')));
  });

  it('catches missing obstacles field', () => {
    const { obstacles, ...noObs } = validLevel;
    const result = validateLevel(noObs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'obstacles')).toBe(true);
  });
});
