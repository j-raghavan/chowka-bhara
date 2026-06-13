/**
 * Application service: builds idempotent, revision-guarded commands and submits
 * them through the transport. The UI calls these; it never builds commands or
 * touches the reducer directly.
 */
import type { CommandType, DomainEnv, GameState, PlayerStatus } from '../../domain/types';
import type {
  CommandResult,
  CreateRoomResult,
  GameTransport,
  JoinRoomResult,
  Unsubscribe,
} from '../../transport/game-transport';

/** The revision-bearing portion a command builder produces; the service fills in the rest. */
type PartialCommand = { readonly expectedRevision: number } & (
  | {
      readonly type: Exclude<
        CommandType,
        'SELECT_MOVE' | 'SET_COLOR' | 'CREATE_ROOM' | 'JOIN_ROOM' | 'LEAVE_ROOM'
      >;
    }
  | { readonly type: 'SELECT_MOVE'; readonly moveId: string }
  | { readonly type: 'SET_COLOR'; readonly color: string }
);

export class GameService {
  constructor(
    private readonly transport: GameTransport,
    private readonly env: DomainEnv,
  ) {}

  createRoom(hostName: string): Promise<CreateRoomResult> {
    return this.transport.createRoom({ hostName });
  }

  joinRoom(gameId: string, displayName: string, reclaimToken?: string): Promise<JoinRoomResult> {
    return this.transport.joinRoom(
      reclaimToken === undefined ? { gameId, displayName } : { gameId, displayName, reclaimToken },
    );
  }

  start(gameId: string, playerId: string): Promise<CommandResult> {
    return this.submit(gameId, playerId, (rev) => ({ type: 'START_GAME', expectedRevision: rev }));
  }

  roll(gameId: string, playerId: string): Promise<CommandResult> {
    return this.submit(gameId, playerId, (rev) => ({ type: 'ROLL', expectedRevision: rev }));
  }

  selectMove(gameId: string, playerId: string, moveId: string): Promise<CommandResult> {
    return this.submit(gameId, playerId, (rev) => ({
      type: 'SELECT_MOVE',
      moveId,
      expectedRevision: rev,
    }));
  }

  resign(gameId: string, playerId: string): Promise<CommandResult> {
    return this.submit(gameId, playerId, (rev) => ({ type: 'RESIGN', expectedRevision: rev }));
  }

  setColor(gameId: string, playerId: string, color: string): Promise<CommandResult> {
    return this.submit(gameId, playerId, (rev) => ({
      type: 'SET_COLOR',
      color,
      expectedRevision: rev,
    }));
  }

  updatePresence(gameId: string, playerId: string, status: PlayerStatus): Promise<void> {
    return this.transport.updatePresence(gameId, playerId, status);
  }

  subscribe(gameId: string, onState: (state: GameState) => void): Unsubscribe {
    return this.transport.subscribeRoom(gameId, onState);
  }

  private submit(
    gameId: string,
    playerId: string,
    build: (revision: number) => PartialCommand,
  ): Promise<CommandResult> {
    const state = this.transport.getState(gameId);
    if (state === undefined) {
      return Promise.resolve({ accepted: false, revision: 0, rejection: 'UNKNOWN_COMMAND' });
    }
    const partial = build(state.revision);
    const command = {
      commandId: this.env.ids.next(),
      gameId,
      playerId,
      issuedAt: this.env.clock.now(),
      ...partial,
    };
    // Shape matches a GameCommand variant; the reducer validates the rest.
    return this.transport.transactCommand(
      command as Parameters<GameTransport['transactCommand']>[0],
    );
  }
}
