import type { ServerRack } from '@/types';
import { DEFAULT_AMBIENT_TEMP } from '@/utils/constants';

export interface TemperatureState {
  servers: ServerRack[];
  hasMeltdown: boolean;
  allCooled: boolean;
}

/**
 * Creates initial server state from level config.
 * Servers start above safe threshold so player must actively cool them.
 *
 * @param configs - Server configuration array
 * @param startTempMultiplier - Optional multiplier for starting temperature offset (default 1.0).
 *   Values < 1.0 start servers cooler (closer to safe), values > 1.0 start them hotter.
 */
export function createServers(
  configs: { id: string; x: number; y: number; meltdownThreshold: number; safeThreshold: number; heatRate: number; coolingRate: number }[],
  startTempMultiplier = 1.0
): ServerRack[] {
  return configs.map((c) => ({
    id: c.id,
    position: { x: c.x, y: c.y },
    temperature: c.safeThreshold + (c.meltdownThreshold - c.safeThreshold) * 0.3 * startTempMultiplier,
    meltdownThreshold: c.meltdownThreshold,
    safeThreshold: c.safeThreshold,
    heatRate: c.heatRate,
    coolingRate: c.coolingRate,
    isMeltedDown: false,
  }));
}

/**
 * Updates temperatures for all servers based on elapsed time and cooling state.
 * Returns updated temperature state with meltdown/win detection.
 *
 * @param servers - Current server rack states
 * @param heatDeltaSec - Effective time delta for heating (can be 0 during grace freeze, or adjusted by difficulty multiplier)
 * @param cooledServers - Map of server ID → cooling strength from AirflowSystem
 * @param coolDeltaSec - Optional separate time delta for cooling (defaults to heatDeltaSec if not provided)
 */
export function updateTemperatures(
  servers: ServerRack[],
  heatDeltaSec: number,
  cooledServers: Map<string, number>,
  coolDeltaSec?: number
): TemperatureState {
  const effectiveCoolDelta = coolDeltaSec ?? heatDeltaSec;
  let hasMeltdown = false;
  let allCooled = true;

  for (const server of servers) {
    if (server.isMeltedDown) {
      hasMeltdown = true;
      allCooled = false;
      continue;
    }

    const coolingStrength = cooledServers.get(server.id) ?? 0;

    if (coolingStrength > 0) {
      // Server is receiving cold air — cool it down
      server.temperature -= server.coolingRate * coolingStrength * effectiveCoolDelta;
    } else {
      // Server is heating up
      server.temperature += server.heatRate * heatDeltaSec;
    }

    // Clamp minimum to ambient
    if (server.temperature < DEFAULT_AMBIENT_TEMP) {
      server.temperature = DEFAULT_AMBIENT_TEMP;
    }

    // Check meltdown
    if (server.temperature >= server.meltdownThreshold) {
      server.isMeltedDown = true;
      hasMeltdown = true;
      allCooled = false;
    } else if (server.temperature > server.safeThreshold) {
      allCooled = false;
    }
  }

  return { servers, hasMeltdown, allCooled };
}

/**
 * Check if all servers are below their safe threshold (win condition).
 */
export function areAllServersCooled(servers: ServerRack[]): boolean {
  return servers.every((s) => !s.isMeltedDown && s.temperature <= s.safeThreshold);
}

/**
 * Check if any server has melted down (lose condition).
 */
export function hasAnyMeltdown(servers: ServerRack[]): boolean {
  return servers.some((s) => s.isMeltedDown);
}
