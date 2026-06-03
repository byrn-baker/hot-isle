import { describe, it, expect } from 'vitest';
import {
  createServers,
  updateTemperatures,
  areAllServersCooled,
  hasAnyMeltdown,
} from '@/systems/TemperatureSystem';

describe('TemperatureSystem', () => {
  describe('createServers', () => {
    it('initializes servers above safe threshold', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      // Should start above safe threshold (server needs cooling)
      expect(servers[0]!.temperature).toBeGreaterThan(40);
      expect(servers[0]!.temperature).toBeLessThan(100);
      expect(servers[0]!.isMeltedDown).toBe(false);
    });
  });

  describe('updateTemperatures', () => {
    it('increases temperature when server is not cooled', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 10, coolingRate: 8 },
      ]);
      const startTemp = servers[0]!.temperature;
      const result = updateTemperatures(servers, 1, new Map());
      expect(result.servers[0]!.temperature).toBe(startTemp + 10);
    });

    it('decreases temperature when server is cooled', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      // Manually set temperature above ambient
      servers[0]!.temperature = 60;
      const cooled = new Map([['s1', 1]]);
      const result = updateTemperatures(servers, 1, cooled);
      expect(result.servers[0]!.temperature).toBe(60 - 8);
    });

    it('does not cool below ambient temperature', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 100 },
      ]);
      servers[0]!.temperature = 21;
      const cooled = new Map([['s1', 1]]);
      const result = updateTemperatures(servers, 1, cooled);
      expect(result.servers[0]!.temperature).toBe(20);
    });

    it('triggers meltdown when threshold exceeded', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 50, coolingRate: 8 },
      ]);
      servers[0]!.temperature = 95;
      const result = updateTemperatures(servers, 1, new Map());
      expect(result.servers[0]!.isMeltedDown).toBe(true);
      expect(result.hasMeltdown).toBe(true);
    });

    it('reports allCooled when all servers below safe threshold', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
        { id: 's2', x: 1, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      // Manually set both below safe threshold
      servers[0]!.temperature = 30;
      servers[1]!.temperature = 25;
      const result = updateTemperatures(servers, 0, new Map());
      expect(result.allCooled).toBe(true);
    });

    it('reports not allCooled when any server above safe threshold', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      servers[0]!.temperature = 50;
      const result = updateTemperatures(servers, 0, new Map());
      expect(result.allCooled).toBe(false);
    });

    it('applies cooling strength multiplier', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 10 },
      ]);
      servers[0]!.temperature = 80;
      const cooled = new Map([['s1', 2]]); // strength 2
      const result = updateTemperatures(servers, 1, cooled);
      // 80 - (10 * 2 * 1) = 60
      expect(result.servers[0]!.temperature).toBe(60);
    });
  });

  describe('areAllServersCooled', () => {
    it('returns true when all below safe threshold', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      servers[0]!.temperature = 30; // Manually set below safe threshold
      expect(areAllServersCooled(servers)).toBe(true);
    });

    it('returns false when one is above safe', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      servers[0]!.temperature = 50;
      expect(areAllServersCooled(servers)).toBe(false);
    });
  });

  describe('hasAnyMeltdown', () => {
    it('returns false when no meltdowns', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      expect(hasAnyMeltdown(servers)).toBe(false);
    });

    it('returns true when a server has melted', () => {
      const servers = createServers([
        { id: 's1', x: 0, y: 0, meltdownThreshold: 100, safeThreshold: 40, heatRate: 5, coolingRate: 8 },
      ]);
      servers[0]!.isMeltedDown = true;
      expect(hasAnyMeltdown(servers)).toBe(true);
    });
  });
});
