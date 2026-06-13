import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/reducer';
import type { GameState, RollValue } from '../../src/domain/types';
import { envForRolls, makeEnv } from '../helpers/env';
import { commandFactory } from '../helpers/commands';
import { makePlayingState, withHasHit, withPawnAt, withRoll } from '../helpers/state';

const cmd = commandFactory();

/** Apply a ROLL with a scripted value, returning the post-roll state. */
function roll(state: GameState, playerId: string, value: RollValue) {
  const env = envForRolls([value]);
  return applyCommand(state, cmd({ type: 'ROLL', playerId }), env);
}

describe('command validation (CB4-AC1..AC3, AC7)', () => {
  it('rejects ROLL from a non-current player (CB4-AC1)', () => {
    const s = makePlayingState({ sides: ['south', 'north'] });
    const res = roll(s, 'north', 3);
    expect(res.accepted).toBe(false);
    expect(res.rejection).toBe('NOT_CURRENT_PLAYER');
    expect(res.state).toBe(s);
  });

  it('rejects SELECT_MOVE before rolling (CB4-AC2)', () => {
    const s = makePlayingState();
    const res = applyCommand(s, cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId: 'x' }), makeEnv());
    expect(res.rejection).toBe('WRONG_PHASE');
  });

  it('rejects a move that is not in legalMoves (CB4-AC3)', () => {
    let s = withRoll(makePlayingState(), 1);
    s = { ...s, legalMoves: [] };
    const res = applyCommand(s, cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId: 'nope' }), makeEnv());
    // No roll set via reducer here; emulate awaiting-move with empty list -> MOVE_NOT_LEGAL
    expect(['MOVE_NOT_LEGAL']).toContain(res.rejection);
  });

  it('ignores a duplicate command id, leaving state unchanged (CB4-AC7)', () => {
    const s = makePlayingState();
    const env = envForRolls([3]);
    const c = cmd({ type: 'ROLL', playerId: 'south', commandId: 'dup-1' });
    const first = applyCommand(s, c, env);
    const second = applyCommand(first.state, c, env);
    expect(second.accepted).toBe(false);
    expect(second.rejection).toBe('DUPLICATE_COMMAND');
    expect(second.state).toBe(first.state);
  });
});

describe('turn advancement (CB4-AC4..AC6)', () => {
  it('advances to the next player after a non-bonus move with no hit (CB4-AC4)', () => {
    const env = envForRolls([1]);
    const s = makePlayingState({ sides: ['south', 'north'] });
    const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    const moveId = rolled.state.legalMoves[0]!.id;
    const moved = applyCommand(rolled.state, cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId }), env);
    expect(moved.accepted).toBe(true);
    expect(moved.state.currentPlayerId).toBe('north');
    expect(moved.state.currentRoll).toBeNull();
  });

  it('keeps the same player after rolling a bonus with a move (CB4-AC5)', () => {
    let s = makePlayingState();
    s = withPawnAt(s, 'south-p0', 5);
    const env = envForRolls([6]);
    const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    const moveId = rolled.state.legalMoves.find((m) => m.pawnId === 'south-p0')!.id;
    const moved = applyCommand(rolled.state, cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId }), env);
    expect(moved.state.currentPlayerId).toBe('south');
    expect(moved.state.pawns['south-p0']!.pathIndex).toBe(11);
  });

  it('keeps the same player after a hit on a non-bonus roll (CB4-AC6, CB3-AC4)', () => {
    let s = makePlayingState({ sides: ['south', 'north'] });
    s = withPawnAt(s, 'south-p0', 6);
    s = withPawnAt(s, 'north-p0', 21); // both resolve to [0,6]
    const env = envForRolls([3]);
    const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    const moveId = rolled.state.legalMoves.find((m) => m.wouldHitPawnId === 'north-p0')!.id;
    const moved = applyCommand(rolled.state, cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId }), env);
    expect(moved.state.currentPlayerId).toBe('south'); // hit grants bonus
    expect(moved.state.pawns['north-p0']!.state).toBe('home'); // victim sent home
    expect(moved.state.pawns['south-p0']!.pathIndex).toBe(9); // mover occupies target
    expect(moved.state.players['south']!.hasHit).toBe(true);
  });
});

describe('no-legal-moves auto-resolution (CB4-FR5, L-CB3)', () => {
  it('auto-skips and advances on a non-bonus roll with no moves', () => {
    const s = makePlayingState({ sides: ['south', 'north'] }); // all home
    const res = roll(s, 'south', 2); // roll 2: no entry, no active -> no moves
    expect(res.accepted).toBe(true);
    expect(res.state.currentPlayerId).toBe('north');
    expect(res.state.history.some((e) => e.type === 'SKIP')).toBe(true);
  });

  it('auto re-rolls the same player on a bonus roll with no moves', () => {
    const s = makePlayingState({ sides: ['south', 'north'] });
    const res = roll(s, 'south', 6); // bonus, but no moves
    expect(res.state.currentPlayerId).toBe('south');
    expect(res.state.currentRoll).toBeNull();
  });
});

describe('finish and winner (CB3-AC6, AC10)', () => {
  it('finishes a pawn on an exact center roll', () => {
    let s = withHasHit(makePlayingState(), 'south');
    s = withPawnAt(s, 'south-p0', 47);
    const env = envForRolls([1]);
    const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    const moveId = rolled.state.legalMoves.find((m) => m.pawnId === 'south-p0')!.id;
    const moved = applyCommand(rolled.state, cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId }), env);
    expect(moved.state.pawns['south-p0']!.state).toBe('finished');
  });

  it('declares a winner when all of a player\'s pawns are finished (CB3-AC10)', () => {
    let s = withHasHit(makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 }), 'south');
    s = withPawnAt(s, 'south-p0', 47);
    const env = envForRolls([1]);
    const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    const moveId = rolled.state.legalMoves.find((m) => m.pawnId === 'south-p0')!.id;
    const moved = applyCommand(rolled.state, cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId }), env);
    expect(moved.state.status).toBe('finished');
    expect(moved.state.winnerPlayerId).toBe('south');
    expect(moved.state.history.some((e) => e.type === 'WIN')).toBe(true);
  });
});

describe('resign (Edge: all others resigned)', () => {
  it('hands the win to the last live player', () => {
    const s = makePlayingState({ sides: ['south', 'north'] });
    const res = applyCommand(s, cmd({ type: 'RESIGN', playerId: 'north' }), makeEnv());
    expect(res.state.status).toBe('finished');
    expect(res.state.winnerPlayerId).toBe('south');
  });

  it('advances the turn when the current player resigns in a 3-player game', () => {
    const s = makePlayingState({ sides: ['south', 'east', 'north'], current: 'south' });
    const res = applyCommand(s, cmd({ type: 'RESIGN', playerId: 'south' }), makeEnv());
    expect(res.state.players['south']!.status).toBe('resigned');
    expect(res.state.currentPlayerId).toBe('east');
    expect(res.state.status).toBe('playing');
  });
});

describe('game over guards', () => {
  it('rejects gameplay commands after the game is finished', () => {
    const s = { ...makePlayingState(), status: 'finished' as const };
    const res = roll(s, 'south', 3);
    expect(res.rejection).toBe('GAME_OVER');
  });
});
