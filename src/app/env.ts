/**
 * Production DomainEnv. Constructed in the APP layer and injected downward so
 * the domain only ever sees the Clock/IdSource/CowrieRandomSource interfaces
 * (boundary rule B3). Date.now()/crypto are permitted here, never in src/domain.
 */
import type { Clock, CowrieRandomSource, DomainEnv, IdSource } from '../domain/types';
import { flatValueRandomSource } from '../domain/cowries';

export const systemClock: Clock = { now: () => Date.now() };

export const uuidIdSource: IdSource = {
  next: () => crypto.randomUUID(),
};

/** Uniform float in [0,1) from the platform CSPRNG. */
function cryptoFloat(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
}

/**
 * Production cowrie source: cryptographically random, but using the flattened
 * value distribution so rolls feel varied instead of bunching on 2/3/4. See
 * flatValueRandomSource for the odds.
 */
export const cryptoRandomSource: CowrieRandomSource = flatValueRandomSource(cryptoFloat);

export function makeProductionEnv(): DomainEnv {
  // devMode (invariant checks) on in dev builds, off in production (perf).
  return {
    clock: systemClock,
    ids: uuidIdSource,
    random: cryptoRandomSource,
    devMode: import.meta.env.DEV,
  };
}
