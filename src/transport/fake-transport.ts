/**
 * In-memory transport (the FIRST implementation, L-CB6). Proves the concurrency
 * contract C1-C5 that real adapters must also satisfy. No network, no storage.
 */
import { applyCommand } from '../domain/reducer';
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

interface ReclaimRecord {
  readonly gameId: string;
  readonly playerId: string;
}

export class FakeTransport implements GameTransport {
  private readonly rooms = new Map<string, GameState>();
  private readonly subscribers = new Map<string, Set<(state: GameState) => void>>();
  private readonly tokens = new Map<string, ReclaimRecord>();

  constructor(private readonly env: DomainEnv) {}

  getState(gameId: string): GameState | undefined {
    return this.rooms.get(gameId);
  }

  /** Import an existing room state (session import / test seeding). */
  loadRoom(state: GameState): void {
    this.rooms.set(state.gameId, state);
    this.broadcast(state.gameId, state);
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const gameId = input.gameId ?? this.env.ids.next();
    const hostId = this.env.ids.next();
    const state = createInitialState({ gameId, hostId, hostName: input.hostName }, this.env);
    this.rooms.set(gameId, state);
    const reclaimToken = this.issueToken(gameId, hostId);
    return { gameId, playerId: hostId, reclaimToken, state };
  }

  async joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
    const state = this.requireRoom(input.gameId);

    // Reconnect path (CB5-FR9, CB5-AC7): a valid token reclaims the seat.
    if (input.reclaimToken !== undefined) {
      const record = this.tokens.get(input.reclaimToken);
      if (record !== undefined && record.gameId === input.gameId && state.players[record.playerId]) {
        await this.updatePresence(input.gameId, record.playerId, 'connected');
        return {
          playerId: record.playerId,
          reclaimToken: input.reclaimToken,
          spectator: false,
          state: this.requireRoom(input.gameId),
        };
      }
    }

    const seated = state.playerOrder.length;
    const spectator = state.status !== 'lobby' || seated >= state.config.maxPlayers;
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
    // The spectator gate above guarantees the JOIN is accepted in the in-memory store.
    await this.transactCommand(command);
    return {
      playerId,
      reclaimToken: this.issueToken(input.gameId, playerId),
      spectator: false,
      state: this.requireRoom(input.gameId),
    };
  }

  subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe {
    const set = this.subscribers.get(gameId) ?? new Set();
    set.add(onState);
    this.subscribers.set(gameId, set);
    const current = this.rooms.get(gameId);
    if (current !== undefined) onState(current);
    return () => {
      set.delete(onState);
    };
  }

  async transactCommand(command: GameCommand): Promise<CommandResult> {
    const state = this.rooms.get(command.gameId);
    if (state === undefined) {
      return { accepted: false, revision: 0, rejection: 'UNKNOWN_COMMAND' };
    }
    // Idempotent duplicate: accept without mutating (C2, I-CB16).
    if (state.recentCommandIds.includes(command.commandId)) {
      return { accepted: true, revision: state.revision };
    }
    // CAS guard (C1, I-CB17): exactly one command wins at a given revision.
    if (state.revision !== command.expectedRevision) {
      return { accepted: false, revision: state.revision, rejection: 'STALE_REVISION' };
    }
    const result = applyCommand(state, command, this.env);
    if (!result.accepted) {
      return { accepted: false, revision: state.revision, rejection: result.rejection! };
    }
    this.rooms.set(command.gameId, result.state);
    this.broadcast(command.gameId, result.state);
    return { accepted: true, revision: result.state.revision };
  }

  async updatePresence(gameId: string, playerId: string, status: PlayerStatus): Promise<void> {
    const state = this.rooms.get(gameId);
    if (state === undefined) return;
    const player = state.players[playerId];
    if (player === undefined) return;
    const next: GameState = {
      ...state,
      players: { ...state.players, [playerId]: { ...player, status, lastSeenAt: this.env.clock.now() } },
    };
    this.rooms.set(gameId, next);
    this.broadcast(gameId, next);
  }

  private issueToken(gameId: string, playerId: string): string {
    const token = this.env.ids.next();
    this.tokens.set(token, { gameId, playerId });
    return token;
  }

  private requireRoom(gameId: string): GameState {
    const state = this.rooms.get(gameId);
    /* v8 ignore next -- defensive: callers always pass a known room id */
    if (state === undefined) throw new Error(`unknown room ${gameId}`);
    return state;
  }

  private broadcast(gameId: string, state: GameState): void {
    const set = this.subscribers.get(gameId);
    if (set === undefined) return;
    for (const cb of set) cb(state);
  }
}
