import { DEFAULT_7X7_CONFIG } from '../../src/domain/config';
import { facesForValue, grantsBonus, openCount, scoreCowries } from '../../src/domain/cowries';
import type {
  CowrieRoll,
  GameState,
  Pawn,
  Player,
  PlayerSide,
  RollValue,
} from '../../src/domain/types';

const COLORS: Record<PlayerSide, string> = {
  south: '#3f51b5',
  east: '#f9a825',
  north: '#bf360c',
  west: '#2e7d32',
};

export function newPlayer(side: PlayerSide): Player {
  return {
    id: side,
    displayName: side,
    side,
    color: COLORS[side],
    status: 'connected',
    hasHit: false,
    joinedAt: 0,
    lastSeenAt: 0,
  };
}

export function newPawns(playerId: string, count = 4): Pawn[] {
  return Array.from({ length: count }, (_u, i) => ({
    id: `${playerId}-p${i}`,
    playerId,
    state: 'home' as const,
    pathIndex: null,
    finishedOrder: null,
  }));
}

export interface MakeStateOpts {
  readonly sides?: readonly PlayerSide[];
  readonly current?: PlayerSide;
  readonly status?: GameState['status'];
  readonly pawnsPerPlayer?: number;
}

/** Build a playing GameState with all pawns home. Canonical order. */
export function makePlayingState(opts: MakeStateOpts = {}): GameState {
  const order: PlayerSide[] = ['south', 'east', 'north', 'west'];
  const sides = (opts.sides ?? ['south', 'north']).slice();
  const seated = order.filter((s) => sides.includes(s));

  const players: Record<string, Player> = {};
  const pawns: Record<string, Pawn> = {};
  for (const side of seated) {
    players[side] = newPlayer(side);
    for (const pawn of newPawns(side, opts.pawnsPerPlayer ?? 4)) pawns[pawn.id] = pawn;
  }

  return {
    schemaVersion: 1,
    gameId: 'game-test',
    status: opts.status ?? 'playing',
    config: DEFAULT_7X7_CONFIG,
    hostId: seated[0] ?? null,
    players,
    playerOrder: seated,
    currentPlayerId: opts.current ?? seated[0] ?? null,
    pawns,
    currentRoll: null,
    legalMoves: [],
    turnNumber: 1,
    turnChainRollCount: 0,
    winnerPlayerId: null,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    revision: 0,
  };
}

export function makeRoll(value: RollValue, id = 'roll-0'): CowrieRoll {
  const faces = facesForValue(value);
  return {
    id,
    faces,
    openCount: openCount(faces),
    value: scoreCowries(faces),
    grantsBonusTurn: grantsBonus(value),
    rolledAt: 0,
  };
}

export function withRoll(state: GameState, value: RollValue): GameState {
  return { ...state, currentRoll: makeRoll(value) };
}

/** Place a pawn at a given path index (active). */
export function withPawnAt(
  state: GameState,
  pawnId: string,
  pathIndex: number,
  pawnState: Pawn['state'] = 'active',
): GameState {
  const pawn = state.pawns[pawnId];
  if (pawn === undefined) throw new Error(`no pawn ${pawnId}`);
  return {
    ...state,
    pawns: {
      ...state.pawns,
      [pawnId]: {
        ...pawn,
        state: pawnState,
        pathIndex: pawnState === 'home' ? null : pathIndex,
        finishedOrder: pawnState === 'finished' ? 0 : null,
      },
    },
  };
}

export function withHasHit(state: GameState, playerId: string, hasHit = true): GameState {
  const player = state.players[playerId];
  if (player === undefined) throw new Error(`no player ${playerId}`);
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...player, hasHit } },
  };
}
