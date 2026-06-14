import { describe, expect, it } from 'vitest';
import { buildOccupancy, occupantsAt } from '../../src/domain/occupancy';
import { makePlayingState, withPawnAt } from '../helpers/state';

describe('buildOccupancy (L-CB1, I-CB18)', () => {
  it('includes only active pawns, keyed by resolved Coord', () => {
    let s = makePlayingState();
    s = withPawnAt(s, 'south-p0', 5); // active
    const occ = buildOccupancy(s);
    expect(occ.size).toBe(1);
    // south index 5 resolves to [4,6]
    const here = occupantsAt(occ, [4, 6]);
    expect(here).toHaveLength(1);
    expect(here[0]?.pawnId).toBe('south-p0');
    expect(here[0]?.side).toBe('south');
  });

  it('excludes home and finished pawns (I-CB5, I-CB6)', () => {
    let s = makePlayingState();
    s = withPawnAt(s, 'south-p0', 47, 'finished');
    const occ = buildOccupancy(s);
    expect(occ.size).toBe(0);
  });

  it('keys two pawns at the same pathIndex to different physical cells', () => {
    let s = makePlayingState({ sides: ['south', 'north'] });
    s = withPawnAt(s, 'south-p0', 1); // south idx1 = [6,4]
    s = withPawnAt(s, 'north-p0', 1); // north idx1 = rotate180([6,4]) = [0,2]
    const occ = buildOccupancy(s);
    expect(occ.size).toBe(2);
    expect(occupantsAt(occ, [6, 4])[0]?.side).toBe('south');
    expect(occupantsAt(occ, [0, 2])[0]?.side).toBe('north');
  });

  it('stacks multiple pawns on one coordinate (safe-house stacking, #3)', () => {
    // south idx 3 = [6,6] (a safe corner); north idx 15 also resolves to [6,6].
    let s = makePlayingState({ sides: ['south', 'north'] });
    s = withPawnAt(s, 'south-p0', 3);
    s = withPawnAt(s, 'north-p0', 15);
    const occ = buildOccupancy(s);
    expect(occupantsAt(occ, [6, 6])).toHaveLength(2);
  });

  it('returns an empty list for an empty cell', () => {
    const occ = buildOccupancy(makePlayingState());
    expect(occupantsAt(occ, [3, 3])).toEqual([]);
  });
});
