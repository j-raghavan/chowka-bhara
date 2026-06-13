/**
 * Browser transport: a localStorage-backed room store with cross-tab change
 * notifications (BroadcastChannel). Two tabs in the same browser play real
 * online games, and room state survives a refresh — so reclaim-token reconnect
 * (CB5-FR9) works without any backend. No external infrastructure required.
 */
import { StoreTransport, type ReclaimRecord } from './store-transport';
import { BroadcastNotifier } from './broadcast-notifier';
import type { DomainEnv, GameState } from '../domain/types';
import type { Unsubscribe } from './game-transport';

/** Minimal storage surface (window.localStorage satisfies it). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Cross-tab change notifier (BroadcastChannel satisfies it). */
export interface RoomNotifier {
  post(gameId: string): void;
  subscribe(handler: (gameId: string) => void): () => void;
}

const ROOM_PREFIX = 'cb:room:';
const TOKEN_PREFIX = 'cb:token:';

export class BrowserTransport extends StoreTransport {
  constructor(
    env: DomainEnv,
    private readonly store: KeyValueStore,
    private readonly notifier: RoomNotifier,
  ) {
    super(env);
  }

  /** Wire to the real browser localStorage + BroadcastChannel. */
  static create(env: DomainEnv): BrowserTransport {
    return new BrowserTransport(env, window.localStorage, new BroadcastNotifier());
  }

  getState(gameId: string): GameState | undefined {
    const raw = this.store.getItem(ROOM_PREFIX + gameId);
    return raw === null ? undefined : (JSON.parse(raw) as GameState);
  }

  protected putState(state: GameState): void {
    this.store.setItem(ROOM_PREFIX + state.gameId, JSON.stringify(state));
    this.notifier.post(state.gameId);
  }

  protected getToken(token: string): ReclaimRecord | undefined {
    const raw = this.store.getItem(TOKEN_PREFIX + token);
    return raw === null ? undefined : (JSON.parse(raw) as ReclaimRecord);
  }

  protected putToken(token: string, record: ReclaimRecord): void {
    this.store.setItem(TOKEN_PREFIX + token, JSON.stringify(record));
  }

  subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe {
    const unsub = this.notifier.subscribe((changed) => {
      if (changed !== gameId) return;
      const state = this.getState(gameId);
      if (state !== undefined) onState(state);
    });
    const current = this.getState(gameId);
    if (current !== undefined) onState(current);
    return unsub;
  }
}
