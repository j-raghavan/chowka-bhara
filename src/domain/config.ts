/**
 * Default v0.1 ruleset config. Board-geometry constants are referenced from
 * board.ts (single source of truth, L-CB9) — never literal-duplicated here.
 */
import { FINISH_INDEX, OUTER_RING_EXIT_INDEX, SAFE_HOUSES } from './board';
import type { GameConfig } from './types';

export const RULESET_ID = '7x7-six-cowrie-v1' as const;

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

  allowStacking: false,
  allowGatti: false,
  hitOpponentOnLanding: true,
  hitGrantsBonusTurn: true,

  safeHouses: SAFE_HOUSES,
  outerRingExitIndex: OUTER_RING_EXIT_INDEX,
  finishIndex: FINISH_INDEX,

  tripleBonusRule: 'disabled',
  maxTurnChain: 64,
};
