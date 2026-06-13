import { describe, expect, it } from 'vitest';
import { DEFAULT_7X7_CONFIG, RULESET_ID } from '../../src/domain/config';
import { FINISH_INDEX, OUTER_RING_EXIT_INDEX, SAFE_HOUSES } from '../../src/domain/board';

describe('DEFAULT_7X7_CONFIG (CB1-AC4)', () => {
  it('forbids stacking and Gatti', () => {
    expect(DEFAULT_7X7_CONFIG.allowStacking).toBe(false);
    expect(DEFAULT_7X7_CONFIG.allowGatti).toBe(false);
  });

  it('uses six cowries, entry on 1, bonus on 6 and 12', () => {
    expect(DEFAULT_7X7_CONFIG.cowrieCount).toBe(6);
    expect(DEFAULT_7X7_CONFIG.entryRoll).toBe(1);
    expect(DEFAULT_7X7_CONFIG.bonusRolls).toEqual([6, 12]);
  });

  it('defaults to 4 pawns per player (L-CB11 G7)', () => {
    expect(DEFAULT_7X7_CONFIG.pawnsPerPlayer).toBe(4);
  });

  it('references board constants rather than duplicating them (L-CB9)', () => {
    expect(DEFAULT_7X7_CONFIG.safeHouses).toBe(SAFE_HOUSES);
    expect(DEFAULT_7X7_CONFIG.outerRingExitIndex).toBe(OUTER_RING_EXIT_INDEX);
    expect(DEFAULT_7X7_CONFIG.finishIndex).toBe(FINISH_INDEX);
  });

  it('versions the ruleset and disables tripleBonusRule with a turn-chain cap', () => {
    expect(DEFAULT_7X7_CONFIG.ruleset).toBe(RULESET_ID);
    expect(DEFAULT_7X7_CONFIG.tripleBonusRule).toBe('disabled');
    expect(DEFAULT_7X7_CONFIG.maxTurnChain).toBe(64);
  });
});
