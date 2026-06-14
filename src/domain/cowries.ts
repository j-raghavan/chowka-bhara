/**
 * Six-cowrie scoring, bonus detection, and roll construction.
 * Randomness is injected (L-CB4): no Math.random() here.
 */
import type { CowrieFace, CowrieRandomSource, CowrieRoll, DomainEnv, RollValue } from './types';

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
export function grantsBonus(value: number): boolean {
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
export function seededRandomSource(seed: readonly CowrieFace[][] | number): CowrieRandomSource {
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
        return Array.from({ length: count }, () => (nextFloat() < 0.5 ? 'open' : 'closed'));
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
  return Array.from({ length: COWRIE_COUNT }, (_unused, i) => (i < open ? 'open' : 'closed'));
}

/**
 * Flattened roll-value distribution. Six fair shells produce a binomial spread
 * that bunches ~77% of throws on 2/3/4 and almost never yields 1, 5, 6 or 12 —
 * which feels repetitive ("samey"). This source instead picks the roll VALUE
 * from an even-ish distribution so the player sees real variety, then lays out
 * matching cowrie faces at random positions (so the shells still look thrown).
 * 1–5 are equally common; 6 (Chowka) and 12 (Bhara) stay the rare big rolls.
 */
export const FLAT_ROLL_WEIGHTS: ReadonlyArray<readonly [RollValue, number]> = [
  [1, 18],
  [2, 18],
  [3, 18],
  [4, 18],
  [5, 18],
  [6, 7],
  [12, 3],
];

/**
 * Build a cowrie source with the flattened value distribution above, driven by
 * an injected uniform `nextFloat` in [0,1) (crypto in production, seeded PRNG in
 * tests). Pure given `nextFloat`, so the distribution is fully testable.
 */
export function flatValueRandomSource(nextFloat: () => number): CowrieRandomSource {
  const total = FLAT_ROLL_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  return {
    rollFaces(count: number): readonly CowrieFace[] {
      // Pick a target value from the weighted distribution.
      let r = nextFloat() * total;
      let value: RollValue = FLAT_ROLL_WEIGHTS[0]![0];
      for (const [v, weight] of FLAT_ROLL_WEIGHTS) {
        if (r < weight) {
          value = v;
          break;
        }
        r -= weight;
      }
      // Faces: `opens` open shells (0 for Bhara/12) placed at random positions.
      const opens = value === 12 ? 0 : Math.min(value, count);
      const slots = Array.from({ length: count }, (_unused, i) => i);
      for (let i = 0; i < opens; i++) {
        const j = i + Math.floor(nextFloat() * (count - i));
        const tmp = slots[i]!;
        slots[i] = slots[j]!;
        slots[j] = tmp;
      }
      const openSlots = new Set(slots.slice(0, opens));
      return Array.from({ length: count }, (_unused, i) => (openSlots.has(i) ? 'open' : 'closed'));
    },
  };
}
