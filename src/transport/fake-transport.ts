/**
 * In-memory transport (the FIRST implementation, L-CB6). Proves the concurrency
 * contract C1-C5 that real adapters must also satisfy. No network, no storage.
 */
import { StoreTransport, type ReclaimRecord } from './store-transport';
import type { DomainEnv, GameState } from '../domain/types';
import type { Unsubscribe } from './game-transport';

export class FakeTransport extends StoreTransport {
  private readonly rooms = new Map<string, GameState>();
  private readonly subscribers = new Map<string, Set<(state: GameState) => void>>();
  private readonly tokens = new Map<string, ReclaimRecord>();

  constructor(env: DomainEnv) {
    super(env);
  }

  getState(gameId: string): GameState | undefined {
    return this.rooms.get(gameId);
  }

  protected putState(state: GameState): void {
    this.rooms.set(state.gameId, state);
    const set = this.subscribers.get(state.gameId);
    if (set !== undefined) for (const cb of set) cb(state);
  }

  protected getToken(token: string): ReclaimRecord | undefined {
    return this.tokens.get(token);
  }

  protected putToken(token: string, record: ReclaimRecord): void {
    this.tokens.set(token, record);
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
}
