import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/domain/game-setup';
import { RULESET_ID } from '../../src/domain/config';
import { makeEnv } from '../helpers/env';

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
});
