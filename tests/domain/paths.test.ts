import { describe, expect, it } from 'vitest';
import { coordAt, PATHS, SOUTH_PATH, validatePaths } from '../../src/domain/paths';
import { coordKey } from '../../src/domain/board';
import type { PlayerSide } from '../../src/domain/types';

const SIDES: PlayerSide[] = ['south', 'east', 'north', 'west'];

describe('path geometry (CB1-AC1, CB1-AC2)', () => {
  it('every side path has length 49', () => {
    for (const side of SIDES) {
      expect(PATHS[side]).toHaveLength(49);
    }
  });

  it('every side path starts at its start house and ends at center', () => {
    expect(PATHS.south[0]).toEqual([6, 3]);
    expect(PATHS.west[0]).toEqual([3, 0]);
    expect(PATHS.north[0]).toEqual([0, 3]);
    expect(PATHS.east[0]).toEqual([3, 6]);
    for (const side of SIDES) {
      expect(PATHS[side][48]).toEqual([3, 3]);
    }
  });

  it('no path contains duplicate coordinates', () => {
    for (const side of SIDES) {
      const keys = PATHS[side].map(coordKey);
      expect(new Set(keys).size).toBe(49);
    }
  });

  it('every coordinate is inside the 7x7 board', () => {
    for (const side of SIDES) {
      for (const [r, c] of PATHS[side]) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(7);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(7);
      }
    }
  });

  it('south outer ring (0..23) equals the full 24-cell perimeter', () => {
    const perim = new Set<string>();
    for (let i = 0; i < 7; i++) {
      perim.add(coordKey([0, i]));
      perim.add(coordKey([6, i]));
      perim.add(coordKey([i, 0]));
      perim.add(coordKey([i, 6]));
    }
    const outer = new Set(SOUTH_PATH.slice(0, 24).map(coordKey));
    expect(outer).toEqual(perim);
    expect(outer.size).toBe(24);
  });

  it('documents the ring landmarks', () => {
    expect(SOUTH_PATH[23]).toEqual([6, 2]); // outer last
    expect(SOUTH_PATH[24]).toEqual([5, 1]); // middle-ring entry, the ✕ corner (gate)
    expect(SOUTH_PATH[40]).toEqual([4, 2]); // inner-ring entry
    expect(SOUTH_PATH[47]).toEqual([4, 3]); // directly below the crown
    expect(SOUTH_PATH[48]).toEqual([3, 3]); // center
  });

  it('enters the inner square diagonally and the crown straight up', () => {
    // The one diagonal hop: outer [6,2] -> middle ✕ corner [5,1].
    expect(SOUTH_PATH[23]).toEqual([6, 2]);
    expect(SOUTH_PATH[24]).toEqual([5, 1]);
    // The crown is entered straight up from directly below.
    expect(SOUTH_PATH[47]).toEqual([4, 3]);
    expect(SOUTH_PATH[48]).toEqual([3, 3]);
  });
});

describe('coordAt', () => {
  it('resolves a side + index to a coordinate', () => {
    expect(coordAt('south', 0)).toEqual([6, 3]);
    expect(coordAt('south', 48)).toEqual([3, 3]);
    expect(coordAt('west', 0)).toEqual([3, 0]);
  });

  it('throws on an out-of-range index', () => {
    expect(() => coordAt('south', 49)).toThrow(RangeError);
    expect(() => coordAt('south', -1)).toThrow(RangeError);
  });
});

describe('validatePaths', () => {
  it('passes for the canonical paths', () => {
    expect(() => validatePaths()).not.toThrow();
  });

  it('rejects a path of the wrong length', () => {
    expect(() => validatePaths({ ...PATHS, south: SOUTH_PATH.slice(0, 48) })).toThrow(/length/);
  });

  it('rejects a path that does not start at the start house', () => {
    const bad = [[0, 0], ...SOUTH_PATH.slice(1)] as const;
    expect(() => validatePaths({ ...PATHS, south: bad })).toThrow(/start house/);
  });

  it('rejects a path that does not end at center', () => {
    const bad = [...SOUTH_PATH.slice(0, 48), [0, 0]] as const;
    expect(() => validatePaths({ ...PATHS, south: bad })).toThrow(/center/);
  });

  it('rejects a duplicate coordinate', () => {
    const dup = [...SOUTH_PATH.slice(0, 47), [6, 3], [3, 3]] as const;
    expect(() => validatePaths({ ...PATHS, south: dup })).toThrow(/duplicate/);
  });

  it('rejects an out-of-bounds coordinate', () => {
    const oob = [[9, 9], ...SOUTH_PATH.slice(1)] as const;
    expect(() => validatePaths({ ...PATHS, south: oob })).toThrow(/out-of-bounds|start house/);
  });
});
