import { describe, expect, it } from 'vitest';
import { KEYBOARD_HELP, reduceRoomUiState, type RoomUiState } from '../../../src/tycoon/ui/RoomController';
import type { RackInstance } from '../../../src/tycoon/model/types';

function initial(): RoomUiState {
  return { cursor: { x: 0, y: 0 }, selectedId: null, placement: null, overlay: 'none' };
}

describe('room UI interaction state', () => {
  it('clamps keyboard cursor movement to the room without mutating the prior state', () => {
    const before = initial();
    const left = reduceRoomUiState(before, { type: 'MOVE_CURSOR', dx: -1, dy: -1, width: 12, height: 10 });
    const far = reduceRoomUiState(left, { type: 'MOVE_CURSOR', dx: 99, dy: 99, width: 12, height: 10 });
    expect(before.cursor).toEqual({ x: 0, y: 0 });
    expect(left.cursor).toEqual({ x: 0, y: 0 });
    expect(far.cursor).toEqual({ x: 11, y: 9 });
  });

  it('keeps purchase and explicit move previews distinct and rotates clockwise', () => {
    const purchase = reduceRoomUiState(initial(), { type: 'BEGIN_PLACE', definitionId: 'rack-balanced' });
    expect(purchase.placement).toEqual({ definitionId: 'rack-balanced', orientation: 'north', movingInstanceId: null });
    const rotated = reduceRoomUiState(purchase, { type: 'ROTATE' });
    expect(rotated.placement?.orientation).toBe('east');

    const instance = {
      id: 'equipment-7', definitionId: 'rack-balanced', kind: 'rack', position: { x: 4, y: 5 }, orientation: 'south',
    } as RackInstance;
    const move = reduceRoomUiState(rotated, { type: 'BEGIN_MOVE', instance });
    expect(move.cursor).toEqual({ x: 4, y: 5 });
    expect(move.selectedId).toBe('equipment-7');
    expect(move.placement).toEqual({ definitionId: 'rack-balanced', orientation: 'south', movingInstanceId: 'equipment-7' });
  });

  it('cycles every renderer overlay and publishes the implemented keyboard commands', () => {
    let state = initial();
    state = reduceRoomUiState(state, { type: 'CYCLE_OVERLAY' });
    expect(state.overlay).toBe('temperature');
    state = reduceRoomUiState(state, { type: 'CYCLE_OVERLAY' });
    expect(state.overlay).toBe('airflow');
    state = reduceRoomUiState(state, { type: 'CYCLE_OVERLAY' });
    expect(state.overlay).toBe('none');
    expect(KEYBOARD_HELP.map(([key]) => key)).toEqual(expect.arrayContaining([
      'Arrow keys', 'Space', 'R', 'M', 'Delete / Backspace', 'Ctrl / Cmd + Z', 'I', 'O', 'P', '1 / 2 / 3', 'Tab / Shift+Tab', 'H', 'Escape',
    ]));
  });
});
