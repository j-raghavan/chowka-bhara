/**
 * Six-cowrie scoring, bonus detection, and roll construction.
 * Randomness is injected (L-CB4): no Math.random() here.
 */
import type {
  CowrieFace,
  CowrieRandomSource,
  CowrieRoll,
  DomainEnv,
  RollValue,
} from './types';

export const COWRIE_COUNT = 6 as const;

/**
 * Score six cowries: zero open => 12 (Bhara/Bara); otherwise the open count
 * (1..6, where 6 is Chowka). Throws if the face count is not exactly six.
 */
export function scoreCowries(faces: readonly CowrieFace[]): RollValue {
  if (faces.length !== COWRIE_COUNT) {
    throw new Error('Chowka Bhara 7x7 requires exactly 6 cowries');
  }
  const openCount = faces.filter((face) => face === 'open').length;
  if (openCount === 0) return 12;
  return openCount as RollValue;
}

/** Roll values 6 (Chowka) and 12 (Bhara) grant a bonus turn (I-CB9). */
export function grantsBonus(value: RollValue): boolean {
  return value === 6 || value === 12;
}

/** Count open cowries in a face array. */
export function openCount(faces: readonly CowrieFace[]): number {
  return faces.filter((face) => face === 'open').length;
}

/** Build a CowrieRoll using injected env — fully deterministic given env. */
export function rollCowries(env: DomainEnv): CowrieRoll {
  const faces = env.random.rollFaces(COWRIE_COUNT);
  const value = scoreCowries(faces);
  return {
    id: env.ids.next(),
    faces,
    openCount: openCount(faces),
    value,
    grantsBonusTurn: grantsBonus(value),
    rolledAt: env.clock.now(),
  };
}

/**
 * Deterministic cowrie source for tests and replay.
 * - number seed: a small PRNG (mulberry32) maps to open/closed faces.
 * - array seed: a fixed sequence of pre-rolled face arrays, consumed in order
 *   and cycled when exhausted.
 */
export function seededRandomSource(
  seed: readonly CowrieFace[][] | number,
): CowrieRandomSource {
  if (typeof seed === 'number') {
    let state = seed >>> 0;
    const nextFloat = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      rollFaces(count: number): readonly CowrieFace[] {
        return Array.from({ length: count }, () =>
          nextFloat() < 0.5 ? 'open' : 'closed',
        );
      },
    };
  }

  let index = 0;
  return {
    rollFaces(_count: number): readonly CowrieFace[] {
      if (seed.length === 0) {
        throw new Error('seededRandomSource: empty face sequence');
      }
      const faces = seed[index % seed.length];
      index += 1;
      // faces is guaranteed defined by the modulo over a non-empty array.
      return faces as readonly CowrieFace[];
    },
  };
}

/** Convenience: an array of `open` then `closed` faces producing a given value. */
export function facesForValue(value: RollValue): readonly CowrieFace[] {
  const open = value === 12 ? 0 : value;
  return Array.from({ length: COWRIE_COUNT }, (_unused, i) =>
    i < open ? 'open' : 'closed',
  );
}
