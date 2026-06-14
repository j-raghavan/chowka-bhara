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

  /**
   * Submit a command under optimistic concurrency. If another writer advanced
   * the revision between our read and write (STALE_REVISION) — e.g. a concurrent
   * move or a presence update on the same room — re-read the latest revision and
   * retry with a fresh command, up to MAX_ATTEMPTS. A fresh commandId is minted
   * each attempt, and the reducer re-validates, so a no-longer-legal command is
   * rejected normally rather than retried into a wrong state.
   */
  private async submit(
    gameId: string,
    playerId: string,
    build: (revision: number) => PartialCommand,
  ): Promise<CommandResult> {
    const MAX_ATTEMPTS = 4;
    let last: CommandResult = { accepted: false, revision: 0, rejection: 'UNKNOWN_COMMAND' };
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const state = this.transport.getState(gameId);
      if (state === undefined) {
        return { accepted: false, revision: 0, rejection: 'UNKNOWN_COMMAND' };
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
      last = await this.transport.transactCommand(
        command as Parameters<GameTransport['transactCommand']>[0],
      );
      // On a stale write the transport has refreshed its cache to the latest
      // revision; loop to rebuild the command against it. Any other outcome
      // (accepted, or a real rejection) is returned as-is.
      if (last.accepted || last.rejection !== 'STALE_REVISION') return last;
    }
    return last;
  }
}
