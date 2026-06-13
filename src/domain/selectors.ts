/**
 * Pure read-only selectors / render helpers (L-CB11). These let the UI render
 * placement, previews, and turn phase without re-implementing path math.
 */
import { coordAt } from './paths';
import type { Coord, GameState, PlayerSide, TurnPhase } from './types';

/** Derived (non-stored) turn phase, gap G1. */
export function deriveTurnPhase(state: GameState): TurnPhase {
  if (state.status !== 'playing' || state.currentPlayerId === null) return 'idle';
  if (state.currentRoll === null) return 'awaiting-roll';
  if (state.legalMoves.length > 0) return 'awaiting-move';
  return 'idle'; // no legal moves auto-resolves in the reducer; transient
}

/** Resolve a pawn's current board coordinate, or null if home/finished/unknown. */
export function coordForPawn(state: GameState, pawnId: string): Coord | null {
  const pawn = state.pawns[pawnId];
  if (pawn === undefined || pawn.state !== 'active' || pawn.pathIndex === null) return null;
  const player = state.players[pawn.playerId];
  if (player === undefined) return null;
  return coordAt(player.side, pawn.pathIndex);
}

/**
 * The ordered list of board coordinates a pawn passes through from `fromIndex`
 * to `toIndex` (inclusive). Walks path-index order so it handles the spiral's
 * ring-transition jumps and the diagonal hop into the center — the UI must NOT
 * assume physical step-1 adjacency.
 */
export function pathTrail(side: PlayerSide, fromIndex: number, toIndex: number): readonly Coord[] {
  if (toIndex < fromIndex) return [];
  const trail: Coord[] = [];
  for (let i = fromIndex; i <= toIndex; i++) trail.push(coordAt(side, i));
  return trail;
}
