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
    // Entry lands one house past the start/home marker (ENTRY_INDEX = 1).
    expect(entries[0]).toMatchObject({ type: 'enter', fromIndex: null, toIndex: 1 });
  });

  it('produces no entry candidate on roll 2', () => {
    const s = withRoll(makePlayingState(), 2);
    expect(generateCandidates(ctxFor(s)).some((c) => c.type === 'enter')).toBe(false);
  });

  it('produces a move candidate per active pawn at pathIndex + value', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 5);
    const moves = generateCandidates(ctxFor(s)).filter((c) => c.type === 'move');
    // south-p0 moves; the 3 home pawns also enter (a pawn is already out) -> 1 move candidate.
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ fromIndex: 5, toIndex: 8 });
  });

  it('lets home pawns enter on ANY roll once a pawn is on the board (#2)', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 10); // a pawn is already out
    const entries = generateCandidates(ctxFor(s)).filter((c) => c.type === 'enter');
    expect(entries).toHaveLength(3); // p1, p2, p3 may come out
    expect(entries[0]!.toIndex).toBe(3); // lands `rollValue` houses from the home marker
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
    // [3,6] (east start marker) is non-safe; south idx6 and north idx18 both resolve there.
    let s = withRoll(makePlayingState({ sides: ['south', 'north'] }), 3);
    s = withPawnAt(s, 'south-p0', 3); // -> toIndex 6 = [3,6]
    s = withPawnAt(s, 'north-p0', 18); // sits on [3,6]
    const r = destinationRule(cand({ pawnId: 'south-p0', fromIndex: 3, toIndex: 6 }), ctxFor(s));
    expect(r.ok).toBe(true);
    expect(r.ok && r.wouldHitPawnId).toBe('north-p0');
  });

  it('allows landing on a safe house shared with an opponent — no hit (#3)', () => {
    // [0,6] is a safe corner; south idx9 and north idx21 both resolve there.
    let s = withRoll(makePlayingState({ sides: ['south', 'north'] }), 3);
    s = withPawnAt(s, 'south-p0', 6); // -> toIndex 9 = [0,6]
    s = withPawnAt(s, 'north-p0', 21); // sits on [0,6]
    const r = destinationRule(cand({ pawnId: 'south-p0', fromIndex: 6, toIndex: 9 }), ctxFor(s));
    expect(r.ok).toBe(true);
    expect(r.ok && r.wouldHitPawnId).toBeNull();
  });
});

describe('generateLegalMoves (end to end)', () => {
  it('returns empty when there is no current roll', () => {
    expect(generateLegalMoves(makePlayingState())).toHaveLength(0);
  });

  it('marks a hit move with wouldHitPawnId', () => {
    let s = withRoll(makePlayingState({ sides: ['south', 'north'] }), 3);
    s = withPawnAt(s, 'south-p0', 3); // -> [3,6], non-safe
    s = withPawnAt(s, 'north-p0', 18); // sits on [3,6]
    const moves = generateLegalMoves(s);
    const hit = moves.find((m) => m.pawnId === 'south-p0');
    expect(hit?.wouldHitPawnId).toBe('north-p0');
    expect(hit?.to).toEqual([3, 6]);
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
  // Use 1-2 pawns and no home pawns so entry candidates don't appear (home pawns
  // can now enter on any roll once a pawn is out).
  it('reports inner-path-locked when the only move is gated', () => {
    let s = withRoll(makePlayingState({ pawnsPerPlayer: 1 }), 3);
    s = withPawnAt(s, 'south-p0', 22); // -> 25, gated without hit
    expect(generateLegalMoves(s)).toHaveLength(0);
    expect(computeSkipReason(s)).toBe('inner-path-locked');
  });

  it('reports would-overshoot when the only move overshoots', () => {
    let s = withHasHit(withRoll(makePlayingState({ pawnsPerPlayer: 1 }), 5), 'south');
    s = withPawnAt(s, 'south-p0', 46); // -> 51 overshoot
    expect(computeSkipReason(s)).toBe('would-overshoot');
  });

  it('reports all-targets-blocked when no candidate exists', () => {
    const s = withRoll(makePlayingState(), 2); // no active pawns, roll != 1 -> no entry
    expect(computeSkipReason(s)).toBe('all-targets-blocked');
  });

  it('reports mixed when candidates fail for different reasons', () => {
    let s = withRoll(makePlayingState({ pawnsPerPlayer: 2 }), 6);
    s = withPawnAt(s, 'south-p0', 20); // -> 26 inner-path gated
    s = withPawnAt(s, 'south-p1', 45); // -> 51 overshoot
    expect(computeSkipReason(s)).toBe('mixed');
  });
});
