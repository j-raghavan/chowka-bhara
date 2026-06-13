/**
 * Realtime transport port (L-CB6). Designed against a compare-and-set
 * transaction on `expectedRevision`; the reducer validates inside the
 * transaction. Adapters (Fake/Firebase/Supabase) are interchangeable.
 */
import type {
  CommandRejectionCode,
  GameCommand,
  GameState,
  PlayerStatus,
} from '../domain/types';

export type Unsubscribe = () => void;

export interface CommandResult {
  readonly accepted: boolean;
  readonly revision: number; // resulting revision, or current revision if rejected
  readonly rejection?: CommandRejectionCode;
}

export interface CreateRoomInput {
  readonly hostName: string;
  readonly gameId?: string;
}
export interface CreateRoomResult {
  readonly gameId: string;
  readonly playerId: string;
  readonly reclaimToken: string;
  readonly state: GameState;
}

export interface JoinRoomInput {
  readonly gameId: string;
  readonly displayName: string;
  readonly reclaimToken?: string;
}
export interface JoinRoomResult {
  readonly playerId: string;
  readonly reclaimToken: string;
  readonly spectator: boolean;
  readonly state: GameState;
}

export interface GameTransport {
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  joinRoom(input: JoinRoomInput): Promise<JoinRoomResult>;
  subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe;
  /**
   * CAS transaction:
   *   - duplicate commandId -> accepted idempotently, no mutation (I-CB16)
   *   - state.revision !== command.expectedRevision -> STALE_REVISION, no mutation (I-CB17)
   *   - else applyCommand inside the transaction; on accept persist (revision+1) and broadcast
   */
  transactCommand(command: GameCommand): Promise<CommandResult>;
  updatePresence(gameId: string, playerId: string, status: PlayerStatus): Promise<void>;
  /** Synchronous snapshot of the latest known state (cached by real adapters). */
  getState(gameId: string): GameState | undefined;
}
