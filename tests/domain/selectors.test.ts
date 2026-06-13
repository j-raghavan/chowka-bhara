import { describe, expect, it } from 'vitest';
import { coordForPawn, deriveTurnPhase, pathTrail } from '../../src/domain/selectors';
import { makePlayingState, withPawnAt, withRoll } from '../helpers/state';

describe('deriveTurnPhase (G1)', () => {
  it('is idle outside an active turn', () => {
    expect(deriveTurnPhase({ ...makePlayingState(), status: 'lobby' })).toBe('idle');
    expect(deriveTurnPhase({ ...makePlayingState(), currentPlayerId: null })).toBe('idle');
  });

  it('is awaiting-roll before a roll', () => {
    expect(deriveTurnPhase(makePlayingState())).toBe('awaiting-roll');
  });

  it('is awaiting-move when legal moves exist', () => {
    let s = withRoll(makePlayingState(), 3);
    s = withPawnAt(s, 'south-p0', 5);
    s = {
      ...s,
      legalMoves: [
        {
          id: 'm',
          type: 'move',
          playerId: 'south',
          pawnId: 'south-p0',
          rollValue: 3,
          from: [4, 6],
          to: [3, 6],
          fromIndex: 5,
          toIndex: 8,
          wouldHitPawnId: null,
          wouldFinish: false,
        },
      ],
    };
    expect(deriveTurnPhase(s)).toBe('awaiting-move');
  });

  it('is idle when a roll produced no legal moves (transient)', () => {
    const s = withRoll(makePlayingState(), 3);
    expect(deriveTurnPhase(s)).toBe('idle');
  });
});

describe('coordForPawn', () => {
  it('resolves an active pawn to its board coordinate', () => {
    const s = withPawnAt(makePlayingState(), 'south-p0', 0);
    expect(coordForPawn(s, 'south-p0')).toEqual([6, 3]);
  });

  it('returns null for home, finished, or unknown pawns', () => {
    const s = makePlayingState();
    expect(coordForPawn(s, 'south-p0')).toBeNull(); // home
    expect(coordForPawn(s, 'nope')).toBeNull();
    const fin = withPawnAt(s, 'south-p1', 48, 'finished');
    expect(coordForPawn(fin, 'south-p1')).toBeNull();
  });
});

describe('pathTrail', () => {
  it('lists inclusive coordinates in path-index order', () => {
    const trail = pathTrail('south', 0, 3);
    expect(trail).toEqual([
      [6, 3],
      [6, 4],
      [6, 5],
      [6, 6],
    ]);
  });

  it('handles the ring-transition jump and the diagonal hop to center', () => {
    const trail = pathTrail('south', 47, 48);
    expect(trail).toEqual([
      [4, 2],
      [3, 3],
    ]); // index 47 -> 48 is a diagonal, non-adjacent hop
  });

  it('returns empty when toIndex precedes fromIndex', () => {
    expect(pathTrail('south', 5, 4)).toEqual([]);
  });
});
