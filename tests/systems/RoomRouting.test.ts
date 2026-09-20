import { describe, it, expect } from 'vitest';
import { buildNetwork, canRoute, dragCells, ROOM } from '../../src/prototype/RouteSystem';
import { createServers, updateTemperatures } from '@/systems/TemperatureSystem';

describe('3D room routing', () => {
  it('automatically branches a nine-section network to all three racks', () => {
    const cells = new Set(['1,3', '2,3', '3,3', '4,3', '5,3', '5,2', '5,1', '5,4', '5,5']);
    const { grid, airflow } = buildNetwork(cells);
    expect(grid.ducts.size).toBe(9);
    expect(airflow.cooledServers.size).toBe(3);
    const servers = createServers(ROOM.servers.map((s, i) => ({ ...s, id: `rack-${i}` })));
    const result = updateTemperatures(servers, 4, airflow.cooledServers);
    expect(result.allCooled).toBe(true);
    expect(result.hasMeltdown).toBe(false);
  });
  it('does not connect an isolated route or allow airflow from the back of the cooler', () => {
    expect(buildNetwork(new Set(['5,1', '5,2', '5,3'])).airflow.cooledServers.size).toBe(0);
    expect(buildNetwork(new Set(['0,2', '1,2', '2,2'])).airflow.airflowPaths.size).toBe(0);
  });
  it('re-evaluates connectivity after a shared trunk section is erased', () => {
    const cells = new Set(['1,3', '2,3', '3,3', '4,3', '5,3']);
    expect(buildNetwork(cells).airflow.cooledServers.size).toBe(1);
    cells.delete('3,3');
    expect(buildNetwork(cells).airflow.cooledServers.size).toBe(0);
  });
  it('interpolates fast drags but stops before obstacles', () => {
    expect(dragCells([0,3], [5,3])).toEqual([[1,3],[2,3],[3,3],[4,3],[5,3]]);
    expect(dragCells([1,2], [5,2])).toEqual([[2,2]]);
    expect(canRoute(6,1)).toBe(false);
    expect(canRoute(-1,3)).toBe(false);
  });
});
