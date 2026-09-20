import type { AirState, ModelParameters, RoomDefinition } from '../model/types';

export interface ForcedAirLink {
  equipmentInstanceId: string;
  kind: 'rack' | 'cooler';
  fromCell: number;
  toCell: number;
  flowM3s: number;
}

export interface AirflowSolution {
  faceFlowXM3s: number[];
  faceFlowYM3s: number[];
  pressuresPa: number[];
  maxCellAbsResidualM3s: number;
  iterationCount: number;
}

export type AirflowSolveResult =
  | { ok: true; value: AirflowSolution }
  | {
      ok: false;
      code: 'FLOW_SOLVE_FAILED' | 'FLOW_RESIDUAL_EXCEEDED' | 'NON_FINITE_STATE';
      measuredValue?: number;
      allowedValue?: number;
      reason: string;
    };

interface Components {
  labelByCell: number[];
  cells: number[][];
}

function neighbors(index: number, room: RoomDefinition, freeCellMask: readonly boolean[]): number[] {
  const x = index % room.widthCells;
  const y = Math.floor(index / room.widthCells);
  const values: number[] = [];
  if (y > 0 && freeCellMask[index - room.widthCells]) values.push(index - room.widthCells);
  if (x + 1 < room.widthCells && freeCellMask[index + 1]) values.push(index + 1);
  if (y + 1 < room.heightCells && freeCellMask[index + room.widthCells]) values.push(index + room.widthCells);
  if (x > 0 && freeCellMask[index - 1]) values.push(index - 1);
  return values;
}

/** Labels four-neighbor free-air components in stable row-major order. */
export function findAirComponents(
  room: RoomDefinition,
  freeCellMask: readonly boolean[],
): Components {
  const cellCount = room.widthCells * room.heightCells;
  const labelByCell = Array(cellCount).fill(-1) as number[];
  const cells: number[][] = [];
  for (let start = 0; start < cellCount; start += 1) {
    if (!freeCellMask[start] || labelByCell[start] !== -1) continue;
    const label = cells.length;
    const component: number[] = [];
    const queue = [start];
    labelByCell[start] = label;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      component.push(current);
      for (const neighbor of neighbors(current, room, freeCellMask)) {
        if (labelByCell[neighbor] !== -1) continue;
        labelByCell[neighbor] = label;
        queue.push(neighbor);
      }
    }
    cells.push(component);
  }
  return { labelByCell, cells };
}

function dot(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index]! * b[index]!;
  return total;
}

function solveComponent(
  component: readonly number[],
  source: readonly number[],
  room: RoomDefinition,
  freeCellMask: readonly boolean[],
  model: ModelParameters,
): { ok: true; pressure: Map<number, number>; iterations: number }
  | { ok: false; reason: string } {
  const anchor = component[0]!;
  const variables = component.slice(1);
  const localByCell = new Map<number, number>();
  variables.forEach((cell, index) => localByCell.set(cell, index));
  const pressure = new Map<number, number>([[anchor, 0]]);
  if (variables.length === 0) return { ok: true, pressure, iterations: 0 };

  const conductance = model.faceConductanceM3sPa;
  const multiply = (vector: readonly number[]): number[] => variables.map((cell) => {
    let value = 0;
    for (const neighbor of neighbors(cell, room, freeCellMask)) {
      const neighborValue = neighbor === anchor ? 0 : vector[localByCell.get(neighbor)!]!;
      value += conductance * (vector[localByCell.get(cell)!]! - neighborValue);
    }
    return value;
  });
  const diagonal = variables.map((cell) => conductance * neighbors(cell, room, freeCellMask).length);
  if (diagonal.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { ok: false, reason: 'singular component matrix' };
  }

  const rhs = variables.map((cell) => source[cell]!);
  let x = variables.map(() => 0);
  let residual = rhs.slice();
  let preconditioned = residual.map((value, index) => value / diagonal[index]!);
  let direction = preconditioned.slice();
  let rz = dot(residual, preconditioned);
  let iterations = 0;
  // The omitted anchor equation receives the negative sum of reduced residuals.
  // Tighten the per-variable target so the subsequent all-cell audit is bounded.
  const residualTarget = model.flowResidualToleranceM3s
    / Math.max(10, component.length * 2);

  while (Math.max(...residual.map(Math.abs)) > residualTarget && iterations < model.flowMaxIterations) {
    const multiplied = multiply(direction);
    const denominator = dot(direction, multiplied);
    if (!Number.isFinite(denominator) || denominator <= 0 || !Number.isFinite(rz)) {
      return { ok: false, reason: 'invalid PCG direction' };
    }
    const alpha = rz / denominator;
    x = x.map((value, index) => value + alpha * direction[index]!);
    residual = residual.map((value, index) => value - alpha * multiplied[index]!);
    if (x.some((value) => !Number.isFinite(value)) || residual.some((value) => !Number.isFinite(value))) {
      return { ok: false, reason: 'non-finite PCG state' };
    }
    iterations += 1;
    if (Math.max(...residual.map(Math.abs)) <= residualTarget) break;
    preconditioned = residual.map((value, index) => value / diagonal[index]!);
    const nextRz = dot(residual, preconditioned);
    const beta = nextRz / rz;
    direction = preconditioned.map((value, index) => value + beta * direction[index]!);
    rz = nextRz;
  }
  if (Math.max(...residual.map(Math.abs)) > residualTarget) {
    return { ok: false, reason: 'PCG iteration limit exceeded' };
  }
  variables.forEach((cell, index) => pressure.set(cell, x[index]!));
  return { ok: true, pressure, iterations };
}

/** Solves passive face flow that balances the supplied paired equipment transfers. */
export function solveAirflow(
  room: RoomDefinition,
  model: ModelParameters,
  air: Pick<AirState, 'freeCellMask'>,
  forcedLinks: readonly ForcedAirLink[],
): AirflowSolveResult {
  const cellCount = room.widthCells * room.heightCells;
  if (air.freeCellMask.length !== cellCount) {
    return { ok: false, code: 'FLOW_SOLVE_FAILED', reason: 'free-cell mask length mismatch' };
  }
  const source = Array(cellCount).fill(0) as number[];
  for (const link of forcedLinks) {
    if (!Number.isFinite(link.flowM3s) || link.flowM3s < 0) {
      return { ok: false, code: 'NON_FINITE_STATE', reason: 'invalid forced-link flow' };
    }
    if (!air.freeCellMask[link.fromCell] || !air.freeCellMask[link.toCell]) {
      return { ok: false, code: 'FLOW_SOLVE_FAILED', reason: 'forced link endpoint is not free' };
    }
    source[link.fromCell] = source[link.fromCell]! - link.flowM3s;
    source[link.toCell] = source[link.toCell]! + link.flowM3s;
  }

  const components = findAirComponents(room, air.freeCellMask);
  const pressuresPa = Array(cellCount).fill(0) as number[];
  let iterationCount = 0;
  for (const component of components.cells) {
    const sourceSum = component.reduce((sum, cell) => sum + source[cell]!, 0);
    if (!Number.isFinite(sourceSum) || Math.abs(sourceSum) > 1e-12) {
      return {
        ok: false,
        code: 'FLOW_SOLVE_FAILED',
        measuredValue: Math.abs(sourceSum),
        allowedValue: 1e-12,
        reason: 'component forced-source sum is not balanced',
      };
    }
    const solved = solveComponent(component, source, room, air.freeCellMask, model);
    if (!solved.ok) return { ok: false, code: 'FLOW_SOLVE_FAILED', reason: solved.reason };
    iterationCount += solved.iterations;
    for (const [cell, value] of solved.pressure) pressuresPa[cell] = value;
  }

  const faceFlowXM3s = Array(Math.max(0, room.widthCells - 1) * room.heightCells).fill(0) as number[];
  const faceFlowYM3s = Array(room.widthCells * Math.max(0, room.heightCells - 1)).fill(0) as number[];
  const passiveOutflow = Array(cellCount).fill(0) as number[];
  for (let y = 0; y < room.heightCells; y += 1) {
    for (let x = 0; x < room.widthCells; x += 1) {
      const low = y * room.widthCells + x;
      if (!air.freeCellMask[low]) continue;
      if (x + 1 < room.widthCells && air.freeCellMask[low + 1]) {
        const flow = model.faceConductanceM3sPa * (pressuresPa[low]! - pressuresPa[low + 1]!);
        faceFlowXM3s[y * (room.widthCells - 1) + x] = flow;
        passiveOutflow[low] = passiveOutflow[low]! + flow;
        passiveOutflow[low + 1] = passiveOutflow[low + 1]! - flow;
      }
      if (y + 1 < room.heightCells && air.freeCellMask[low + room.widthCells]) {
        const flow = model.faceConductanceM3sPa
          * (pressuresPa[low]! - pressuresPa[low + room.widthCells]!);
        faceFlowYM3s[y * room.widthCells + x] = flow;
        passiveOutflow[low] = passiveOutflow[low]! + flow;
        passiveOutflow[low + room.widthCells] = passiveOutflow[low + room.widthCells]! - flow;
      }
    }
  }
  if ([...pressuresPa, ...faceFlowXM3s, ...faceFlowYM3s].some((value) => !Number.isFinite(value))) {
    return { ok: false, code: 'NON_FINITE_STATE', reason: 'non-finite pressure or face flow' };
  }
  let maxCellAbsResidualM3s = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (!air.freeCellMask[cell]) continue;
    maxCellAbsResidualM3s = Math.max(
      maxCellAbsResidualM3s,
      Math.abs(source[cell]! - passiveOutflow[cell]!),
    );
  }
  if (maxCellAbsResidualM3s > model.flowResidualToleranceM3s) {
    return {
      ok: false,
      code: 'FLOW_RESIDUAL_EXCEEDED',
      measuredValue: maxCellAbsResidualM3s,
      allowedValue: model.flowResidualToleranceM3s,
      reason: 'cell mass residual exceeded tolerance',
    };
  }
  return {
    ok: true,
    value: {
      faceFlowXM3s,
      faceFlowYM3s,
      pressuresPa,
      maxCellAbsResidualM3s,
      iterationCount,
    },
  };
}
