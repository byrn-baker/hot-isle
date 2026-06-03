import type { LevelConfig } from '@/types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  level?: LevelConfig;
}

const VALID_DIRECTIONS = ['up', 'down', 'left', 'right'];

/**
 * Validates a raw JSON object against the LevelConfig schema.
 * Returns structured errors if invalid.
 */
export function validateLevel(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ field: 'root', message: 'Level must be a JSON object' }] };
  }

  const obj = data as Record<string, unknown>;

  // Required string fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    errors.push({ field: 'id', message: 'id must be a non-empty string' });
  }
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    errors.push({ field: 'name', message: 'name must be a non-empty string' });
  }
  if (typeof obj.name === 'string' && obj.name.length > 50) {
    errors.push({ field: 'name', message: 'name must be 50 characters or fewer' });
  }

  // Grid dimensions
  const gridWidth = validateInteger(obj.gridWidth, 'gridWidth', 3, 20, errors);
  const gridHeight = validateInteger(obj.gridHeight, 'gridHeight', 3, 20, errors);

  // Servers
  if (!Array.isArray(obj.servers) || obj.servers.length === 0) {
    errors.push({ field: 'servers', message: 'servers must be a non-empty array' });
  } else {
    for (let i = 0; i < obj.servers.length; i++) {
      validateServer(obj.servers[i], i, gridWidth, gridHeight, errors);
    }
  }

  // Cold sources
  if (!Array.isArray(obj.coldSources) || obj.coldSources.length === 0) {
    errors.push({ field: 'coldSources', message: 'coldSources must be a non-empty array' });
  } else {
    for (let i = 0; i < obj.coldSources.length; i++) {
      validateColdSource(obj.coldSources[i], i, gridWidth, gridHeight, errors);
    }
  }

  // Obstacles
  if (!Array.isArray(obj.obstacles)) {
    errors.push({ field: 'obstacles', message: 'obstacles must be an array' });
  } else {
    for (let i = 0; i < obj.obstacles.length; i++) {
      validatePosition(obj.obstacles[i], `obstacles[${i}]`, gridWidth, gridHeight, errors);
    }
  }

  // Available tiles
  if (!obj.availableTiles || typeof obj.availableTiles !== 'object') {
    errors.push({ field: 'availableTiles', message: 'availableTiles must be an object' });
  } else {
    const tiles = obj.availableTiles as Record<string, unknown>;
    for (const key of ['straight', 'corner', 't_junction', 'cross']) {
      if (typeof tiles[key] !== 'number' || !Number.isInteger(tiles[key]) || (tiles[key] as number) < 0) {
        errors.push({ field: `availableTiles.${key}`, message: `${key} must be a non-negative integer` });
      }
    }
  }

  // Scoring
  if (!obj.scoring || typeof obj.scoring !== 'object') {
    errors.push({ field: 'scoring', message: 'scoring must be an object' });
  } else {
    const scoring = obj.scoring as Record<string, unknown>;
    for (const key of ['threeStarTiles', 'twoStarTiles', 'threeStarTime', 'twoStarTime']) {
      if (typeof scoring[key] !== 'number' || (scoring[key] as number) < 1) {
        errors.push({ field: `scoring.${key}`, message: `${key} must be a number >= 1` });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], level: obj as unknown as LevelConfig };
}

function validateInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
  errors: ValidationError[]
): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push({ field, message: `${field} must be an integer` });
    return null;
  }
  if (value < min || value > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}` });
    return null;
  }
  return value;
}

function validatePosition(
  pos: unknown,
  prefix: string,
  gridWidth: number | null,
  gridHeight: number | null,
  errors: ValidationError[]
): void {
  if (!pos || typeof pos !== 'object') {
    errors.push({ field: prefix, message: `${prefix} must be an object with x and y` });
    return;
  }
  const p = pos as Record<string, unknown>;
  if (typeof p.x !== 'number' || !Number.isInteger(p.x) || p.x < 0) {
    errors.push({ field: `${prefix}.x`, message: 'x must be a non-negative integer' });
  } else if (gridWidth !== null && p.x >= gridWidth) {
    errors.push({ field: `${prefix}.x`, message: `x (${p.x}) is outside grid width (${gridWidth})` });
  }
  if (typeof p.y !== 'number' || !Number.isInteger(p.y) || p.y < 0) {
    errors.push({ field: `${prefix}.y`, message: 'y must be a non-negative integer' });
  } else if (gridHeight !== null && p.y >= gridHeight) {
    errors.push({ field: `${prefix}.y`, message: `y (${p.y}) is outside grid height (${gridHeight})` });
  }
}

function validateServer(
  server: unknown,
  index: number,
  gridWidth: number | null,
  gridHeight: number | null,
  errors: ValidationError[]
): void {
  const prefix = `servers[${index}]`;
  if (!server || typeof server !== 'object') {
    errors.push({ field: prefix, message: `${prefix} must be an object` });
    return;
  }
  const s = server as Record<string, unknown>;
  validatePosition(s, prefix, gridWidth, gridHeight, errors);

  if (typeof s.meltdownThreshold !== 'number' || s.meltdownThreshold < 50) {
    errors.push({ field: `${prefix}.meltdownThreshold`, message: 'meltdownThreshold must be >= 50' });
  }
  if (typeof s.safeThreshold !== 'number' || s.safeThreshold < 20) {
    errors.push({ field: `${prefix}.safeThreshold`, message: 'safeThreshold must be >= 20' });
  }
  if (typeof s.heatRate !== 'number' || s.heatRate < 0.1) {
    errors.push({ field: `${prefix}.heatRate`, message: 'heatRate must be >= 0.1' });
  }
  if (typeof s.coolingRate !== 'number' || s.coolingRate < 0.1) {
    errors.push({ field: `${prefix}.coolingRate`, message: 'coolingRate must be >= 0.1' });
  }
}

function validateColdSource(
  source: unknown,
  index: number,
  gridWidth: number | null,
  gridHeight: number | null,
  errors: ValidationError[]
): void {
  const prefix = `coldSources[${index}]`;
  if (!source || typeof source !== 'object') {
    errors.push({ field: prefix, message: `${prefix} must be an object` });
    return;
  }
  const s = source as Record<string, unknown>;
  validatePosition(s, prefix, gridWidth, gridHeight, errors);

  if (typeof s.direction !== 'string' || !VALID_DIRECTIONS.includes(s.direction)) {
    errors.push({ field: `${prefix}.direction`, message: `direction must be one of: ${VALID_DIRECTIONS.join(', ')}` });
  }
  if (typeof s.strength !== 'number' || s.strength < 0.1) {
    errors.push({ field: `${prefix}.strength`, message: 'strength must be >= 0.1' });
  }
}
