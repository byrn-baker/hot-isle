import type {
  AirState,
  EquipmentDefinition,
  EquipmentInstance,
  FootprintDefinition,
  GridPosition,
  Orientation,
  RoomDefinition,
} from './types';

export type PlacementFailureCode =
  | 'OUT_OF_BOUNDS'
  | 'FOOTPRINT_BLOCKED'
  | 'SERVICE_ACCESS_BLOCKED'
  | 'OCCUPIED'
  | 'INSUFFICIENT_FUNDS';

export interface ResolvedEquipmentGeometry {
  footprint: GridPosition[];
  serviceAccess: GridPosition[];
  ports: {
    intake?: GridPosition;
    exhaust?: GridPosition;
    return?: GridPosition;
    supply?: GridPosition;
  };
  widthCells: number;
  depthCells: number;
}

export interface PlacementWarning {
  code: 'PORT_BLOCKED';
  port: 'intake' | 'exhaust' | 'return' | 'supply';
  position: GridPosition;
}

export type PlacementResult =
  | { ok: true; geometry: ResolvedEquipmentGeometry; warnings: PlacementWarning[] }
  | {
      ok: false;
      code: PlacementFailureCode;
      position: GridPosition;
      messageKey: string;
    };

export interface PlacementContext {
  room: RoomDefinition;
  definitions: readonly EquipmentDefinition[];
  equipment: readonly EquipmentInstance[];
  excludeInstanceId?: string;
  availableCashMicrocents?: number;
  isPurchase?: boolean;
}

const ORIENTATION_TURNS: Record<Orientation, number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

export function positionKey(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

export function calculateResaleValueMicrocents(priceMicrocents: number, basisPoints: number): number {
  const quotient = Math.floor(priceMicrocents / 10_000);
  const remainder = priceMicrocents % 10_000;
  return quotient * basisPoints + Math.floor(remainder * basisPoints / 10_000);
}

export function isPositionInRoom(position: GridPosition, room: RoomDefinition): boolean {
  return position.x >= 0 && position.y >= 0
    && position.x < room.widthCells && position.y < room.heightCells;
}

export function getRotatedFootprintSize(
  footprint: FootprintDefinition,
  orientation: Orientation,
): { widthCells: number; depthCells: number } {
  return orientation === 'east' || orientation === 'west'
    ? { widthCells: footprint.depthCells, depthCells: footprint.widthCells }
    : { ...footprint };
}

/** Rotates a north-oriented offset clockwise while keeping the rotated bounding box at (0, 0). */
export function rotateOffset(
  offset: GridPosition,
  footprint: FootprintDefinition,
  orientation: Orientation,
): GridPosition {
  let { x, y } = offset;
  let width = footprint.widthCells;
  let depth = footprint.depthCells;
  for (let turn = 0; turn < ORIENTATION_TURNS[orientation]; turn += 1) {
    [x, y] = [depth - 1 - y, x];
    [width, depth] = [depth, width];
  }
  return { x, y };
}

function translate(position: GridPosition, offset: GridPosition): GridPosition {
  return { x: position.x + offset.x, y: position.y + offset.y };
}

export function resolveEquipmentGeometry(
  definition: EquipmentDefinition,
  position: GridPosition,
  orientation: Orientation,
): ResolvedEquipmentGeometry {
  const footprint: GridPosition[] = [];
  for (let y = 0; y < definition.footprint.depthCells; y += 1) {
    for (let x = 0; x < definition.footprint.widthCells; x += 1) {
      footprint.push(translate(position, rotateOffset({ x, y }, definition.footprint, orientation)));
    }
  }
  footprint.sort((a, b) => a.y - b.y || a.x - b.x);

  const rotateAndTranslate = (offset: GridPosition): GridPosition =>
    translate(position, rotateOffset(offset, definition.footprint, orientation));
  const ports = definition.kind === 'rack'
    ? {
        intake: rotateAndTranslate(definition.intakeOffset),
        exhaust: rotateAndTranslate(definition.exhaustOffset),
      }
    : {
        return: rotateAndTranslate(definition.returnOffset),
        supply: rotateAndTranslate(definition.supplyOffset),
      };

  return {
    footprint,
    serviceAccess: definition.serviceOffsets.map(rotateAndTranslate),
    ports,
    ...getRotatedFootprintSize(definition.footprint, orientation),
  };
}

function definitionById(
  definitions: readonly EquipmentDefinition[],
  definitionId: string,
): EquipmentDefinition {
  const definition = definitions.find((candidate) => candidate.id === definitionId);
  if (!definition) {
    throw new Error(`Unknown equipment definition: ${definitionId}`);
  }
  return definition;
}

function occupiedAndAccessKeys(context: PlacementContext): {
  occupied: Set<string>;
  reservedService: Set<string>;
} {
  const occupied = new Set<string>();
  const reservedService = new Set<string>();
  for (const instance of context.equipment) {
    if (instance.id === context.excludeInstanceId) continue;
    const definition = definitionById(context.definitions, instance.definitionId);
    const geometry = resolveEquipmentGeometry(definition, instance.position, instance.orientation);
    geometry.footprint.forEach((cell) => occupied.add(positionKey(cell)));
    geometry.serviceAccess.forEach((cell) => reservedService.add(positionKey(cell)));
  }
  return { occupied, reservedService };
}

function failure(
  code: PlacementFailureCode,
  position: GridPosition,
): Extract<PlacementResult, { ok: false }> {
  return { ok: false, code, position, messageKey: `tycoon.placement.${code.toLowerCase()}` };
}

export function validatePlacement(
  definition: EquipmentDefinition,
  position: GridPosition,
  orientation: Orientation,
  context: PlacementContext,
): PlacementResult {
  const geometry = resolveEquipmentGeometry(definition, position, orientation);
  const blocked = new Set(context.room.blockedCells.map(positionKey));
  const roomAccess = new Set(context.room.requiredAccessCells.map(positionKey));
  const envelopeHeat = new Set(context.room.envelopeHeatWByCell.map(({ position: cell }) => positionKey(cell)));
  const { occupied, reservedService } = occupiedAndAccessKeys(context);

  if (context.isPurchase && context.availableCashMicrocents !== undefined
      && context.availableCashMicrocents < definition.purchasePriceMicrocents) {
    return failure('INSUFFICIENT_FUNDS', position);
  }

  for (const cell of geometry.footprint) {
    if (!isPositionInRoom(cell, context.room)) return failure('OUT_OF_BOUNDS', cell);
    const key = positionKey(cell);
    if (occupied.has(key)) return failure('OCCUPIED', cell);
    if (blocked.has(key) || roomAccess.has(key) || envelopeHeat.has(key)) {
      return failure('FOOTPRINT_BLOCKED', cell);
    }
    if (reservedService.has(key)) return failure('SERVICE_ACCESS_BLOCKED', cell);
  }

  for (const cell of Object.values(geometry.ports)) {
    if (cell && !isPositionInRoom(cell, context.room)) return failure('OUT_OF_BOUNDS', cell);
  }

  const candidateFootprint = new Set(geometry.footprint.map(positionKey));
  for (const cell of geometry.serviceAccess) {
    if (!isPositionInRoom(cell, context.room)) return failure('OUT_OF_BOUNDS', cell);
    const key = positionKey(cell);
    if (blocked.has(key) || occupied.has(key) || candidateFootprint.has(key)) {
      return failure('SERVICE_ACCESS_BLOCKED', cell);
    }
  }

  const unavailableForPorts = new Set([...blocked, ...occupied, ...candidateFootprint]);
  const warnings: PlacementWarning[] = [];
  for (const [port, cell] of Object.entries(geometry.ports)) {
    if (cell && unavailableForPorts.has(positionKey(cell))) {
      warnings.push({
        code: 'PORT_BLOCKED',
        port: port as PlacementWarning['port'],
        position: cell,
      });
    }
  }
  return { ok: true, geometry, warnings };
}

export function buildFreeCellMask(
  room: RoomDefinition,
  equipment: readonly EquipmentInstance[],
  definitions: readonly EquipmentDefinition[],
): boolean[] {
  const unavailable = new Set(room.blockedCells.map(positionKey));
  for (const instance of equipment) {
    const definition = definitionById(definitions, instance.definitionId);
    resolveEquipmentGeometry(definition, instance.position, instance.orientation).footprint
      .forEach((cell) => unavailable.add(positionKey(cell)));
  }
  return Array.from({ length: room.widthCells * room.heightCells }, (_, index) => {
    const position = { x: index % room.widthCells, y: Math.floor(index / room.widthCells) };
    return !unavailable.has(positionKey(position));
  });
}

export function createInitialAirState(room: RoomDefinition): AirState {
  const blocked = new Set(room.blockedCells.map(positionKey));
  const cellCount = room.widthCells * room.heightCells;
  return {
    temperatureC: Array.from({ length: cellCount }, (_, index) => {
      const position = { x: index % room.widthCells, y: Math.floor(index / room.widthCells) };
      return blocked.has(positionKey(position)) ? null : room.initialTemperatureC;
    }),
    freeCellMask: Array.from({ length: cellCount }, (_, index) => {
      const position = { x: index % room.widthCells, y: Math.floor(index / room.widthCells) };
      return !blocked.has(positionKey(position));
    }),
    faceFlowXM3s: Array(Math.max(0, room.widthCells - 1) * room.heightCells).fill(0) as number[],
    faceFlowYM3s: Array(room.widthCells * Math.max(0, room.heightCells - 1)).fill(0) as number[],
    flowValid: false,
    lastFlowResidualM3s: 0,
    lastEnergyResidualJ: 0,
    lastIterationCount: 0,
  };
}

function orthogonalNeighborIndices(index: number, room: RoomDefinition): number[] {
  const x = index % room.widthCells;
  const y = Math.floor(index / room.widthCells);
  const result: number[] = [];
  if (y > 0) result.push(index - room.widthCells);
  if (x + 1 < room.widthCells) result.push(index + 1);
  if (y + 1 < room.heightCells) result.push(index + room.widthCells);
  if (x > 0) result.push(index - 1);
  return result;
}

/** Applies the documented no-time-advance topology remap without mutating the previous air state. */
export function remapAirStateForTopology(
  previous: AirState,
  nextFreeCellMask: readonly boolean[],
  room: RoomDefinition,
): AirState {
  const cellCount = room.widthCells * room.heightCells;
  if (previous.temperatureC.length !== cellCount || previous.freeCellMask.length !== cellCount
      || nextFreeCellMask.length !== cellCount) {
    throw new Error('Air topology length does not match room dimensions');
  }
  const previousFreeTemperatures = previous.temperatureC.filter(
    (value, index): value is number => previous.freeCellMask[index] === true && value !== null,
  );
  const fallback = previousFreeTemperatures.length > 0
    ? previousFreeTemperatures.reduce((sum, value) => sum + value, 0) / previousFreeTemperatures.length
    : room.initialTemperatureC;
  const temperatureC = previous.temperatureC.slice();

  for (let index = 0; index < cellCount; index += 1) {
    if (!nextFreeCellMask[index] || previous.freeCellMask[index]) continue;
    const neighborValues = orthogonalNeighborIndices(index, room)
      .filter((neighbor) => nextFreeCellMask[neighbor])
      .map((neighbor) => previous.temperatureC[neighbor])
      .filter((value): value is number => value !== null);
    temperatureC[index] = neighborValues.length > 0
      ? neighborValues.reduce((sum, value) => sum + value, 0) / neighborValues.length
      : fallback;
  }

  return {
    temperatureC,
    freeCellMask: [...nextFreeCellMask],
    faceFlowXM3s: Array(Math.max(0, room.widthCells - 1) * room.heightCells).fill(0) as number[],
    faceFlowYM3s: Array(room.widthCells * Math.max(0, room.heightCells - 1)).fill(0) as number[],
    flowValid: false,
    lastFlowResidualM3s: previous.lastFlowResidualM3s,
    lastEnergyResidualJ: previous.lastEnergyResidualJ,
    lastIterationCount: previous.lastIterationCount,
  };
}

/** Refreshes only occupied-cell shadow samples after a successful tick. */
export function refreshDormantTemperatureSamples(air: AirState, room: RoomDefinition): AirState {
  const previousFreeTemperatures = air.temperatureC.filter(
    (value, index): value is number => air.freeCellMask[index] === true && value !== null,
  );
  const fallback = previousFreeTemperatures.length > 0
    ? previousFreeTemperatures.reduce((sum, value) => sum + value, 0) / previousFreeTemperatures.length
    : room.initialTemperatureC;
  const temperatureC = air.temperatureC.slice();
  for (let index = 0; index < air.freeCellMask.length; index += 1) {
    if (air.freeCellMask[index] || temperatureC[index] === null) continue;
    const neighborValues = orthogonalNeighborIndices(index, room)
      .filter((neighbor) => air.freeCellMask[neighbor])
      .map((neighbor) => air.temperatureC[neighbor])
      .filter((value): value is number => value !== null);
    temperatureC[index] = neighborValues.length > 0
      ? neighborValues.reduce((sum, value) => sum + value, 0) / neighborValues.length
      : fallback;
  }
  return { ...air, temperatureC };
}
