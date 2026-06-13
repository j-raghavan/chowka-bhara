/** Room creation, deterministic side assignment, and pawn setup (CB5-FR5). */
import { DEFAULT_7X7_CONFIG } from './config';
import type { DomainEnv, GameState, Pawn, Player, PlayerSide } from './types';

export const SIDE_COLORS: Readonly<Record<PlayerSide, string>> = {
  south: '#3f51b5', // indigo
  east: '#f9a825', // marigold
  north: '#bf360c', // terracotta
  west: '#2e7d32', // forest green
};

/** Canonical turn order south -> east -> north -> west (L-CB10). */
export const CANONICAL_ORDER: readonly PlayerSide[] = ['south', 'east', 'north', 'west'];

/**
 * Deterministic side assignment by seated-player count (CB5-AC2..AC4):
 * 2 -> opposite sides; 3/4 -> canonical order.
 */
export const SIDE_ASSIGNMENT: Readonly<Record<number, readonly PlayerSide[]>> = {
  2: ['south', 'north'],
  3: ['south', 'east', 'north'],
  4: ['south', 'east', 'north', 'west'],
};

export interface CreateRoomInput {
  readonly gameId: string;
  readonly hostId: string;
  readonly hostName: string;
}

/** Build a fresh lobby state with the host seated. */
export function createInitialState(input: CreateRoomInput, env: DomainEnv): GameState {
  const now = env.clock.now();
  const host = newSeat(input.hostId, input.hostName, 'south', now);
  return {
    schemaVersion: 1,
    gameId: input.gameId,
    status: 'lobby',
    config: DEFAULT_7X7_CONFIG,
    hostId: input.hostId,
    players: { [input.hostId]: host },
    playerOrder: [input.hostId],
    currentPlayerId: null,
    pawns: {},
    currentRoll: null,
    legalMoves: [],
    turnNumber: 0,
    turnChainRollCount: 0,
    winnerPlayerId: null,
    history: [],
    recentCommandIds: [],
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };
}

/** A provisional lobby seat; the definitive side is assigned at START_GAME. */
export function newSeat(
  id: string,
  displayName: string,
  side: PlayerSide,
  now: number,
): Player {
  return {
    id,
    displayName,
    side,
    color: SIDE_COLORS[side],
    status: 'connected',
    hasHit: false,
    joinedAt: now,
    lastSeenAt: now,
  };
}

export function makePawns(playerId: string, count: number): Pawn[] {
  return Array.from({ length: count }, (_u, i) => ({
    id: `${playerId}-p${i}`,
    playerId,
    state: 'home' as const,
    pathIndex: null,
    finishedOrder: null,
  }));
}

/**
 * Assign definitive sides + colors by join order and create pawns.
 * Returns the players map, pawns map, and turn order (join order == canonical
 * side order because SIDE_ASSIGNMENT lists are canonical).
 */
export function assignSidesAndPawns(
  players: Readonly<Record<string, Player>>,
  joinOrder: readonly string[],
  pawnsPerPlayer: number,
): { players: Record<string, Player>; pawns: Record<string, Pawn>; playerOrder: string[] } {
  const sides = SIDE_ASSIGNMENT[joinOrder.length];
  if (sides === undefined) {
    throw new Error(`no side assignment for ${joinOrder.length} players`);
  }
  const nextPlayers: Record<string, Player> = {};
  const pawns: Record<string, Pawn> = {};
  joinOrder.forEach((playerId, i) => {
    const existing = players[playerId];
    const side = sides[i]!;
    if (existing === undefined) return;
    nextPlayers[playerId] = { ...existing, side, color: SIDE_COLORS[side] };
    for (const pawn of makePawns(playerId, pawnsPerPlayer)) pawns[pawn.id] = pawn;
  });
  return { players: nextPlayers, pawns, playerOrder: [...joinOrder] };
}
