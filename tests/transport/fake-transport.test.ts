import { describe, expect, it } from 'vitest';
import { FakeTransport } from '../../src/transport/fake-transport';
import type { GameCommand } from '../../src/domain/types';
import { makeEnv } from '../helpers/env';

function joinCmd(
  gameId: string,
  playerId: string,
  expectedRevision: number,
  commandId: string,
): GameCommand {
  return {
    commandId,
    type: 'JOIN_ROOM',
    gameId,
    playerId,
    displayName: playerId,
    expectedRevision,
    issuedAt: 0,
  };
}

describe('FakeTransport — CAS concurrency (C1, CB5-AC6)', () => {
  it('lets exactly one of two commands at the same revision mutate', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId } = await t.createRoom({ hostName: 'host' });
    const rev = t.getState(gameId)!.revision;

    const a = await t.transactCommand(joinCmd(gameId, 'p-a', rev, 'cmd-a'));
    const b = await t.transactCommand(joinCmd(gameId, 'p-b', rev, 'cmd-b'));

    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(false);
    expect(b.rejection).toBe('STALE_REVISION');
    expect(t.getState(gameId)!.playerOrder).toContain('p-a');
    expect(t.getState(gameId)!.playerOrder).not.toContain('p-b');
  });
});

describe('FakeTransport — idempotency (C2, I-CB16)', () => {
  it('accepts a replayed commandId without mutating', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId } = await t.createRoom({ hostName: 'host' });
    const rev = t.getState(gameId)!.revision;
    const c = joinCmd(gameId, 'p-a', rev, 'dup');

    const first = await t.transactCommand(c);
    const afterFirst = t.getState(gameId)!.revision;
    const second = await t.transactCommand(c);

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(t.getState(gameId)!.revision).toBe(afterFirst);
  });

  it('rejects a command against an unknown room', async () => {
    const t = new FakeTransport(makeEnv());
    const res = await t.transactCommand(joinCmd('nope', 'p', 0, 'c'));
    expect(res.rejection).toBe('UNKNOWN_COMMAND');
  });
});

describe('FakeTransport — serialization (C5)', () => {
  it('round-trips state through JSON without losing semantics', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId, state } = await t.createRoom({ hostName: 'host' });
    const round = JSON.parse(JSON.stringify(state));
    expect(round).toEqual(state);
    expect(round.config.ruleset).toBe('7x7-six-cowrie-v1');
    void gameId;
  });
});

describe('FakeTransport — subscription (C4)', () => {
  it('fires immediately and on each accepted mutation', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId } = await t.createRoom({ hostName: 'host' });
    const seen: number[] = [];
    const unsub = t.subscribeRoom(gameId, (s) => seen.push(s.revision));
    expect(seen).toEqual([0]); // immediate
    await t.joinRoom({ gameId, displayName: 'p2' });
    expect(seen.at(-1)).toBeGreaterThan(0);
    unsub();
    const before = seen.length;
    await t.joinRoom({ gameId, displayName: 'p3' });
    expect(seen.length).toBe(before); // no longer notified
  });
});

describe('FakeTransport — rooms, spectators, reconnect (CB5-FR9, AC7)', () => {
  it('reclaims a seat with a valid token after disconnect', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId } = await t.createRoom({ hostName: 'host' });
    const join = await t.joinRoom({ gameId, displayName: 'alice' });
    await t.updatePresence(gameId, join.playerId, 'disconnected');
    expect(t.getState(gameId)!.players[join.playerId]!.status).toBe('disconnected');

    const reclaim = await t.joinRoom({
      gameId,
      displayName: 'alice',
      reclaimToken: join.reclaimToken,
    });
    expect(reclaim.spectator).toBe(false);
    expect(reclaim.playerId).toBe(join.playerId);
    expect(t.getState(gameId)!.players[join.playerId]!.status).toBe('connected');
  });

  it('makes the fifth joiner a spectator', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId } = await t.createRoom({ hostName: 'host' });
    await t.joinRoom({ gameId, displayName: 'p2' });
    await t.joinRoom({ gameId, displayName: 'p3' });
    await t.joinRoom({ gameId, displayName: 'p4' });
    const fifth = await t.joinRoom({ gameId, displayName: 'p5' });
    expect(fifth.spectator).toBe(true);
  });

  it('treats an unrecognised reclaim token as a fresh join', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId } = await t.createRoom({ hostName: 'host' });
    const join = await t.joinRoom({ gameId, displayName: 'alice' });
    const bogus = await t.joinRoom({ gameId, displayName: 'mallory', reclaimToken: 'not-a-token' });
    expect(bogus.spectator).toBe(false);
    expect(bogus.playerId).not.toBe('');
    expect(bogus.playerId).not.toBe(join.playerId);
  });

  it('relays a reducer rejection (non-current ROLL) without mutating', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId, playerId: host } = await t.createRoom({ hostName: 'host' });
    const p2 = await t.joinRoom({ gameId, displayName: 'p2' });
    const startRev = t.getState(gameId)!.revision;
    await t.transactCommand({
      commandId: 'start',
      type: 'START_GAME',
      gameId,
      playerId: host,
      expectedRevision: startRev,
      issuedAt: 0,
    });
    const rev = t.getState(gameId)!.revision;
    const res = await t.transactCommand({
      commandId: 'roll-wrong',
      type: 'ROLL',
      gameId,
      playerId: p2.playerId, // not the current player
      expectedRevision: rev,
      issuedAt: 0,
    });
    expect(res.accepted).toBe(false);
    expect(res.rejection).toBe('NOT_CURRENT_PLAYER');
    expect(t.getState(gameId)!.revision).toBe(rev); // unchanged
  });

  it('honours an explicit gameId on createRoom', async () => {
    const t = new FakeTransport(makeEnv());
    const created = await t.createRoom({ hostName: 'host', gameId: 'fixed-room' });
    expect(created.gameId).toBe('fixed-room');
    expect(t.getState('fixed-room')).toBeDefined();
  });

  it('ignores a reclaim token issued for a different game', async () => {
    const t = new FakeTransport(makeEnv());
    const a = await t.createRoom({ hostName: 'hostA', gameId: 'A' });
    await t.createRoom({ hostName: 'hostB', gameId: 'B' });
    // a.reclaimToken belongs to game A; using it to join B must fall through to a fresh seat.
    const join = await t.joinRoom({
      gameId: 'B',
      displayName: 'mallory',
      reclaimToken: a.reclaimToken,
    });
    expect(join.spectator).toBe(false);
    expect(join.playerId).not.toBe(a.playerId);
  });

  it('makes a joiner a spectator once the game has started', async () => {
    const t = new FakeTransport(makeEnv());
    const { gameId, playerId: host } = await t.createRoom({ hostName: 'host' });
    await t.joinRoom({ gameId, displayName: 'p2' });
    await t.transactCommand({
      commandId: 'start',
      type: 'START_GAME',
      gameId,
      playerId: host,
      expectedRevision: t.getState(gameId)!.revision,
      issuedAt: 0,
    });
    expect(t.getState(gameId)!.status).toBe('playing');
    const late = await t.joinRoom({ gameId, displayName: 'latecomer' });
    expect(late.spectator).toBe(true);
  });

  it('updatePresence is a no-op for unknown room or player', async () => {
    const t = new FakeTransport(makeEnv());
    await expect(t.updatePresence('nope', 'x', 'connected')).resolves.toBeUndefined();
    const { gameId } = await t.createRoom({ hostName: 'host' });
    await expect(t.updatePresence(gameId, 'ghost', 'connected')).resolves.toBeUndefined();
  });
});
