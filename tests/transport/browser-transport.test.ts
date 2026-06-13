import { afterEach, describe, expect, it } from 'vitest';
import {
  BrowserTransport,
  type KeyValueStore,
  type RoomNotifier,
} from '../../src/transport/browser-transport';
import { BroadcastNotifier } from '../../src/transport/broadcast-notifier';
import { makeEnv } from '../helpers/env';

/** Shared in-memory localStorage stand-in (one per "browser"). */
function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

/** Synchronous cross-tab notifier stand-in shared by several transports. */
function fakeNotifier(): RoomNotifier {
  const handlers = new Set<(g: string) => void>();
  return {
    post: (gameId) => {
      for (const h of [...handlers]) h(gameId);
    },
    subscribe: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
}

describe('BrowserTransport — cross-tab sync + persistence', () => {
  it('syncs state across two tabs sharing one store + channel', async () => {
    const store = memStore();
    const channel = fakeNotifier();
    const tabA = new BrowserTransport(makeEnv(), store, channel);
    const tabB = new BrowserTransport(makeEnv(), store, channel);

    const { gameId } = await tabA.createRoom({ hostName: 'host' });
    const seen: number[] = [];
    tabB.subscribeRoom(gameId, (s) => seen.push(s.revision));
    expect(seen).toEqual([0]); // immediate current state

    await tabB.joinRoom({ gameId, displayName: 'p2' });
    expect(seen.at(-1)).toBeGreaterThan(0); // tab B was notified of its own join
    expect(tabA.getState(gameId)!.playerOrder).toHaveLength(2); // tab A sees it too
  });

  it('survives a refresh: a fresh transport on the same store sees the room', async () => {
    const store = memStore();
    const channel = fakeNotifier();
    const before = new BrowserTransport(makeEnv(), store, channel);
    const { gameId } = await before.createRoom({ hostName: 'host' });

    const afterRefresh = new BrowserTransport(makeEnv(), store, channel);
    expect(afterRefresh.getState(gameId)?.gameId).toBe(gameId);
  });

  it('reclaims a seat with a token after a refresh', async () => {
    const store = memStore();
    const channel = fakeNotifier();
    const t1 = new BrowserTransport(makeEnv(), store, channel);
    const { gameId } = await t1.createRoom({ hostName: 'host' });
    const join = await t1.joinRoom({ gameId, displayName: 'alice' });
    await t1.updatePresence(gameId, join.playerId, 'disconnected');

    const t2 = new BrowserTransport(makeEnv(), store, channel); // "after refresh"
    const back = await t2.joinRoom({
      gameId,
      displayName: 'alice',
      reclaimToken: join.reclaimToken,
    });
    expect(back.playerId).toBe(join.playerId);
    expect(back.spectator).toBe(false);
    expect(t2.getState(gameId)!.players[join.playerId]!.status).toBe('connected');
  });

  it('returns undefined for an unknown room and ignores a bad reclaim token', async () => {
    const store = memStore();
    const channel = fakeNotifier();
    const t = new BrowserTransport(makeEnv(), store, channel);
    expect(t.getState('nope')).toBeUndefined();

    const { gameId } = await t.createRoom({ hostName: 'host' });
    const join = await t.joinRoom({ gameId, displayName: 'alice', reclaimToken: 'bogus-token' });
    expect(join.spectator).toBe(false); // fell through to a fresh seat
    expect(join.playerId).not.toBe('');
  });

  it('ignores cross-tab notifications for other rooms', async () => {
    const store = memStore();
    const channel = fakeNotifier();
    const t = new BrowserTransport(makeEnv(), store, channel);
    const { gameId } = await t.createRoom({ hostName: 'host' });
    const seen: number[] = [];
    t.subscribeRoom(gameId, (s) => seen.push(s.revision));
    expect(seen).toHaveLength(1); // immediate
    channel.post('some-other-room'); // must NOT notify this subscriber
    expect(seen).toHaveLength(1);
    await t.joinRoom({ gameId, displayName: 'p2' }); // a change to our room does notify
    expect(seen.length).toBeGreaterThan(1);
  });

  it('makes the fifth joiner a spectator and rejects stale CAS', async () => {
    const store = memStore();
    const channel = fakeNotifier();
    const t = new BrowserTransport(makeEnv(), store, channel);
    const { gameId } = await t.createRoom({ hostName: 'host' });
    await t.joinRoom({ gameId, displayName: 'p2' });
    await t.joinRoom({ gameId, displayName: 'p3' });
    await t.joinRoom({ gameId, displayName: 'p4' });
    const fifth = await t.joinRoom({ gameId, displayName: 'p5' });
    expect(fifth.spectator).toBe(true);

    const rev = t.getState(gameId)!.revision;
    const stale = await t.transactCommand({
      commandId: 'x',
      type: 'START_GAME',
      gameId,
      playerId: 'nobody',
      expectedRevision: rev - 1, // stale
      issuedAt: 0,
    });
    expect(stale.rejection).toBe('STALE_REVISION');
  });
});

describe('BrowserTransport.create + BroadcastNotifier (real browser globals)', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('wires real localStorage and a working BroadcastChannel', async () => {
    const t = BrowserTransport.create(makeEnv());
    const { gameId } = await t.createRoom({ hostName: 'host' });
    expect(t.getState(gameId)?.gameId).toBe(gameId);
  });

  it('BroadcastNotifier construct/post/subscribe/unsub do not throw', () => {
    const n = new BroadcastNotifier('cb-test');
    const unsub = n.subscribe(() => {});
    expect(() => n.post('room-1')).not.toThrow();
    expect(() => unsub()).not.toThrow();
    n.close();
  });
});
