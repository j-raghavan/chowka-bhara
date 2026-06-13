/**
 * Authoritative pure reducer (L-CB3): validate -> apply -> resolveTurn.
 * The single place that produces a new GameState (boundary rule B2).
 */
import { FINISH_INDEX } from './board';
import { grantsBonus, rollCowries } from './cowries';
import { assignSidesAndPawns, CANONICAL_ORDER, newSeat } from './game-setup';
import { computeSkipReason, generateLegalMoves } from './legal-moves';
import { appendEvents, makeEvent, rememberCommandId } from './history';
import { assertInvariantsDev } from './invariants';
import type {
  ApplyResult,
  CommandRejectionCode,
  DomainEnv,
  GameCommand,
  GameEvent,
  GameState,
  LegalMove,
  Pawn,
  Player,
} from './types';

type Step =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly rejection: CommandRejectionCode };

const ok = (state: GameState, events: readonly GameEvent[] = []): Step => ({ ok: true, state, events });
const no = (rejection: CommandRejectionCode): Step => ({ ok: false, rejection });

/** Single entry point. */
export function applyCommand(state: GameState, command: GameCommand, env: DomainEnv): ApplyResult {
  if (state.recentCommandIds.includes(command.commandId)) {
    return { state, accepted: false, rejection: 'DUPLICATE_COMMAND', events: [] };
  }
  const step = dispatch(state, command, env);
  if (!step.ok) {
    return { state, accepted: false, rejection: step.rejection, events: [] };
  }
  const next: GameState = {
    ...step.state,
    history: appendEvents(state.history, step.events),
    recentCommandIds: rememberCommandId(state.recentCommandIds, command.commandId),
    revision: state.revision + 1,
    updatedAt: env.clock.now(),
  };
  assertInvariantsDev(next);
  return { state: next, accepted: true, events: step.events };
}

function dispatch(state: GameState, command: GameCommand, env: DomainEnv): Step {
  switch (command.type) {
    case 'JOIN_ROOM':
      return applyJoin(state, command.playerId, command.displayName, env);
    case 'LEAVE_ROOM':
      return applyLeave(state, command.playerId, env);
    case 'START_GAME':
      return applyStart(state, command.playerId, env);
    case 'ROLL':
      return applyRoll(state, command.playerId, env);
    case 'SELECT_MOVE':
      return applySelectMove(state, command.playerId, command.moveId, env);
    case 'RESIGN':
      return applyResign(state, command.playerId, env);
    case 'CREATE_ROOM':
      return no('UNKNOWN_COMMAND'); // room creation is a transport op, not an in-state transition
    /* v8 ignore next 2 -- defensive: the command union above is exhaustive */
    default:
      return no('UNKNOWN_COMMAND');
  }
}

// --- Lobby transitions ------------------------------------------------------

function applyJoin(state: GameState, playerId: string, displayName: string, env: DomainEnv): Step {
  if (state.status !== 'lobby') return no('NOT_IN_LOBBY');
  if (state.players[playerId] !== undefined) return ok(state); // idempotent re-seat
  if (state.playerOrder.length >= state.config.maxPlayers) return no('ROOM_FULL');
  const side = CANONICAL_ORDER[state.playerOrder.length]!;
  const player = newSeat(playerId, displayName, side, env.clock.now());
  const next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: player },
    playerOrder: [...state.playerOrder, playerId],
  };
  return ok(next, [makeEvent('JOIN', env, playerId, { displayName })]);
}

function applyLeave(state: GameState, playerId: string, env: DomainEnv): Step {
  const player = state.players[playerId];
  if (player === undefined) return ok(state);
  if (state.status === 'lobby') {
    const players = { ...state.players };
    delete players[playerId];
    const pawns = Object.fromEntries(
      Object.entries(state.pawns).filter(([, p]) => p.playerId !== playerId),
    );
    const playerOrder = state.playerOrder.filter((id) => id !== playerId);
    const hostId = state.hostId === playerId ? (playerOrder[0] ?? null) : state.hostId;
    return ok({ ...state, players, pawns, playerOrder, hostId }, [makeEvent('LEAVE', env, playerId)]);
  }
  // In play: mark disconnected (v0.1 does not auto-skip the current player).
  const next: GameState = {
    ...state,
    players: { ...state.players, [playerId]: { ...player, status: 'disconnected' } },
  };
  return ok(next, [makeEvent('LEAVE', env, playerId)]);
}

function applyStart(state: GameState, playerId: string, env: DomainEnv): Step {
  if (state.status !== 'lobby') return no('NOT_IN_LOBBY');
  if (state.hostId !== playerId) return no('NOT_HOST');
  const count = state.playerOrder.length;
  if (count < state.config.minPlayers || count > state.config.maxPlayers) return no('BAD_PLAYER_COUNT');

  const { players, pawns, playerOrder } = assignSidesAndPawns(
    state.players,
    state.playerOrder,
    state.config.pawnsPerPlayer,
  );
  const next: GameState = {
    ...state,
    status: 'playing',
    players,
    pawns,
    playerOrder,
    currentPlayerId: playerOrder[0] ?? null,
    turnNumber: 1,
    turnChainRollCount: 0,
  };
  return ok(next, [makeEvent('START', env, playerId, { players: playerOrder.length })]);
}

// --- Gameplay transitions ---------------------------------------------------

function notPlayable(state: GameState): CommandRejectionCode | null {
  if (state.status === 'finished') return 'GAME_OVER';
  if (state.status !== 'playing') return 'WRONG_PHASE';
  return null;
}

function applyRoll(state: GameState, playerId: string, env: DomainEnv): Step {
  const bad = notPlayable(state);
  if (bad) return no(bad);
  if (state.currentPlayerId !== playerId) return no('NOT_CURRENT_PLAYER');
  if (state.currentRoll !== null) return no('WRONG_PHASE'); // already rolled, awaiting move

  const roll = rollCowries(env);
  let s: GameState = { ...state, currentRoll: roll, turnChainRollCount: state.turnChainRollCount + 1 };
  const legalMoves = generateLegalMoves(s);
  s = { ...s, legalMoves };
  const events: GameEvent[] = [
    makeEvent('ROLL', env, playerId, { value: roll.value, openCount: roll.openCount }),
  ];

  if (legalMoves.length === 0) {
    events.push(makeEvent('SKIP', env, playerId, { reason: computeSkipReason(s) }));
    const resolved = resolveTurn(s, roll.value, false, false, env);
    return ok(resolved.state, [...events, ...resolved.events]);
  }
  return ok(s, events); // awaiting-move; same player must SELECT_MOVE
}

function applySelectMove(state: GameState, playerId: string, moveId: string, env: DomainEnv): Step {
  const bad = notPlayable(state);
  if (bad) return no(bad);
  if (state.currentPlayerId !== playerId) return no('NOT_CURRENT_PLAYER');
  if (state.currentRoll === null) return no('WRONG_PHASE'); // must roll first (CB4-AC2)
  const move = state.legalMoves.find((m) => m.id === moveId);
  if (move === undefined) return no('MOVE_NOT_LEGAL');

  const applied = applyMove(state, move, env);
  let s = applied.state;
  const events: GameEvent[] = [...applied.events];

  let gameOver = false;
  if (allFinished(s, playerId)) {
    s = { ...s, status: 'finished', winnerPlayerId: playerId };
    events.push(makeEvent('WIN', env, playerId));
    gameOver = true;
  }
  s = { ...s, currentRoll: null, legalMoves: [] };
  const resolved = resolveTurn(s, move.rollValue, applied.didHit, gameOver, env);
  return ok(resolved.state, [...events, ...resolved.events]);
}

interface MoveApplication {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly didHit: boolean;
}

function applyMove(state: GameState, move: LegalMove, env: DomainEnv): MoveApplication {
  const pawns: Record<string, Pawn> = { ...state.pawns };
  const events: GameEvent[] = [];
  let didHit = false;

  // Hit resolution: send the opponent pawn home (CB3-FR10).
  if (move.wouldHitPawnId !== null) {
    const victim = pawns[move.wouldHitPawnId];
    if (victim !== undefined) {
      pawns[victim.id] = { ...victim, state: 'home', pathIndex: null, finishedOrder: null };
      didHit = true;
      events.push(makeEvent('HIT', env, move.playerId, { victimPawnId: victim.id, victimPlayerId: victim.playerId }));
    }
  }

  const mover = pawns[move.pawnId]!;
  if (move.wouldFinish) {
    pawns[mover.id] = { ...mover, state: 'finished', pathIndex: FINISH_INDEX, finishedOrder: nextFinishedOrder(state) };
    events.push(makeEvent('FINISH', env, move.playerId, { pawnId: mover.id }));
  } else {
    pawns[mover.id] = { ...mover, state: 'active', pathIndex: move.toIndex, finishedOrder: null };
  }

  events.unshift(
    makeEvent('MOVE', env, move.playerId, {
      pawnId: move.pawnId,
      type: move.type,
      toIndex: move.toIndex,
      hit: didHit,
      finish: move.wouldFinish,
    }),
  );

  let players = state.players;
  if (didHit) {
    const p = players[move.playerId]!;
    players = { ...players, [move.playerId]: { ...p, hasHit: true } };
  }
  return { state: { ...state, pawns, players }, events, didHit };
}

function nextFinishedOrder(state: GameState): number {
  return Object.values(state.pawns).filter((p) => p.state === 'finished').length;
}

function allFinished(state: GameState, playerId: string): boolean {
  const pawns = Object.values(state.pawns).filter((p) => p.playerId === playerId);
  return pawns.length > 0 && pawns.every((p) => p.state === 'finished');
}

/**
 * Pure turn resolution (L-CB3). bonus = grantsBonus(roll) || didHit.
 * Bonus keeps the same player current (await next ROLL) unless the safety cap
 * is reached; otherwise the turn advances to the next non-resigned player.
 */
export function resolveTurn(
  state: GameState,
  rollValue: number | null,
  didHit: boolean,
  gameOver: boolean,
  env: DomainEnv,
): { state: GameState; events: readonly GameEvent[] } {
  if (gameOver) {
    return { state: { ...state, turnChainRollCount: 0, currentRoll: null, legalMoves: [] }, events: [] };
  }
  const bonus = (rollValue !== null && grantsBonus(rollValue as 1)) || didHit;
  const capReached = state.turnChainRollCount >= state.config.maxTurnChain;

  if (bonus && !capReached) {
    const s: GameState = { ...state, currentRoll: null, legalMoves: [] };
    return { state: s, events: [makeEvent('BONUS', env, state.currentPlayerId, { reason: didHit ? 'hit' : 'roll' })] };
  }

  const nextId = nextPlayerId(state);
  const s: GameState = {
    ...state,
    currentPlayerId: nextId,
    currentRoll: null,
    legalMoves: [],
    turnNumber: state.turnNumber + 1,
    turnChainRollCount: 0,
  };
  return { state: s, events: [makeEvent('TURN_ADVANCE', env, nextId)] };
}

function nextPlayerId(state: GameState): string | null {
  const order = state.playerOrder;
  /* v8 ignore next -- defensive: a playing game always has an ordered current player */
  if (order.length === 0 || state.currentPlayerId === null) return state.currentPlayerId;
  const idx = order.indexOf(state.currentPlayerId);
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(idx + step) % order.length]!;
    if (state.players[candidate]!.status !== 'resigned') return candidate;
  }
  /* v8 ignore next -- defensive: resign-to-win removes the last-player-standing case first */
  return state.currentPlayerId;
}

function applyResign(state: GameState, playerId: string, env: DomainEnv): Step {
  const player = state.players[playerId];
  if (player === undefined) return no('NOT_CURRENT_PLAYER');
  const players: Record<string, Player> = {
    ...state.players,
    [playerId]: { ...player, status: 'resigned' },
  };
  let s: GameState = { ...state, players };
  const events: GameEvent[] = [makeEvent('RESIGN', env, playerId)];

  if (state.status === 'playing') {
    const live = state.playerOrder.filter((id) => players[id]?.status !== 'resigned');
    if (live.length === 1) {
      const winner = live[0]!;
      s = { ...s, status: 'finished', winnerPlayerId: winner, currentRoll: null, legalMoves: [] };
      events.push(makeEvent('WIN', env, winner));
      return ok(s, events);
    }
    if (state.currentPlayerId === playerId) {
      const resolved = resolveTurn(s, null, false, false, env);
      return ok(resolved.state, [...events, ...resolved.events]);
    }
  }
  return ok(s, events);
}
