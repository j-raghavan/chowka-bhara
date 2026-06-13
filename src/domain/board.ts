/**
 * Board constants, rotations, and the single source of truth for path-index
 * landmarks and the occupancy key format (L-CB7, L-CB9).
 */
import type { Coord, CoordKey, PlayerSide } from './types';

export const BOARD_SIZE = 7 as const;
export const CENTER: Coord = [3, 3];

export const START_HOUSES: Readonly<Record<PlayerSide, Coord>> = {
  south: [6, 3],
  east: [3, 6],
  north: [0, 3],
  west: [3, 0],
};

/** The four start houses plus the center. */
export const SAFE_HOUSES: readonly Coord[] = [
  [6, 3],
  [3, 6],
  [0, 3],
  [3, 0],
  [3, 3],
];

// Path-index landmarks (L-CB7/L-CB9).
export const OUTER_RING_LAST_INDEX = 23 as const; // last outer-ring cell [6,2]
export const OUTER_RING_EXIT_INDEX = 24 as const; // entry to 5x5 middle ring [5,2] (gate)
export const MIDDLE_RING_START_INDEX = 24 as const; // alias for readability
export const INNER_RING_START_INDEX = 40 as const; // entry to true 3x3 ring [4,3]
export const FINISH_INDEX = 48 as const; // center [3,3]

// --- Rotations (90deg clockwise on a 7x7 grid) ------------------------------

export function rotate90Clockwise([r, c]: Coord): Coord {
  return [c, 6 - r];
}
export function rotate180(coord: Coord): Coord {
  return rotate90Clockwise(rotate90Clockwise(coord));
}
export function rotate270Clockwise(coord: Coord): Coord {
  return rotate90Clockwise(rotate180(coord));
}

// --- Coord <-> key (the ONE occupancy key format, L-CB1) --------------------

export function coordKey([r, c]: Coord): CoordKey {
  return `${r},${c}` as CoordKey;
}

export function keyToCoord(k: CoordKey): Coord {
  const [r, c] = k.split(',');
  return [Number(r), Number(c)];
}

export function inBounds([r, c]: Coord): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function isSafe(coord: Coord): boolean {
  const key = coordKey(coord);
  return SAFE_HOUSES.some((s) => coordKey(s) === key);
}

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
