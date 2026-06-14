import { describe, expect, it } from 'vitest';
import { FakeTransport } from '../../src/transport/fake-transport';
import { GameService } from '../../src/app/services/game-service';
import type { GameState, PlayerSide } from '../../src/domain/types';
import { envForRolls, makeEnv } from '../helpers/env';
import { makePlayingState, withHasHit, withPawnAt } from '../helpers/state';
import { PAWN_PALETTE } from '../../src/domain/config';

async function seatRoom(service: GameService, names: string[]) {
  const created = await service.createRoom(names[0]!);
  const ids = [created.playerId];
  for (const name of names.slice(1)) {
    const join = await service.joinRoom(created.gameId, name);
    ids.push(join.playerId);
  }
  return { gameId: created.gameId, hostId: created.playerId, ids };
}

function sidesOf(state: GameState, ids: string[]): PlayerSide[] {
  return ids.map((id) => state.players[id]!.side);
}

describe('start gating and side assignment (CB5-AC1..AC4)', () => {
  it('rejects starting with a single player (CB5-AC1)', async () => {
    const service = new GameService(new FakeTransport(makeEnv()), makeEnv());
    const created = await service.createRoom('solo');
    const res = await service.start(created.gameId, created.playerId);
    expect(res.accepted).toBe(false);
    expect(res.rejection).toBe('BAD_PLAYER_COUNT');
  });

  it('assigns South and North for 2 players (CB5-AC2)', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const { gameId, hostId, ids } = await seatRoom(service, ['a', 'b']);
    await service.start(gameId, hostId);
    expect(sidesOf(t.getState(gameId)!, ids)).toEqual(['south', 'north']);
  });

  it('assigns South, East, North for 3 players (CB5-AC3)', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const { gameId, hostId, ids } = await seatRoom(service, ['a', 'b', 'c']);
    await service.start(gameId, hostId);
    expect(sidesOf(t.getState(gameId)!, ids)).toEqual(['south', 'east', 'north']);
  });

  it('assigns all four sides for 4 players (CB5-AC4)', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const { gameId, hostId, ids } = await seatRoom(service, ['a', 'b', 'c', 'd']);
    await service.start(gameId, hostId);
    expect(sidesOf(t.getState(gameId)!, ids)).toEqual(['south', 'east', 'north', 'west']);
  });

  it('sets a pawn color through the service', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const created = await service.createRoom('a');
    const res = await service.setColor(created.gameId, created.playerId, PAWN_PALETTE[5]!);
    expect(res.accepted).toBe(true);
    expect(t.getState(created.gameId)!.players[created.playerId]!.color).toBe(PAWN_PALETTE[5]);
  });

  it('rejects a non-host start (CB5-FR6)', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const { gameId, ids } = await seatRoom(service, ['a', 'b']);
    const res = await service.start(gameId, ids[1]!);
    expect(res.rejection).toBe('NOT_HOST');
  });

  it('returns UNKNOWN_COMMAND when acting on a missing room', async () => {
    const service = new GameService(new FakeTransport(makeEnv()), makeEnv());
    const res = await service.roll('ghost', 'p');
    expect(res.rejection).toBe('UNKNOWN_COMMAND');
  });
});

describe('full game through the service (deterministic)', () => {
  it('rolls and moves, alternating turns', async () => {
    const t = new FakeTransport(envForRolls([1]));
    const service = new GameService(t, makeEnv());
    const { gameId, hostId, ids } = await seatRoom(service, ['a', 'b']);
    await service.start(gameId, hostId);

    await service.roll(gameId, hostId); // roll 1 -> 4 entry moves
    const move = t.getState(gameId)!.legalMoves[0]!;
    await service.selectMove(gameId, hostId, move.id);

    const state = t.getState(gameId)!;
    expect(state.currentPlayerId).toBe(ids[1]); // turn advanced (roll 1 is non-bonus)
    expect(Object.values(state.pawns).some((p) => p.state === 'active')).toBe(true);
  });

  it('reaches a winner from a seeded near-finish state (CB5 integration)', async () => {
    const t = new FakeTransport(envForRolls([1]));
    const service = new GameService(t, makeEnv());
    let seed = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 });
    seed = withHasHit(seed, 'south');
    seed = withPawnAt(seed, 'south-p0', 46);
    t.loadRoom(seed);

    await service.roll(seed.gameId, 'south');
    const move = t.getState(seed.gameId)!.legalMoves.find((m) => m.wouldFinish)!;
    await service.selectMove(seed.gameId, 'south', move.id);

    const state = t.getState(seed.gameId)!;
    expect(state.status).toBe('finished');
    expect(state.winnerPlayerId).toBe('south');
  });
});

describe('reconnect through the service (CB5-AC7)', () => {
  it('restores a seat with the reclaim token', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const created = await service.createRoom('host');
    const join = await service.joinRoom(created.gameId, 'alice');
    await service.updatePresence(created.gameId, join.playerId, 'disconnected');

    const back = await service.joinRoom(created.gameId, 'alice', join.reclaimToken);
    expect(back.playerId).toBe(join.playerId);
    expect(back.spectator).toBe(false);
  });

  it('resigns through the service, handing the win to the last player', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const { gameId, hostId, ids } = await seatRoom(service, ['a', 'b']);
    await service.start(gameId, hostId);
    const res = await service.resign(gameId, ids[1]!);
    expect(res.accepted).toBe(true);
    expect(t.getState(gameId)!.winnerPlayerId).toBe(hostId);
  });

  it('subscribes and receives state updates', async () => {
    const t = new FakeTransport(makeEnv());
    const service = new GameService(t, makeEnv());
    const created = await service.createRoom('host');
    const revisions: number[] = [];
    const unsub = service.subscribe(created.gameId, (s) => revisions.push(s.revision));
    await service.joinRoom(created.gameId, 'p2');
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
