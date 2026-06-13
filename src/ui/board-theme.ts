/**
 * Visual theme derived from the reference photo of the handmade Chowka Bhara
 * board: lime-green safe houses with green X marks, blue pawn glyphs on the
 * four start houses, a blue crown in the center, over a blue/teal patchwork.
 */
import { coordKey, isSafe, START_HOUSES } from '../domain/board';
import type { Coord, PlayerSide } from '../domain/types';

export const SIDE_COLORS: Record<PlayerSide, string> = {
  south: '#2b5fb8', // indigo-blue
  east: '#e0982a', // marigold
  north: '#c2451f', // terracotta
  west: '#2f7d46', // forest green
};

export const SIDE_LABEL: Record<PlayerSide, string> = {
  south: 'South',
  east: 'East',
  north: 'North',
  west: 'West',
};

export const SAFE_LIME = '#a8d24a';
export const SAFE_LIME_DEEP = '#8cbb39';
export const GLYPH_BLUE = '#1f6fa8';

/** Hand-painted patchwork blues/teals for the non-safe path tiles. */
const TILE_SHADES = ['#2faec6', '#39b6b0', '#2a97c4', '#49c3cc', '#3fb1bd', '#2bbcc0'];

const START_KEYS = new Set(Object.values(START_HOUSES).map(coordKey));
const CENTER_KEY = coordKey([3, 3]);

export type HouseRole = 'center' | 'start' | 'safe' | 'path';

export function houseRole(coord: Coord): HouseRole {
  const key = coordKey(coord);
  if (key === CENTER_KEY) return 'center';
  if (START_KEYS.has(key)) return 'start';
  if (isSafe(coord)) return 'safe';
  return 'path';
}

/** Which side a start house belongs to (for its pawn glyph tint). */
export function startSide(coord: Coord): PlayerSide | null {
  const key = coordKey(coord);
  for (const side of Object.keys(START_HOUSES) as PlayerSide[]) {
    if (coordKey(START_HOUSES[side]) === key) return side;
  }
  return null;
}

/** Deterministic patchwork shade so the board looks hand-made, not uniform. */
export function tileShade([r, c]: Coord): string {
  const idx = (r * 7 + c * 3 + ((r * c) % 5)) % TILE_SHADES.length;
  return TILE_SHADES[idx]!;
}
