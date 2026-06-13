import type { Clock, CowrieFace, DomainEnv, IdSource, RollValue } from '../../src/domain/types';
import { facesForValue, seededRandomSource } from '../../src/domain/cowries';

/** Monotonic clock starting at `start`, advancing `step` each call. */
export function fixedClock(start = 1_000, step = 1): Clock {
  let t = start;
  return {
    now() {
      const v = t;
      t += step;
      return v;
    },
  };
}

/** Sequential id source: `${prefix}-0`, `${prefix}-1`, ... */
export function seqIdSource(prefix = 'id'): IdSource {
  let n = 0;
  return {
    next() {
      return `${prefix}-${n++}`;
    },
  };
}

/** Deterministic DomainEnv. Faces default to a seeded PRNG (seed 1). */
export function makeEnv(faces?: readonly CowrieFace[][] | number): DomainEnv {
  return {
    clock: fixedClock(),
    ids: seqIdSource(),
    random: seededRandomSource(faces ?? 1),
    devMode: true, // run assertInvariants after every transition in tests
  };
}

/** Env that yields a scripted sequence of roll values, in order, cycling. */
export function envForRolls(values: readonly RollValue[]): DomainEnv {
  return makeEnv(values.map((v) => [...facesForValue(v)]));
}
