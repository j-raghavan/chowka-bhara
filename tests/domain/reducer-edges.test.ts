import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/reducer';
import { createInitialState } from '../../src/domain/game-setup';
import type { GameState } from '../../src/domain/types';
import { envForRolls, makeEnv } from '../helpers/env';
import { commandFactory } from '../helpers/commands';
import { makePlayingState } from '../helpers/state';

const cmd = commandFactory();

function lobby(): GameState {
  return createInitialState({ gameId: 'g', hostId: 'host', hostName: 'Host' }, makeEnv());
}

describe('lobby transitions', () => {
  it('seats joining players and rejects a full room', () => {
    let s = lobby();
    for (const id of ['b', 'c', 'd']) {
      s = applyCommand(s, cmd({ type: 'JOIN_ROOM', playerId: id, displayName: id }), makeEnv()).state;
    }
    expect(s.playerOrder).toHaveLength(4);
    const full = applyCommand(s, cmd({ type: 'JOIN_ROOM', playerId: 'e', displayName: 'e' }), makeEnv());
    expect(full.rejection).toBe('ROOM_FULL');
  });

  it('treats a re-seat of the same player as idempotent', () => {
    let s = lobby();
    s = applyCommand(s, cmd({ type: 'JOIN_ROOM', playerId: 'host', displayName: 'Host' }), makeEnv()).state;
    expect(s.playerOrder).toEqual(['host']);
  });

  it('reassigns the host when the host leaves the lobby', () => {
    let s = lobby();
    s = applyCommand(s, cmd({ type: 'JOIN_ROOM', playerId: 'b', displayName: 'b' }), makeEnv()).state;
    s = applyCommand(s, cmd({ type: 'LEAVE_ROOM', playerId: 'host' }), makeEnv()).state;
    expect(s.hostId).toBe('b');
    expect(s.playerOrder).toEqual(['b']);
  });

  it('rejects START from a non-host and with a bad player count', () => {
    let s = lobby();
    s = applyCommand(s, cmd({ type: 'JOIN_ROOM', playerId: 'b', displayName: 'b' }), makeEnv()).state;
    expect(applyCommand(s, cmd({ type: 'START_GAME', playerId: 'b' }), makeEnv()).rejection).toBe('NOT_HOST');
    const solo = lobby();
    expect(applyCommand(solo, cmd({ type: 'START_GAME', playerId: 'host' }), makeEnv()).rejection).toBe('BAD_PLAYER_COUNT');
  });

  it('rejects gameplay commands while still in the lobby', () => {
    const s = lobby();
    expect(applyCommand(s, cmd({ type: 'ROLL', playerId: 'host' }), makeEnv()).rejection).toBe('WRONG_PHASE');
  });

  it('rejects CREATE_ROOM and unknown commands at the reducer', () => {
    const s = lobby();
    expect(applyCommand(s, cmd({ type: 'CREATE_ROOM', playerId: 'host', displayName: 'x' }), makeEnv()).rejection).toBe('UNKNOWN_COMMAND');
  });

  it('leaving an unknown player is a no-op', () => {
    const s = lobby();
    const res = applyCommand(s, cmd({ type: 'LEAVE_ROOM', playerId: 'ghost' }), makeEnv());
    expect(res.accepted).toBe(true);
    expect(res.state.playerOrder).toEqual(['host']);
  });
});

describe('in-play edges', () => {
  it('marks a leaving player disconnected during play', () => {
    const s = makePlayingState({ sides: ['south', 'north'] });
    const res = applyCommand(s, cmd({ type: 'LEAVE_ROOM', playerId: 'north' }), makeEnv());
    expect(res.state.players['north']!.status).toBe('disconnected');
  });

  it('rejects a second ROLL before resolving the first (WRONG_PHASE)', () => {
    const s = makePlayingState({ sides: ['south', 'north'] });
    const env = envForRolls([1, 1]);
    const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    const again = applyCommand(rolled.state, cmd({ type: 'ROLL', playerId: 'south' }), env);
    expect(again.rejection).toBe('WRONG_PHASE');
  });

  it('rejects a resign from an unknown player', () => {
    const s = makePlayingState({ sides: ['south', 'north'] });
    expect(applyCommand(s, cmd({ type: 'RESIGN', playerId: 'ghost' }), makeEnv()).rejection).toBe('NOT_CURRENT_PLAYER');
  });

  it('keeps a non-current resign from advancing the turn (4 players)', () => {
    const s = makePlayingState({ sides: ['south', 'east', 'north', 'west'], current: 'south' });
    const res = applyCommand(s, cmd({ type: 'RESIGN', playerId: 'north' }), makeEnv());
    expect(res.state.currentPlayerId).toBe('south');
    expect(res.state.status).toBe('playing');
  });

  it('resigns a player in the lobby without ending a game', () => {
    let s = lobby();
    s = applyCommand(s, cmd({ type: 'JOIN_ROOM', playerId: 'b', displayName: 'b' }), makeEnv()).state;
    const res = applyCommand(s, cmd({ type: 'RESIGN', playerId: 'b' }), makeEnv());
    expect(res.state.players['b']!.status).toBe('resigned');
    expect(res.state.status).toBe('lobby');
    expect(res.state.winnerPlayerId).toBeNull();
  });

  it('forces a turn advance when the bonus chain hits MAX_TURN_CHAIN', () => {
    const base = makePlayingState({ sides: ['south', 'north'] });
    const s = { ...base, turnChainRollCount: base.config.maxTurnChain };
    const env = envForRolls([6]); // bonus roll, but no legal moves
    const res = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), env);
    expect(res.state.currentPlayerId).toBe('north'); // cap forced the advance
  });
});
