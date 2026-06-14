/**
 * Canonical South path and the rotated paths for the other three sides.
 * The South path is a Hamiltonian spiral over all 49 houses, traced to match
 * the physical board:
 *   perimeter (0-23) -> 5x5 ring (24-39) -> 3x3 ring (40-47) -> center (48).
 * Two notable steps mirror the board's drawn route:
 *   - Entry into the inner square cuts the corner diagonally from the outer
 *     ring [6,2] into the middle-ring ✕ corner [5,1] (index 23 -> 24, the gate).
 *   - The crown is entered with a straight step from directly below
 *     ([4,3] -> [3,3], index 47 -> 48).
 */
import {
  FINISH_INDEX,
  coordKey,
  coordsEqual,
  inBounds,
  rotate180,
  rotate270Clockwise,
  rotate90Clockwise,
  START_HOUSES,
  CENTER,
} from './board';
import type { Coord, PlayerSide } from './types';

export const SOUTH_PATH: readonly Coord[] = [
  // Start
  [6, 3],

  // Outer ring (perimeter), anti-clockwise from South start (indices 1-23)
  [6, 4],
  [6, 5],
  [6, 6],
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [0, 6],
  [0, 5],
  [0, 4],
  [0, 3],
  [0, 2],
  [0, 1],
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [5, 0],
  [6, 0],
  [6, 1],
  [6, 2],

  // Middle 5x5 ring (indices 24-39). Entered diagonally from [6,2] at the ✕
  // corner [5,1], then clockwise: up the left, across the top, down the right,
  // and back along row 5 to [5,2].
  [5, 1],
  [4, 1],
  [3, 1],
  [2, 1],
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [4, 5],
  [5, 5],
  [5, 4],
  [5, 3],
  [5, 2],

  // Inner 3x3 ring (indices 40-47): up the left, across the top, down the
  // right, ending directly below the crown so the final step is straight up.
  [4, 2],
  [3, 2],
  [2, 2],
  [2, 3],
  [2, 4],
  [3, 4],
  [4, 4],
  [4, 3],

  // Finish (index 48): straight step up into the crown from [4,3].
  [3, 3],
];

export const PATHS: Readonly<Record<PlayerSide, readonly Coord[]>> = {
  south: SOUTH_PATH,
  west: SOUTH_PATH.map(rotate90Clockwise),
  north: SOUTH_PATH.map(rotate180),
  east: SOUTH_PATH.map(rotate270Clockwise),
};

/** Resolve a side + pathIndex to a board Coord. Throws on out-of-range index. */
export function coordAt(side: PlayerSide, pathIndex: number): Coord {
  const path = PATHS[side];
  const coord = path[pathIndex];
  if (coord === undefined) {
    throw new RangeError(`pathIndex ${pathIndex} out of range for side ${side}`);
  }
  return coord;
}

/**
 * Validate the five path invariants for every side:
 * length 49, index 0 = start house, index 48 = center, no duplicates,
 * every coordinate in bounds. Throws on the first violation.
 */
export function validatePaths(paths: Readonly<Record<PlayerSide, readonly Coord[]>> = PATHS): void {
  for (const side of Object.keys(paths) as PlayerSide[]) {
    const path = paths[side];
    if (path.length !== FINISH_INDEX + 1) {
      throw new Error(`path[${side}] length ${path.length} !== 49`);
    }
    const start = path[0];
    if (start === undefined || !coordsEqual(start, START_HOUSES[side])) {
      throw new Error(`path[${side}] does not start at its start house`);
    }
    const end = path[FINISH_INDEX];
    if (end === undefined || !coordsEqual(end, CENTER)) {
      throw new Error(`path[${side}] does not end at center`);
    }
    const seen = new Set<string>();
    for (const coord of path) {
      if (!inBounds(coord)) {
        throw new Error(`path[${side}] has out-of-bounds coord ${coordKey(coord)}`);
      }
      const key = coordKey(coord);
      if (seen.has(key)) {
        throw new Error(`path[${side}] has duplicate coord ${key}`);
      }
      seen.add(key);
    }
  }
}
