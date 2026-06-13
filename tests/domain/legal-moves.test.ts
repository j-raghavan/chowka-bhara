import { describe, expect, it } from 'vitest';
import {
  computeSkipReason,
  destinationRule,
  generateCandidates,
  generateLegalMoves,
  innerPathGate,
  withinBounds,
  type MoveCandidate,
  type MoveContext,
} from '../../src/domain/legal-moves';
import { buildOccupancy } from '../../src/domain/occupancy';
import type { GameState, PlayerSide } from '../../src/domain/types';
import { makePlayingState, withHasHit, withPawnAt, withRoll } from '../helpers/state';

function ctxFor(state: GameState, side: PlayerSide = 'south'): MoveContext {
  const player = state.players[side]!;
  return { state, occ: buildOccupancy(state), player, roll: state.currentRoll! };
}

const cand = (over: Partial<MoveCandidate>): MoveCandidate => ({
  pawnId: 'south-p0',
  type: 'move',
  fromIndex: 0,
  toIndex: 0,
  side: 'south',
  ...over,
});

describe('generateCandidates (CB3-FR3, FR7)', () => {
  it('produces an entry candidate per home pawn only on roll 1 (CB3-AC1/AC2)', () => {
    const s = withRoll(makePlayingState(), 1);
    const entries = generateCandidates(ctxFor(s)).filter((c) => c.type === 'enter');
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ type: 'enter', fromIndex: null, toIndex: 0 });
  });

  it('produces no entry candidate on roll 2', () => {
    const s = withRoll(makePlayingState(), 2);
    expect(generateCandidates(ctxFor(s)).some((c) => c.type === 'enter')).toBe(false);
  });

  it('produces a move candidate per active pawn at pathIndex + value', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 5);
    const moves = generateCandidates(ctxFor(s)).filter((c) => c.type === 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ fromIndex: 5, toIndex: 8 });
  });
});

describe('withinBounds gate (G-1, CB3-FR8 / AC6, AC7)', () => {
  it('passes an exact finish (toIndex 48)', () => {
    expect(withinBounds(cand({ toIndex: 48 })).ok).toBe(true);
  });
  it('drops an overshoot (toIndex 49)', () => {
    const r = withinBounds(cand({ toIndex: 49 }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('OVERSHOOT');
  });
});

describe('innerPathGate (G-2, CB3-FR13 / AC8, AC9)', () => {
  it('drops crossing into the middle ring without a prior hit', () => {
    const s = withRoll(makePlayingState(), 3);
    const r = innerPathGate(cand({ toIndex: 24 }), ctxFor(s));
    expect(r.ok === false && r.reason).toBe('INNER_PATH_NO_HIT');
  });

  it('allows crossing once the player has hit', () => {
    const s = withHasHit(withRoll(makePlayingState(), 3), 'south');
    expect(innerPathGate(cand({ toIndex: 24 }), ctxFor(s)).ok).toBe(true);
  });

  it('always allows staying in the outer ring (toIndex < 24)', () => {
    const s = withRoll(makePlayingState(), 3);
    expect(innerPathGate(cand({ toIndex: 23 }), ctxFor(s)).ok).toBe(true);
  });
});

describe('destinationRule gate (G-3, CB3-FR9/FR10/FR11)', () => {
  it('passes an empty destination with no hit', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 5);
    const r = destinationRule(cand({ pawnId: 'south-p0', fromIndex: 5, toIndex: 8 }), ctxFor(s));
    expect(r.ok).toBe(true);
    expect(r.ok && r.wouldHitPawnId).toBeNull();
  });

  it('drops a destination occupied by an own pawn (CB3-AC3)', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 5);
    s = withPawnAt(s, 'south-p1', 8); // own pawn on target
    const r = destinationRule(cand({ pawnId: 'south-p0', fromIndex: 5, toIndex: 8 }), ctxFor(s));
    expect(r.ok === false && r.reason).toBe('OWN_PAWN');
  });

  it('hits an opponent on a non-safe house (CB3-AC4)', () => {
    // south idx 9 = [0,6]; north idx 21 also = [0,6] (non-safe corner)
    let s = withRoll(makePlayingState({ sides: ['south', 'north'] }), 3);
    s = withPawnAt(s, 'south-p0', 6); // -> toIndex 9
    s = withPawnAt(s, 'north-p0', 21); // sits on [0,6]
    const r = destinationRule(cand({ pawnId: 'south-p0', fromIndex: 6, toIndex: 9 }), ctxFor(s));
    expect(r.ok).toBe(true);
    expect(r.ok && r.wouldHitPawnId).toBe('north-p0');
  });

  it('drops an opponent on a safe house (CB3-AC5)', () => {
    // south start [6,3] is safe; north idx 12 sits on [6,3]
    let s = withRoll(makePlayingState({ sides: ['south', 'north'] }), 1);
    s = withPawnAt(s, 'north-p0', 12); // occupies south start [6,3]
    const r = destinationRule(
      cand({ pawnId: 'south-p0', type: 'enter', fromIndex: null, toIndex: 0 }),
      ctxFor(s),
    );
    expect(r.ok === false && r.reason).toBe('OPP_SAFE_BLOCKED');
  });
});

describe('generateLegalMoves (end to end)', () => {
  it('returns empty when there is no current roll', () => {
    expect(generateLegalMoves(makePlayingState())).toHaveLength(0);
  });

  it('marks a hit move with wouldHitPawnId', () => {
    let s = withRoll(makePlayingState({ sides: ['south', 'north'] }), 3);
    s = withPawnAt(s, 'south-p0', 6);
    s = withPawnAt(s, 'north-p0', 21);
    const moves = generateLegalMoves(s);
    const hit = moves.find((m) => m.pawnId === 'south-p0');
    expect(hit?.wouldHitPawnId).toBe('north-p0');
    expect(hit?.to).toEqual([0, 6]);
  });

  it('marks an exact finish with wouldFinish (CB3-AC6)', () => {
    let s = withHasHit(withRoll(makePlayingState(), 1), 'south');
    s = withPawnAt(s, 'south-p0', 47);
    const move = generateLegalMoves(s).find((m) => m.pawnId === 'south-p0');
    expect(move?.wouldFinish).toBe(true);
    expect(move?.toIndex).toBe(48);
  });

  it('omits a finish move when the roll overshoots (CB3-AC7)', () => {
    let s = withHasHit(withRoll(makePlayingState(), 2), 'south');
    s = withPawnAt(s, 'south-p0', 47);
    expect(generateLegalMoves(s).some((m) => m.pawnId === 'south-p0')).toBe(false);
  });
});

describe('computeSkipReason (CB6-FR12)', () => {
  it('reports inner-path-locked when the only move is gated', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 22); // -> 25, gated without hit
    expect(generateLegalMoves(s)).toHaveLength(0);
    expect(computeSkipReason(s)).toBe('inner-path-locked');
  });

  it('reports would-overshoot when the only move overshoots', () => {
    let s = withHasHit(withRoll(makePlayingState(), 5), 'south');
    s = withPawnAt(s, 'south-p0', 46); // -> 51 overshoot
    expect(computeSkipReason(s)).toBe('would-overshoot');
  });

  it('reports all-targets-blocked when no candidate exists', () => {
    const s = withRoll(makePlayingState(), 2); // no active pawns, roll != 1
    expect(computeSkipReason(s)).toBe('all-targets-blocked');
  });

  it('reports mixed when candidates fail for different reasons', () => {
    let s = withRoll(makePlayingState(), 6);
    s = withPawnAt(s, 'south-p0', 20); // -> 26 inner-path gated
    s = withPawnAt(s, 'south-p1', 45); // -> 51 overshoot
    expect(computeSkipReason(s)).toBe('mixed');
  });
});
