/**
 * Legal-move generation (L-CB2): build candidates, then filter through an
 * ORDERED predicate chain. Each gate is pure, exported, and maps 1:1 to a
 * CB3 Acceptance Criterion.
 *
 * Order is normative:  withinBounds -> innerPathGate -> destinationRule.
 */
import { ENTRY_INDEX, FINISH_INDEX, OUTER_RING_EXIT_INDEX, isSafe } from './board';
import { coordAt } from './paths';
import { buildOccupancy, occupantAt, type OccupancyMap } from './occupancy';
import type {
  CowrieRoll,
  GameState,
  LegalMove,
  LegalMoveType,
  Pawn,
  Player,
  PlayerSide,
  SkipReason,
} from './types';

export interface MoveContext {
  readonly state: GameState;
  readonly occ: OccupancyMap;
  readonly player: Player;
  readonly roll: CowrieRoll;
}

export interface MoveCandidate {
  readonly pawnId: string;
  readonly type: LegalMoveType;
  readonly fromIndex: number | null;
  readonly toIndex: number;
  readonly side: PlayerSide;
}

export type GateReason = 'OVERSHOOT' | 'INNER_PATH_NO_HIT' | 'OWN_PAWN' | 'OPP_SAFE_BLOCKED';

export type GateResult =
  | { readonly ok: true; readonly candidate: MoveCandidate; readonly wouldHitPawnId: string | null }
  | { readonly ok: false; readonly reason: GateReason };

const pass = (candidate: MoveCandidate, wouldHitPawnId: string | null = null): GateResult => ({
  ok: true,
  candidate,
  wouldHitPawnId,
});

const drop = (reason: GateReason): GateResult => ({ ok: false, reason });

function playerPawns(state: GameState, playerId: string): Pawn[] {
  return Object.values(state.pawns).filter((p) => p.playerId === playerId);
}

// --- Candidate generation ---------------------------------------------------

/**
 * roll === entryRoll (1) -> one 'enter' candidate per home pawn, landing on the
 * first playable house (ENTRY_INDEX = 1), one step past the start/home marker;
 * any roll -> one 'move' candidate per active pawn (toIndex = pathIndex + value).
 */
export function generateCandidates(ctx: MoveContext): readonly MoveCandidate[] {
  const { state, player, roll } = ctx;
  const side = player.side;
  const candidates: MoveCandidate[] = [];
  const pawns = playerPawns(state, player.id);

  if (roll.value === state.config.entryRoll) {
    for (const pawn of pawns) {
      if (pawn.state === 'home') {
        candidates.push({
          pawnId: pawn.id,
          type: 'enter',
          fromIndex: null,
          toIndex: ENTRY_INDEX,
          side,
        });
      }
    }
  }

  for (const pawn of pawns) {
    if (pawn.state === 'active' && pawn.pathIndex !== null) {
      candidates.push({
        pawnId: pawn.id,
        type: 'move',
        fromIndex: pawn.pathIndex,
        toIndex: pawn.pathIndex + roll.value,
        side,
      });
    }
  }

  return candidates;
}

// --- Ordered gate chain -----------------------------------------------------

/** G-1: toIndex must not overshoot the center; exact finish is allowed (CB3-FR8). */
export function withinBounds(c: MoveCandidate): GateResult {
  return c.toIndex <= FINISH_INDEX ? pass(c) : drop('OVERSHOOT');
}

/** G-2: crossing into the ring beyond the outer ring requires a prior hit (CB3-FR13). */
export function innerPathGate(c: MoveCandidate, ctx: MoveContext): GateResult {
  const gated = ctx.state.config.requireHitBeforeInnerPath;
  if (gated && !ctx.player.hasHit && c.toIndex >= OUTER_RING_EXIT_INDEX) {
    return drop('INNER_PATH_NO_HIT');
  }
  return pass(c);
}

/** G-3: resolve destination occupancy (CB3-FR9/FR10/FR11). */
export function destinationRule(c: MoveCandidate, ctx: MoveContext): GateResult {
  const coord = coordAt(c.side, c.toIndex);
  const occupant = occupantAt(ctx.occ, coord);
  if (occupant === undefined) return pass(c);
  if (occupant.playerId === ctx.player.id) return drop('OWN_PAWN');
  // opponent
  if (isSafe(coord)) return drop('OPP_SAFE_BLOCKED');
  return pass(c, occupant.pawnId);
}

const REASON_TO_SKIP: Readonly<Record<GateReason, SkipReason>> = {
  OVERSHOOT: 'would-overshoot',
  INNER_PATH_NO_HIT: 'inner-path-locked',
  OWN_PAWN: 'all-targets-blocked',
  OPP_SAFE_BLOCKED: 'all-targets-blocked',
};

const GATES: ReadonlyArray<(c: MoveCandidate, ctx: MoveContext) => GateResult> = [
  withinBounds,
  innerPathGate,
  destinationRule,
];

/** Run a candidate through the ordered chain; first failing gate wins. */
export function runGates(c: MoveCandidate, ctx: MoveContext): GateResult {
  let result: GateResult = pass(c);
  for (const gate of GATES) {
    result = gate(c, ctx);
    if (!result.ok) return result;
  }
  return result;
}

function toLegalMove(
  c: MoveCandidate,
  roll: CowrieRoll,
  player: Player,
  wouldHitPawnId: string | null,
): LegalMove {
  return {
    id: `${c.type}:${c.pawnId}:${c.toIndex}`,
    type: c.type,
    playerId: player.id,
    pawnId: c.pawnId,
    rollValue: roll.value,
    from: c.fromIndex === null ? null : coordAt(c.side, c.fromIndex),
    to: coordAt(c.side, c.toIndex),
    fromIndex: c.fromIndex,
    toIndex: c.toIndex,
    wouldHitPawnId,
    wouldFinish: c.toIndex === FINISH_INDEX,
  };
}

/** Generate every legal move for the current player and current roll. */
export function generateLegalMoves(state: GameState): readonly LegalMove[] {
  const { currentPlayerId, currentRoll } = state;
  if (currentPlayerId === null || currentRoll === null) return [];
  const player = state.players[currentPlayerId];
  /* v8 ignore next -- defensive: the current player always has a record */
  if (player === undefined) return [];

  const ctx: MoveContext = { state, occ: buildOccupancy(state), player, roll: currentRoll };
  const moves: LegalMove[] = [];
  for (const candidate of generateCandidates(ctx)) {
    const result = runGates(candidate, ctx);
    if (result.ok) moves.push(toLegalMove(candidate, currentRoll, player, result.wouldHitPawnId));
  }
  return moves;
}

/**
 * Explain why the current player has no legal move (CB6-FR12, designer ask).
 * Inspects the drop reasons of every candidate.
 */
export function computeSkipReason(state: GameState): SkipReason {
  const { currentPlayerId, currentRoll } = state;
  /* v8 ignore next -- defensive: only invoked mid-turn with a current roll */
  if (currentPlayerId === null || currentRoll === null) return 'all-targets-blocked';
  const player = state.players[currentPlayerId];
  /* v8 ignore next -- defensive: current player always has a record */
  if (player === undefined) return 'all-targets-blocked';

  const ctx: MoveContext = { state, occ: buildOccupancy(state), player, roll: currentRoll };
  const candidates = generateCandidates(ctx);
  if (candidates.length === 0) return 'all-targets-blocked';

  const reasons = new Set<GateReason>();
  for (const c of candidates) {
    const result = runGates(c, ctx);
    if (result.ok) continue; // (should not happen when called on a no-move turn)
    reasons.add(result.reason);
  }

  if (reasons.size === 0) return 'all-targets-blocked';
  if (reasons.size > 1) return 'mixed';
  return REASON_TO_SKIP[[...reasons][0]!];
}
