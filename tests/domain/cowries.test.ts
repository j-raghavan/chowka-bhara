import { describe, expect, it } from 'vitest';
import {
  COWRIE_COUNT,
  facesForValue,
  grantsBonus,
  openCount,
  rollCowries,
  scoreCowries,
  seededRandomSource,
} from '../../src/domain/cowries';
import type { CowrieFace, RollValue } from '../../src/domain/types';
import { makeEnv } from '../helpers/env';

const open = (n: number): CowrieFace[] =>
  Array.from({ length: COWRIE_COUNT }, (_u, i) => (i < n ? 'open' : 'closed'));

describe('scoreCowries (CB2-FR3, FR4 / CB2-AC1..AC4)', () => {
  it('scores 0 open cowries as 12 (Bhara)', () => {
    expect(scoreCowries(open(0))).toBe(12);
  });

  it.each([1, 2, 3, 4, 5, 6])('scores %i open cowries as that value', (n) => {
    expect(scoreCowries(open(n))).toBe(n);
  });

  it('throws when the face count is not exactly six', () => {
    expect(() => scoreCowries(open(0).slice(0, 5))).toThrow(/exactly 6/);
    expect(() => scoreCowries([...open(6), 'open'])).toThrow(/exactly 6/);
  });
});

describe('grantsBonus (CB2-FR5..FR7 / CB2-AC1, AC2)', () => {
  it('grants a bonus for 6 (Chowka) and 12 (Bhara)', () => {
    expect(grantsBonus(6)).toBe(true);
    expect(grantsBonus(12)).toBe(true);
  });

  it.each<RollValue>([1, 2, 3, 4, 5])('does not grant a bonus for %i', (v) => {
    expect(grantsBonus(v)).toBe(false);
  });
});

describe('openCount', () => {
  it('counts open faces', () => {
    expect(openCount(open(3))).toBe(3);
    expect(openCount(open(0))).toBe(0);
  });
});

describe('rollCowries (CB2-AC5, determinism via injected env)', () => {
  it('produces a roll deterministically from a seeded env', () => {
    const a = rollCowries(makeEnv(7));
    const b = rollCowries(makeEnv(7));
    expect(a.faces).toEqual(b.faces);
    expect(a.value).toBe(b.value);
  });

  it('sets id, rolledAt, openCount, and bonus consistently', () => {
    const roll = rollCowries(makeEnv([[...facesForValue(6)]]));
    expect(roll.value).toBe(6);
    expect(roll.openCount).toBe(6);
    expect(roll.grantsBonusTurn).toBe(true);
    expect(roll.faces).toHaveLength(6);
    expect(roll.id).toBe('id-0');
    expect(roll.rolledAt).toBe(1000);
  });

  it('a scripted single open cowrie yields an entry roll value of 1 (CB2-AC3)', () => {
    const roll = rollCowries(makeEnv([[...facesForValue(1)]]));
    expect(roll.value).toBe(1);
    expect(roll.grantsBonusTurn).toBe(false);
  });
});

describe('seededRandomSource', () => {
  it('cycles a fixed face sequence in order', () => {
    const src = seededRandomSource([open(6), open(0), open(2)]);
    expect(scoreCowries(src.rollFaces(6))).toBe(6);
    expect(scoreCowries(src.rollFaces(6))).toBe(12);
    expect(scoreCowries(src.rollFaces(6))).toBe(2);
    expect(scoreCowries(src.rollFaces(6))).toBe(6); // cycles
  });

  it('throws on an empty face sequence', () => {
    expect(() => seededRandomSource([]).rollFaces(6)).toThrow(/empty/);
  });

  it('PRNG seed returns the requested number of faces, reproducibly', () => {
    const a = seededRandomSource(42).rollFaces(6);
    const b = seededRandomSource(42).rollFaces(6);
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);
    expect(a.every((f) => f === 'open' || f === 'closed')).toBe(true);
  });
});

describe('facesForValue', () => {
  it('produces faces that score back to the requested value', () => {
    for (const v of [1, 2, 3, 4, 5, 6, 12] as RollValue[]) {
      expect(scoreCowries(facesForValue(v))).toBe(v);
    }
  });
});
