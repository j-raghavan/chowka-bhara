import { describe, expect, it } from 'vitest';
import { assignSidesAndPawns } from '../../src/domain/game-setup';
import { assertInvariants } from '../../src/domain/invariants';
import { computeSkipReason } from '../../src/domain/legal-moves';
import { buildOccupancy } from '../../src/domain/occupancy';
import { validatePaths, PATHS, SOUTH_PATH } from '../../src/domain/paths';
import { newPlayer } from '../helpers/state';
import { makePlayingState, withPawnAt, withRoll } from '../helpers/state';

describe('assignSidesAndPawns edges (game-setup)', () => {
  it('skips a join-order id that has no player record', () => {
    const players = { a: newPlayer('south') };
    const { players: out, playerOrder } = assignSidesAndPawns({ a: players.a }, ['a', 'b'], 4);
    expect(out['a']!.side).toBe('south');
    expect(out['b']).toBeUndefined();
    expect(playerOrder).toEqual(['a', 'b']);
  });

  it('throws for an unsupported player count', () => {
    expect(() => assignSidesAndPawns({}, ['a'], 4)).toThrow(/side assignment/);
  });
});

describe('invariants extra branches', () => {
  it('throws when an active pawn has an out-of-range pathIndex (I-CB3)', () => {
    const s = withPawnAt(makePlayingState(), 'south-p0', 50);
    expect(() => assertInvariants(s)).toThrow(/I-CB3/);
  });

  it('throws when a finished pawn is not at the finish index (I-CB12)', () => {
    const s = withPawnAt(makePlayingState(), 'south-p0', 10, 'finished');
    expect(() => assertInvariants(s)).toThrow(/I-CB12/);
  });

  it('throws on an illegal roll value (I-CB8)', () => {
    const base = makePlayingState();
    const broken = {
      ...base,
      currentRoll: {
        id: 'r',
        faces: [],
        openCount: 0,
        value: 7 as 1,
        grantsBonusTurn: false,
        rolledAt: 0,
      },
    };
    expect(() => assertInvariants(broken)).toThrow(/I-CB8/);
  });
});

describe('computeSkipReason extra branches', () => {
  it('reports start-blocked when entry is blocked by a safe opponent', () => {
    let s = withRoll(makePlayingState({ sides: ['south', 'north'] }), 1);
    s = withPawnAt(s, 'north-p0', 12); // sits on south start [6,3] (safe)
    expect(computeSkipReason(s)).toBe('start-blocked');
  });

  it('falls through to all-targets-blocked when a candidate is actually legal', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 5); // -> 8, empty, legal
    expect(computeSkipReason(s)).toBe('all-targets-blocked');
  });
});

describe('occupancy skips pawns with no player record', () => {
  it('ignores a pawn whose playerId is unknown', () => {
    const base = makePlayingState({ sides: ['south'] });
    const s = {
      ...base,
      pawns: {
        ...base.pawns,
        'ghost-p0': {
          id: 'ghost-p0',
          playerId: 'ghost',
          state: 'active' as const,
          pathIndex: 5,
          finishedOrder: null,
        },
      },
    };
    expect(buildOccupancy(s).size).toBe(0);
  });
});

describe('validatePaths interior out-of-bounds', () => {
  it('rejects an interior out-of-bounds coordinate', () => {
    const bad = SOUTH_PATH.map((c, i) => (i === 5 ? ([9, 9] as const) : c));
    expect(() => validatePaths({ ...PATHS, south: bad })).toThrow(/out-of-bounds/);
  });
});
