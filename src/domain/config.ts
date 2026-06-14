/**
 * Default v0.1 ruleset config. Board-geometry constants are referenced from
 * board.ts (single source of truth, L-CB9) — never literal-duplicated here.
 */
import { FINISH_INDEX, OUTER_RING_EXIT_INDEX, SAFE_HOUSES } from './board';
import type { GameConfig } from './types';

// v2: the as-built rules diverge from spec v0.1 (safe-house geometry/stacking,
// entry rule, start=marker/center=finish, diagonal inner-square entry + straight
// crown, flattened cowrie odds). See docs/adr/ADR-0002-as-built-rules.md. The id
// is stored per game, so older saved rooms keep whatever ruleset they began with.
export const RULESET_ID = '7x7-six-cowrie-v2' as const;

/**
 * Selectable pawn colors (single source of truth). The first four are the
 * default seat colors (South, East, North, West); the rest are extra choices.
 * Players may pick any palette color not already taken (CB-color choice).
 */
export const PAWN_PALETTE: readonly string[] = [
  '#3f51b5', // indigo (South default)
  '#f9a825', // marigold (East default)
  '#bf360c', // terracotta (North default)
  '#2e7d32', // forest (West default)
  '#7b1fa2', // purple
  '#0097a7', // teal
  '#c2185b', // magenta
  '#455a64', // slate
];

export function isPaletteColor(color: string): boolean {
  return PAWN_PALETTE.includes(color);
}

export const DEFAULT_7X7_CONFIG: GameConfig = {
  ruleset: RULESET_ID,
  boardSize: 7,
  minPlayers: 2,
  maxPlayers: 4,

  cowrieCount: 6,
  rollValues: [1, 2, 3, 4, 5, 6, 12],
  entryRoll: 1,
  bonusRolls: [6, 12],

  pawnsPerPlayer: 4,
  requireHitBeforeInnerPath: true,
  exactRollToFinish: true,

  allowStacking: false, // ordinary houses: own pawn blocks, opponent is hit
  allowSafeHouseStacking: true, // ✕ safe houses may be shared by any pawns (#3)
  allowGatti: false,
  hitOpponentOnLanding: true,
  hitGrantsBonusTurn: true,

  safeHouses: SAFE_HOUSES,
  outerRingExitIndex: OUTER_RING_EXIT_INDEX,
  finishIndex: FINISH_INDEX,

  tripleBonusRule: 'disabled',
  maxTurnChain: 64,
};
