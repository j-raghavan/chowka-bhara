/** Executable invariants (L-CB5). Called at the end of every transition in dev/test. */
import { FINISH_INDEX, isSafe, keyToCoord } from './board';
import { buildOccupancy } from './occupancy';
import type { CoordKey, GameState } from './types';

export class InvariantError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'InvariantError';
  }
}

const VALID_ROLLS = new Set<number>([1, 2, 3, 4, 5, 6, 12]);

export function assertInvariants(state: GameState): void {
  for (const pawn of Object.values(state.pawns)) {
    switch (pawn.state) {
      case 'home':
        if (pawn.pathIndex !== null) {
          throw new InvariantError('I-CB5', `home pawn ${pawn.id} has a pathIndex`);
        }
        break;
      case 'active':
        if (pawn.pathIndex === null || pawn.pathIndex < 0 || pawn.pathIndex > FINISH_INDEX) {
          throw new InvariantError('I-CB3', `active pawn ${pawn.id} has invalid pathIndex`);
        }
        if (pawn.pathIndex === FINISH_INDEX) {
          throw new InvariantError('I-CB12', `active pawn ${pawn.id} sits on the finish house`);
        }
        break;
      case 'finished':
        if (pawn.pathIndex !== FINISH_INDEX) {
          throw new InvariantError('I-CB12', `finished pawn ${pawn.id} not at finish index`);
        }
        break;
    }
  }

  // I-CB4: no two active pawns share a NON-SAFE coordinate (safe houses may stack).
  const occ = buildOccupancy(state);
  for (const [key, occupants] of occ) {
    if (occupants.length > 1 && !isSafe(keyToCoord(key as CoordKey))) {
      throw new InvariantError('I-CB4', 'two active pawns occupy the same non-safe coordinate');
    }
  }

  // I-CB8: roll values are exactly 1..6 or 12.
  if (state.currentRoll !== null && !VALID_ROLLS.has(state.currentRoll.value)) {
    throw new InvariantError('I-CB8', `illegal roll value ${state.currentRoll.value}`);
  }

  // I-CB15: a declared winner implies a finished game.
  if (state.winnerPlayerId !== null && state.status !== 'finished') {
    throw new InvariantError('I-CB15', 'winner set but status is not finished');
  }
}
