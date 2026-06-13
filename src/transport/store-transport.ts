/**
 * Shared room lifecycle for store-backed transports. Concrete subclasses supply
 * the storage + notification primitives; this base owns createRoom/joinRoom/
 * transactCommand/updatePresence and the reclaim-token flow, so the CAS and
 * reconnect logic exists in exactly one place (DRY).
 */
import { runCas } from './cas';
import { createInitialState } from '../domain/game-setup';
import type { DomainEnv, GameCommand, GameState, PlayerStatus } from '../domain/types';
import type {
  CommandResult,
  CreateRoomInput,
  CreateRoomResult,
  GameTransport,
  JoinRoomInput,
  JoinRoomResult,
  Unsubscribe,
} from './game-transport';

export interface ReclaimRecord {
  readonly gameId: string;
  readonly playerId: string;
}

export abstract class StoreTransport implements GameTransport {
  constructor(protected readonly env: DomainEnv) {}

  // --- primitives provided by concrete transports ---------------------------
  abstract getState(gameId: string): GameState | undefined;
  /** Persist a room state AND notify subscribers of the change. */
  protected abstract putState(state: GameState): void;
  protected abstract getToken(token: string): ReclaimRecord | undefined;
  protected abstract putToken(token: string, record: ReclaimRecord): void;
  abstract subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe;

  // --- shared lifecycle -----------------------------------------------------
  loadRoom(state: GameState): void {
    this.putState(state);
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const gameId = input.gameId ?? this.env.ids.next();
    const hostId = this.env.ids.next();
    const state = createInitialState({ gameId, hostId, hostName: input.hostName }, this.env);
    this.putState(state);
    const reclaimToken = this.issueToken(gameId, hostId);
    return { gameId, playerId: hostId, reclaimToken, state };
  }

  async joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
    const state = this.requireRoom(input.gameId);

    // Reconnect (CB5-FR9, CB5-AC7): a valid token reclaims the seat.
    if (input.reclaimToken !== undefined) {
      const record = this.getToken(input.reclaimToken);
      if (
        record !== undefined &&
        record.gameId === input.gameId &&
        state.players[record.playerId]
      ) {
        await this.updatePresence(input.gameId, record.playerId, 'connected');
        return {
          playerId: record.playerId,
          reclaimToken: input.reclaimToken,
          spectator: false,
          state: this.requireRoom(input.gameId),
        };
      }
    }

    const spectator =
      state.status !== 'lobby' || state.playerOrder.length >= state.config.maxPlayers;
    if (spectator) {
      return { playerId: '', reclaimToken: '', spectator: true, state };
    }

    const playerId = this.env.ids.next();
    const command: GameCommand = {
      commandId: this.env.ids.next(),
      type: 'JOIN_ROOM',
      gameId: input.gameId,
      playerId,
      displayName: input.displayName,
      expectedRevision: state.revision,
      issuedAt: this.env.clock.now(),
    };
    await this.transactCommand(command);
    return {
      playerId,
      reclaimToken: this.issueToken(input.gameId, playerId),
      spectator: false,
      state: this.requireRoom(input.gameId),
    };
  }

  async transactCommand(command: GameCommand): Promise<CommandResult> {
    const { result, next } = runCas(this.getState(command.gameId), command, this.env);
    if (next !== undefined) this.putState(next);
    return result;
  }

  async updatePresence(gameId: string, playerId: string, status: PlayerStatus): Promise<void> {
    const state = this.getState(gameId);
    if (state === undefined) return;
    const player = state.players[playerId];
    if (player === undefined) return;
    this.putState({
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...player, status, lastSeenAt: this.env.clock.now() },
      },
    });
  }

  protected issueToken(gameId: string, playerId: string): string {
    const token = this.env.ids.next();
    this.putToken(token, { gameId, playerId });
    return token;
  }

  protected requireRoom(gameId: string): GameState {
    const state = this.getState(gameId);
    /* v8 ignore next -- defensive: callers always pass a known room id */
    if (state === undefined) throw new Error(`unknown room ${gameId}`);
    return state;
  }
}
