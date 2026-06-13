import { describe, expect, it } from 'vitest';
import {
  coordKey,
  coordsEqual,
  inBounds,
  isSafe,
  keyToCoord,
  rotate180,
  rotate270Clockwise,
  rotate90Clockwise,
  SAFE_HOUSES,
  START_HOUSES,
  OUTER_RING_EXIT_INDEX,
  MIDDLE_RING_START_INDEX,
  FINISH_INDEX,
} from '../../src/domain/board';
import type { Coord } from '../../src/domain/types';

describe('coordKey / keyToCoord', () => {
  it('round-trips every board coordinate (CB1-AC2)', () => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const coord: Coord = [r, c];
        const back = keyToCoord(coordKey(coord));
        expect(back).toEqual(coord);
      }
    }
  });

  it('produces the documented "row,col" format', () => {
    expect(coordKey([6, 3])).toBe('6,3');
  });
});

describe('rotations', () => {
  it('rotate90Clockwise maps each start house to the next side', () => {
    expect(rotate90Clockwise(START_HOUSES.south)).toEqual(START_HOUSES.west);
    expect(rotate90Clockwise(START_HOUSES.west)).toEqual(START_HOUSES.north);
    expect(rotate90Clockwise(START_HOUSES.north)).toEqual(START_HOUSES.east);
    expect(rotate90Clockwise(START_HOUSES.east)).toEqual(START_HOUSES.south);
  });

  it('rotate180 / rotate270 derive from rotate90', () => {
    expect(rotate180(START_HOUSES.south)).toEqual(START_HOUSES.north);
    expect(rotate270Clockwise(START_HOUSES.south)).toEqual(START_HOUSES.east);
  });

  it('keeps the center fixed under all rotations', () => {
    expect(rotate90Clockwise([3, 3])).toEqual([3, 3]);
    expect(rotate180([3, 3])).toEqual([3, 3]);
    expect(rotate270Clockwise([3, 3])).toEqual([3, 3]);
  });
});

describe('safe houses', () => {
  it('includes the four start houses plus center', () => {
    expect(SAFE_HOUSES).toHaveLength(5);
    expect(isSafe([6, 3])).toBe(true);
    expect(isSafe([3, 6])).toBe(true);
    expect(isSafe([0, 3])).toBe(true);
    expect(isSafe([3, 0])).toBe(true);
    expect(isSafe([3, 3])).toBe(true);
  });

  it('reports non-safe houses as unsafe', () => {
    expect(isSafe([6, 4])).toBe(false);
    expect(isSafe([1, 1])).toBe(false);
  });

  it('safe-house set is invariant under 90/180/270 rotation', () => {
    const base = SAFE_HOUSES.map(coordKey).sort();
    for (const rot of [rotate90Clockwise, rotate180, rotate270Clockwise]) {
      const rotated = SAFE_HOUSES.map((s) => coordKey(rot(s))).sort();
      expect(rotated).toEqual(base);
    }
  });
});

describe('bounds and equality', () => {
  it('inBounds rejects coordinates outside the 7x7 grid', () => {
    expect(inBounds([0, 0])).toBe(true);
    expect(inBounds([6, 6])).toBe(true);
    expect(inBounds([-1, 0])).toBe(false);
    expect(inBounds([0, 7])).toBe(false);
    expect(inBounds([7, 3])).toBe(false);
  });

  it('coordsEqual compares structurally', () => {
    expect(coordsEqual([3, 3], [3, 3])).toBe(true);
    expect(coordsEqual([3, 3], [3, 4])).toBe(false);
  });
});

describe('landmark constants', () => {
  it('the gate landmark is the middle-ring entry, not the inner ring (L-CB7)', () => {
    expect(OUTER_RING_EXIT_INDEX).toBe(24);
    expect(MIDDLE_RING_START_INDEX).toBe(24);
    expect(FINISH_INDEX).toBe(48);
  });
});
