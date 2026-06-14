import { describe, expect, it } from 'vitest';
import {
  COWRIE_COUNT,
  FLAT_ROLL_WEIGHTS,
  facesForValue,
  flatValueRandomSource,
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

describe('flatValueRandomSource', () => {
  // A deterministic float sequence drives the picker so the distribution is testable.
  const fromFloats = (values: number[]) => {
    let i = 0;
    return flatValueRandomSource(() => values[i++ % values.length]!);
  };

  it('maps the weighted buckets to the expected roll values', () => {
    const total = FLAT_ROLL_WEIGHTS.reduce((s, [, w]) => s + w, 0); // 100
    // A float that lands at the very start of each cumulative bucket selects that value.
    let cumulative = 0;
    for (const [value, weight] of FLAT_ROLL_WEIGHTS) {
      const mid = (cumulative + weight / 2) / total; // a point inside this bucket
      // first nextFloat picks the value; the rest place open faces -> use 0s so
      // the Fisher-Yates picks are deterministic (placement doesn't affect score).
      const src = fromFloats([mid, 0, 0, 0, 0, 0, 0]);
      expect(scoreCowries(src.rollFaces(6))).toBe(value);
      cumulative += weight;
    }
  });

  it('always returns exactly six valid faces whose score is a legal roll value', () => {
    const legal = new Set(FLAT_ROLL_WEIGHTS.map(([v]) => v));
    const src = seededFloatSource(12345);
    const flat = flatValueRandomSource(src);
    for (let i = 0; i < 200; i++) {
      const faces = flat.rollFaces(6);
      expect(faces).toHaveLength(6);
      expect(faces.every((f) => f === 'open' || f === 'closed')).toBe(true);
      expect(legal.has(scoreCowries(faces))).toBe(true);
    }
  });

  it('flattens the spread: 1 and 5 are far more common than with fair shells', () => {
    const flat = flatValueRandomSource(seededFloatSource(7));
    const counts = new Map<number, number>();
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const v = scoreCowries(flat.rollFaces(6));
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    // Fair shells give P(1)=P(5)=~9%; the flat source targets ~18% each.
    expect((counts.get(1) ?? 0) / N).toBeGreaterThan(0.13);
    expect((counts.get(5) ?? 0) / N).toBeGreaterThan(0.13);
    // 6 and 12 stay rarer than the 1-5 values.
    expect((counts.get(6) ?? 0) / N).toBeLessThan(counts.get(3)! / N);
    expect((counts.get(12) ?? 0) / N).toBeLessThan(counts.get(6)! / N + 0.05);
  });
});

/** A small deterministic uniform-float PRNG (mulberry32) for distribution tests. */
function seededFloatSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
