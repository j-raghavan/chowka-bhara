/**
 * Occupancy is keyed by RESOLVED board Coord, never by pathIndex (L-CB1, I-CB18).
 * All four player paths overlap physically; this map is the single access path
 * for every hit / own-block / no-stacking check.
 *
 * A coordinate maps to a LIST of occupants: non-safe houses hold at most one
 * pawn (no stacking), but safe houses may hold several (stacking allowed, #3).
 */
import { coordKey } from './board';
import { coordAt } from './paths';
import type { Coord, CoordKey, GameState, PlayerSide } from './types';

export interface Occupant {
  readonly pawnId: string;
  readonly playerId: string;
  readonly side: PlayerSide;
}

export type OccupancyMap = ReadonlyMap<CoordKey, readonly Occupant[]>;

/**
 * Build occupancy from state. Includes ONLY pawns with state === 'active'.
 * Home pawns (no board cell) and finished pawns (not capturable, I-CB6) are excluded.
 */
export function buildOccupancy(state: GameState): OccupancyMap {
  const map = new Map<CoordKey, Occupant[]>();
  for (const pawn of Object.values(state.pawns)) {
    if (pawn.state !== 'active' || pawn.pathIndex === null) continue;
    const player = state.players[pawn.playerId];
    if (player === undefined) continue;
    const key = coordKey(coordAt(player.side, pawn.pathIndex));
    const occupant: Occupant = { pawnId: pawn.id, playerId: pawn.playerId, side: player.side };
    const list = map.get(key);
    if (list === undefined) map.set(key, [occupant]);
    else list.push(occupant);
  }
  return map;
}

export function occupantsAt(occ: OccupancyMap, coord: Coord): readonly Occupant[] {
  return occ.get(coordKey(coord)) ?? [];
}
