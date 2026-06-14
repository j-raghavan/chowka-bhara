import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/reducer';
import type { Coord, GameState, PlayerSide, RollValue } from '../../src/domain/types';
import { envForRolls, makeEnv } from '../helpers/env';
import { commandFactory } from '../helpers/commands';
import { makePlayingState, withHasHit, withPawnAt } from '../helpers/state';
import { coordAt, PATHS } from '../../src/domain/paths';
import { FINISH_INDEX } from '../../src/domain/board';

const cmd = commandFactory();

describe('path traversal (the route is clear from entry to the crown)', () => {
  it('walks one pawn house-by-house along the entire path and finishes on the crown', () => {
    // One pawn per side. South has already hit, so the inner-path gate is open
    // for the whole journey; its pawn starts entered at index 1.
    let s = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 });
    s = withHasHit(s, 'south');
    s = withPawnAt(s, 'south-p0', 1);

    // South always rolls 1 (advance exactly one house); North always rolls 2
    // (all pawns home -> no move -> auto-skip back to South). The env cycles [1,2].
    const env = envForRolls([1, 2]);

    // The houses the pawn lands on, starting from its current house (index 1).
    const visited: Coord[] = [coordAt('south', 1)];

    while (s.status === 'playing') {
      // South's turn: there must be exactly one way forward -> the path is clear.
      const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
      expect(rolled.accepted).toBe(true);
      expect(rolled.state.legalMoves).toHaveLength(1);
      const move = rolled.state.legalMoves[0]!;
      visited.push(move.to);
      s = applyCommand(
        rolled.state,
        cmd({ type: 'SELECT_MOVE', playerId: 'south', moveId: move.id }),
        env,
      ).state;
      if (s.status !== 'playing') break;
      // North's turn: roll 2 with all pawns home -> auto-skip back to South.
      s = applyCommand(s, cmd({ type: 'ROLL', playerId: 'north' }), env).state;
      expect(s.currentPlayerId).toBe('south');
    }

    // The pawn finished exactly on the crown and won the game.
    expect(s.pawns['south-p0']!.state).toBe('finished');
    expect(s.winnerPlayerId).toBe('south');

    // It visited every house of the South path, in order, from index 1 to the
    // crown — proving the whole route is reachable and matches the board.
    const expected = Array.from({ length: FINISH_INDEX }, (_u, i) => coordAt('south', i + 1));
    expect(visited).toEqual(expected);
    expect(visited).toHaveLength(FINISH_INDEX); // 48 houses (indices 1..48)

    // The two signature steps drawn on the physical board:
    // (1) diagonal entry into the inner square: [6,2] -> [5,1].
    expect(visited[22]).toEqual([6, 2]); // index 23 (outer-ring last)
    expect(visited[23]).toEqual([5, 1]); // index 24 (one step later, the ✕ corner)
    // (2) straight step up into the crown: [4,3] -> [3,3].
    expect(visited[FINISH_INDEX - 2]).toEqual([4, 3]); // index 47 (directly below)
    expect(visited[FINISH_INDEX - 1]).toEqual([3, 3]); // index 48 (the crown)
  });

  it('every side advances house-by-house, with only the inner-square entry cutting a corner', () => {
    for (const side of ['south', 'east', 'north', 'west'] as PlayerSide[]) {
      const path = PATHS[side];
      const corners: number[] = [];
      for (let i = 1; i < path.length; i++) {
        const [r0, c0] = path[i - 1]!;
        const [r1, c1] = path[i]!;
        const dr = Math.abs(r1 - r0);
        const dc = Math.abs(c1 - c0);
        const adjacent = dr + dc === 1; // orthogonal step
        const corner = dr === 1 && dc === 1; // diagonal corner-cut
        expect(adjacent || corner).toBe(true); // never a long jump -> path is clear
        if (corner) corners.push(i);
      }
      // Exactly one corner-cut per side: the entry into the inner square (23 -> 24).
      expect(corners).toEqual([24]);
    }
  });
});

describe('full traversal to a real winner via the reducer (no near-finish seeding)', () => {
  it('drives one pawn outer ring -> hit -> across the gate -> inner rings -> exact finish', () => {
    // South starts at idx 3; North is a hittable victim on the non-safe [3,6] (south idx 6).
    let s = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 });
    s = withPawnAt(s, 'south-p0', 3);
    s = withPawnAt(s, 'north-p0', 18); // resolves to [3,6], same cell as south idx 6

    // 3 lands the hit (enables inner path); seven 6s keep the bonus turn while crossing
    // the outer->middle->inner ring transitions and landing exactly on center (3->6->...->48).
    const rolls: RollValue[] = [3, 6, 6, 6, 6, 6, 6, 6];
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
