import { describe, expect, it } from 'vitest';
import { buildOccupancy, occupantAt } from '../../src/domain/occupancy';
import { makePlayingState, withPawnAt } from '../helpers/state';

describe('buildOccupancy (L-CB1, I-CB18)', () => {
  it('includes only active pawns, keyed by resolved Coord', () => {
    let s = makePlayingState();
    s = withPawnAt(s, 'south-p0', 5); // active
    const occ = buildOccupancy(s);
    expect(occ.size).toBe(1);
    // south index 5 resolves to [4,6]
    expect(occupantAt(occ, [4, 6])?.pawnId).toBe('south-p0');
    expect(occupantAt(occ, [4, 6])?.side).toBe('south');
  });

  it('excludes home and finished pawns (I-CB5, I-CB6)', () => {
    let s = makePlayingState();
    s = withPawnAt(s, 'south-p0', 48, 'finished');
    // south-p1 stays home
    const occ = buildOccupancy(s);
    expect(occ.size).toBe(0);
  });

  it('keys two pawns at the same pathIndex to different physical cells', () => {
    let s = makePlayingState({ sides: ['south', 'north'] });
    s = withPawnAt(s, 'south-p0', 1); // south idx1 = [6,4]
    s = withPawnAt(s, 'north-p0', 1); // north idx1 = rotate180([6,4]) = [0,2]
    const occ = buildOccupancy(s);
    expect(occ.size).toBe(2);
    expect(occupantAt(occ, [6, 4])?.side).toBe('south');
    expect(occupantAt(occ, [0, 2])?.side).toBe('north');
  });

  it('returns undefined for an empty cell', () => {
    const occ = buildOccupancy(makePlayingState());
    expect(occupantAt(occ, [3, 3])).toBeUndefined();
  });
});
