import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/domain/game-setup';
import { applyCommand } from '../../src/domain/reducer';
import { RULESET_ID } from '../../src/domain/config';
import { envForRolls, makeEnv } from '../helpers/env';
import { commandFactory } from '../helpers/commands';

const cmd = commandFactory();

describe('ruleset versioning (CB8-FR4, FR6 / CB8-AC2, AC3)', () => {
  it('stores the ruleset id with every created game', () => {
    const state = createInitialState({ gameId: 'g', hostId: 'h', hostName: 'Host' }, makeEnv());
    expect(state.config.ruleset).toBe(RULESET_ID);
    expect(state.config.ruleset).toBe('7x7-six-cowrie-v1');
  });

  it('round-trips the stored ruleset through serialization (old games keep their rules)', () => {
    const state = createInitialState({ gameId: 'g', hostId: 'h', hostName: 'Host' }, makeEnv());
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.config.ruleset).toBe(RULESET_ID);
  });

  it('keeps config immutable through lobby -> playing -> rolls (CB1-FR7/AC3)', () => {
    const env = envForRolls([1, 1]);
    let s = createInitialState({ gameId: 'g', hostId: 'h', hostName: 'Host' }, env);
    const cfgRef = s.config; // no command carries a config payload, so this must never change
    s = applyCommand(s, cmd({ type: 'JOIN_ROOM', playerId: 'b', displayName: 'B' }), env).state;
    s = applyCommand(s, cmd({ type: 'START_GAME', playerId: 'h' }), env).state;
    s = applyCommand(s, cmd({ type: 'ROLL', playerId: s.currentPlayerId! }), env).state;
    expect(s.config).toBe(cfgRef);
    expect(s.config.ruleset).toBe(RULESET_ID);
  });
});
