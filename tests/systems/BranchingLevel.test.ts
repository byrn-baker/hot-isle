import { describe, expect, it } from 'vitest';
import levelData from '../../src/data/levels/level-003.json';
import type { DuctType, LevelConfig, Rotation } from '@/types';
import { createGrid, placeDuct } from '@/systems/GridSystem';
import { resolveAirflow } from '@/systems/AirflowSystem';
import { createServers, updateTemperatures } from '@/systems/TemperatureSystem';
import { calculateScore } from '@/systems/ScoreSystem';

describe('Branching Out campaign solution', () => {
  it('cools both racks with available inventory and earns three stars', () => {
    const level = levelData as LevelConfig;
    const grid = createGrid(level);
    const remaining = { ...level.availableTiles };
    const solution: [number, number, DuctType, Rotation][] = [
      [1, 2, 'straight', 90], [2, 2, 'straight', 90], [3, 2, 'straight', 90],
      [4, 2, 't_junction', 90], [5, 2, 't_junction', 180],
      [5, 1, 'straight', 0], [5, 3, 'straight', 0],
    ];
    for (const [x, y, type, rotation] of solution) {
      expect(remaining[type]--).toBeGreaterThan(0);
      expect(placeDuct(grid, x, y, type, rotation)).not.toBeNull();
    }
    const configs = level.servers.map((server, i) => ({ ...server, id: `s${i}` }));
    const airflow = resolveAirflow(grid, level.coldSources, configs);
    expect([...airflow.cooledServers.values()]).toEqual([1, 1]);
    const servers = createServers(configs);
    // Allow a player 15 seconds to construct the route on Normal.
    expect(updateTemperatures(servers, 15, new Map()).hasMeltdown).toBe(false);
    const result = updateTemperatures(servers, 7, airflow.cooledServers);
    expect(result.hasMeltdown).toBe(false);
    expect(result.allCooled).toBe(true);
    expect(calculateScore(solution.length, 22, level.scoring).stars).toBe(3);
  });
});
