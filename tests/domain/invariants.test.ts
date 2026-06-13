import { describe, expect, it } from 'vitest';
import { assertInvariants, assertInvariantsDev, InvariantError } from '../../src/domain/invariants';
import { appendEvents, makeEvent, rememberCommandId, MAX_HISTORY } from '../../src/domain/history';
import { makePlayingState, withPawnAt } from '../helpers/state';
import { makeEnv } from '../helpers/env';

describe('assertInvariants (L-CB5)', () => {
  it('passes for a well-formed state', () => {
    const s = withPawnAt(makePlayingState(), 'south-p0', 5);
    expect(() => assertInvariants(s)).not.toThrow();
    expect(() => assertInvariantsDev(s)).not.toThrow();
  });

  it('throws when two active pawns share a coordinate (I-CB4)', () => {
    let s = makePlayingState({ sides: ['south'] });
    s = withPawnAt(s, 'south-p0', 5);
    s = withPawnAt(s, 'south-p1', 5); // same side+index => same coord
    expect(() => assertInvariants(s)).toThrow(InvariantError);
  });

  it('throws when a home pawn carries a pathIndex (I-CB5)', () => {
    const s = makePlayingState();
    const broken = {
      ...s,
      pawns: { ...s.pawns, 'south-p0': { ...s.pawns['south-p0']!, pathIndex: 3 } },
    };
    expect(() => assertInvariants(broken)).toThrow(/I-CB5/);
  });

  it('throws when an active pawn sits on the finish index (I-CB12)', () => {
    let s = makePlayingState();
    s = withPawnAt(s, 'south-p0', 48); // active at 48 is illegal
    expect(() => assertInvariants(s)).toThrow(/I-CB12/);
  });

  it('throws when a winner is set without a finished status (I-CB15)', () => {
    const s = { ...makePlayingState(), winnerPlayerId: 'south' };
    expect(() => assertInvariants(s)).toThrow(/I-CB15/);
  });
});

describe('history retention (CB4-FR8)', () => {
  it('appends events and bounds retention to the max', () => {
    const env = makeEnv();
    const events = Array.from({ length: 5 }, () => makeEvent('ROLL', env, 'south'));
    const history = appendEvents([], events, 3);
    expect(history).toHaveLength(3);
  });

  it('returns the same array when there are no events', () => {
    const h = [makeEvent('JOIN', makeEnv(), 'south')];
    expect(appendEvents(h, [])).toBe(h);
  });

  it('defaults to MAX_HISTORY', () => {
    expect(MAX_HISTORY).toBe(200);
  });

  it('bounds the recent-command-id ring', () => {
    let ids: readonly string[] = [];
    for (let i = 0; i < 5; i++) ids = rememberCommandId(ids, `c-${i}`, 3);
    expect(ids).toEqual(['c-2', 'c-3', 'c-4']);
  });
});
