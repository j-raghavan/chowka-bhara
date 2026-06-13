/**
 * Occupancy is keyed by RESOLVED board Coord, never by pathIndex (L-CB1, I-CB18).
 * All four player paths overlap physically; this map is the single access path
 * for every hit / own-block / safe-block / no-stacking check.
 */
import { coordKey } from './board';
import { coordAt } from './paths';
import type { Coord, CoordKey, GameState, PlayerSide } from './types';

export interface Occupant {
  readonly pawnId: string;
  readonly playerId: string;
  readonly side: PlayerSide;
}

export type OccupancyMap = ReadonlyMap<CoordKey, Occupant>;

/**
 * Build occupancy from state. Includes ONLY pawns with state === 'active'.
 * Home pawns (no board cell) and finished pawns (not capturable, I-CB6) are excluded.
 */
export function buildOccupancy(state: GameState): OccupancyMap {
  const map = new Map<CoordKey, Occupant>();
  for (const pawn of Object.values(state.pawns)) {
    if (pawn.state !== 'active' || pawn.pathIndex === null) continue;
    const player = state.players[pawn.playerId];
    if (player === undefined) continue;
    const coord = coordAt(player.side, pawn.pathIndex);
    map.set(coordKey(coord), {
      pawnId: pawn.id,
      playerId: pawn.playerId,
      side: player.side,
    });
  }
  return map;
}

export function occupantAt(occ: OccupancyMap, coord: Coord): Occupant | undefined {
  return occ.get(coordKey(coord));
}
