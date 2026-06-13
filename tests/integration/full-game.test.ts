import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/reducer';
import type { GameState, RollValue } from '../../src/domain/types';
import { envForRolls, makeEnv } from '../helpers/env';
import { commandFactory } from '../helpers/commands';
import { makePlayingState, withPawnAt } from '../helpers/state';

const cmd = commandFactory();

describe('full traversal to a real winner via the reducer (no near-finish seeding)', () => {
  it('drives one pawn outer ring -> hit -> across the gate -> inner rings -> exact finish', () => {
    // South starts mid outer-ring (idx 6); North is a hittable victim parked on [0,6] (south idx 9).
    let s = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 });
    s = withPawnAt(s, 'south-p0', 6);
    s = withPawnAt(s, 'north-p0', 21); // resolves to [0,6], same cell as south idx 9

    // 3 lands the hit (enables inner path); six 6s keep the bonus turn while crossing
    // the outer->middle->inner ring transitions; final 3 lands exactly on center (48).
    const rolls: RollValue[] = [3, 6, 6, 6, 6, 6, 6, 3];
    const env = envForRolls(rolls);

    const crossedGate: number[] = [];
    for (let i = 0; i < rolls.length; i++) {
      const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
      expect(rolled.accepted).toBe(true);
      expect(rolled.state.legalMoves).toHaveLength(1);
      const move = rolled.state.legalMoves[0]!;
      const moved = applyCommand(
        rolled.state,
        cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId: move.id }),
        env,
      );
      expect(moved.accepted).toBe(true);
      s = moved.state;
      const pawn = s.pawns['south-p0']!;
      if (pawn.pathIndex !== null && pawn.pathIndex >= 24 && pawn.state === 'active') {
        crossedGate.push(pawn.pathIndex);
      }
    }

    // North was hit and sent home on the first move.
    expect(s.history.some((e) => e.type === 'HIT')).toBe(true);
    // The pawn genuinely crossed the inner-path gate (index >= 24) during real play.
    expect(crossedGate.length).toBeGreaterThan(0);
    // And finished exactly on the center, winning the game.
    expect(s.status).toBe('finished');
    expect(s.winnerPlayerId).toBe('south');
    expect(s.pawns['south-p0']!.state).toBe('finished');
  });
});

describe('turn cycling through normal play', () => {
  it('cycles south -> east -> north -> west -> south on non-bonus skips (4 players)', () => {
    let s: GameState = makePlayingState({ sides: ['south', 'east', 'north', 'west'] });
    const order = ['south', 'east', 'north', 'west'];
    const env = envForRolls([2, 2, 2, 2]); // roll 2, all pawns home -> no move -> skip -> advance

    let advances = 0;
    for (let i = 0; i < 4; i++) {
      expect(s.currentPlayerId).toBe(order[i]);
      const res = applyCommand(s, cmd({ type: 'ROLL', playerId: order[i]! }), env);
      if (res.state.history.some((e) => e.type === 'TURN_ADVANCE')) advances++;
      s = res.state;
    }
    expect(s.currentPlayerId).toBe('south'); // wrapped around
    expect(advances).toBeGreaterThan(0);
  });

  it('skips a resigned player mid-cycle', () => {
    let s = makePlayingState({ sides: ['south', 'east', 'north'], current: 'south' });
    s = applyCommand(s, cmd({ type: 'RESIGN', playerId: 'east' }), makeEnv()).state;
    expect(s.status).toBe('playing'); // 2 live players remain
    // South skips (roll 2, all home) -> turn must skip resigned East -> North.
    s = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), envForRolls([2])).state;
    expect(s.currentPlayerId).toBe('north');
  });
});

describe('SELECT_MOVE membership (CB4-AC3, real non-empty legalMoves)', () => {
  it('rejects a fabricated moveId when several legal moves exist', () => {
    const s = makePlayingState();
    const env = envForRolls([1]); // 4 home pawns -> 4 entry moves
    const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    expect(rolled.state.legalMoves.length).toBeGreaterThan(1);
    const res = applyCommand(
      rolled.state,
      cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId: 'not-a-real-move' }),
      env,
    );
    expect(res.rejection).toBe('MOVE_NOT_LEGAL');
    expect(res.state).toBe(rolled.state); // unchanged
  });
});
